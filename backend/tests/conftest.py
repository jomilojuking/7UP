"""Shared test setup.

The tests never download models or datasets: training and evaluation are
replaced with a fake module, so the suite runs in seconds on any CI runner.
"""

import os
import sys
import tempfile
import types

import pytest

# Isolate every side effect in a temp folder, before the app is imported.
_TMP = tempfile.mkdtemp(prefix="hfaio-tests-")
os.chdir(_TMP)
for var in ("REDIS_URL", "HF_TOKEN", "HF_REPO", "HFAIO_API_KEY", "USE_WORKER"):
    os.environ.pop(var, None)
os.environ["UPLOAD_DIR"] = os.path.join(_TMP, "uploads")
os.environ["MODELS_DIR"] = os.path.join(_TMP, "models")
os.environ["MLFLOW_TRACKING_URI"] = f"sqlite:///{os.path.join(_TMP, 'mlflow.db')}"
os.environ["OPTUNA_STORAGE"] = f"sqlite:///{os.path.join(_TMP, 'optuna.db')}"
os.environ["MAX_ACTIVE_JOBS"] = "100"

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient  # noqa: E402

from app import security  # noqa: E402
from app.main import app  # noqa: E402
from app.state import store  # noqa: E402

FAKE_METRICS = {
    "train_accuracy": 0.95, "test_accuracy": 0.82, "train_loss": 0.15, "test_loss": 0.45,
    "train_f1": 0.95, "test_f1": 0.81, "train_precision": 0.95, "test_precision": 0.8,
    "train_recall": 0.95, "test_recall": 0.82, "generalization_gap": 0.13, "epochs_trained": 2.0,
}


@pytest.fixture
def fake_training(monkeypatch):
    """Replace app.services.training (torch + downloads) with a fast fake."""
    calls = []

    def train(hub_id, learning_rate, batch_size, epochs, weight_decay=0.01,
              warmup_ratio=0.1, dataset=None, output_dir="outputs/run", callbacks=None,
              save=False, metrics_out=None):
        calls.append({"hub_id": hub_id, "lr": learning_rate, "epochs": epochs,
                      "weight_decay": weight_decay, "dataset": dataset})
        if save:
            os.makedirs(output_dir, exist_ok=True)
            with open(os.path.join(output_dir, "config.json"), "w") as f:
                f.write("{}")
        if metrics_out is not None:
            metrics_out.update(FAKE_METRICS)
        return FAKE_METRICS["test_accuracy"]

    def evaluate_dir(model_ref, dataset=None, revision=None):
        return (90, 100) if model_ref.endswith("1") else (80, 100)

    fake = types.ModuleType("app.services.training")
    fake.train, fake.evaluate_dir, fake.calls = train, evaluate_dir, calls
    monkeypatch.setitem(sys.modules, "app.services.training", fake)
    return fake


@pytest.fixture(autouse=True)
def clean_state(monkeypatch):
    for var in ("HF_TOKEN", "HF_REPO", "HFAIO_API_KEY", "USE_WORKER"):
        monkeypatch.delenv(var, raising=False)
    store.clear()
    security.heavy_limiter.reset()
    security.default_limiter.reset()
    yield
    store.clear()


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def model_id(client, monkeypatch):
    import huggingface_hub
    monkeypatch.setattr(huggingface_hub, "model_info", lambda hub_id: {"id": hub_id})
    r = client.post("/models/import", json={"hub_id": "distilbert-base-uncased"})
    assert r.status_code == 200, r.text
    return r.json()["id"]
