"""Job, study and A/B test records.

Records live in Redis when REDIS_URL is set and reachable, so the API and the
background worker (a separate process) see the same state and nothing is lost
when the API restarts. Without Redis (e.g. on the Hugging Face Space or a quick
local run) the same interface falls back to in-process dictionaries.
"""

import json
import logging
import os
import threading

log = logging.getLogger("hfaio.state")

KINDS = ("model", "job", "study", "ab", "upload")

# Only one training run at a time inside one process, so a laptop does not run
# out of memory. With the Redis worker, the single worker process serializes runs.
TRAIN_LOCK = threading.Lock()


class MemoryStore:
    backend = "memory"

    def __init__(self):
        self._data = {k: {} for k in KINDS}
        self._counters = {k: 0 for k in KINDS}
        self._lock = threading.Lock()

    def create(self, kind: str, record: dict) -> dict:
        with self._lock:
            self._counters[kind] += 1
            rid = self._counters[kind]
            self._data[kind][rid] = {**record, "id": rid}
            return dict(self._data[kind][rid])

    def get(self, kind: str, rid: int):
        with self._lock:
            rec = self._data[kind].get(int(rid))
            return dict(rec) if rec is not None else None

    def update(self, kind: str, rid: int, **fields) -> dict:
        with self._lock:
            rec = self._data[kind][int(rid)]
            rec.update(fields)
            return dict(rec)

    def all(self, kind: str) -> list[dict]:
        with self._lock:
            return [dict(r) for _, r in sorted(self._data[kind].items())]

    def count(self, kind: str, statuses: tuple[str, ...]) -> int:
        return sum(1 for r in self.all(kind) if r.get("status") in statuses)

    def clear(self):
        with self._lock:
            self._data = {k: {} for k in KINDS}
            self._counters = {k: 0 for k in KINDS}


class RedisStore:
    backend = "redis"

    def __init__(self, client, prefix: str = "hfaio"):
        self.r = client
        self.prefix = prefix

    def _key(self, kind):
        return f"{self.prefix}:{kind}"

    def create(self, kind: str, record: dict) -> dict:
        rid = int(self.r.incr(f"{self.prefix}:counter:{kind}"))
        rec = {**record, "id": rid}
        self.r.hset(self._key(kind), str(rid), json.dumps(rec))
        return rec

    def get(self, kind: str, rid: int):
        raw = self.r.hget(self._key(kind), str(int(rid)))
        return json.loads(raw) if raw else None

    def update(self, kind: str, rid: int, **fields) -> dict:
        # WATCH/MULTI so the API and the worker never overwrite each other.
        key = self._key(kind)
        with self.r.pipeline() as pipe:
            while True:
                try:
                    pipe.watch(key)
                    raw = pipe.hget(key, str(int(rid)))
                    if raw is None:
                        raise KeyError(rid)
                    rec = json.loads(raw)
                    rec.update(fields)
                    pipe.multi()
                    pipe.hset(key, str(int(rid)), json.dumps(rec))
                    pipe.execute()
                    return rec
                except Exception as e:  # redis.WatchError -> retry
                    if type(e).__name__ != "WatchError":
                        raise

    def all(self, kind: str) -> list[dict]:
        rows = [json.loads(v) for v in self.r.hgetall(self._key(kind)).values()]
        return sorted(rows, key=lambda r: r["id"])

    def count(self, kind: str, statuses: tuple[str, ...]) -> int:
        return sum(1 for r in self.all(kind) if r.get("status") in statuses)

    def clear(self):
        for kind in KINDS:
            self.r.delete(self._key(kind), f"{self.prefix}:counter:{kind}")


def redis_client():
    """Return a connected Redis client, or None if REDIS_URL is unset/unreachable."""
    url = os.getenv("REDIS_URL")
    if not url:
        return None
    try:
        import redis
        client = redis.Redis.from_url(url, decode_responses=True, socket_timeout=5)
        client.ping()
        return client
    except Exception as e:
        log.warning("REDIS_URL is set but Redis is unreachable (%s); using memory", e)
        return None


def _make_store():
    client = redis_client()
    return RedisStore(client) if client is not None else MemoryStore()


store = _make_store()
