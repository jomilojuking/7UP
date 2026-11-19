import os

import mlflow
import optuna

from app.schemas import DatasetSpec, SearchSpace

STORAGE = os.getenv("OPTUNA_STORAGE", "sqlite:///optuna.db")
# Respect MLFLOW_TRACKING_URI (docker compose points it at the MLflow server);
# fall back to a local SQLite file.
mlflow.set_tracking_uri(os.getenv("MLFLOW_TRACKING_URI") or "sqlite:///mlflow.db")
mlflow.set_experiment(os.getenv("MLFLOW_EXPERIMENT", "hfaio"))


def _prune_callback(trial):
    from transformers import TrainerCallback

    class PruneCallback(TrainerCallback):
        """Reports each epoch's accuracy to Optuna and stops weak trials early."""

        def on_evaluate(self, args, state, control, metrics=None, **kwargs):
            trial.report(metrics["eval_accuracy"], int(state.epoch or 0))
            if trial.should_prune():
                raise optuna.TrialPruned()

    return PruneCallback()


def run_study(study_name, hub_id, n_trials, dataset: DatasetSpec | None = None,
              space: SearchSpace | None = None):
    from app.services.training import train

    space = space or SearchSpace()
    dataset = dataset or DatasetSpec()
    epochs = int(os.getenv("TUNE_EPOCHS", space.epochs))
    study = optuna.create_study(
        study_name=study_name,
        storage=STORAGE,
        direction="maximize",
        pruner=optuna.pruners.MedianPruner(n_startup_trials=2),
        load_if_exists=True,
    )
    study.set_user_attr("search_space", space.model_dump())
    study.set_user_attr("dataset", dataset.label())
    study.set_user_attr("model", hub_id)

    def objective(trial):
        lr = trial.suggest_float("learning_rate", space.lr_min, space.lr_max, log=True)
        bs = trial.suggest_categorical("batch_size", space.batch_sizes)
        wd = trial.suggest_float("weight_decay", space.wd_min, space.wd_max)
        with mlflow.start_run(run_name=f"{study_name}-trial-{trial.number}"):
            mlflow.log_params({"learning_rate": lr, "batch_size": bs, "weight_decay": wd,
                               "model": hub_id, "dataset": dataset.label(), "epochs": epochs})
            metrics = {}
            acc = train(hub_id, lr, bs, epochs=epochs, weight_decay=wd, dataset=dataset,
                        callbacks=[_prune_callback(trial)], metrics_out=metrics)
            mlflow.log_metric("accuracy", acc)
            for k in ("train_accuracy", "generalization_gap", "test_loss", "train_loss"):
                if k in metrics:
                    trial.set_user_attr(k, metrics[k])
        return acc

    study.optimize(objective, n_trials=n_trials)


def load(study_name):
    return optuna.load_study(study_name=study_name, storage=STORAGE)


def get_trials(study_name):
    study = load(study_name)
    return [
        {
            "number": t.number,
            "state": t.state.name,
            "learning_rate": t.params.get("learning_rate", 0.0),
            "batch_size": t.params.get("batch_size", 0),
            "weight_decay": t.params.get("weight_decay", 0.0),
            "accuracy": t.value,
        }
        for t in study.trials
    ]
