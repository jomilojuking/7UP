import os
import numpy as np
from datasets import load_dataset
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
    DataCollatorWithPadding,
    Trainer,
    TrainingArguments,
)

# small subsets keep runs short on a laptop; raise them if you have a GPU
MAX_TRAIN = int(os.getenv("MAX_TRAIN", 2000))
MAX_EVAL = int(os.getenv("MAX_EVAL", 500))


def _load_data(tokenizer, need_train=True):
    ds = load_dataset("stanfordnlp/sst2")
    evals = ds["validation"].shuffle(seed=42).select(
        range(min(MAX_EVAL, len(ds["validation"])))
    )

    def tok(batch):
        return tokenizer(batch["sentence"], truncation=True, max_length=128)

    evals = evals.map(tok, batched=True)
    train = None
    if need_train:
        train = ds["train"].shuffle(seed=42).select(range(MAX_TRAIN))
        train = train.map(tok, batched=True)
    return train, evals


def _metrics(p):
    """Accuracy, precision, recall and F1 (positive class = 1)."""
    preds = np.argmax(p.predictions, axis=1)
    labels = p.label_ids
    tp = int(((preds == 1) & (labels == 1)).sum())
    fp = int(((preds == 1) & (labels == 0)).sum())
    fn = int(((preds == 0) & (labels == 1)).sum())
    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = (2 * precision * recall / (precision + recall)
          if (precision + recall) else 0.0)
    return {
        "accuracy": float((preds == labels).mean()),
        "precision": float(precision),
        "recall": float(recall),
        "f1": float(f1),
    }


def train(hub_id, learning_rate, batch_size, epochs,
          weight_decay=0.0, output_dir="outputs/run", callbacks=None, save=False,
          metrics_out=None):
    """Fine-tune a Hugging Face model and return eval accuracy.

    Also logs train_* and test_* metrics (loss, accuracy, precision, recall,
    F1) to the active MLflow run, if there is one. If a dict is passed as
    metrics_out, the same metrics are copied into it for the caller.
    """
    tokenizer = AutoTokenizer.from_pretrained(hub_id)
    model = AutoModelForSequenceClassification.from_pretrained(hub_id, num_labels=2)
    train_ds, eval_ds = _load_data(tokenizer)

    args = TrainingArguments(
        output_dir=output_dir,
        learning_rate=learning_rate,
        per_device_train_batch_size=batch_size,
        per_device_eval_batch_size=64,
        num_train_epochs=epochs,
        weight_decay=weight_decay,
        eval_strategy="epoch",
        save_strategy="no",
        logging_steps=50,
        report_to="none",
        seed=42,
    )
    trainer = Trainer(
        model=model,
        args=args,
        train_dataset=train_ds,
        eval_dataset=eval_ds,
        data_collator=DataCollatorWithPadding(tokenizer),
        compute_metrics=_metrics,
        callbacks=callbacks or [],
    )
    trainer.train()

    # final metrics on the evaluation set (validation sample)
    test = trainer.evaluate()
    acc = test["eval_accuracy"]

    # same metrics on the training subset
    train_m = trainer.evaluate(eval_dataset=train_ds, metric_key_prefix="trainset")

    extra = {}
    for name in ("loss", "accuracy", "precision", "recall", "f1"):
        extra[f"test_{name}"] = float(test[f"eval_{name}"])
        extra[f"train_{name}"] = float(train_m[f"trainset_{name}"])

    try:
        import mlflow
        if mlflow.active_run():
            mlflow.log_metrics(extra)
    except Exception:
        pass  # never let logging break a training run

    if metrics_out is not None:
        metrics_out.update(extra)

    if save:
        trainer.save_model(output_dir)
        tokenizer.save_pretrained(output_dir)
    return acc


def evaluate_dir(model_dir):
    """Return (n_correct, n_total) of a saved model on the shared eval set."""
    tokenizer = AutoTokenizer.from_pretrained(model_dir)
    model = AutoModelForSequenceClassification.from_pretrained(model_dir)
    _, eval_ds = _load_data(tokenizer, need_train=False)
    trainer = Trainer(
        model=model,
        args=TrainingArguments(output_dir="outputs/eval",
                               per_device_eval_batch_size=64, report_to="none"),
        data_collator=DataCollatorWithPadding(tokenizer),
    )
    out = trainer.predict(eval_ds)
    preds = np.argmax(out.predictions, axis=1)
    return int((preds == out.label_ids).sum()), int(len(preds))