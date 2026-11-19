import logging
import os
import time

from fastapi import BackgroundTasks, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from prometheus_fastapi_instrumentator import Instrumentator

from app.schemas import (
    ABTestRequest, ABTestResult, DatasetInspect, FinetuneJob, FinetuneRequest, ModelImport,
    ModelInfo, StudyRequest, SuggestRequest, Trial,
)
from app.security import check_capacity, heavy_guard, write_guard
from app.services import data as data_service
from app.services import hub
from app.state import store
from app.worker_queue import enqueue, worker_enabled

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))

app = FastAPI(title="HFAIO API", version="0.3.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
)
Instrumentator().instrument(app).expose(app)  # adds /metrics for Prometheus


@app.get("/health")
def health():
    return {
        "status": "ok",
        "state_backend": store.backend,
        "runner": "worker" if worker_enabled() else "in-process",
        "hub_push": hub.enabled(),
        "auth": bool(os.getenv("HFAIO_API_KEY")),
    }


# ---------- models ----------
@app.post("/models/import", response_model=ModelInfo, dependencies=write_guard)
def import_model(body: ModelImport):
    from huggingface_hub import model_info

    try:
        model_info(body.hub_id)  # confirms the model exists (uses HF_TOKEN for private repos)
    except Exception:
        raise HTTPException(404, f"{body.hub_id} not found on the Hugging Face Hub")
    return store.create("model", {"hub_id": body.hub_id, "status": "imported"})


@app.get("/models", response_model=list[ModelInfo])
def list_models():
    return store.all("model")


@app.get("/hub/models")
def hub_models():
    """Fine-tuned models HFAIO pushed to your Hub account, with their versions."""
    if not hub.enabled():
        return {"enabled": False, "models": []}
    try:
        return {"enabled": True, "models": hub.list_pushed_models()}
    except Exception as e:
        raise HTTPException(502, f"Could not reach the Hugging Face Hub: {str(e)[:200]}")


def _model(model_id: int) -> dict:
    m = store.get("model", model_id)
    if m is None:
        raise HTTPException(404, "Unknown model_id. Import the model first.")
    return m


# ---------- datasets ----------
@app.post("/datasets/upload", dependencies=write_guard)
async def upload_dataset(file: UploadFile = File(...)):
    """Upload a CSV with a text column and a label column."""
    raw = await file.read()
    try:
        return data_service.save_upload(raw, file.filename or "upload.csv")
    except data_service.DatasetError as e:
        raise HTTPException(400, str(e))


@app.get("/datasets/uploads")
def list_uploads():
    return [{k: v for k, v in u.items() if k != "path"} for u in store.all("upload")]


@app.post("/datasets/inspect", dependencies=write_guard)
def inspect_dataset(body: DatasetInspect):
    """Splits and columns of any Hugging Face dataset, to pick text/label columns."""
    try:
        return data_service.inspect_hub(body.hub_id, body.config)
    except data_service.DatasetError as e:
        raise HTTPException(400, str(e))


def _check_dataset(spec):
    if spec.upload_id is not None and store.get("upload", spec.upload_id) is None:
        raise HTTPException(404, f"Upload {spec.upload_id} not found. Upload the CSV again.")


# ---------- fine-tuning ----------
@app.post("/finetune/jobs", response_model=FinetuneJob, dependencies=heavy_guard)
def start_finetune(body: FinetuneRequest, bg: BackgroundTasks):
    model = _model(body.model_id)
    _check_dataset(body.dataset)
    check_capacity()
    job = store.create("job", {
        "status": "queued",
        "hub_id": model["hub_id"],
        "dataset": body.dataset.label(),
        "params": {"lr": body.learning_rate, "batch_size": body.batch_size,
                   "epochs": body.epochs, "weight_decay": body.weight_decay,
                   "warmup_ratio": body.warmup_ratio},
        "request": body.model_dump(),
    })
    runner = enqueue("run_finetune", job["id"], background=bg)
    return store.update("job", job["id"], runner=runner)


