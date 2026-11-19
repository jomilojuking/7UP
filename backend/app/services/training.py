import os

import numpy as np
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
    DataCollatorWithPadding,
    EarlyStoppingCallback,
    Trainer,
    TrainingArguments,
)

from app.schemas import DatasetSpec
from app.services.data import classification_metrics, load_splits

# Subset sizes keep CPU runs reasonable; raise them if you have a GPU.
MAX_TRAIN = int(os.getenv("MAX_TRAIN", 4000))
MAX_EVAL = int(os.getenv("MAX_EVAL", 500))
MAX_LENGTH = int(os.getenv("MAX_LENGTH", 128))


def _prepare(tokenizer, spec: DatasetSpec):
    data = load_splits(spec or DatasetSpec(), MAX_TRAIN, MAX_EVAL)

    def tok(batch):
        return tokenizer(batch["text"], truncation=True, max_length=MAX_LENGTH)

    train = data.train.map(tok, batched=True, remove_columns=["text"])
    evals = data.eval.map(tok, batched=True, remove_columns=["text"])
    return data, train, evals


def train(hub_id, learning_rate, batch_size, epochs,
          weight_decay=0.01, warmup_ratio=0.1, dataset: DatasetSpec | None = None,
          output_dir="outputs/run", callbacks=None, save=False, metrics_out=None):
    """Fine-tune a Hugging Face model and return eval accuracy.

    Regularisation to close the train/test gap: linear warmup then linear decay
    of the learning rate, weight decay, and (for saved runs) keeping the best
    epoch's weights with early stopping instead of the last epoch's.

    Logs train_* and test_* metrics (loss, accuracy, precision, recall, F1) to
    the active MLflow run if there is one, and copies them into metrics_out.
    """
    tokenizer = AutoTokenizer.from_pretrained(hub_id)
    data, train_ds, eval_ds = _prepare(tokenizer, dataset)
    id2label = dict(enumerate(data.label_names))
    model = AutoModelForSequenceClassification.from_pretrained(
        hub_id,
        num_labels=data.num_labels,
        id2label=id2label,
        label2id={v: k for k, v in id2label.items()},
        ignore_mismatched_sizes=True,  # lets a model with a different head be re-used
    )

    keep_best = save and epochs > 1
    args = TrainingArguments(
        output_dir=output_dir,
        learning_rate=learning_rate,
        per_device_train_batch_size=batch_size,
        per_device_eval_batch_size=64,
        num_train_epochs=epochs,
        weight_decay=weight_decay,
        lr_scheduler_type="linear",
        # transformers 5: a float in [0, 1) is the warmup fraction of total steps
        warmup_steps=float(warmup_ratio),
        eval_strategy="epoch",
        save_strategy="epoch" if keep_best else "no",
        save_total_limit=1 if keep_best else None,
        load_best_model_at_end=keep_best,
        metric_for_best_model="accuracy",
        logging_steps=50,
        report_to="none",
        seed=42,
    )
    cbs = list(callbacks or [])
    if keep_best:
        cbs.append(EarlyStoppingCallback(early_stopping_patience=1))

    def metrics_fn(p):
        return classification_metrics(np.argmax(p.predictions, axis=1), p.label_ids,
                                      data.num_labels)

    trainer = Trainer(
        model=model,
        args=args,
        train_dataset=train_ds,
        eval_dataset=eval_ds,
        data_collator=DataCollatorWithPadding(tokenizer),
        compute_metrics=metrics_fn,
        callbacks=cbs,
    )
    trainer.train()

    test = trainer.evaluate()
    acc = test["eval_accuracy"]
    train_m = trainer.predict(train_ds, metric_key_prefix="trainset").metrics
    extra = {}
    for name in ("loss", "accuracy", "precision", "recall", "f1"):
        extra[f"test_{name}"] = float(test[f"eval_{name}"])
        extra[f"train_{name}"] = float(train_m[f"trainset_{name}"])
    # positive = the model fits training data better than unseen data
    extra["generalization_gap"] = extra["train_accuracy"] - extra["test_accuracy"]
    extra["epochs_trained"] = float(trainer.state.epoch or epochs)  # < epochs if early stopping kicked in

    try:
        import mlflow
        if mlflow.active_run():
            mlflow.log_metrics(extra)
            mlflow.log_params({"num_labels": data.num_labels, "eval_source": data.eval_source,
                               "train_rows": len(train_ds), "eval_rows": len(eval_ds)})
    except Exception:
        pass  # never let logging break a training run

    if metrics_out is not None:
        metrics_out.update(extra)

    if save:
        trainer.save_model(output_dir)
        tokenizer.save_pretrained(output_dir)
        # checkpoints were only needed to pick the best epoch
        import shutil
        for d in os.listdir(output_dir):
            if d.startswith("checkpoint-"):
                shutil.rmtree(os.path.join(output_dir, d), ignore_errors=True)
    return acc


def evaluate_dir(model_ref, dataset: DatasetSpec | None = None, revision=None):
    """Return (n_correct, n_total) of a saved model on the shared eval set.

    model_ref is a local folder or a Hub repo id (with an optional revision),
    so A/B tests still work after a restart wipes the local models folder.
    """
    tokenizer = AutoTokenizer.from_pretrained(model_ref, revision=revision)
    model = AutoModelForSequenceClassification.from_pretrained(model_ref, revision=revision)
    _, _, eval_ds = _prepare(tokenizer, dataset)
    trainer = Trainer(
        model=model,
        args=TrainingArguments(output_dir="outputs/eval",
                               per_device_eval_batch_size=64, report_to="none"),
        data_collator=DataCollatorWithPadding(tokenizer),
    )
    out = trainer.predict(eval_ds)
    preds = np.argmax(out.predictions, axis=1)
    return int((preds == out.label_ids).sum()), int(len(preds))
