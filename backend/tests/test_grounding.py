"""Source selection: document-focused questions are answered from the user's documents, not look-alike web pages.

Regression for a production failure: the uploaded document said the lighthouse was electrified in 1931, but
unrelated web pages about *other* lighthouses (electrified in 1952) outranked it and the report said 1952.
"""

import json

import pytest
from httpx import AsyncClient

from app.db.models import SourceType
from app.research import runner
from app.research.state import SourceItem
from app.services.jobs import get_job_runner
from tests.conftest import ALICE
from tests.fakes import FakeAcademic, FakeWeb, make_deps

DOC = (
    b"Veltrani Lighthouse field notes.\n\n"
    b"The Veltrani Lighthouse was completed in 1887 on Oskar Rock. "
    b"Its kerosene lamp was converted to electricity in 1931. "
    b"Keeper Mara Ilves logged 412 ships passing the Veltrani Lighthouse in its first winter."
)


def _web(key: str, title: str, snippet: str) -> SourceItem:
    return SourceItem(key=key, title=title, url=key, domain=key.split("/")[2], publisher=key.split("/")[2], type=SourceType.web, relevance=0.9, snippet=snippet)


# Look-alike pages: same topic and wording, different lighthouses, conflicting date.
LOOKALIKE_WEB = [
    _web(
        "https://lighthouses.example/electrification",
        "When lighthouses were converted to electricity",
        "The Souter Lighthouse was converted to electricity in 1952 after decades on kerosene. "
        "Its lamp was converted to electricity in 1952 and its keeper logged passing ships every winter.",
    ),
    _web(
        "https://maritime.example/keepers",
        "Lighthouse keepers and electrification",
        "Many rock lighthouses converted their kerosene lamps to electricity in 1952. "
        "The lighthouse keeper recorded ships in the first winter after the lighthouse was converted to electricity in 1952.",
    ),
]


@pytest.fixture(autouse=True)
def lookalike_web(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(runner, "default_deps", make_deps(FakeWeb(LOOKALIKE_WEB), FakeAcademic([])))


async def _project_with_doc(client: AsyncClient) -> str:
    p = (await client.post("/api/v1/projects", headers=ALICE, json={"name": "Lighthouses"})).json()
    r = await client.post("/api/v1/library/upload", headers=ALICE, files={"file": ("veltrani.txt", DOC)}, data={"projectId": p["id"]})
    assert r.status_code == 201, r.text
    await get_job_runner().drain()
    return str(p["id"])


async def _research(client: AsyncClient, project_id: str, query: str) -> dict:  # type: ignore[type-arg]
    r = await client.post(
        "/api/v1/research", headers=ALICE, json={"query": query, "mode": "standard", "sources": ["web", "academic", "project"], "projectId": project_id}
    )
    assert r.status_code == 202, r.text
    await get_job_runner().drain()
    out = (await client.get(f"/api/v1/research/{r.json()['researchId']}", headers=ALICE)).json()
    assert out["status"] == "completed", out
    return out  # type: ignore[no-any-return]


def _assert_grounded_in_document(r: dict) -> None:  # type: ignore[type-arg]
    report = json.dumps(r["report"])
    assert "1931" in report, "answer must use the date from the uploaded document"
    assert "1952" not in report, "look-alike web pages must not override the uploaded document"
    by_id = {s["id"]: s for s in r["sources"]}
    cited = [by_id[c["sourceId"]] for c in r["report"]["citations"]]
    assert cited, "the answer must be cited"
    assert all(s["type"] == "library" and s["title"] == "veltrani" for s in cited), cited
    assert all(s["type"] == "library" for s in r["sources"]), "unrelated web pages must not be listed as sources"
    # The cited evidence is the document passage that actually states 1931.
    passages = [e["passage"] for e in r["evidence"]]
    assert passages and all("1952" not in p for p in passages)
    assert any("1931" in p for p in passages)


async def test_question_about_document_entity_uses_document_not_lookalike_web(client: AsyncClient) -> None:
    pid = await _project_with_doc(client)
    r = await _research(client, pid, "When was the Veltrani Lighthouse converted to electricity, and who kept it?")
    _assert_grounded_in_document(r)


async def test_explicit_reference_to_uploaded_document_uses_document(client: AsyncClient) -> None:
    pid = await _project_with_doc(client)
    r = await _research(client, pid, "According to the uploaded document, when was the lighthouse converted to electricity?")
    _assert_grounded_in_document(r)


async def test_general_question_still_uses_web_research(client: AsyncClient) -> None:
    pid = await _project_with_doc(client)
    r = await _research(client, pid, "When were rock lighthouses converted from kerosene to electricity?")
    web = [s for s in r["sources"] if s["type"] != "library"]
    assert web, "general questions keep web research"
    by_id = {s["id"]: s for s in r["sources"]}
    assert any(by_id[c["sourceId"]]["type"] != "library" for c in r["report"]["citations"])


async def test_explicit_web_request_is_not_restricted(client: AsyncClient) -> None:
    pid = await _project_with_doc(client)
    r = await _research(client, pid, "Compare the uploaded document with other sources online: when was the Veltrani Lighthouse electrified?")
    assert any(s["type"] != "library" for s in r["sources"]), "an explicit request for web sources keeps them"
