"""Send long-running work (fine-tuning, Optuna studies, A/B tests) off the
request path.

With USE_WORKER=1 and Redis available, jobs go onto an RQ queue and a separate
`rq worker` process runs them, so a long study never blocks or times out an
HTTP request and survives an API restart. Otherwise (Hugging Face Space, quick
local runs) they fall back to FastAPI BackgroundTasks in the API process.
"""

import os

from fastapi import BackgroundTasks

from app.state import store

QUEUE_NAME = "hfaio"
# Optuna studies on CPU can take a while; give each job up to 6 hours.
JOB_TIMEOUT = int(os.getenv("JOB_TIMEOUT_SECONDS", 6 * 3600))


def worker_enabled() -> bool:
    return os.getenv("USE_WORKER", "0").lower() in ("1", "true", "yes") \
        and store.backend == "redis"


def _queue():
    from redis import Redis
    from rq import Queue
    # RQ pickles job payloads, so it needs a connection without decode_responses.
    return Queue(QUEUE_NAME, connection=Redis.from_url(os.environ["REDIS_URL"]))


def enqueue(task_name: str, *args, background: BackgroundTasks) -> str:
    """Run app.tasks.<task_name>(*args) on the worker, or in-process as a fallback.

    Returns "worker" or "in-process" so the API can report where it ran.
    """
    if worker_enabled():
        _queue().enqueue(f"app.tasks.{task_name}", *args, job_timeout=JOB_TIMEOUT)
        return "worker"
    from app import tasks
    background.add_task(getattr(tasks, task_name), *args)
    return "in-process"
