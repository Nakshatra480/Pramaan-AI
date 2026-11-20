import re

import pytest
from httpx import AsyncClient

from app.research import runner
from app.services.jobs import get_job_runner
from tests.conftest import ALICE, BOB, CAROL
from tests.fakes import FakeAcademic, FakeWeb, make_deps

Q = "What are the latest developments in humanoid robots?"


@pytest.fixture(autouse=True)
def fake_services(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(runner, "default_deps", make_deps(FakeWeb(), FakeAcademic()))


async def start(client: AsyncClient, headers=ALICE, **body) -> str:  # type: ignore[no-untyped-def]
    r = await client.post("/api/v1/research", headers=headers, json={"query": Q, "mode": "standard", "sources": ["web", "academic"], **body})
    assert r.status_code == 202, r.text
    assert r.json()["status"] == "queued"
    return r.json()["researchId"]


async def complete(client: AsyncClient, headers=ALICE, **body) -> dict:  # type: ignore[no-untyped-def]
    rid = await start(client, headers, **body)
    await get_job_runner().drain()
    r = (await client.get(f"/api/v1/research/{rid}", headers=headers)).json()
    return r


async def test_research_lifecycle_and_deterministic_citations(client: AsyncClient) -> None:
    r = await complete(client)
    assert r["status"] == "completed", r
    assert r["progress"] == 1.0
    assert all(s["status"] in ("complete", "skipped") for s in r["steps"])
    assert r["steps"][4]["status"] == "skipped"  # no private library selected
    assert r["metrics"]["sources"] == 3 and r["metrics"]["evidence"] > 0 and r["metrics"]["verifiedClaims"] > 0

    report = r["report"]
    cites = report["citations"]
    assert [c["index"] for c in cites] == list(range(1, len(cites) + 1))
    # Citation n always refers to sourceIds[n-1], and every source is a stored source.
    assert [c["sourceId"] for c in cites] == r["sourceIds"][: len(cites)]
    urls = {s["url"] for s in r["sources"]}
    assert urls == {"https://robotics.example/humanoids", "https://costs.example/actuators", "https://doi.org/10.1/humanoid"}
    text = " ".join(report["summary"] + [f["body"] for f in report["findings"]] + [p for a in report["analysis"] for p in a["paragraphs"]])
    used = {int(n) for n in re.findall(r"\[(\d+)\]", text)}
    assert used and used <= {c["index"] for c in cites}
    assert "http" not in text and "[C" not in text and "[E" not in text
    # Every claim references stored evidence, and evidence references stored sources.
    ev_ids = {e["id"] for e in r["evidence"]}
    src_ids = set(r["sourceIds"])
    for c in r["claims"]:
        assert set(c["evidenceIds"]) <= ev_ids and set(c["sourceIds"]) <= src_ids
        assert c["status"] in ("supported", "partially_supported", "unsupported", "insufficient_evidence")
    assert all(e["sourceId"] in src_ids for e in r["evidence"])


async def test_sse_stream_reports_progress_then_completes(client: AsyncClient) -> None:
    import asyncio

    rid = await start(client)
    events = []
    worker = asyncio.create_task(get_job_runner().drain())  # the worker loop is off in tests; drive it alongside the stream
    async with client.stream("GET", f"/api/v1/research/{rid}/stream", headers=ALICE) as resp:
        assert resp.headers["content-type"].startswith("text/event-stream")
        async for line in resp.aiter_lines():
            if line.startswith("event: "):
                events.append(line[7:])
    await worker
    assert events[-1] == "research.completed"
    assert len(events) >= 2


async def test_no_sources_fails_with_safe_code(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(runner, "default_deps", make_deps(FakeWeb([]), FakeAcademic([])))
    r = await complete(client)
    assert r["status"] == "failed" and r["errorCode"] == "NO_SOURCES"
    retried = await client.post(f"/api/v1/research/{r['id']}/retry", headers=ALICE)
    assert retried.status_code == 202


async def test_project_research_uses_scoped_library(client: AsyncClient) -> None:
    p = (await client.post("/api/v1/projects", headers=ALICE, json={"name": "Robotics"})).json()
    await client.put(f"/api/v1/projects/{p['id']}/instructions", headers=ALICE, json={"content": "Prefer peer-reviewed research."})
    notes = (
        b"Humanoid robots in our lab achieved stable walking after sim-to-real transfer.\n\n"
        b"Teleoperation datasets for humanoid robots remain small and inconsistent."
    )
    await client.post("/api/v1/library/upload", headers=ALICE, files={"file": ("lab.md", notes)}, data={"projectId": p["id"]})
    # Bob's private document must never be retrieved for Alice.
    await client.post(
        "/api/v1/library/upload", headers=BOB, files={"file": ("bob.md", b"Humanoid robots secret Bob notes about walking robots and humanoid research.")}
    )
    await get_job_runner().drain()

    r = await complete(client, projectId=p["id"], sources=["web", "project"])
    assert r["status"] == "completed", r
    lib = [s for s in r["sources"] if s["type"] == "library"]
    assert len(lib) == 1 and lib[0]["title"] == "lab"
    assert r["steps"][4]["status"] == "complete"
    assert all("Bob" not in e["passage"] for e in r["evidence"])
    listed = (await client.get("/api/v1/research", headers=ALICE, params={"projectId": p["id"]})).json()
    assert [x["id"] for x in listed] == [r["id"]]
    assert (await client.get(f"/api/v1/projects/{p['id']}", headers=ALICE)).json()["researchCount"] == 1


async def test_cannot_start_research_in_someone_elses_project(client: AsyncClient) -> None:
    p = (await client.post("/api/v1/projects", headers=ALICE, json={"name": "Private"})).json()
    r = await client.post("/api/v1/research", headers=BOB, json={"query": Q, "projectId": p["id"], "sources": ["project"]})
    assert r.status_code == 404


async def test_research_validation(client: AsyncClient) -> None:
    assert (await client.post("/api/v1/research", headers=ALICE, json={"query": "short"})).status_code == 422
    assert (await client.post("/api/v1/research", headers=ALICE, json={"query": Q, "sources": []})).status_code == 422
    assert (await client.post("/api/v1/research", headers=ALICE, json={"query": Q, "mode": "turbo"})).status_code == 422
    # "project" without a project is dropped; nothing left → rejected.
    r = await client.post("/api/v1/research", headers=ALICE, json={"query": Q, "sources": ["project"]})
    assert r.status_code == 422 and r.json()["error"]["code"] == "NO_SOURCES_SELECTED"


async def test_save_rename_share_follow_up(client: AsyncClient) -> None:
    r = await complete(client)
    rid = r["id"]
    upd = (await client.patch(f"/api/v1/research/{rid}", headers=ALICE, json={"saved": True, "title": "Humanoids"})).json()
    assert upd["saved"] is True and upd["title"] == "Humanoids"

    share = (await client.put(f"/api/v1/research/{rid}/share", headers=ALICE, json={"visibility": "link"})).json()
    token = share["shareId"]
    public = await client.get(f"/api/v1/shared/{token}")  # no auth
    assert public.status_code == 200 and public.json()["report"]["citations"]
    await client.put(f"/api/v1/research/{rid}/share", headers=ALICE, json={"visibility": "private"})
    assert (await client.get(f"/api/v1/shared/{token}")).status_code == 404

    fu = await client.post(f"/api/v1/research/{rid}/follow-ups", headers=ALICE, json={"question": "Which automakers run humanoid pilots?"})
    assert fu.status_code == 202
    await get_job_runner().drain()
    thread = (await client.get(f"/api/v1/research/{rid}", headers=ALICE)).json()["followUps"]
    assert thread[0]["status"] == "complete" and thread[0]["answer"]
    assert max((int(n) for n in re.findall(r"\[(\d+)\]", " ".join(thread[0]["answer"]))), default=1) <= len(r["report"]["citations"])


async def test_cancel(client: AsyncClient) -> None:
    rid = await start(client)
    assert (await client.post(f"/api/v1/research/{rid}/cancel", headers=ALICE)).status_code == 204
    await get_job_runner().drain()
    r = (await client.get(f"/api/v1/research/{rid}", headers=ALICE)).json()
    assert r["status"] == "cancelled" and r["report"] is None


async def test_project_members_can_read_but_not_modify(client: AsyncClient) -> None:
    from sqlalchemy import select

    from app.db.database import get_sessionmaker
    from app.db.models import ProjectMember, ProjectRole, User

    p = (await client.post("/api/v1/projects", headers=ALICE, json={"name": "Team"})).json()
    await client.get("/api/v1/me", headers=CAROL)
    async with get_sessionmaker()() as db:
        carol = await db.scalar(select(User).where(User.firebase_uid == "uid-carol"))
        db.add(ProjectMember(project_id=p["id"], user_id=carol.id, role=ProjectRole.viewer))
        await db.commit()
    r = await complete(client, projectId=p["id"])
    assert (await client.get(f"/api/v1/research/{r['id']}", headers=CAROL)).status_code == 200
    assert (await client.get(f"/api/v1/projects/{p['id']}", headers=CAROL)).json()["role"] == "viewer"
    # Viewer: read-only.
    assert (await client.patch(f"/api/v1/research/{r['id']}", headers=CAROL, json={"saved": True})).status_code == 404
    assert (await client.delete(f"/api/v1/research/{r['id']}", headers=CAROL)).status_code == 404
    assert (await client.put(f"/api/v1/projects/{p['id']}/instructions", headers=CAROL, json={"content": "x"})).status_code == 403
    assert (await client.post("/api/v1/research", headers=CAROL, json={"query": Q, "projectId": p["id"]})).status_code == 403
    assert (await client.delete(f"/api/v1/projects/{p['id']}", headers=CAROL)).status_code == 403
