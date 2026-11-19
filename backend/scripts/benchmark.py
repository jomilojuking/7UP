"""Reproduce the README evaluation table.

Fine-tunes one model with the regularised training setup (linear warmup and
decay, weight decay, best-epoch selection with early stopping) and prints a
Markdown table of train vs. test metrics that you can paste into the README.

    cd backend
    python scripts/benchmark.py                                  # SST-2, defaults below
    python scripts/benchmark.py --max-train 8000 --epochs 3      # bigger, slower
    python scripts/benchmark.py --dataset imdb --text-column text --eval-split test

Takes roughly 10-30 minutes on a laptop CPU with the defaults; much faster on
Apple Silicon (MPS) or a GPU.
"""

import argparse
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument("--model", default="distilbert-base-uncased")
    ap.add_argument("--dataset", default="stanfordnlp/sst2")
    ap.add_argument("--config", default=None)
    ap.add_argument("--text-column", default="sentence")
    ap.add_argument("--label-column", default="label")
    ap.add_argument("--eval-split", default="validation")
    ap.add_argument("--lr", type=float, default=2e-5)
    ap.add_argument("--batch-size", type=int, default=16)
    ap.add_argument("--epochs", type=int, default=3)
    ap.add_argument("--weight-decay", type=float, default=0.01)
    ap.add_argument("--warmup-ratio", type=float, default=0.1)
    ap.add_argument("--max-train", type=int, default=4000)
    ap.add_argument("--max-eval", type=int, default=500)
    args = ap.parse_args()

    # read by app.services.training at import time
    os.environ["MAX_TRAIN"] = str(args.max_train)
    os.environ["MAX_EVAL"] = str(args.max_eval)
    from app.schemas import DatasetSpec
    from app.services.training import train

    spec = DatasetSpec(hub_id=args.dataset, config=args.config, text_column=args.text_column,
                       label_column=args.label_column, eval_split=args.eval_split)
    metrics = {}
    start = time.time()
    train(args.model, args.lr, args.batch_size, args.epochs, weight_decay=args.weight_decay,
          warmup_ratio=args.warmup_ratio, dataset=spec, output_dir="outputs/benchmark",
          save=True, metrics_out=metrics)
    minutes = (time.time() - start) / 60

    print(f"\n{args.model} on {spec.label()}: lr {args.lr}, batch {args.batch_size}, "
          f"up to {args.epochs} epochs (trained {metrics['epochs_trained']:.0f}), "
          f"weight decay {args.weight_decay}, warmup {args.warmup_ratio}, linear decay, "
          f"{args.max_train} train / {args.max_eval} test rows, {minutes:.1f} min\n")
    print("| Metric | Training Set | Test Set |")
    print("| :--- | :--- | :--- |")
    print(f"| Accuracy | {metrics['train_accuracy']:.3f} | {metrics['test_accuracy']:.3f} |")
    print(f"| Precision / F1-Score | {metrics['train_precision']:.3f} / {metrics['train_f1']:.3f}"
          f" | {metrics['test_precision']:.3f} / {metrics['test_f1']:.3f} |")
    print(f"| Recall | {metrics['train_recall']:.3f} | {metrics['test_recall']:.3f} |")
    print(f"| Loss | {metrics['train_loss']:.3f} | {metrics['test_loss']:.3f} |")
    print(f"\nTrain-test accuracy gap: {metrics['generalization_gap']:+.3f}")


if __name__ == "__main__":
    main()
