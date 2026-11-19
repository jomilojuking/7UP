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
