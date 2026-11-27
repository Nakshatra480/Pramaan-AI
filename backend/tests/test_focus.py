""" "Research with this": a report built from the chosen documents first, saved in the project it was started from."""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from app.research import runner
from app.services.jobs import get_job_runner
from tests.conftest import ALICE, BOB
from tests.fakes import FakeAcademic, FakeWeb, make_deps

GUIDE = "\n\n".join(
    [
        "# Kafka getting started",
        "Kafka is an event streaming platform that stores streams of events durably and lets applications publish and subscribe to them.",
        "To start, download the Kafka release, start the broker in KRaft mode and create a topic called quickstart-events.",
        "Producers write events to the topic with the console producer, and consumers read them back with the console consumer.",
        "Kafka Connect imports and exports data between Kafka and external systems such as databases and object stores.",
        "Kafka Streams is a client library for building applications that process and transform streams of events in real time.",
    ]
)
Q = "Summarise the key findings of the Kafka getting started guide"


@pytest.fixture(autouse=True)
def fake_services(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(runner, "default_deps", make_deps(FakeWeb(), FakeAcademic()))


async def _doc(client: AsyncClient, headers: dict, project_id: str | None = None) -> str:  # type: ignore[type-arg]
    data = {"projectId": project_id} if project_id else {}
    r = await client.post("/api/v1/library/upload", headers=headers, files={"file": ("kafka-guide.md", GUIDE.encode())}, data=data)
    assert r.status_code == 201, r.text
    await get_job_runner().drain()
    return r.json()["id"]


async def _run(client: AsyncClient, **body: object) -> dict:  # type: ignore[type-arg]
    r = await client.post("/api/v1/research", headers=ALICE, json={"query": Q, "mode": "standard", **body})
    assert r.status_code == 202, r.text
    await get_job_runner().drain()
    return (await client.get(f"/api/v1/research/{r.json()['researchId']}", headers=ALICE)).json()


async def test_research_with_a_document_is_built_from_it_and_saved_in_the_project(client: AsyncClient) -> None:
    project = (await client.post("/api/v1/projects", headers=ALICE, json={"name": "Streaming"})).json()
    doc = await _doc(client, ALICE, project["id"])
    r = await _run(client, projectId=project["id"], sources=["project"], documentIds=[doc])
    assert r["status"] == "completed", r
    assert r["projectId"] == project["id"] and r["documentIds"] == [doc]  # saved in the project, focus remembered
    assert {s["type"] for s in r["sources"]} == {"library"}  # only the document: no web, no papers
    evidence = " ".join(e["passage"] for e in r["evidence"])
    for fact in ("quickstart-events", "Kafka Connect", "Kafka Streams"):
        assert fact in evidence, fact  # the document read in full, not just its best-matching passage
    listed = (await client.get("/api/v1/research", headers=ALICE, params={"projectId": project["id"]})).json()
    assert [x["id"] for x in listed] == [r["id"]]


async def test_web_sources_only_supplement_the_document(client: AsyncClient) -> None:
    doc = await _doc(client, ALICE)
    r = await _run(client, sources=["web", "academic"], documentIds=[doc])
    assert r["status"] == "completed", r
    assert "library" in r["channels"]  # the document is always a source of a research built from it
    library = {s["id"] for s in r["sources"] if s["type"] == "library"}
    from_doc = [e for e in r["evidence"] if e["sourceId"] in library]
    assert library and len(from_doc) >= 0.5 * len(r["evidence"])  # the document comes first
    assert r["evidence"][0]["sourceId"] in library


async def test_only_readable_ready_documents_can_be_the_focus(client: AsyncClient) -> None:
    bobs = await _doc(client, BOB)
    r = await client.post("/api/v1/research", headers=ALICE, json={"query": Q, "sources": ["web"], "documentIds": [bobs]})
    assert r.status_code == 404  # never reveal or use someone else's private document
    pending = (await client.post("/api/v1/library/upload", headers=ALICE, files={"file": ("new.md", GUIDE.encode())})).json()["id"]
    r = await client.post("/api/v1/research", headers=ALICE, json={"query": Q, "sources": ["web"], "documentIds": [pending]})
    assert (r.status_code, r.json()["error"]["code"]) == (422, "DOCUMENT_NOT_READY")
    await get_job_runner().drain()
