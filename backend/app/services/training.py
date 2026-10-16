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
    preds = np.argmax(p.predictions, axis=1)
    return {"accuracy": float((preds == p.label_ids).mean())}


def train(hub_id, learning_rate, batch_size, epochs,
          weight_decay=0.0, output_dir="outputs/run", callbacks=None, save=False):
    """Fine-tune a Hugging Face model and return eval accuracy."""
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
    acc = trainer.evaluate()["eval_accuracy"]
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