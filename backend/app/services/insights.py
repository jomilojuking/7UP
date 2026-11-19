"""LLM-powered insights on tuning studies and fine-tuning runs.

Reads the Optuna trial log (for a study) or the MLflow run (for a fine-tuning
job), summarises it, and asks one or more instruction-tuned models on the
Hugging Face Inference API (Mistral and Llama by default) for a diagnosis and
a better hyperparameter search space. Every answer comes back as structured
JSON so the frontend can start a new study with the suggested ranges in one
click.

A deterministic rule-based analysis is always returned too, so the feature
still works with no HF_TOKEN, when a model is unavailable, or in tests.
"""

import json
import math
import os
import re
from concurrent.futures import ThreadPoolExecutor

from pydantic import ValidationError

from app.schemas import SearchSpace

DEFAULT_MODELS = "mistralai/Mistral-7B-Instruct-v0.3,meta-llama/Llama-3.1-8B-Instruct"
LR_BOUNDS = (1e-7, 1e-2)

SYSTEM_PROMPT = (
    "You are an MLOps assistant that helps engineers fine-tune Hugging Face "
    "transformer classifiers. Be specific and practical. Reply with ONLY a JSON "
    "object, no markdown, using exactly these keys:\n"
    '{"summary": "<2-3 sentences: what the results show>",\n'
    ' "recommendations": ["<short actionable tip>", "..."],\n'
    ' "search_space": {"lr_min": <float>, "lr_max": <float>, "batch_sizes": [<int>],\n'
    '                  "wd_min": <float>, "wd_max": <float>, "epochs": <int 1-10>}}'
)


def insight_models() -> list[str]:
    raw = os.getenv("INSIGHT_MODELS") or DEFAULT_MODELS
    return [m.strip() for m in raw.split(",") if m.strip()]


# ------------------------------------------------------------------ context
def _clamp_lr(x):
    return float(min(max(x, LR_BOUNDS[0]), LR_BOUNDS[1]))


def _space(lr_lo, lr_hi, **kw) -> SearchSpace:
    """SearchSpace with clamped learning rates that always form a valid range."""
    lo, hi = _clamp_lr(lr_lo), _clamp_lr(lr_hi)
    if hi <= lo:
        lo, hi = _clamp_lr(lo / 2), _clamp_lr(lo * 2)
    return SearchSpace(lr_min=lo, lr_max=hi, **kw)


def study_facts(study) -> dict:
    trials = study.trials
    done = [t for t in trials if t.value is not None and t.state.name == "COMPLETE"]
    done.sort(key=lambda t: t.value, reverse=True)
    space = study.user_attrs.get("search_space") or SearchSpace().model_dump()
    return {
        "model": study.user_attrs.get("model"),
        "dataset": study.user_attrs.get("dataset"),
        "search_space": space,
        "n_trials": len(trials),
        "n_complete": len(done),
        "n_pruned": sum(t.state.name == "PRUNED" for t in trials),
        "n_failed": sum(t.state.name == "FAIL" for t in trials),
        "trials": [
            {"number": t.number, "accuracy": round(t.value, 4),
             "learning_rate": t.params.get("learning_rate"),
             "batch_size": t.params.get("batch_size"),
             "weight_decay": round(t.params.get("weight_decay", 0.0), 4),
             "generalization_gap": (round(t.user_attrs["generalization_gap"], 4)
                                    if "generalization_gap" in t.user_attrs else None)}
            for t in done
        ],
    }


def study_context(facts: dict) -> str:
    s = facts["search_space"]
    lines = [
        f"Model: {facts['model']}  Dataset: {facts['dataset']}",
        f"Search space: lr {s['lr_min']:.1e}-{s['lr_max']:.1e} (log), batch sizes "
        f"{s['batch_sizes']}, weight decay {s['wd_min']}-{s['wd_max']}, {s['epochs']} epochs",
        f"Trials: {facts['n_trials']} total, {facts['n_complete']} complete, "
        f"{facts['n_pruned']} pruned early, {facts['n_failed']} failed",
        "Completed trials, best first (generalization_gap = train acc - test acc):",
    ]
    for t in facts["trials"][:12]:
        lines.append(
            f"  #{t['number']}: acc={t['accuracy']:.4f} lr={t['learning_rate']:.2e} "
            f"batch={t['batch_size']} wd={t['weight_decay']:.3f}"
            + (f" gap={t['generalization_gap']:+.3f}" if t["generalization_gap"] is not None else ""))
    return "\n".join(lines)


