"""Dataset loading for any Hugging Face dataset or an uploaded CSV.

Everything here is torch-free so it can be unit tested quickly. The output is
always two `datasets.Dataset` objects with exactly two columns, "text" and
"labels" (an integer class index), plus the list of label names.
"""

import io
import os
from dataclasses import dataclass

import numpy as np

from app.schemas import DatasetSpec
from app.state import store

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")
MAX_UPLOAD_MB = float(os.getenv("MAX_UPLOAD_MB", 20))
MAX_CLASSES = 100
SEED = 42


class DatasetError(ValueError):
    """Raised for problems the user can fix (bad column names, empty file...)."""


@dataclass
class Prepared:
    train: object  # datasets.Dataset
    eval: object   # datasets.Dataset
    label_names: list[str]
    eval_source: str  # which split, or "10% holdout of train"

    @property
    def num_labels(self) -> int:
        return len(self.label_names)


# ---------------------------------------------------------------- uploads
def save_upload(raw: bytes, filename: str) -> dict:
    """Validate a CSV upload, store it on disk and register it."""
    import pandas as pd

    if len(raw) > MAX_UPLOAD_MB * 1024 * 1024:
        raise DatasetError(f"File is larger than {MAX_UPLOAD_MB:g} MB.")
    if not filename.lower().endswith(".csv"):
        raise DatasetError("Only .csv files are supported.")
    try:
        df = pd.read_csv(io.BytesIO(raw))
    except Exception as e:
        raise DatasetError(f"Could not read the CSV: {e}") from e
    if df.empty or len(df.columns) < 2:
        raise DatasetError("The CSV needs at least two columns (text and label) and one row.")

    rec = store.create("upload", {
        "filename": os.path.basename(filename),
        "rows": int(len(df)),
        "columns": [str(c) for c in df.columns],
    })
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    path = os.path.join(UPLOAD_DIR, f"upload-{rec['id']}.csv")
    with open(path, "wb") as f:
        f.write(raw)
    rec = store.update("upload", rec["id"], path=path)
    preview = df.head(5).astype(str).to_dict(orient="records")
    return {"upload_id": rec["id"], "filename": rec["filename"], "rows": rec["rows"],
            "columns": rec["columns"], "preview": preview}


# ---------------------------------------------------------------- inspect
def inspect_hub(hub_id: str, config: str | None = None) -> dict:
    """Splits and columns of a Hub dataset, without downloading the data."""
    from datasets import ClassLabel, get_dataset_config_names, load_dataset_builder

    try:
        builder = load_dataset_builder(hub_id, config)
    except Exception as e:
        msg = str(e)
        if "Config name is missing" in msg or "config" in msg.lower():
            try:
                configs = get_dataset_config_names(hub_id)
                raise DatasetError(f"Pick a config for {hub_id}: {', '.join(configs[:20])}") from e
            except DatasetError:
                raise
            except Exception:
                pass
        raise DatasetError(f"Could not load {hub_id}: {msg[:300]}") from e

    info = builder.info
    features = info.features or {}
    columns, label_candidates, text_candidates = [], [], []
    for name, feat in features.items():
        kind = type(feat).__name__
        dtype = getattr(feat, "dtype", None)
        columns.append({"name": name, "type": kind if kind != "Value" else str(dtype)})
        if isinstance(feat, ClassLabel):
            label_candidates.append(name)
        elif dtype == "string":
            text_candidates.append(name)
    splits = {k: v.num_examples for k, v in (info.splits or {}).items()}
    return {
        "hub_id": hub_id,
        "config": config,
        "splits": splits,
        "columns": columns,
        "suggested_text_column": text_candidates[0] if text_candidates else None,
        "suggested_label_column": label_candidates[0] if label_candidates else None,
    }


