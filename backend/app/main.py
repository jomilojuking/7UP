import time
import os
from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from huggingface_hub import model_info
from prometheus_fastapi_instrumentator import Instrumentator
import mlflow

from app import state
from app.schemas import (
    ModelImport, ModelInfo, FinetuneRequest, FinetuneJob, StudyRequest,
    Trial, ABTestRequest, ABTestResult, SuggestRequest,
)
from app.services import tuning, abtest, hub, suggest as suggest_service
from app.services.training import train, evaluate_dir

app = FastAPI(title="HFAIO API", version="0.2.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])
Instrumentator().instrument(app).expose(app)  # adds /metrics for Prometheus


@app.get("/health")
def health():
    return {"status": "ok"}


# ---------- models ----------
@app.post("/models/import", response_model=ModelInfo)
def import_model(body: ModelImport):
    try:
        model_info(body.hub_id)  # confirms the model exists on the Hub
    except Exception:
        raise HTTPException(404, f"{body.hub_id} not found on the Hugging Face Hub")
    mid = state.next_id("model")
    state.MODELS[mid] = {"id": mid, "hub_id": body.hub_id, "status": "imported"}
    return state.MODELS[mid]


@app.get("/models", response_model=list[ModelInfo])
def list_models():
    return list(state.MODELS.values())


# ---------- fine-tuning ----------
def _run_finetune(job_id, hub_id, req: FinetuneRequest):
    job = state.JOBS[job_id]
    with state.TRAIN_LOCK:
        job["status"] = "running"
        try:
            out_dir = f"models/job-{job_id}"
            with mlflow.start_run(run_name=f"finetune-{job_id}"):
                mlflow.log_params({"model": hub_id, "lr": req.learning_rate,
                                   "batch_size": req.batch_size, "epochs": req.epochs})
                metrics = {}
                acc = train(hub_id, req.learning_rate, req.batch_size, req.epochs,
                            output_dir=out_dir, save=True, metrics_out=metrics)
                mlflow.log_metric("accuracy", acc)
            job.update(accuracy=acc, metrics=metrics, model_dir=out_dir)
            if req.push_to_hub and os.getenv("HF_TOKEN") and os.getenv("HF_REPO"):
                job["hub_url"] = hub.push_folder(out_dir, os.environ["HF_REPO"], acc, hub_id)
            job["status"] = "done"
        except Exception as e:
            job.update(status="failed", error=str(e))


@app.post("/finetune/jobs", response_model=FinetuneJob)
def start_finetune(body: FinetuneRequest, bg: BackgroundTasks):
    if body.model_id not in state.MODELS:
        raise HTTPException(404, "Unknown model_id. Import the model first.")
    if body.dataset != "sst2":
        raise HTTPException(400, "Only 'sst2' is supported right now.")
    jid = state.next_id("job")
    state.JOBS[jid] = {"id": jid, "status": "queued"}
    bg.add_task(_run_finetune, jid, state.MODELS[body.model_id]["hub_id"], body)
    return state.JOBS[jid]


@app.get("/finetune/jobs/{job_id}", response_model=FinetuneJob)
def get_finetune(job_id: int):
    if job_id not in state.JOBS:
        raise HTTPException(404, "Unknown job")
    return state.JOBS[job_id]


# ---------- tuning ----------
def _run_study(study_id, hub_id, n_trials):
    study = state.STUDIES[study_id]
    with state.TRAIN_LOCK:
        study["status"] = "running"
        try:
            tuning.run_study(study["name"], hub_id, n_trials)
            study["status"] = "done"
        except Exception as e:
            study.update(status="failed", error=str(e))


@app.post("/tuning/studies")
def create_study(body: StudyRequest, bg: BackgroundTasks):
    if body.model_id not in state.MODELS:
        raise HTTPException(404, "Unknown model_id. Import the model first.")
    sid = state.next_id("study")
    name = f"study-{sid}-{int(time.time())}"
    state.STUDIES[sid] = {"id": sid, "name": name, "status": "queued"}
    bg.add_task(_run_study, sid, state.MODELS[body.model_id]["hub_id"], body.n_trials)
    return {"id": sid, "status": "queued", "n_trials": body.n_trials}


@app.get("/tuning/studies/{study_id}/trials", response_model=list[Trial])
def get_trials(study_id: int):
    if study_id not in state.STUDIES:
        raise HTTPException(404, "Unknown study")
    try:
        return tuning.get_trials(state.STUDIES[study_id]["name"])
    except KeyError:
        return []  # study has not created its first trial yet


# ---------- A/B tests ----------
def _run_ab(ab_id, dir_a, dir_b):
    ab = state.ABTESTS[ab_id]
    with state.TRAIN_LOCK:
        ab["status"] = "running"
        try:
            ca, na = evaluate_dir(dir_a)
            cb, nb = evaluate_dir(dir_b)
            z, p = abtest.two_proportion_z(ca, na, cb, nb)
            ab.update(status="done", accuracy_a=ca / na, accuracy_b=cb / nb,
                      z_score=z, p_value=p,
                      verdict=abtest.verdict(ca / na, cb / nb, p))
        except Exception as e:
            ab.update(status="failed", verdict=str(e))


@app.post("/ab-tests")
def create_ab_test(body: ABTestRequest, bg: BackgroundTasks):
    jobs = [state.JOBS.get(body.job_a), state.JOBS.get(body.job_b)]
    if any(j is None or j.get("status") != "done" for j in jobs):
        raise HTTPException(400, "Both jobs must exist and be finished.")
    aid = state.next_id("ab")
    state.ABTESTS[aid] = {"id": aid, "status": "queued"}
    bg.add_task(_run_ab, aid, jobs[0]["model_dir"], jobs[1]["model_dir"])
    return {"id": aid, "status": "queued"}


@app.get("/ab-tests/{test_id}/results", response_model=ABTestResult)
def ab_results(test_id: int):
    if test_id not in state.ABTESTS:
        raise HTTPException(404, "Unknown A/B test")
    return state.ABTESTS[test_id]


# ---------- LLM suggestions ----------
@app.post("/suggestions")
def suggestions(body: SuggestRequest):
    if body.study_id not in state.STUDIES:
        raise HTTPException(404, "Unknown study")
    return suggest_service.suggest(state.STUDIES[body.study_id]["name"])