import threading

MODELS: dict[int, dict] = {}
JOBS: dict[int, dict] = {}
STUDIES: dict[int, dict] = {}
ABTESTS: dict[int, dict] = {}

# only one training run at a time, so a laptop doesn't run out of memory
TRAIN_LOCK = threading.Lock()

_counters = {"model": 0, "job": 0, "study": 0, "ab": 0}
_lock = threading.Lock()


def next_id(kind: str) -> int:
    with _lock:
        _counters[kind] += 1
        return _counters[kind]