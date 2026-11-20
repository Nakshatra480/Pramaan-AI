import pytest
from httpx import AsyncClient

from app.core.config import get_settings
from app.research import runner
from app.services.jobs import get_job_runner
from tests.conftest import ALICE, BOB
from tests.fakes import FakeAcademic, FakeWeb, make_deps


async def test_cors_allows_only_configured_origins(client: AsyncClient) -> None:
    allowed = get_settings().cors_origins[0]
    preflight = {"Origin": allowed, "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "authorization"}
    ok = await client.options("/api/v1/me", headers=preflight)
    assert ok.headers.get("access-control-allow-origin") == allowed
    simple = await client.get("/health", headers={"Origin": allowed})
    assert "content-disposition" in simple.headers.get("access-control-expose-headers", "").lower()
    bad = await client.options("/api/v1/me", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"})
    assert "access-control-allow-origin" not in bad.headers


def test_wildcard_cors_is_refused() -> None:
    from pydantic import ValidationError

    from app.core.config import Settings

    with pytest.raises(ValidationError):
        Settings(cors_origins=["*"])


async def test_request_size_limit(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    r = await client.post("/api/v1/projects", headers={**ALICE, "Content-Length": str(10**9)}, content=b"{}")
    assert r.status_code == 413 and r.json()["error"]["code"] == "PAYLOAD_TOO_LARGE"


async def test_oversized_upload_rejected(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "max_upload_bytes", 1024)
    r = await client.post("/api/v1/library/upload", headers=ALICE, files={"file": ("big.txt", b"a" * 2048)})
    assert r.status_code == 413


async def test_errors_never_leak_internals(client: AsyncClient) -> None:
    r = await client.get("/api/v1/projects/00000000-0000-0000-0000-000000000000", headers=ALICE)
    body = r.text
    assert "Traceback" not in body and "sqlalchemy" not in body.lower() and "asyncpg" not in body.lower()


async def test_delete_all_research_only_deletes_own(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(runner, "default_deps", make_deps(FakeWeb(), FakeAcademic()))
    q = {"query": "What are the latest developments in humanoid robots?"}
    await client.post("/api/v1/research", headers=ALICE, json=q)
    await client.post("/api/v1/research", headers=BOB, json=q)
    await get_job_runner().drain()
    assert (await client.delete("/api/v1/research", headers=ALICE)).status_code == 422  # confirmation required
    assert (await client.delete("/api/v1/research", headers=ALICE, params={"confirm": "delete-all"})).status_code == 204
    assert (await client.get("/api/v1/research", headers=ALICE)).json() == []
    assert len((await client.get("/api/v1/research", headers=BOB)).json()) == 1


async def test_rate_limit(client: AsyncClient) -> None:
    from app.api.deps import get_rate_limiter
    from app.core.rate_limit import SlidingWindowLimiter
    from app.main import app

    limiter = SlidingWindowLimiter(2)
    app.dependency_overrides[get_rate_limiter] = lambda: limiter
    try:
        responses = [await client.get("/api/v1/me", headers=ALICE) for _ in range(3)]
        codes = [r.status_code for r in responses]
        assert responses[-1].headers["retry-after"] == "5"
    finally:
        app.dependency_overrides.pop(get_rate_limiter)
    assert codes == [200, 200, 429]


def test_production_refuses_auth_emulator_and_requires_project() -> None:
    from app.core.config import Settings, get_settings

    get_settings.cache_clear()
    try:
        for env, msg in [
            ({"ENVIRONMENT": "production", "FIREBASE_PROJECT_ID": "pramaan-ai-prod", "FIREBASE_AUTH_EMULATOR_HOST": "127.0.0.1:9099"}, "EMULATOR"),
            ({"ENVIRONMENT": "production", "FIREBASE_PROJECT_ID": ""}, "FIREBASE_PROJECT_ID"),
        ]:
            with pytest.MonkeyPatch.context() as mp:
                for k, v in env.items():
                    mp.setenv(k, v)
                get_settings.cache_clear()
                with pytest.raises(RuntimeError, match=msg):
                    get_settings()
        assert Settings(environment="production", firebase_project_id="pramaan-ai-prod").is_production
    finally:
        get_settings.cache_clear()


async def test_unhandled_500_keeps_cors_headers_and_envelope(client: AsyncClient) -> None:
    """A real server error must not masquerade as a network/CORS failure in the browser."""
    from app.main import app

    async def boom() -> None:
        raise RuntimeError("secret internal detail")

    app.add_api_route("/__boom", boom)
    try:
        origin = get_settings().cors_origins[0]
        r = await client.get("/__boom", headers={"Origin": origin})
    finally:
        app.router.routes.pop()
    assert r.status_code == 500
    assert r.headers.get("access-control-allow-origin") == origin
    assert r.json()["error"]["code"] == "INTERNAL_ERROR" and "secret" not in r.text
