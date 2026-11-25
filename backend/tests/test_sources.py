"""Source breadth: Wikipedia + page reading in the pipeline, per-mode cited-source targets, request budgets."""

from __future__ import annotations

import hashlib
import json
import re
import uuid

import pytest
from httpx import AsyncClient

from app.db.models import ClaimStatus, ResearchMode, SourceType
from app.research import runner
from app.research.deps import ResearchDeps
from app.research.follow_ups import search_fresh
from app.research.llm import REQUEST_TOKENS, ResearchLLM, claim_batches, corroborate, estimate_tokens, verify_batches
from app.research.nodes.evidence import select_evidence
from app.research.progress import ProgressReporter
from app.research.runner import _persist_sources, _retrieve
from app.research.state import MODE_LIMITS, ClaimItem, EvidenceItem, SourceItem
from app.services.embeddings import EmbeddingService
from app.services.jobs import get_job_runner
from app.services.llm.base import ChatMessage
from app.services.llm.fake import FakeProvider
from tests.conftest import ALICE
from tests.fakes import FakeAcademic, FakeWeb, make_deps

Q = "What are the latest developments in humanoid robots?"
TOPICS = ["actuators", "batteries", "locomotion", "factories", "dexterity", "safety", "costs", "sensors", "software", "logistics"]


class FakeWikipedia:
    configured = True

    def __init__(self) -> None:
        self.queries: list[str] = []

    async def search(self, query: str, *, max_results: int) -> list[SourceItem]:
        self.queries.append(query)
        return [
            SourceItem(
                key="https://en.wikipedia.org/wiki/Humanoid_robot",
                title="Humanoid robot",
                url="https://en.wikipedia.org/wiki/Humanoid_robot",
                domain="en.wikipedia.org",
                publisher="Wikipedia",
                type=SourceType.encyclopedia,
                snippet="A humanoid robot is a robot resembling the human body in shape.",
                relevance=0.7,
                passages=[
                    "Humanoid robots are now being piloted on automotive assembly lines by several automakers, according to industry reports. "
                    "Learned locomotion policies for humanoid robots transfer from simulation to hardware."
                ],
            )
        ][:max_results]


class FakeReader:
    """Stands in for page reading: gives each web result a page passage the snippet doesn't have."""

    def __init__(self) -> None:
        self.calls: list[tuple[int, int]] = []

    async def read(self, sources: list[SourceItem], *, limit: int) -> int:
        targets = [s for s in sources if s.type in (SourceType.web, SourceType.news, SourceType.report) and not s.passages][:limit]
        self.calls.append((len(targets), limit))
        for s in targets:
            s.passages = [f"Full page text: humanoid robots from {s.domain} reached a new milestone in factory pilots during 2026, the page reports."]
        return len(targets)


def _deps(web, academic, wikipedia, reader, provider=None):  # type: ignore[no-untyped-def]
    def factory(research_id: uuid.UUID) -> ResearchDeps:
        embed = FakeProvider(768)
        return ResearchDeps(
            llm=ResearchLLM(provider or embed),
            embeddings=EmbeddingService(embed),
            web=web,
            academic=academic,
            retrieve=_retrieve,
            reporter=ProgressReporter(research_id),
            persist_sources=_persist_sources,
            wikipedia=wikipedia,
            reader=reader,
        )

    return factory


async def _run(client: AsyncClient, mode: str = "standard", sources: list[str] | None = None) -> dict:  # type: ignore[type-arg]
    r = await client.post("/api/v1/research", headers=ALICE, json={"query": Q, "mode": mode, "sources": sources or ["web", "academic"]})
    assert r.status_code == 202, r.text
    await get_job_runner().drain()
    return (await client.get(f"/api/v1/research/{r.json()['researchId']}", headers=ALICE)).json()


