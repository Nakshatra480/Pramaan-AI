"""Follow-up questions: answered from the research's evidence, numbered like the side panel, never stuck."""

import re

import pytest
from httpx import AsyncClient

from app.research import runner
from app.research.llm import ResearchLLM
from app.services.jobs import get_job_runner
from app.services.llm.base import ModelUnavailable
from tests.conftest import ALICE
from tests.fakes import FakeAcademic, FakeWeb, make_deps

Q = "What are the latest developments in humanoid robots?"


@pytest.fixture(autouse=True)
def fake_services(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(runner, "default_deps", make_deps(FakeWeb(), FakeAcademic()))


async def completed(client: AsyncClient) -> dict:  # type: ignore[type-arg]
    r = await client.post("/api/v1/research", headers=ALICE, json={"query": Q, "mode": "standard", "sources": ["web", "academic"]})
    await get_job_runner().drain()
    return (await client.get(f"/api/v1/research/{r.json()['researchId']}", headers=ALICE)).json()


async def ask(client: AsyncClient, rid: str, question: str) -> dict:  # type: ignore[type-arg]
    assert (await client.post(f"/api/v1/research/{rid}/follow-ups", headers=ALICE, json={"question": question})).status_code == 202
    await get_job_runner().drain()
    return (await client.get(f"/api/v1/research/{rid}", headers=ALICE)).json()


async def test_follow_up_citations_match_the_side_panel(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    r = await completed(client)
    with_evidence = {e["sourceId"] for e in r["evidence"]}
    target = [sid for sid in r["sourceIds"] if sid in with_evidence][-1]  # the last-numbered source with evidence
    target_passage = next(e["passage"] for e in r["evidence"] if e["sourceId"] == target)

    async def answer(self, question, evidence, history=None):  # type: ignore[no-untyped-def]
        e = next(x for x in evidence if x.passage == target_passage)
        return [f"This is answered by a source the report didn't cite [{e.id}]."]

    monkeypatch.setattr(ResearchLLM, "follow_up", answer)
    thread = (await ask(client, r["id"], "Which source mentions this?"))["followUps"]
    n = int(re.findall(r"\[(\d+)\]", thread[0]["answer"][0])[0])
    assert r["sourceIds"][n - 1] == target  # [n] opens the n-th source in the panel


async def test_provider_outage_fails_cleanly_and_can_be_asked_again(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    r = await completed(client)

    async def down(self, question, evidence, history=None):  # type: ignore[no-untyped-def]
        raise ModelUnavailable("groq down")

    monkeypatch.setattr(ResearchLLM, "follow_up", down)
    f = (await ask(client, r["id"], "Which automakers run pilots?"))["followUps"][0]
    assert f["status"] == "failed" and "ask again" in f["answer"][0].lower()  # not left "running"

    monkeypatch.undo()
    monkeypatch.setattr(runner, "default_deps", make_deps(FakeWeb(), FakeAcademic()))
    thread = (await ask(client, r["id"], "Which automakers run pilots?"))["followUps"]
    assert thread[-1]["status"] == "complete" and thread[-1]["answer"]


async def test_follow_ups_see_the_thread_and_the_most_relevant_evidence(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    r = await completed(client)
    seen: list[tuple[list[tuple[str, str]], list[str]]] = []
    original = ResearchLLM.follow_up

    async def spy(self, question, evidence, history=None):  # type: ignore[no-untyped-def]
        seen.append((list(history or []), [e.passage for e in evidence]))
        return await original(self, question, evidence, history)

    monkeypatch.setattr(ResearchLLM, "follow_up", spy)
    await ask(client, r["id"], "Which automakers run humanoid pilots?")
    await ask(client, r["id"], "What about the second one?")
    assert seen[0][0] == [] and seen[1][0][0][0] == "Which automakers run humanoid pilots?"  # earlier Q&A passed as context
    assert len(seen[0][1]) <= 24
    best = seen[0][1][0].lower()
    assert any(w in best for w in ("automaker", "pilot", "humanoid"))  # most relevant passage first


async def test_follow_up_answers_are_never_empty(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    r = await completed(client)

    async def unrelated(self, question, evidence, history=None):  # type: ignore[no-untyped-def]
        return ["   "]

    monkeypatch.setattr(ResearchLLM, "follow_up", unrelated)
    f = (await ask(client, r["id"], "What is the capital of Peru?"))["followUps"][0]
    assert f["status"] == "complete" and "new research" in f["answer"][0]


def test_panel_order_is_cited_first_then_uncited_by_relevance() -> None:
    import uuid
    from types import SimpleNamespace as NS

    from app.services.research import source_order

    a, b, c, d = (uuid.uuid4() for _ in range(4))
    artifacts = {
        "citations": [NS(source_id=b, index=1), NS(source_id=a, index=2)],
        "sources": [NS(id=a, relevance=0.9), NS(id=b, relevance=0.5), NS(id=c, relevance=0.2), NS(id=d, relevance=0.7)],
    }
    assert source_order(artifacts) == [b, a, d, c]  # uncited sources keep a number, so follow-ups can cite them
