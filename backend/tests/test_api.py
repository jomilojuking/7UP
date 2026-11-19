def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["state_backend"] == "memory"
    assert body["runner"] == "in-process"


def test_import_unknown_model_returns_404(client, monkeypatch):
    import huggingface_hub

    def missing(hub_id):
        raise RuntimeError("404")

    monkeypatch.setattr(huggingface_hub, "model_info", missing)
    r = client.post("/models/import", json={"hub_id": "nobody/nothing"})
    assert r.status_code == 404


def test_import_and_list_models(client, model_id):
    models = client.get("/models").json()
    assert [m["id"] for m in models] == [model_id]
    assert models[0]["hub_id"] == "distilbert-base-uncased"


def test_finetune_requires_imported_model(client):
    r = client.post("/finetune/jobs", json={"model_id": 99})
    assert r.status_code == 404


def test_finetune_job_runs_to_done(client, model_id, fake_training):
    r = client.post("/finetune/jobs", json={"model_id": model_id, "epochs": 2})
    assert r.status_code == 200, r.text
    job_id = r.json()["id"]

    job = client.get(f"/finetune/jobs/{job_id}").json()
    assert job["status"] == "done", job
    assert job["runner"] == "in-process"
    assert job["accuracy"] == 0.82
    assert job["metrics"]["generalization_gap"] == 0.13
    assert job["mlflow_run_id"]
    assert job["dataset"] == "stanfordnlp/sst2"
    assert job["hub_url"] is None  # no HF_TOKEN -> no push
    assert fake_training.calls[0]["epochs"] == 2
    assert fake_training.calls[0]["weight_decay"] == 0.01


def test_old_style_sst2_dataset_still_accepted(client, model_id, fake_training):
    r = client.post("/finetune/jobs", json={"model_id": model_id, "dataset": "sst2"})
    assert r.status_code == 200


def test_unknown_dataset_string_rejected(client, model_id):
    r = client.post("/finetune/jobs", json={"model_id": model_id, "dataset": "imdb"})
    assert r.status_code == 422


def test_custom_hub_dataset_is_passed_to_training(client, model_id, fake_training):
    spec = {"hub_id": "imdb", "text_column": "text", "label_column": "label",
            "eval_split": "test"}
    r = client.post("/finetune/jobs", json={"model_id": model_id, "dataset": spec})
    assert r.status_code == 200
    assert r.json()["dataset"] == "imdb"
    assert fake_training.calls[0]["dataset"].text_column == "text"


def test_finetune_with_unknown_upload_rejected(client, model_id):
    r = client.post("/finetune/jobs", json={
        "model_id": model_id,
        "dataset": {"upload_id": 42, "text_column": "text", "label_column": "label"}})
    assert r.status_code == 404


def test_hyperparameter_validation(client, model_id):
    r = client.post("/finetune/jobs", json={"model_id": model_id, "epochs": 50})
    assert r.status_code == 422


def test_push_to_hub_when_token_set(client, model_id, fake_training, monkeypatch):
    from app.services import hub

    monkeypatch.setenv("HF_TOKEN", "hf_test")
    pushed = {}

    def fake_push(folder, repo_id, job_id, base_model, dataset_label, params, metrics,
                  private=True):
        pushed.update(repo=repo_id, job=job_id)
        return f"https://huggingface.co/{repo_id}/tree/job-{job_id}", f"job-{job_id}"

    monkeypatch.setattr(hub, "push_folder", fake_push)
    monkeypatch.setattr(hub, "default_repo", lambda m, d: "me/hfaio-test")

    job_id = client.post("/finetune/jobs", json={"model_id": model_id}).json()["id"]
    job = client.get(f"/finetune/jobs/{job_id}").json()
    assert job["status"] == "done"
    assert job["hub_repo"] == "me/hfaio-test"
    assert job["hub_revision"] == f"job-{job_id}"
    assert pushed == {"repo": "me/hfaio-test", "job": job_id}


def test_failed_push_does_not_fail_the_job(client, model_id, fake_training, monkeypatch):
    from app.services import hub

    monkeypatch.setenv("HF_TOKEN", "hf_test")

    def boom(*a, **k):
        raise RuntimeError("network down")

    monkeypatch.setattr(hub, "default_repo", lambda m, d: "me/repo")
    monkeypatch.setattr(hub, "push_folder", boom)
    job_id = client.post("/finetune/jobs", json={"model_id": model_id}).json()["id"]
    job = client.get(f"/finetune/jobs/{job_id}").json()
    assert job["status"] == "done"
    assert "network down" in job["hub_error"]


def test_capacity_limit(client, model_id, monkeypatch):
    from app.state import store

    monkeypatch.setenv("MAX_ACTIVE_JOBS", "1")
    store.create("job", {"status": "running"})
    r = client.post("/finetune/jobs", json={"model_id": model_id})
    assert r.status_code == 429


def test_ab_test_between_two_runs(client, model_id, fake_training):
    a = client.post("/finetune/jobs", json={"model_id": model_id}).json()["id"]
    b = client.post("/finetune/jobs", json={"model_id": model_id}).json()["id"]
    created = client.post("/ab-tests", json={"job_a": a, "job_b": b})
    assert created.status_code == 200, created.text
    res = client.get(f"/ab-tests/{created.json()['id']}/results").json()
    assert res["status"] == "done"
    assert res["accuracy_a"] == 0.9 and res["accuracy_b"] == 0.8


def test_ab_test_needs_same_dataset(client, model_id, fake_training):
    a = client.post("/finetune/jobs", json={"model_id": model_id}).json()["id"]
    b = client.post("/finetune/jobs", json={
        "model_id": model_id,
        "dataset": {"hub_id": "imdb", "text_column": "text", "label_column": "label"}},
    ).json()["id"]
    r = client.post("/ab-tests", json={"job_a": a, "job_b": b})
    assert r.status_code == 400


def test_study_request_validates_search_space(client, model_id):
    r = client.post("/tuning/studies", json={
        "model_id": model_id, "n_trials": 2,
        "search_space": {"lr_min": 1e-4, "lr_max": 1e-5}})
    assert r.status_code == 422


def test_study_is_queued_with_custom_space(client, model_id, monkeypatch):
    from app import tasks

    ran = []
    monkeypatch.setattr(tasks, "run_study", lambda sid: ran.append(sid))
    r = client.post("/tuning/studies", json={
        "model_id": model_id, "n_trials": 2,
        "search_space": {"lr_min": 2e-5, "lr_max": 6e-5, "batch_sizes": [16]}})
    assert r.status_code == 200, r.text
    sid = r.json()["id"]
    assert ran == [sid]
    detail = client.get(f"/tuning/studies/{sid}").json()
    assert detail["search_space"]["batch_sizes"] == [16]
    assert detail["name"].startswith(f"study-{sid}-")


def test_job_insights_rule_based_without_token(client, model_id, fake_training):
    job_id = client.post("/finetune/jobs", json={"model_id": model_id}).json()["id"]
    r = client.post(f"/insights/jobs/{job_id}")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["source"] == "rule"
    assert "overfitting" in body["rule_based"]["summary"]
    assert body["recommended_search_space"]["wd_min"] >= 0.05
    assert body["llm"] == []
