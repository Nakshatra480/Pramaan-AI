"""Follow-ups: routed to a revision (new report) or an answer (report evidence + fresh search); never stuck."""

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


async def test_follow_up_citations_link_back_to_the_report_sources(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    r = await completed(client)
    with_evidence = {e["sourceId"] for e in r["evidence"]}
    target = [sid for sid in r["sourceIds"] if sid in with_evidence][-1]  # the last-numbered source with evidence
    target_passage = next(e["passage"] for e in r["evidence"] if e["sourceId"] == target)

    async def answer(self, question, evidence, history=None, **kw):  # type: ignore[no-untyped-def]
        e = next(x for x in evidence if x.passage == target_passage)
        return [f"This is answered by a source the report didn't cite [{e.id}]."]

    monkeypatch.setattr(ResearchLLM, "follow_up", answer)
    thread = (await ask(client, r["id"], "Which source mentions this?"))["followUps"]
    n = int(re.findall(r"\[(\d+)\]", thread[0]["answer"][0])[0])
    cited = thread[0]["sources"][n - 1]  # [n] is the n-th entry of the answer's own source list
    assert cited["origin"] == "report" and cited["sourceId"] == target  # …which opens the report's source in the panel


async def test_provider_outage_fails_cleanly_and_can_be_asked_again(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    r = await completed(client)

    async def down(self, question, evidence, history=None, **kw):  # type: ignore[no-untyped-def]
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

    async def spy(self, question, evidence, history=None, **kw):  # type: ignore[no-untyped-def]
        seen.append((list(history or []), [e.passage for e in evidence]))
        return await original(self, question, evidence, history, **kw)

    monkeypatch.setattr(ResearchLLM, "follow_up", spy)
    await ask(client, r["id"], "Which automakers run humanoid pilots?")
    await ask(client, r["id"], "What about the second one?")
    assert seen[0][0] == [] and seen[1][0][0][0] == "Which automakers run humanoid pilots?"  # earlier Q&A passed as context
    assert len(seen[0][1]) <= 26  # report passages + fresh search passages
    best = seen[0][1][0].lower()
    assert any(w in best for w in ("automaker", "pilot", "humanoid"))  # most relevant passage first


async def test_follow_up_answers_are_never_empty(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    r = await completed(client)

    async def unrelated(self, question, evidence, history=None, **kw):  # type: ignore[no-untyped-def]
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


# ---------------------------------------------------------------- routing

from app.db.models import SourceType  # noqa: E402
from app.research.follow_ups import heuristic_intent, parse_intent, revision_length  # noqa: E402
from app.research.state import SourceItem  # noqa: E402

FRESH = SourceItem(
    key="https://news.example/humanoid-costs-2026",
    title="Humanoid robot prices drop below $30,000",
    url="https://news.example/humanoid-costs-2026",
    domain="news.example",
    publisher="news.example",
    type=SourceType.news,
    relevance=0.9,
    snippet="Several manufacturers now list humanoid robots below 30,000 dollars per unit. Analysts attribute the price drop to cheaper actuators "
    "and battery packs shared with electric vehicles.",
)


@pytest.mark.parametrize(
    "question",
    [
        "Make the report shorter",
        "Rewrite it for executives",
        "Can you make this more detailed?",
        "Focus more on India and leave out the US",
        "Regenerate the report with a section on costs",
        "Put the findings in bullet points",
        "add a comparison table of the main robots",
    ],
)
def test_change_requests_are_revisions(question: str) -> None:
    intent = heuristic_intent(question, "Humanoid robots")
    assert intent.kind == "revise" and intent.instructions == question


@pytest.mark.parametrize(
    "question",
    [
        "Which automakers run humanoid pilots?",
        "Why did actuator costs fall?",
        "What about Europe?",
        "Is the report too short?",
        "Who makes the cheapest humanoid robot today?",
        "How does this compare with industrial arms?",
    ],
)
def test_information_requests_are_questions(question: str) -> None:
    assert heuristic_intent(question, "Humanoid robots").kind == "question"


def test_referential_questions_get_the_topic_for_search() -> None:
    assert heuristic_intent("What about Europe?", "Humanoid robot pilots").search_query == "What about Europe Humanoid robot pilots"
    assert heuristic_intent("Which carmakers have announced humanoid robot deployments?", "x").search_query.startswith("Which carmakers")


def test_model_classification_is_validated() -> None:
    q = "Can you focus on costs?"
    assert parse_intent({"intent": "revise", "instructions": "Focus on cost trends"}, q, "t").instructions == "Focus on cost trends"
    assert parse_intent({"intent": "question", "search_query": "humanoid robot cost trends"}, q, "t").search_query == "humanoid robot cost trends"
    assert parse_intent({"intent": "banana"}, "Make it shorter", "t").kind == "revise"  # invalid → heuristic
    assert parse_intent(None, "Why?", "t").kind == "question"


def test_revision_length_follows_the_request() -> None:
    assert revision_length("Make it shorter, one page", "balanced") == "concise"
    assert revision_length("Go more in-depth on safety", "balanced") == "comprehensive"
    assert revision_length("Focus on India", "concise") == "concise"


# ---------------------------------------------------------------- workflows


async def test_a_change_request_regenerates_the_report_as_a_new_research(client: AsyncClient) -> None:
    r = await completed(client)
    before = r["report"]
    t = await ask(client, r["id"], "Make the report shorter and focus on automaker pilots")
    f = t["followUps"][0]
    assert f["kind"] == "revision" and f["status"] == "complete" and f["revisionId"]
    assert t["report"] == before  # the original report is never edited

    await get_job_runner().drain()  # the revision runs as its own research job
    child = (await client.get(f"/api/v1/research/{f['revisionId']}", headers=ALICE)).json()
    assert child["status"] == "completed" and child["report"]["summary"]
    assert child["parentId"] == r["id"] and "automaker" in child["revisionInstructions"]
    assert child["query"] == r["query"] and child["mode"] == r["mode"] and child["title"].endswith("(revised)")
    again = (await client.get(f"/api/v1/research/{r['id']}", headers=ALICE)).json()
    assert again["report"] == before and len(again["followUps"]) == 1


async def test_revision_instructions_reach_the_planner_and_writer(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    r = await completed(client)
    seen: dict[str, object] = {}
    plan, synth = ResearchLLM.plan, ResearchLLM.synthesize

    async def spy_plan(self, query, n, instructions, prior):  # type: ignore[no-untyped-def]
        seen["plan"] = instructions
        return await plan(self, query, n, instructions, prior)

    async def spy_synth(self, query, claims, instructions, **kw):  # type: ignore[no-untyped-def]
        seen["synth"], seen["length"] = instructions, kw.get("length")
        return await synth(self, query, claims, instructions, **kw)

    monkeypatch.setattr(ResearchLLM, "plan", spy_plan)
    monkeypatch.setattr(ResearchLLM, "synthesize", spy_synth)
    await ask(client, r["id"], "Rewrite it shorter for executives")
    await get_job_runner().drain()
    assert "Rewrite it shorter for executives" in str(seen["plan"]) and "Rewrite it shorter for executives" in str(seen["synth"])
    assert seen["length"] == "concise"


async def test_a_question_searches_the_web_and_literature_and_cites_new_sources(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    r = await completed(client)
    queries: list[str] = []

    class Web(FakeWeb):
        async def search(self, query, *, max_results, deep):  # type: ignore[no-untyped-def]
            queries.append(query)
            return [FRESH]

    monkeypatch.setattr(runner, "default_deps", make_deps(Web(), FakeAcademic()))

    async def answer(self, question, evidence, history=None, **kw):  # type: ignore[no-untyped-def]
        fresh = next(e for e in evidence if "30,000" in e.passage)
        report = evidence[0]
        assert kw.get("context")  # the report's summary is passed as context
        return [f"Prices fell below $30,000 [{fresh.id}]. The report notes pilots at automakers [{report.id}]."]

    monkeypatch.setattr(ResearchLLM, "follow_up", answer)
    f = (await ask(client, r["id"], "How much does a humanoid robot cost now?"))["followUps"][0]
    assert f["kind"] == "answer" and f["status"] == "complete"
    assert queries and "humanoid" in queries[0].lower()
    assert f["answer"] == ["Prices fell below $30,000 [1]. The report notes pilots at automakers [2]."]
    assert f["sources"][0]["origin"] == "web" and f["sources"][0]["url"] == FRESH.url and f["sources"][0]["sourceId"] is None
    assert f["sources"][1]["origin"] == "report" and f["sources"][1]["sourceId"] in r["sourceIds"]


async def test_a_question_still_gets_an_answer_when_search_fails(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    import httpx

    r = await completed(client)

    class DownWeb(FakeWeb):
        async def search(self, query, *, max_results, deep):  # type: ignore[no-untyped-def]
            raise httpx.ConnectError("tavily down")

    class DownAcademic(FakeAcademic):
        async def search(self, query, *, max_results):  # type: ignore[no-untyped-def]
            raise httpx.ReadTimeout("openalex slow")

    monkeypatch.setattr(runner, "default_deps", make_deps(DownWeb(), DownAcademic()))
    f = (await ask(client, r["id"], "Which automakers run humanoid pilots?"))["followUps"][0]
    assert f["status"] == "complete" and f["answer"] and all(s["origin"] == "report" for s in f["sources"])


async def test_the_model_decides_the_route_when_available(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    r = await completed(client)

    async def classify(self, question, title, summary, history=None):  # type: ignore[no-untyped-def]
        return {"intent": "revise", "instructions": "Emphasise safety concerns throughout", "search_query": ""}

    monkeypatch.setattr(ResearchLLM, "classify_follow_up", classify)
    f = (await ask(client, r["id"], "What if safety were the main lens?"))["followUps"][0]
    assert f["kind"] == "revision"
    await get_job_runner().drain()
    child = (await client.get(f"/api/v1/research/{f['revisionId']}", headers=ALICE)).json()
    assert child["revisionInstructions"] == "Emphasise safety concerns throughout"