# ---------------------------------------------------------------- loading
def _load_raw(spec: DatasetSpec):
    from datasets import load_dataset

    if spec.upload_id is not None:
        rec = store.get("upload", spec.upload_id)
        if not rec or not os.path.exists(rec.get("path", "")):
            raise DatasetError(f"Upload {spec.upload_id} not found. Upload the CSV again.")
        return {"train": load_dataset("csv", data_files=rec["path"], split="train")}
    try:
        return load_dataset(spec.hub_id, spec.config)
    except Exception as e:
        raise DatasetError(f"Could not load {spec.label()}: {str(e)[:300]}") from e


def _encode_labels(train, label_col):
    """Return (label_names, value->index mapping or None for ClassLabel)."""
    from datasets import ClassLabel

    feat = train.features[label_col]
    if isinstance(feat, ClassLabel):
        return list(feat.names), None
    values = [v for v in train[label_col] if v is not None and v == v]  # drop None/NaN
    uniq = sorted(set(values), key=lambda v: (str(type(v)), v))
    if len(uniq) < 2:
        raise DatasetError(f"Column '{label_col}' has fewer than 2 distinct labels.")
    if len(uniq) > MAX_CLASSES:
        raise DatasetError(
            f"Column '{label_col}' has {len(uniq)} distinct values; is it really the label column?")
    return [str(v) for v in uniq], {v: i for i, v in enumerate(uniq)}


def _to_text_labels(ds, text_col, label_col, mapping, n_labels):
    def convert(row):
        lab = row[label_col]
        if mapping is not None:
            lab = mapping.get(lab, -1)
        return {"text": "" if row[text_col] is None else str(row[text_col]),
                "labels": int(lab) if lab is not None else -1}

    ds = ds.map(convert, remove_columns=ds.column_names)
    # Unlabelled rows (e.g. GLUE test splits use -1) and unseen labels are dropped.
    return ds.filter(lambda r: 0 <= r["labels"] < n_labels and r["text"].strip() != "")


def load_splits(spec: DatasetSpec, max_train: int, max_eval: int) -> Prepared:
    raw = _load_raw(spec)
    if spec.train_split not in raw:
        raise DatasetError(f"Split '{spec.train_split}' not found. Available: {list(raw)}")
    train = raw[spec.train_split]
    for col in (spec.text_column, spec.label_column):
        if col not in train.column_names:
            raise DatasetError(f"Column '{col}' not found. Available: {train.column_names}")

    names, mapping = _encode_labels(train, spec.label_column)
    train = _to_text_labels(train, spec.text_column, spec.label_column, mapping, len(names))

    evals, source = None, None
    if spec.eval_split and spec.eval_split in raw:
        evals = _to_text_labels(raw[spec.eval_split], spec.text_column, spec.label_column,
                                mapping, len(names))
        source = spec.eval_split
    if evals is None or len(evals) == 0:
        parts = train.train_test_split(test_size=0.1, seed=SEED)
        train, evals = parts["train"], parts["test"]
        source = "10% holdout of train"

    if len(train) == 0:
        raise DatasetError("No labelled training rows left after cleaning.")
    train = train.shuffle(seed=SEED).select(range(min(max_train, len(train))))
    evals = evals.shuffle(seed=SEED).select(range(min(max_eval, len(evals))))
    return Prepared(train=train, eval=evals, label_names=names, eval_source=source)


# ---------------------------------------------------------------- metrics
def classification_metrics(preds, labels, num_labels: int) -> dict:
    """Accuracy, precision, recall, F1. Binary uses class 1 as positive; multi-class is macro."""
    from sklearn.metrics import precision_recall_fscore_support

    preds = np.asarray(preds)
    labels = np.asarray(labels)
    avg = "binary" if num_labels == 2 else "macro"
    p, r, f1, _ = precision_recall_fscore_support(labels, preds, average=avg, zero_division=0)
    return {
        "accuracy": float((preds == labels).mean()) if len(labels) else 0.0,
        "precision": float(p),
        "recall": float(r),
        "f1": float(f1),
    }


