"""The Redis + RQ path: the API enqueues, a separate worker runs the job and
writes the result to the shared store."""

import pytest

fakeredis = pytest.importorskip("fakeredis")
rq = pytest.importorskip("rq")


def test_job_runs_on_rq_worker(client, model_id, fake_training, monkeypatch):
    from app import main, state, worker_queue
    from app.state import RedisStore

    server = fakeredis.FakeServer()
    shared = RedisStore(fakeredis.FakeRedis(server=server, decode_responses=True), prefix="t")
    shared.create("model", {"hub_id": "distilbert-base-uncased", "status": "imported"})
    # API, tasks and queue all see the same Redis-backed store
    for mod in (state, main, worker_queue):
        monkeypatch.setattr(mod, "store", shared)
    import app.tasks as tasks
    import app.security as security
    monkeypatch.setattr(tasks, "store", shared)
    monkeypatch.setattr(security, "store", shared)
    monkeypatch.setenv("USE_WORKER", "1")

    queue = rq.Queue("hfaio", connection=fakeredis.FakeRedis(server=server))
    monkeypatch.setattr(worker_queue, "_queue", lambda: queue)

    r = client.post("/finetune/jobs", json={"model_id": 1})
    assert r.status_code == 200, r.text
    job_id = r.json()["id"]
    assert r.json()["runner"] == "worker"
    assert client.get(f"/finetune/jobs/{job_id}").json()["status"] == "queued"
    assert len(queue) == 1

    rq.SimpleWorker([queue], connection=queue.connection).work(burst=True)

    job = client.get(f"/finetune/jobs/{job_id}").json()
    assert job["status"] == "done", job
    assert job["accuracy"] == 0.82
