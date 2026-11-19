"""API key check and rate limiting for the public deployment.

* HFAIO_API_KEY: when set, every write endpoint (POST) needs the header
  `X-API-Key: <key>`. Read-only GET endpoints stay open so the dashboard and
  /health keep working. Leave it unset for local development.
* Rate limits (per client IP, sliding window):
    RATE_LIMIT_HEAVY   requests that start training/tuning/LLM calls (default 10 per 10 min)
    RATE_LIMIT_DEFAULT every other POST (default 60 per minute)
  Format: "<count>/<seconds>".
* MAX_ACTIVE_JOBS caps how many jobs/studies can be queued or running at once,
  so nobody can pile up hours of CPU work on the shared Space.
"""

import hmac
import os
import threading
import time
from collections import defaultdict, deque

from fastapi import Depends, HTTPException, Request, status

from app.state import store


def _parse(spec: str, default: tuple[int, int]) -> tuple[int, int]:
    try:
        count, seconds = spec.split("/")
        return int(count), int(seconds)
    except (ValueError, AttributeError):
        return default


class RateLimiter:
    def __init__(self, limit: int, window_seconds: int):
        self.limit = limit
        self.window = window_seconds
        self.hits: dict[str, deque] = defaultdict(deque)
        self.lock = threading.Lock()

    def check(self, key: str) -> None:
        now = time.monotonic()
        with self.lock:
            q = self.hits[key]
            while q and now - q[0] > self.window:
                q.popleft()
            if len(q) >= self.limit:
                retry = int(self.window - (now - q[0])) + 1
                raise HTTPException(
                    status.HTTP_429_TOO_MANY_REQUESTS,
                    f"Rate limit reached ({self.limit} per {self.window}s). "
                    f"Try again in {retry}s.",
                    headers={"Retry-After": str(retry)},
                )
            q.append(now)

    def reset(self):
        with self.lock:
            self.hits.clear()


heavy_limiter = RateLimiter(*_parse(os.getenv("RATE_LIMIT_HEAVY", ""), (10, 600)))
default_limiter = RateLimiter(*_parse(os.getenv("RATE_LIMIT_DEFAULT", ""), (60, 60)))


def client_ip(request: Request) -> str:
    # Behind a trusted proxy (nginx, Hugging Face Spaces) the real client is the
    # first X-Forwarded-For entry. Only trust it when TRUST_PROXY=1.
    if os.getenv("TRUST_PROXY", "0") == "1":
        fwd = request.headers.get("x-forwarded-for")
        if fwd:
            return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def require_api_key(request: Request) -> None:
    expected = os.getenv("HFAIO_API_KEY", "")
    if not expected:
        return
    given = request.headers.get("x-api-key", "")
    if not hmac.compare_digest(given.encode(), expected.encode()):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing or invalid X-API-Key header.")


def rate_limit(request: Request) -> None:
    default_limiter.check(client_ip(request))


def heavy_rate_limit(request: Request) -> None:
    heavy_limiter.check(client_ip(request))


def check_capacity() -> None:
    limit = int(os.getenv("MAX_ACTIVE_JOBS", 3))
    active = store.count("job", ("queued", "running")) + store.count("study", ("queued", "running"))
    if active >= limit:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"{active} jobs are already queued or running (limit {limit}). "
            "Wait for one to finish.",
        )


# Dependency bundles for the routes.
write_guard = [Depends(require_api_key), Depends(rate_limit)]
heavy_guard = [Depends(require_api_key), Depends(heavy_rate_limit)]
