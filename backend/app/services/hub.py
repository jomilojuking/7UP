"""Hugging Face Hub storage and versioning for fine-tuned models.

Each fine-tuning job is pushed as a commit to one model repo and tagged
`job-<id>`, so every run is a retrievable version:

    AutoModelForSequenceClassification.from_pretrained("user/repo", revision="job-7")

Models live on the Hub, not just in the container, so they survive a restart
of the Hugging Face Space.
"""

import os
import re

from huggingface_hub import HfApi

HFAIO_TAG = "hfaio"


def enabled() -> bool:
    return bool(os.getenv("HF_TOKEN"))


def _api() -> HfApi:
    return HfApi(token=os.environ["HF_TOKEN"])


def _slug(text: str) -> str:
    return re.sub(r"[^a-zA-Z0-9._-]+", "-", text).strip("-").lower()[:60]


def default_repo(base_model: str, dataset_label: str) -> str:
    """HF_REPO if set, else <your-username>/hfaio-<model>-<dataset>."""
    if os.getenv("HF_REPO"):
        return os.environ["HF_REPO"]
    user = _api().whoami()["name"]
    return f"{user}/hfaio-{_slug(base_model.split('/')[-1])}-{_slug(dataset_label.split('/')[-1])}"


def model_card(job_id, base_model, dataset_label, params, metrics, label_names=None) -> str:
    rows = "\n".join(
        f"| {k.replace('_', ' ')} | {v:.4f} |" for k, v in sorted(metrics.items())
        if isinstance(v, (int, float))
    )
    hp = "\n".join(f"- **{k}**: {v}" for k, v in params.items())
    labels = f"\n**Labels:** {', '.join(label_names)}\n" if label_names else ""
    return (
        "---\n"
        f"base_model: {base_model}\n"
        "library_name: transformers\n"
        "pipeline_tag: text-classification\n"
        f"tags: [{HFAIO_TAG}, text-classification]\n"
        "---\n\n"
        f"# {base_model} fine-tuned on {dataset_label}\n\n"
        f"Trained with HFAIO (job {job_id}). This version is tagged `job-{job_id}`.\n"
        f"{labels}\n"
        f"## Hyperparameters\n{hp}\n\n"
        f"## Metrics\n| metric | value |\n|---|---|\n{rows}\n\n"
        "## Load this version\n"
        "```python\n"
        "from transformers import pipeline\n"
        f'clf = pipeline("text-classification", model="REPO_ID", revision="job-{job_id}")\n'
        "```\n"
    )


def push_folder(folder, repo_id, job_id, base_model, dataset_label, params, metrics,
                private=True):
    """Upload a model folder as a new commit + tag. Returns (url, revision)."""
    api = _api()
    api.create_repo(repo_id, exist_ok=True, private=private)
    card = model_card(job_id, base_model, dataset_label, params, metrics)
    with open(os.path.join(folder, "README.md"), "w") as f:
        f.write(card.replace("REPO_ID", repo_id))
    acc = metrics.get("test_accuracy")
    commit = api.upload_folder(
        folder_path=folder,
        repo_id=repo_id,
        commit_message=f"HFAIO job {job_id}: {base_model} on {dataset_label}"
                       + (f" (test acc {acc:.4f})" if acc is not None else ""),
        ignore_patterns=["checkpoint-*", "*.pt", "training_args.bin"],
    )
    tag = f"job-{job_id}"
    try:
        api.create_tag(repo_id, tag=tag, revision=commit.oid, exist_ok=True)
    except TypeError:  # older huggingface_hub without exist_ok
        api.create_tag(repo_id, tag=tag, revision=commit.oid)
    return f"https://huggingface.co/{repo_id}/tree/{tag}", tag


def list_pushed_models() -> list[dict]:
    """Models in your account that HFAIO pushed, with their versions (tags)."""
    api = _api()
    user = api.whoami()["name"]
    out = []
    for m in api.list_models(author=user, filter=HFAIO_TAG, sort="last_modified", limit=50):
        try:
            refs = api.list_repo_refs(m.id)
            versions = sorted((t.name for t in refs.tags), reverse=True)
        except Exception:
            versions = []
        out.append({
            "repo_id": m.id,
            "url": f"https://huggingface.co/{m.id}",
            "last_modified": str(getattr(m, "last_modified", "") or ""),
            "versions": versions,
        })
    return out