def job_facts(job: dict) -> dict:
    """Params and metrics of a fine-tuning job, read from its MLflow run when possible."""
    params = dict(job.get("params") or {})
    metrics = dict(job.get("metrics") or {})
    source = "job record"
    run_id = job.get("mlflow_run_id")
    if run_id:
        try:
            import mlflow
            run = mlflow.get_run(run_id)
            params.update(run.data.params)
            metrics.update(run.data.metrics)
            source = f"MLflow run {run_id}"
        except Exception:
            pass
    return {"model": job.get("hub_id"), "dataset": job.get("dataset"),
            "params": params, "metrics": metrics, "source": source}


def job_context(facts: dict) -> str:
    m = facts["metrics"]
    lines = [f"Model: {facts['model']}  Dataset: {facts['dataset']}  (from {facts['source']})",
             "Hyperparameters: " + ", ".join(f"{k}={v}" for k, v in sorted(facts["params"].items()))]
    for split in ("train", "test"):
        vals = [f"{k}={m[f'{split}_{k}']:.4f}" for k in ("accuracy", "f1", "loss")
                if f"{split}_{k}" in m]
        if vals:
            lines.append(f"{split.title()} set: " + ", ".join(vals))
    if "generalization_gap" in m:
        lines.append(f"Generalization gap (train acc - test acc): {m['generalization_gap']:+.4f}")
    return "\n".join(lines)


# ---------------------------------------------------------------- rule-based
def rule_based_study(facts: dict) -> dict:
    space = SearchSpace(**facts["search_space"])
    trials = facts["trials"]
    if len(trials) < 3:
        return {"summary": "Fewer than 3 trials have finished, so there is not enough "
                           "evidence to narrow the search yet.",
                "recommendations": ["Run at least 3-5 complete trials, then ask again."],
                "search_space": space.model_dump()}

    top = trials[:3]
    lrs = [t["learning_rate"] for t in top]
    best = top[0]
    lo, hi = _clamp_lr(min(lrs) / 1.5), _clamp_lr(max(lrs) * 1.5)
    recs = [f"The best trial (#{best['number']}, acc {best['accuracy']:.3f}) used "
            f"lr {best['learning_rate']:.1e}, batch {best['batch_size']}, "
            f"weight decay {best['weight_decay']:.3f}."]

    # Best value sitting at the edge of the range means the optimum may lie outside it.
    span = math.log(space.lr_max) - math.log(space.lr_min)
    pos = (math.log(best["learning_rate"]) - math.log(space.lr_min)) / span
    if pos > 0.9:
        hi = _clamp_lr(space.lr_max * 3)
        recs.append("The best learning rate is at the top of the range; extend it upward.")
    elif pos < 0.1:
        lo = _clamp_lr(space.lr_min / 3)
        recs.append("The best learning rate is at the bottom of the range; extend it downward.")
    else:
        recs.append(f"Narrow the learning rate to {lo:.1e}-{hi:.1e} around the top trials.")

    batches = sorted({t["batch_size"] for t in top})
    wds = [t["weight_decay"] for t in top]
    wd_min, wd_max = max(0.0, min(wds) - 0.02), min(0.3, max(wds) + 0.02)

    gaps = [t["generalization_gap"] for t in top if t["generalization_gap"] is not None]
    epochs = space.epochs
    if gaps and sum(gaps) / len(gaps) > 0.05:
        wd_min, wd_max = max(wd_min, 0.01), max(wd_max, 0.1)
        epochs = max(1, epochs - 1)
        recs.append("Top trials overfit (train accuracy well above test); use more weight "
                    "decay and one fewer epoch, or train on more data (MAX_TRAIN).")
    if facts["n_pruned"] > facts["n_complete"]:
        recs.append("Most trials were pruned, so the old range wasted time; the narrower "
                    "range should waste less.")

    suggested = _space(lo, max(hi, lo * 1.5), batch_sizes=batches,
                       wd_min=round(wd_min, 4), wd_max=round(wd_max, 4), epochs=epochs)
    return {"summary": f"{facts['n_complete']} trials finished; best accuracy "
                       f"{best['accuracy']:.3f}.",
            "recommendations": recs, "search_space": suggested.model_dump()}


