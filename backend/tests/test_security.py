import pytest
from fastapi import HTTPException

from app.security import RateLimiter


def test_post_needs_api_key_when_configured(client, monkeypatch):
    monkeypatch.setenv("HFAIO_API_KEY", "s3cret")
    r = client.post("/models/import", json={"hub_id": "x"})
    assert r.status_code == 401
    r = client.post("/models/import", json={"hub_id": "x"}, headers={"X-API-Key": "wrong"})
    assert r.status_code == 401


def test_valid_api_key_passes(client, monkeypatch):
    import huggingface_hub

    monkeypatch.setenv("HFAIO_API_KEY", "s3cret")
    monkeypatch.setattr(huggingface_hub, "model_info", lambda hub_id: {})
    r = client.post("/models/import", json={"hub_id": "x"}, headers={"X-API-Key": "s3cret"})
    assert r.status_code == 200


def test_get_endpoints_stay_open(client, monkeypatch):
    monkeypatch.setenv("HFAIO_API_KEY", "s3cret")
    assert client.get("/health").status_code == 200
    assert client.get("/models").status_code == 200


def test_rate_limiter_blocks_after_limit():
    limiter = RateLimiter(limit=2, window_seconds=60)
    limiter.check("1.2.3.4")
    limiter.check("1.2.3.4")
    with pytest.raises(HTTPException) as exc:
        limiter.check("1.2.3.4")
    assert exc.value.status_code == 429
    assert "Retry-After" in exc.value.headers
    limiter.check("5.6.7.8")  # other clients are unaffected


def test_heavy_endpoints_are_rate_limited(client, model_id, fake_training, monkeypatch):
    from app import security

    monkeypatch.setattr(security, "heavy_limiter", RateLimiter(limit=2, window_seconds=600))
    codes = [client.post("/finetune/jobs", json={"model_id": model_id}).status_code
             for _ in range(3)]
    assert codes == [200, 200, 429]
