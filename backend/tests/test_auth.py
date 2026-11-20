from httpx import AsyncClient

from tests.conftest import ALICE, auth


async def test_health(client: AsyncClient) -> None:
    r = await client.get("/health")
    assert r.json() == {"status": "ok"}
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["x-request-id"]


async def test_ready_checks_db_and_pgvector(client: AsyncClient) -> None:
    r = await client.get("/ready")
    assert r.status_code == 200
    assert r.json()["checks"] == {"database": "ok", "pgvector": "ok", "redis": "disabled"}  # tests run without Redis


async def test_ready_reports_but_never_fails_on_redis(client: AsyncClient, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    import app.api.routes.health as health

    async def down() -> str:
        return "unavailable"

    monkeypatch.setattr(health, "redis_ping", down)
    r = await client.get("/ready")
    assert r.status_code == 200 and r.json()["status"] == "ok"  # Redis is optional
    assert r.json()["checks"]["redis"] == "unavailable"


async def test_unauthenticated_request_rejected(client: AsyncClient) -> None:
    r = await client.get("/api/v1/me")
    assert r.status_code == 401
    body = r.json()["error"]
    assert body["code"] == "UNAUTHENTICATED" and body["request_id"]


async def test_invalid_token(client: AsyncClient) -> None:
    r = await client.get("/api/v1/me", headers=auth("forged"))
    assert r.status_code == 401 and r.json()["error"]["code"] == "TOKEN_INVALID"


async def test_expired_token(client: AsyncClient) -> None:
    r = await client.get("/api/v1/me", headers=auth("token-expired"))
    assert r.status_code == 401 and r.json()["error"]["code"] == "TOKEN_EXPIRED"


async def test_malformed_header(client: AsyncClient) -> None:
    r = await client.get("/api/v1/me", headers={"Authorization": "Basic abc"})
    assert r.status_code == 401


async def test_me_creates_user_once_keyed_by_firebase_uid(client: AsyncClient) -> None:
    a = (await client.get("/api/v1/me", headers=ALICE)).json()
    b = (await client.get("/api/v1/me", headers=ALICE)).json()
    assert a["id"] == b["id"]
    assert a["firebaseUid"] == "uid-alice" and a["email"] == "alice@example.com"
    assert a["displayName"] == "Alice Rao"


async def test_me_update_cannot_change_identity(client: AsyncClient) -> None:
    r = await client.patch("/api/v1/me", headers=ALICE, json={"displayName": "Alice R", "firebaseUid": "uid-bob", "email": "x@y.z", "onboarded": True})
    assert r.status_code == 200
    me = r.json()
    assert me["firebaseUid"] == "uid-alice" and me["email"] == "alice@example.com"
    assert me["displayName"] == "Alice R" and me["onboarded"] is True


async def test_unverified_email_blocked_from_app_routes(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/me", headers=auth("token-unverified"))).status_code == 200
    r = await client.get("/api/v1/projects", headers=auth("token-unverified"))
    assert r.status_code == 403 and r.json()["error"]["code"] == "EMAIL_NOT_VERIFIED"