@app.get("/finetune/jobs", response_model=list[FinetuneJob])
def list_finetune():
    return store.all("job")


@app.get("/finetune/jobs/{job_id}", response_model=FinetuneJob)
def get_finetune(job_id: int):
    job = store.get("job", job_id)
    if job is None:
        raise HTTPException(404, "Unknown job")
    return job


# ---------- tuning ----------
@app.post("/tuning/studies", dependencies=heavy_guard)
def create_study(body: StudyRequest, bg: BackgroundTasks):
    model = _model(body.model_id)
    _check_dataset(body.dataset)
    check_capacity()
    study = store.create("study", {"status": "queued", "hub_id": model["hub_id"],
                                   "dataset": body.dataset.label(),
                                   "request": body.model_dump()})
    name = f"study-{study['id']}-{int(time.time())}"
    store.update("study", study["id"], name=name)
    runner = enqueue("run_study", study["id"], background=bg)
    store.update("study", study["id"], runner=runner)
    return {"id": study["id"], "status": "queued", "n_trials": body.n_trials, "runner": runner,
            "search_space": body.search_space.model_dump()}


def _study(study_id: int) -> dict:
    s = store.get("study", study_id)
    if s is None:
        raise HTTPException(404, "Unknown study")
    return s


@app.get("/tuning/studies/{study_id}")
def get_study(study_id: int):
    s = _study(study_id)
    return {k: v for k, v in s.items() if k != "request"} | {
        "search_space": s["request"]["search_space"], "n_trials": s["request"]["n_trials"]}


@app.get("/tuning/studies/{study_id}/trials", response_model=list[Trial])
def get_trials(study_id: int):
    from app.services import tuning

    try:
        return tuning.get_trials(_study(study_id)["name"])
    except KeyError:
        return []  # study has not created its first trial yet


# ---------- A/B tests ----------
@app.post("/ab-tests", dependencies=heavy_guard)
def create_ab_test(body: ABTestRequest, bg: BackgroundTasks):
    jobs = [store.get("job", body.job_a), store.get("job", body.job_b)]
    if any(j is None or j.get("status") != "done" for j in jobs):
        raise HTTPException(400, "Both jobs must exist and be finished.")
    if jobs[0]["dataset"] != jobs[1]["dataset"]:
        raise HTTPException(400, "Both runs must use the same dataset to be compared.")
    ab = store.create("ab", {"status": "queued", "job_a": body.job_a, "job_b": body.job_b})
    enqueue("run_ab", ab["id"], background=bg)
    return {"id": ab["id"], "status": "queued"}


@app.get("/ab-tests/{test_id}/results", response_model=ABTestResult)
def ab_results(test_id: int):
    ab = store.get("ab", test_id)
    if ab is None:
        raise HTTPException(404, "Unknown A/B test")
    return ab


# ---------- LLM insights ----------
@app.post("/insights/studies/{study_id}", dependencies=heavy_guard)
def study_insights(study_id: int):
    """Mistral/Llama analysis of an Optuna study plus a suggested next search space."""
    from app.services import insights

    try:
        return insights.study_insights(_study(study_id)["name"])
    except KeyError:
        raise HTTPException(409, "The study has no trials yet.")


@app.post("/insights/jobs/{job_id}", dependencies=heavy_guard)
def job_insights(job_id: int):
    """Mistral/Llama diagnosis of a fine-tuning run from its MLflow metrics."""
    from app.services import insights

    job = get_finetune(job_id)
    if job["status"] != "done":
        raise HTTPException(409, "The run has not finished yet.")
    return insights.job_insights(job)


@app.post("/suggestions", dependencies=heavy_guard)
def suggestions(body: SuggestRequest):
    """Older endpoint, kept for compatibility. Same as /insights/studies/{id}."""
    return study_insights(body.study_id)
