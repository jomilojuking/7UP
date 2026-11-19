import pytest

from app.services import abtest
from app.state import MemoryStore, RedisStore


@pytest.fixture(params=["memory", "redis"])
def any_store(request):
    if request.param == "memory":
        return MemoryStore()
    fakeredis = pytest.importorskip("fakeredis")
    return RedisStore(fakeredis.FakeRedis(decode_responses=True), prefix="test")


def test_store_create_get_update(any_store):
    a = any_store.create("job", {"status": "queued"})
    b = any_store.create("job", {"status": "queued"})
    assert (a["id"], b["id"]) == (1, 2)
    any_store.update("job", 1, status="running", accuracy=0.9)
    assert any_store.get("job", 1) == {"id": 1, "status": "running", "accuracy": 0.9}
    assert any_store.get("job", 99) is None
    assert [r["id"] for r in any_store.all("job")] == [1, 2]
    assert any_store.count("job", ("queued", "running")) == 2


def test_two_proportion_z_test():
    z, p = abtest.two_proportion_z(80, 100, 90, 100)
    assert z > 0 and 0 < p < 0.1
    assert abtest.two_proportion_z(0, 10, 0, 10) == (0.0, 1.0)


def test_verdict():
    assert "No statistically" in abtest.verdict(0.8, 0.81, 0.4)
    assert "Model B" in abtest.verdict(0.8, 0.9, 0.01)
