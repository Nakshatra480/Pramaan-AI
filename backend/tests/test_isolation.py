"""CRITICAL: User A must never read or mutate User B's data, even by editing ids in URLs."""

import pytest
from httpx import AsyncClient

from app.research import runner
from app.services.jobs import get_job_runner
from tests.conftest import ALICE, BOB
from tests.fakes import FakeAcademic, FakeWeb, make_deps


@pytest.fixture(autouse=True)
def fake_services(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(runner, "default_deps", make_deps(FakeWeb(), FakeAcademic()))


async def test_user_a_cannot_access_any_of_user_b_resources(client: AsyncClient) -> None:
    # --- Bob builds a private workspace -------------------------------------------------
    project = (await client.post("/api/v1/projects", headers=BOB, json={"name": "Bob's project"})).json()
    doc = (
        await client.post(
            "/api/v1/library/upload",
            headers=BOB,
            files={"file": ("bob.md", b"Bob private humanoid robot research notes about walking.")},
            data={"projectId": project["id"]},
        )
    ).json()
    rid = (
        await client.post("/api/v1/research", headers=BOB, json={"query": "What are the latest developments in humanoid robots?", "projectId": project["id"]})
    ).json()["researchId"]
    await get_job_runner().drain()
    research = (await client.get(f"/api/v1/research/{rid}", headers=BOB)).json()
    assert research["status"] == "completed"
    source_id = research["sourceIds"][0]
    collection = (await client.post("/api/v1/library/collections", headers=BOB, json={"name": "Bob's"})).json()

    # --- Alice tries every endpoint with Bob's ids ------------------------------------------
    pid, did = project["id"], doc["id"]
    attempts = [
        ("GET", f"/api/v1/projects/{pid}", None),
        ("PATCH", f"/api/v1/projects/{pid}", {"name": "x"}),
        ("DELETE", f"/api/v1/projects/{pid}", None),
        ("GET", f"/api/v1/projects/{pid}/instructions", None),
        ("PUT", f"/api/v1/projects/{pid}/instructions", {"content": "x"}),
        ("GET", f"/api/v1/projects/{pid}/activity", None),
        ("GET", "/api/v1/library", {"projectId": pid}),
        ("GET", f"/api/v1/library/{did}", None),
        ("DELETE", f"/api/v1/library/{did}", None),
        ("POST", f"/api/v1/library/{did}/retry", None),
        ("POST", f"/api/v1/projects/{pid}/documents/{did}", None),
        ("DELETE", f"/api/v1/projects/{pid}/documents/{did}", None),
        ("POST", f"/api/v1/library/collections/{collection['id']}/documents/{did}", None),
        ("GET", f"/api/v1/research/{rid}", None),
        ("GET", f"/api/v1/research/{rid}/stream", None),
        ("GET", f"/api/v1/research/{rid}/sources/{source_id}", None),
        ("PATCH", f"/api/v1/research/{rid}", {"saved": True}),
        ("DELETE", f"/api/v1/research/{rid}", None),
        ("POST", f"/api/v1/research/{rid}/retry", None),
        ("POST", f"/api/v1/research/{rid}/cancel", None),
        ("PUT", f"/api/v1/research/{rid}/share", {"visibility": "link"}),
        ("POST", f"/api/v1/research/{rid}/follow-ups", {"question": "Tell me more"}),
        ("GET", "/api/v1/research", {"projectId": pid}),
        ("POST", "/api/v1/research", {"query": "Anything about humanoid robots here?", "projectId": pid, "sources": ["project"]}),
        ("POST", "/api/v1/library/upload", "FILE"),
    ]
    for method, path, body in attempts:
        if body == "FILE":
            r = await client.post(path, headers=ALICE, files={"file": ("a.md", b"alice text content here")}, data={"projectId": pid})
        elif method == "GET" and isinstance(body, dict):
            r = await client.get(path, headers=ALICE, params=body)
        else:
            r = await client.request(method, path, headers=ALICE, json=body)
        assert r.status_code == 404, f"{method} {path} -> {r.status_code}"
        assert "Bob" not in r.text

    # --- Alice's own listings contain nothing of Bob's -----------------------------------------
    for path in ["/api/v1/projects", "/api/v1/library", "/api/v1/research", "/api/v1/library/collections", "/api/v1/activity"]:
        r = await client.get(path, headers=ALICE)
        assert r.status_code == 200 and r.json() == [], path

    # --- Bob's data is intact ------------------------------------------------------------------
    assert (await client.get(f"/api/v1/projects/{pid}", headers=BOB)).json()["name"] == "Bob's project"
    assert (await client.get(f"/api/v1/research/{rid}", headers=BOB)).json()["saved"] is False
    assert (await client.get(f"/api/v1/library/{did}", headers=BOB)).status_code == 200


async def test_private_research_is_not_reachable_by_share_guessing(client: AsyncClient) -> None:
    rid = (await client.post("/api/v1/research", headers=BOB, json={"query": "What are the latest developments in humanoid robots?"})).json()["researchId"]
    await get_job_runner().drain()
    assert (await client.get(f"/api/v1/shared/{rid.replace('-', '')[:24]}")).status_code == 404
    # Path traversal normalises to an authenticated route → rejected without data.
    assert (await client.get("/api/v1/shared/../research")).status_code in (401, 404, 422)
