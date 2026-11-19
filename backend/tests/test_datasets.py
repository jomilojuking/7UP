import pytest
from pydantic import ValidationError

from app.schemas import DatasetSpec
from app.services import data

CSV = "review,sentiment\n" + "\n".join(
    f"{'great movie' if i % 2 else 'terrible film'} number {i},{'pos' if i % 2 else 'neg'}"
    for i in range(40)
)


def _upload(client, text=CSV, name="reviews.csv"):
    return client.post("/datasets/upload", files={"file": (name, text.encode(), "text/csv")})


def test_upload_csv(client):
    r = _upload(client)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["columns"] == ["review", "sentiment"]
    assert body["rows"] == 40
    assert len(body["preview"]) == 5
    listed = client.get("/datasets/uploads").json()
    assert listed[0]["id"] == body["upload_id"]
    assert "path" not in listed[0]


def test_upload_rejects_non_csv(client):
    assert _upload(client, name="data.txt").status_code == 400


def test_upload_rejects_single_column(client):
    assert _upload(client, text="only\na\nb\n").status_code == 400


def test_load_splits_from_upload_with_string_labels(client):
    uid = _upload(client).json()["upload_id"]
    spec = DatasetSpec(upload_id=uid, text_column="review", label_column="sentiment")
    prepared = data.load_splits(spec, max_train=30, max_eval=10)
    assert prepared.label_names == ["neg", "pos"]
    assert prepared.eval_source == "10% holdout of train"
    assert prepared.train.column_names == ["text", "labels"]
    assert len(prepared.train) == 30
    assert 0 < len(prepared.eval) <= 10
    assert set(prepared.train["labels"]) == {0, 1}


def test_missing_column_is_a_clear_error(client):
    uid = _upload(client).json()["upload_id"]
    spec = DatasetSpec(upload_id=uid, text_column="text", label_column="sentiment")
    with pytest.raises(data.DatasetError, match="Column 'text' not found"):
        data.load_splits(spec, 10, 10)


def test_spec_needs_a_source():
    with pytest.raises(ValidationError):
        DatasetSpec(hub_id=None)
    with pytest.raises(ValidationError):
        DatasetSpec(text_column="x", label_column="x")


def test_upload_overrides_hub_default():
    spec = DatasetSpec(upload_id=3, text_column="t", label_column="l")
    assert spec.hub_id is None
    assert spec.label() == "upload #3"


def test_binary_metrics():
    m = data.classification_metrics([1, 0, 1, 1], [1, 0, 0, 1], num_labels=2)
    assert m["accuracy"] == 0.75
    assert m["precision"] == pytest.approx(2 / 3)
    assert m["recall"] == 1.0


def test_multiclass_metrics_use_macro_average():
    m = data.classification_metrics([0, 1, 2, 2], [0, 1, 2, 1], num_labels=3)
    assert m["accuracy"] == 0.75
    assert 0 < m["f1"] < 1


def test_profile_endpoint(client):
    uid = _upload(client).json()["upload_id"]
    spec = {"upload_id": uid, "text_column": "review", "label_column": "sentiment"}
    r = client.post("/datasets/profile", json=spec)
    assert r.status_code == 200, r.text
    p = r.json()
    assert p["label_names"] == ["neg", "pos"]
    assert sum(p["train"]["counts"]) == p["train"]["rows"]
    assert sum(p["length"]["counts"]) == p["train"]["rows"]
    assert len(p["length"]["edges"]) == len(p["length"]["counts"]) + 1
    words = [w["word"] for w in p["top_words"][1]]
    assert "great" in words and "terrible" not in words
    assert all("great" in e for e in p["examples"][1])


def test_profile_unknown_upload(client):
    r = client.post("/datasets/profile",
                    json={"upload_id": 9, "text_column": "a", "label_column": "b"})
    assert r.status_code == 404
