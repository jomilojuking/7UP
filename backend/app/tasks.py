"""Long-running jobs. Run by the RQ worker (`rq worker hfaio`) or, as a fallback,
in the API process through FastAPI BackgroundTasks (see worker_queue.py).

Every task takes only an id and reads its parameters from the shared store, so
the same code works in both places.
"""

import logging
import os

from app.schemas import DatasetSpec, FinetuneRequest, StudyRequest
from app.state import TRAIN_LOCK, store

log = logging.getLogger("hfaio.tasks")
MODELS_DIR = os.getenv("MODELS_DIR", "models")


def run_finetune(job_id: int):
    from app.services import hub
    from app.services import tuning  # noqa: F401  (configures MLflow tracking)
    from app.services.training import train
    import mlflow

    job = store.get("job", job_id)
    req = FinetuneRequest(**job["request"])
    with TRAIN_LOCK:
        store.update("job", job_id, status="running")
        try:
            out_dir = os.path.join(MODELS_DIR, f"job-{job_id}")
            params = job["params"]
            with mlflow.start_run(run_name=f"finetune-{job_id}") as run:
                mlflow.log_params({"model": job["hub_id"], "dataset": job["dataset"], **params})
                metrics = {}
                acc = train(job["hub_id"], req.learning_rate, req.batch_size, req.epochs,
                            weight_decay=req.weight_decay, warmup_ratio=req.warmup_ratio,
                            dataset=req.dataset, output_dir=out_dir, save=True,
                            metrics_out=metrics)
                mlflow.log_metric("accuracy", acc)
            store.update("job", job_id, accuracy=acc, metrics=metrics, model_dir=out_dir,
                         mlflow_run_id=run.info.run_id)

            push = req.push_to_hub if req.push_to_hub is not None else hub.enabled()
            if push:
                try:
                    if not hub.enabled():
                        raise RuntimeError("HF_TOKEN is not set on the server")
                    repo = req.hub_repo or hub.default_repo(job["hub_id"], job["dataset"])
                    url, rev = hub.push_folder(out_dir, repo, job_id, job["hub_id"],
                                               job["dataset"], params, metrics)
                    store.update("job", job_id, hub_url=url, hub_repo=repo, hub_revision=rev)
                except Exception as e:  # a failed upload should not fail the training job
                    log.exception("Hub push failed for job %s", job_id)
                    store.update("job", job_id, hub_error=str(e)[:300])
            store.update("job", job_id, status="done")
        except Exception as e:
            log.exception("Fine-tune job %s failed", job_id)
            store.update("job", job_id, status="failed", error=str(e)[:500])


def run_study(study_id: int):
    from app.services import tuning

    study = store.get("study", study_id)
    req = StudyRequest(**study["request"])
    with TRAIN_LOCK:
        store.update("study", study_id, status="running")
        try:
            tuning.run_study(study["name"], study["hub_id"], req.n_trials,
                             dataset=req.dataset, space=req.search_space)
            store.update("study", study_id, status="done")
        except Exception as e:
            log.exception("Study %s failed", study_id)
            store.update("study", study_id, status="failed", error=str(e)[:500])


def _model_ref(job: dict):
    """Local folder if it still exists, else the Hub version pushed for that job."""
    d = job.get("model_dir")
    if d and os.path.isdir(d):
        return d, None
    if job.get("hub_repo"):
        return job["hub_repo"], job.get("hub_revision")
    raise RuntimeError(f"Model for job {job['id']} is gone (restart) and was not pushed to the Hub.")


def run_ab(ab_id: int):
    from app.services import abtest
    from app.services.training import evaluate_dir

    ab = store.get("ab", ab_id)
    job_a, job_b = store.get("job", ab["job_a"]), store.get("job", ab["job_b"])
    dataset = DatasetSpec(**job_a["request"]["dataset"])
    with TRAIN_LOCK:
        store.update("ab", ab_id, status="running")
        try:
            ref_a, rev_a = _model_ref(job_a)
            ref_b, rev_b = _model_ref(job_b)
            ca, na = evaluate_dir(ref_a, dataset, revision=rev_a)
            cb, nb = evaluate_dir(ref_b, dataset, revision=rev_b)
            z, p = abtest.two_proportion_z(ca, na, cb, nb)
            store.update("ab", ab_id, status="done", accuracy_a=ca / na, accuracy_b=cb / nb,
                         z_score=z, p_value=p, verdict=abtest.verdict(ca / na, cb / nb, p))
        except Exception as e:
            log.exception("A/B test %s failed", ab_id)
            store.update("ab", ab_id, status="failed", verdict=str(e)[:300])