def rule_based_job(facts: dict) -> dict:
    m, p = facts["metrics"], facts["params"]
    test_acc = m.get("test_accuracy")
    gap = m.get("generalization_gap")
    if gap is None and "train_accuracy" in m and test_acc is not None:
        gap = m["train_accuracy"] - test_acc
    lr = float(p.get("lr", p.get("learning_rate", 2e-5)))
    epochs = int(float(p.get("epochs", 3)))
    recs, summary = [], "Not enough metrics yet."
    space = _space(lr / 2, lr * 2, epochs=epochs)
    if test_acc is not None and gap is not None:
        summary = f"Test accuracy {test_acc:.3f}, train-test gap {gap:+.3f}."
        if gap > 0.05:
            summary += " The model is overfitting."
            recs += ["Raise weight decay to 0.05-0.1.",
                     "Keep the linear warmup/decay schedule and early stopping on.",
                     f"Try {max(1, epochs - 1)} epochs or a lower learning rate (~{lr / 2:.1e}).",
                     "Train on more rows (raise MAX_TRAIN) if time allows."]
            space = _space(lr / 4, lr, wd_min=0.05, wd_max=0.15, epochs=max(1, epochs - 1))
        elif test_acc < 0.75:
            summary += " The model is underfitting."
            recs += [f"Train longer ({min(10, epochs + 2)} epochs) or raise the learning rate.",
                     "Use more training data (MAX_TRAIN) or a larger base model."]
            space = _space(lr, lr * 4, epochs=min(10, epochs + 2))
        else:
            summary += " Generalization looks healthy."
            recs += ["Run an Optuna study around these settings to squeeze out a bit more."]
    return {"summary": summary, "recommendations": recs, "search_space": space.model_dump()}


# --------------------------------------------------------------------- LLM
def _parse_json(text: str) -> dict:
    text = re.sub(r"```(?:json)?", "", text)
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        raise ValueError("no JSON object in the reply")
    return json.loads(text[start:end + 1])


def _ask(model: str, context: str, task: str, token: str) -> dict:
    from huggingface_hub import InferenceClient

    try:
        client = InferenceClient(token=token, timeout=float(os.getenv("INSIGHT_TIMEOUT", 45)))
        out = client.chat_completion(
            model=model,
            messages=[{"role": "system", "content": SYSTEM_PROMPT},
                      {"role": "user", "content": f"{task}\n\n{context}"}],
            max_tokens=500,
            temperature=0.2,
        )
        text = out.choices[0].message.content or ""
    except Exception as e:
        return {"model": model, "ok": False, "error": f"{type(e).__name__}: {str(e)[:200]}"}

    result = {"model": model, "ok": True, "raw": text}
    try:
        data = _parse_json(text)
        result["summary"] = str(data.get("summary", "")).strip()
        result["recommendations"] = [str(r) for r in data.get("recommendations", [])][:6]
        try:
            result["search_space"] = SearchSpace(**data.get("search_space", {})).model_dump()
        except (ValidationError, TypeError):
            result["search_space"] = None
    except ValueError:
        result["summary"] = text.strip()[:800]  # model ignored the JSON format
        result["recommendations"], result["search_space"] = [], None
    return result


def _ask_all(context: str, task: str) -> list[dict]:
    token = os.getenv("HF_TOKEN")
    if not token:
        return []
    models = insight_models()
    with ThreadPoolExecutor(max_workers=len(models)) as pool:
        return list(pool.map(lambda m: _ask(m, context, task, token), models))


def _combine(rule: dict, llm: list[dict], context: str) -> dict:
    good = [r for r in llm if r.get("ok") and r.get("summary")]
    space = next((r["search_space"] for r in good if r.get("search_space")), None)
    first = good[0] if good else None
    return {
        "source": "llm" if first else "rule",
        # one-line text kept for the old /suggestions response shape
        "suggestion": (first["summary"] if first else
                       " ".join([rule["summary"], *rule["recommendations"]])),
        "recommended_search_space": space or rule["search_space"],
        "llm": llm,
        "rule_based": rule,
        "context": context,
    }


def study_insights(study_name: str) -> dict:
    from app.services.tuning import load

    facts = study_facts(load(study_name))
    context = study_context(facts)
    rule = rule_based_study(facts)
    llm = _ask_all(context, "Analyse this Optuna hyperparameter search and propose a "
                            "better search space for the next study.") \
        if facts["n_complete"] >= 3 else []
    return _combine(rule, llm, context)


def job_insights(job: dict) -> dict:
    facts = job_facts(job)
    context = job_context(facts)
    rule = rule_based_job(facts)
    llm = _ask_all(context, "Diagnose this fine-tuning run (overfitting, underfitting, "
                            "or healthy) and propose a search space for an Optuna study.")
    return _combine(rule, llm, context)
