import optuna
import pytest
from optuna.distributions import CategoricalDistribution, FloatDistribution

from app.schemas import SearchSpace
from app.services import insights

optuna.logging.set_verbosity(optuna.logging.WARNING)

DISTS = {
    "learning_rate": FloatDistribution(1e-5, 1e-4, log=True),
    "batch_size": CategoricalDistribution([16, 32]),
    "weight_decay": FloatDistribution(0.0, 0.1),
}


def make_study(points, space=None):
    study = optuna.create_study(direction="maximize")
    study.set_user_attr("search_space", (space or SearchSpace()).model_dump())
    study.set_user_attr("model", "distilbert-base-uncased")
    study.set_user_attr("dataset", "stanfordnlp/sst2")
    for lr, bs, wd, acc in points:
        study.add_trial(optuna.trial.create_trial(
            params={"learning_rate": lr, "batch_size": bs, "weight_decay": wd},
            distributions=DISTS, value=acc, user_attrs={"generalization_gap": 0.02}))
    return study


def test_rule_based_needs_three_trials():
    facts = insights.study_facts(make_study([(2e-5, 16, 0.01, 0.8)]))
    out = insights.rule_based_study(facts)
    assert "Fewer than 3" in out["summary"]


def test_rule_based_narrows_around_top_trials():
    study = make_study([(3e-5, 16, 0.01, 0.86), (4e-5, 16, 0.02, 0.85),
                        (2.5e-5, 32, 0.03, 0.84), (9e-5, 32, 0.09, 0.70)])
    out = insights.rule_based_study(insights.study_facts(study))
    space = SearchSpace(**out["search_space"])  # must be a valid space
    assert 1e-5 <= space.lr_min < 2.5e-5 and 4e-5 < space.lr_max < 1e-4
    assert space.batch_sizes == [16, 32]


def test_rule_based_extends_range_when_best_is_on_the_edge():
    study = make_study([(9.8e-5, 16, 0.01, 0.9), (5e-5, 16, 0.01, 0.8),
                        (3e-5, 16, 0.01, 0.75)])
    out = insights.rule_based_study(insights.study_facts(study))
    assert out["search_space"]["lr_max"] > 1e-4
    assert any("top of the range" in r for r in out["recommendations"])


def test_rule_based_job_flags_underfitting():
    facts = {"params": {"lr": 2e-5, "epochs": 1},
             "metrics": {"train_accuracy": 0.62, "test_accuracy": 0.6}}
    out = insights.rule_based_job(facts)
    assert "underfitting" in out["summary"]
    assert out["search_space"]["epochs"] == 3


def test_parse_json_handles_code_fences():
    text = 'Sure!\n```json\n{"summary": "ok", "recommendations": []}\n```'
    assert insights._parse_json(text)["summary"] == "ok"


def test_llm_answers_are_combined(monkeypatch):
    monkeypatch.setenv("HF_TOKEN", "hf_test")
    monkeypatch.setenv("INSIGHT_MODELS", "mistral/x,llama/y")

    def fake_ask(model, context, task, token):
        if model == "llama/y":
            return {"model": model, "ok": False, "error": "gated"}
        return {"model": model, "ok": True, "summary": "Lower the LR.",
                "recommendations": ["a"],
                "search_space": SearchSpace(lr_min=1e-5, lr_max=3e-5).model_dump()}

    monkeypatch.setattr(insights, "_ask", fake_ask)
    study = make_study([(3e-5, 16, 0.01, 0.86), (4e-5, 16, 0.02, 0.85),
                        (2.5e-5, 32, 0.03, 0.84)])
    monkeypatch.setattr("app.services.tuning.load", lambda name: study)
    out = insights.study_insights("any")
    assert out["source"] == "llm"
    assert out["suggestion"] == "Lower the LR."
    assert out["recommended_search_space"]["lr_max"] == pytest.approx(3e-5)
    assert [r["ok"] for r in out["llm"]] == [True, False]
    assert "Search space" in out["context"]


def test_ask_parses_model_reply(monkeypatch):
    import huggingface_hub

    class Msg:
        content = ('{"summary": "s", "recommendations": ["r1"], "search_space": '
                   '{"lr_min": 1e-5, "lr_max": 5e-5, "batch_sizes": [16], '
                   '"wd_min": 0, "wd_max": 0.05, "epochs": 2}}')

    class Out:
        choices = [type("C", (), {"message": Msg})]

    class FakeClient:
        def __init__(self, **kw):
            pass

        def chat_completion(self, **kw):
            assert kw["messages"][0]["role"] == "system"
            return Out

    monkeypatch.setattr(huggingface_hub, "InferenceClient", FakeClient)
    res = insights._ask("m", "ctx", "task", "tok")
    assert res["ok"] and res["search_space"]["epochs"] == 2
    assert res["recommendations"] == ["r1"]
