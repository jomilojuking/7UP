import optuna
import mlflow
from transformers import TrainerCallback
from app.services.training import train

STORAGE = "sqlite:///optuna.db"
mlflow.set_tracking_uri("sqlite:///mlflow.db")
mlflow.set_experiment("hfaio")


class PruneCallback(TrainerCallback):
    """Reports each epoch's accuracy to Optuna and stops weak trials early."""

    def __init__(self, trial):
        self.trial = trial

    def on_evaluate(self, args, state, control, metrics=None, **kwargs):
        self.trial.report(metrics["eval_accuracy"], int(state.epoch or 0))
        if self.trial.should_prune():
            raise optuna.TrialPruned()


def run_study(study_name, hub_id, n_trials):
    study = optuna.create_study(
        study_name=study_name,
        storage=STORAGE,
        direction="maximize",
        pruner=optuna.pruners.MedianPruner(n_startup_trials=2),
        load_if_exists=True,
    )

    def objective(trial):
        lr = trial.suggest_float("learning_rate", 1e-5, 1e-4, log=True)
        bs = trial.suggest_categorical("batch_size", [16, 32])
        wd = trial.suggest_float("weight_decay", 0.0, 0.1)
        with mlflow.start_run(run_name=f"{study_name}-trial-{trial.number}"):
            mlflow.log_params({"learning_rate": lr, "batch_size": bs,
                               "weight_decay": wd, "model": hub_id})
            acc = train(hub_id, lr, bs, epochs=3, weight_decay=wd,
                        callbacks=[PruneCallback(trial)])
            mlflow.log_metric("accuracy", acc)
        return acc

    study.optimize(objective, n_trials=n_trials)


def get_trials(study_name):
    study = optuna.load_study(study_name=study_name, storage=STORAGE)
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