async def test_research_searches_wikipedia_and_reads_pages(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    wiki, reader = FakeWikipedia(), FakeReader()
    monkeypatch.setattr(runner, "default_deps", _deps(FakeWeb(), FakeAcademic(), wiki, reader))
    r = await _run(client)
    assert r["status"] == "completed", r
    assert wiki.queries and reader.calls and reader.calls[0][1] == MODE_LIMITS[ResearchMode.standard]["read"]
    assert any(s["type"] == "encyclopedia" and s["publisher"] == "Wikipedia" for s in r["sources"])
    assert any(e["passage"].startswith("Full page text") for e in r["evidence"])  # evidence came from the parsed page
    searching = next(s for s in r["steps"] if s["id"] == "searching")
    reading = next(s for s in r["steps"] if s["id"] == "reading")
    assert "pages read in full" in (reading["detail"] or "") and searching["status"] == "complete"


async def test_wikipedia_is_part_of_the_web_channel_only(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    wiki = FakeWikipedia()
    monkeypatch.setattr(runner, "default_deps", _deps(FakeWeb(), FakeAcademic(), wiki, FakeReader()))
    r = await _run(client, sources=["academic"])
    assert r["status"] == "completed" and wiki.queries == []
    assert all(s["type"] != "encyclopedia" for s in r["sources"])


# ------------------------------------------------------------------ cited-source targets


class ManyWeb:
    """Distinct, relevant web results per query (like a real search across different sub-questions)."""

    configured = True

    async def search(self, query: str, *, max_results: int, deep: bool) -> list[SourceItem]:
        tag = hashlib.sha256(query.encode()).hexdigest()[:6]
        out = []
        for i in range(max_results):
            topic = TOPICS[(i + len(query)) % len(TOPICS)]
            url = f"https://site{tag}{i}.example/humanoid-{topic}"
            out.append(
                SourceItem(
                    key=url,
                    title=f"Humanoid robots and {topic} ({tag}-{i})",
                    url=url,
                    domain=f"site{tag}{i}.example",
                    publisher=f"site{tag}{i}.example",
                    type=SourceType.web,
                    snippet=f"Latest developments in humanoid robots: report {tag}-{i} finds that humanoid robot {topic} improved markedly in 2026. "
                    f"Analysts at site {tag}{i} say humanoid robots {topic} developments continue across pilots.",
                    relevance=0.9 - i * 0.01,
                )
            )
        return out


class ScriptedLLM(FakeProvider):
    """A model that always cites every evidence id it is shown and writes every claim into the report — so the run's
    cited-source count shows what the pipeline's limits allow. Also checks every request fits the token budget."""

    supports_generation = True

    def __init__(self) -> None:
        super().__init__(768)
        self.requests: list[int] = []

    async def generate(self, messages: list[ChatMessage], *, json: bool = False, temperature: float = 0.2, max_tokens: int | None = None) -> str:
        prompt = "\n".join(m.content for m in messages)
        self.requests.append(estimate_tokens(prompt) + (max_tokens or 0))
        user = messages[-1].content
        if '"subqueries"' in user:
            n = int(re.search(r"<(\d+) distinct", user)[1])  # type: ignore[index]
            return _j({"intent": "x", "subqueries": [f"humanoid robots angle {i} {TOPICS[i]}" for i in range(n)]})
        if '"claims"' in user and "Evidence:" in user:
            ids = re.findall(r"^(E\d+): (.*)$", user, re.M)
            n = int(re.search(r"Extract up to (\d+)", user)[1])  # type: ignore[index]
            groups = [ids[i::n] for i in range(n)]
            return _j({"claims": [{"text": f"Claim {g[0][0]}: {g[0][1][:120]}", "evidence": [e for e, _ in g]} for g in groups if g]})
        if '"results"' in user:
            return _j({"results": [{"id": c, "status": "supported", "confidence": 0.9} for c in re.findall(r"^(C\d+):", user, re.M)]})
        if "Verified claims:" in user:
            claims = re.findall(r"^(C\d+) \(\w+\): (.*)$", user, re.M)
            return _j(
                {
                    "summary": [f"{claims[0][1]} [{claims[0][0]}]"],
                    "findings": [{"title": f"Finding {c}", "body": f"{t} [{c}]", "claims": [c]} for c, t in claims[1:]],
                    "analysis": [],
                    "limitations": [],
                }
            )
        return _j({})


def _j(x: object) -> str:
    return json.dumps(x)


@pytest.mark.parametrize("mode", ["quick", "standard", "deep"])
async def test_each_mode_can_reach_its_cited_source_target(client: AsyncClient, monkeypatch: pytest.MonkeyPatch, mode: str) -> None:
    llm = ScriptedLLM()
    monkeypatch.setattr(runner, "default_deps", _deps(ManyWeb(), FakeAcademic(), FakeWikipedia(), FakeReader(), llm))
    r = await _run(client, mode=mode)
    assert r["status"] == "completed", r
    limits = MODE_LIMITS[ResearchMode(mode)]
    cited = len({c["sourceId"] for c in r["report"]["citations"]})
    assert limits["cited"] <= cited <= limits["max_sources"], (mode, cited)
    assert max(llm.requests) <= REQUEST_TOKENS  # every request fits the provider's per-request budget


def test_limits_grow_with_the_mode() -> None:
    q, s, d = (MODE_LIMITS[m] for m in (ResearchMode.quick, ResearchMode.standard, ResearchMode.deep))
    assert (q["cited"], s["cited"], d["cited"]) == (10, 35, 50)
    for lim in (q, s, d):
        found = lim["subqueries"] * lim["web"] + lim["academic"] * lim["academic_queries"] + lim["wikipedia"]
        assert found >= 1.5 * lim["cited"] and lim["evidence"] >= lim["max_sources"] >= lim["cited"]


# ------------------------------------------------------------------ building blocks


def _ev(i: int, source: str, text: str, rel: float = 0.5) -> EvidenceItem:
    return EvidenceItem(id=f"E{i}", source_key=source, passage=text, relevance=rel)


def test_evidence_selection_is_breadth_first() -> None:
    scored = [(0.9 - 0.001 * i, (f"s{i % 30}", f"passage {i}", None, None)) for i in range(90)]  # 30 sources × 3 passages
    items = select_evidence(scored, 40, breadth_floor=0.2)
    assert len(items) == 40 and len({e.source_key for e in items}) == 30


def test_evidence_is_capped_to_the_most_relevant_sources() -> None:
    scored = [(0.9 - 0.001 * i, (f"s{i % 30}", f"passage {i}", None, None)) for i in range(90)]
    items = select_evidence(scored, 40, breadth_floor=0.2, max_sources=12)
    assert len({e.source_key for e in items}) == 12 and {e.source_key for e in items} == {f"s{i}" for i in range(12)}


def test_irrelevant_sources_dont_get_a_breadth_slot() -> None:
    scored = [(0.8, ("good", "a", None, None)), (0.7, ("good", "b", None, None)), (0.1, ("weak", "c", None, None))]
    assert [e.source_key for e in select_evidence(scored, 2, breadth_floor=0.2)] == ["good", "good"]


def test_claim_and_verify_requests_are_batched_to_fit_the_budget() -> None:
    evidence = [_ev(i, f"s{i}", "word " * 100) for i in range(80)]
    batches = claim_batches(evidence, 22)
    assert len(batches) > 1 and sum(len(b) for b in batches) == 80
    assert claim_batches(evidence[:10], 6) == [evidence[:10]]
    claims = [ClaimItem(id=f"C{i}", text="claim text " * 8, evidence_ids=[f"E{i}", f"E{i + 1}"]) for i in range(22)]
    vb = verify_batches(claims, {e.id: e for e in evidence})
    assert len(vb) > 1 and [c.id for b in vb for c in b] == [c.id for c in claims]


def test_corroboration_credits_other_sources_stating_the_same_fact() -> None:
    claim = ClaimItem(id="C1", text="Toyota plans limited solid-state battery production in 2027", evidence_ids=["E1"], status=ClaimStatus.supported)
    evidence = [
        _ev(1, "a", "Toyota plans limited solid-state battery production in 2027, the company said."),
        _ev(2, "b", "Reports say Toyota plans solid-state battery production on a limited scale in 2027."),
        _ev(3, "c", "Toyota plans limited solid-state battery production in 2030."),  # different year: not the same fact
        _ev(4, "d", "Lithium prices fell this quarter."),
        _ev(5, "a", "Toyota plans limited solid-state battery production in 2027 again."),  # same source as E1
    ]
    assert corroborate([claim], evidence, per_claim=3) == 1
    assert claim.evidence_ids == ["E1", "E2"]
    weak = ClaimItem(id="C2", text="Toyota plans limited solid-state battery production in 2027", evidence_ids=["E1"], status=ClaimStatus.unsupported)
    assert corroborate([weak], evidence, per_claim=3) == 0


# ------------------------------------------------------------------ follow-ups


async def test_follow_up_search_includes_wikipedia_and_reads_web_pages() -> None:
    wiki, reader = FakeWikipedia(), FakeReader()
    found, errors = await search_fresh(FakeWeb(), FakeAcademic(), "humanoid robots in factories", wikipedia=wiki, reader=reader)
    channels = {label for label, _ in found}
    assert channels == {"web", "wikipedia", "academic"} and not errors
    assert reader.calls and all(s.passages for label, s in found if label == "web")


async def test_follow_up_answer_can_cite_wikipedia(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(runner, "default_deps", make_deps(FakeWeb(), FakeAcademic()))
    r = await _run(client)
    monkeypatch.setattr(runner, "default_deps", _deps(FakeWeb(), FakeAcademic(), FakeWikipedia(), FakeReader()))

    async def answer(self, question, evidence, history=None, **kw):  # type: ignore[no-untyped-def]
        e = next(x for x in evidence if x.source_key.startswith("fresh:") and "Humanoid_robot" in x.source_key)
        return [f"Several automakers pilot humanoid robots on assembly lines [{e.id}]."]

    monkeypatch.setattr(ResearchLLM, "follow_up", answer)
    assert (await client.post(f"/api/v1/research/{r['id']}/follow-ups", headers=ALICE, json={"question": "Who is piloting them?"})).status_code == 202
    await get_job_runner().drain()
    f = (await client.get(f"/api/v1/research/{r['id']}", headers=ALICE)).json()["followUps"][0]
    assert f["status"] == "complete" and f["sources"][0]["origin"] == "wikipedia" and f["sources"][0]["publisher"] == "Wikipedia"


def test_wikipedia_queries_are_reduced_to_content_words() -> None:
    from app.services.search.wikipedia import search_terms

    assert search_terms("What is direct air capture and how does it differ from point-source capture?") == "direct air capture point-source capture"
    assert search_terms("direct air capture vs point source carbon capture").split()[:3] == ["direct", "air", "capture"]
    assert search_terms("What are the latest developments in humanoid robots?") == "humanoid robots"
    assert search_terms("??") == "??"


def test_every_verified_claim_the_report_left_out_is_still_credited() -> None:
    from app.research.citations import map_report
    from app.research.llm import SUPPORTING_HEADING, cover_claims
    from app.research.state import ReportDraft

    claims = [
        ClaimItem(id="C1", text="Toyota plans solid-state production in 2027", evidence_ids=["E1"], status=ClaimStatus.supported),
        ClaimItem(id="C2", text="Samsung prototypes reach 900 Wh/L energy density", evidence_ids=["E2"], status=ClaimStatus.partially_supported),
        ClaimItem(id="C3", text="Costs may fall after 2030", evidence_ids=["E3"], status=ClaimStatus.unsupported),
    ]
    evidence = [_ev(1, "a", "Toyota plans solid-state production in 2027."), _ev(2, "b", "Samsung prototypes reach 900 Wh/L energy density."), _ev(3, "c", "x")]
    draft = cover_claims(ReportDraft(summary=["Toyota plans solid-state production in 2027 [C1]."], findings=[], analysis=[], limitations=[]), claims)
    section = next(a for a in draft.analysis if a["heading"] == SUPPORTING_HEADING)
    assert "[C2]" in section["paragraphs"][0] and "partially" in section["paragraphs"][0] and "C3" not in str(section)
    _, cites = map_report(draft, claims, evidence)
    assert {c.source_key for c in cites} == {"a", "b"}