# ---------------------------------------------------------------- profile
STOPWORDS = set("""
a an and are as at be been but by for from has have he her his i if in into is it its
of on or our she so than that the their them then there these they this to was we were
what when which who will with you your not no n't 's 're 've 'll 'd -- - , . ; : ! ? ' "
do does did just all can would could should about more most out up very one also
""".split())
PROFILE_TRAIN = int(os.getenv("PROFILE_TRAIN_ROWS", 5000))
PROFILE_EVAL = int(os.getenv("PROFILE_EVAL_ROWS", 2000))
_profile_cache: dict[str, dict] = {}


def _words(text: str) -> list[str]:
    import re
    return [w for w in re.findall(r"[a-z][a-z']+", text.lower())
            if w not in STOPWORDS and len(w) > 2]


def profile(spec: DatasetSpec) -> dict:
    """Summary statistics and samples used by the dataset visuals in the UI.

    Works on a random sample (PROFILE_TRAIN_ROWS / PROFILE_EVAL_ROWS) so it
    stays fast on big datasets; the sample sizes are returned with the result.
    """
    import json
    from collections import Counter

    key = json.dumps(spec.model_dump(), sort_keys=True)
    if key in _profile_cache:
        return _profile_cache[key]

    data = load_splits(spec, PROFILE_TRAIN, PROFILE_EVAL)
    names = data.label_names
    n = len(names)

    def counts(ds):
        c = Counter(ds["labels"])
        return [int(c.get(i, 0)) for i in range(n)]

    train_text, train_labels = data.train["text"], data.train["labels"]
    lengths = [len(t.split()) for t in train_text]
    srt = sorted(lengths)

    def pct(p):
        return float(srt[min(len(srt) - 1, int(p * (len(srt) - 1)))]) if srt else 0.0

    # Histogram of words per example, clipped at the 99th percentile so one
    # very long review does not flatten the chart.
    top = max(1, int(pct(0.99)))
    n_bins = min(30, top)
    width = max(1, -(-top // n_bins))
    edges = list(range(0, top + width, width))
    hist = [0] * (len(edges) - 1)
    for length in lengths:
        hist[min(len(hist) - 1, length // width)] += 1

    per_label_len = []
    word_counts = [Counter() for _ in range(n)]
    examples: list[list[str]] = [[] for _ in range(n)]
    for text, lab in zip(train_text, train_labels):
        word_counts[lab].update(_words(text))
        if len(examples[lab]) < 3 and 30 <= len(text) <= 220:
            examples[lab].append(text.strip())
    for i in range(n):
        ls = [length for length, lab in zip(lengths, train_labels) if lab == i]
        per_label_len.append(round(sum(ls) / len(ls), 1) if ls else 0.0)

    # Words that are frequent in a class *and* more frequent there than overall.
    overall = Counter()
    for wc in word_counts:
        overall.update(wc)
    total_overall = sum(overall.values()) or 1
    top_words = []
    for i in range(n):
        total_i = sum(word_counts[i].values()) or 1
        scored = [
            (w, c, (c / total_i) / (overall[w] / total_overall))
            for w, c in word_counts[i].items() if c >= 3
        ]
        scored.sort(key=lambda x: x[1] * min(x[2], 4.0), reverse=True)
        top_words.append([{"word": w, "count": c} for w, c, _ in scored[:10]])

    result = {
        "dataset": spec.label(),
        "label_names": names,
        "eval_source": data.eval_source,
        "train": {"rows": len(data.train), "counts": counts(data.train)},
        "eval": {"rows": len(data.eval), "counts": counts(data.eval)},
        "length": {
            "edges": edges, "counts": hist,
            "mean": round(sum(lengths) / len(lengths), 1) if lengths else 0.0,
            "median": pct(0.5), "p95": pct(0.95), "max": float(srt[-1]) if srt else 0.0,
            "mean_by_label": per_label_len,
        },
        "top_words": top_words,
        "examples": examples,
        "sampled": {"train_limit": PROFILE_TRAIN, "eval_limit": PROFILE_EVAL},
    }
    if len(_profile_cache) > 32:
        _profile_cache.clear()
    _profile_cache[key] = result
    return result
