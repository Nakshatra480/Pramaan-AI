"""Reports as research papers: structure, and the evidence checks every table, diagram and figure must pass."""

from __future__ import annotations

import json
import re
import uuid

import pytest
from httpx import AsyncClient

from app.db.models import ClaimStatus, SourceType
from app.research import runner
from app.research.deps import ResearchDeps
from app.research.llm import ResearchLLM, clean_heading, parse_paper
from app.research.progress import ProgressReporter
from app.research.runner import _persist_sources, _retrieve
from app.research.state import ClaimItem, EvidenceItem, ReportDraft, SourceItem
from app.research.visuals import build_diagram, image_candidates, parse_visuals, place_visuals
from app.services.embeddings import EmbeddingService
from app.services.jobs import get_job_runner
from app.services.llm.base import ChatMessage
from app.services.llm.fake import FakeProvider
from tests.conftest import ALICE
from tests.fakes import FakeAcademic, FakeWeb

CLAIMS = [
    ClaimItem("C1", "Solvent-based capture systems reach 90% capture efficiency at a cost of $60 per tonne", ["E1"], ClaimStatus.supported, 0.9),
    ClaimItem("C2", "Direct air capture costs between $400 and $600 per tonne of CO2", ["E2"], ClaimStatus.supported, 0.9),
    ClaimItem("C3", "Flue gas is cooled, then CO2 is absorbed by an amine solvent and released by heating", ["E3"], ClaimStatus.partially_supported, 0.7),
    ClaimItem("C4", "Recycling rates doubled", ["E4"], ClaimStatus.insufficient_evidence, 0.2),
]
EVIDENCE = [
    EvidenceItem("E1", "src-a", "Solvent-based systems capture 90% of CO2 for about $60 per tonne.", 0.9),
    EvidenceItem("E2", "src-b", "DAC costs $400–600 per tonne today.", 0.8),
    EvidenceItem("E3", "src-c", "The flue gas is cooled; an amine solvent absorbs CO2, which is released when the solvent is heated.", 0.7),
    EvidenceItem("E4", "src-d", "Recycling doubled.", 0.3),
]


def _source(key: str, images: list[dict[str, str]], rel: float = 0.8) -> SourceItem:
    return SourceItem(
        key=key,
        title=key,
        url=f"https://{key}.example/page",
        domain=f"{key}.example",
        publisher=key.upper(),
        type=SourceType.web,
        snippet="",
        relevance=rel,
        images=images,
    )


# ------------------------------------------------------------------ structure


def test_paper_parsing_cleans_headings_and_rejects_empty_papers() -> None:
    data = {
        "title": "  Capture technologies for industrial emissions. ",
        "keywords": ["carbon capture", " DAC "],
        "abstract": "One paragraph [C1].",
        "sections": [
            {"heading": "1. Introduction", "paragraphs": ["Intro [C1]."]},
            {"heading": "Key Findings", "paragraphs": ["Results [C2]."], "bullets": ["one", "two"]},
            {"heading": "III. Discussion", "paragraphs": []},
            {"heading": "", "paragraphs": ["orphan"]},
        ],
    }
    d = parse_paper(data, "q?")
    assert d is not None and d.title == "Capture technologies for industrial emissions" and d.abstract == ["One paragraph [C1]."]
    assert [s["heading"] for s in d.sections] == ["Introduction", "Results"]  # empty/headless sections dropped, generic renamed
    assert d.sections[1]["blocks"][-1] == {"type": "list", "items": ["one", "two"]}
    assert d.keywords == ["carbon capture", "DAC"]
    assert parse_paper({"title": "x", "abstract": [], "sections": data["sections"]}, "q") is None
    assert parse_paper("not json", "q") is None
    assert clean_heading("Section 2: Executive Summary") == "Summary of the evidence"


# ------------------------------------------------------------------ tables


def _visuals(data: object, **kw: object):  # type: ignore[no-untyped-def]
    args: dict[str, object] = {"claims": CLAIMS, "evidence": EVIDENCE, "candidates": [], "n_sections": 3, "mode": "deep", "question": "carbon capture costs"}
    return parse_visuals(data, **{**args, **kw})  # type: ignore[arg-type]


def test_tables_only_contain_numbers_their_claims_state() -> None:
    table = {
        "section": 2,
        "caption": "Table 1: Cost and efficiency of capture approaches",
        "columns": ["Approach", "Cost per tonne"],
        "rows": [
            {"cells": ["Solvent-based capture", "$60"], "claims": ["C1"]},
            {"cells": ["Direct air capture", "$400–600"], "claims": ["C2"]},
            {"cells": ["Mineralisation", "$120"], "claims": ["C2"]},  # $120 appears nowhere: dropped
            {"cells": ["Recycling", "x2"], "claims": ["C4"]},  # insufficient claim only: dropped
            {"cells": ["Too", "many", "cells"], "claims": ["C1"]},  # wrong width: dropped
        ],
    }
    v = _visuals({"tables": [table]})
    assert len(v.tables) == 1
    t = v.tables[0]
    assert t["caption"] == "Cost and efficiency of capture approaches" and t["section"] == 1
    assert [r["cells"][0] for r in t["rows"]] == ["Solvent-based capture", "Direct air capture"]
    one_row = {**table, "rows": table["rows"][:1]}
    assert _visuals({"tables": [one_row]}).tables == []  # a one-row table is not a table


# ------------------------------------------------------------------ diagrams


FLOW = {
    "section": 3,
    "caption": "Post-combustion capture process",
    "kind": "flow",
    "claims": ["C3"],
    "nodes": [{"id": "a", "label": "Flue gas cooled"}, {"id": "b", "label": 'Amine "solvent" absorbs CO2'}, {"id": "c", "label": "Solvent heated"}],
    "edges": [{"from": "a", "to": "b", "label": ""}, {"from": "b", "to": "c", "label": "CO2 released"}, {"from": "c", "to": "zz"}],
}


def test_diagrams_are_generated_as_safe_mermaid() -> None:
    v = _visuals({"diagrams": [FLOW]})
    code = v.diagrams[0]["code"]
    assert code.splitlines()[0] == "flowchart LR"
    assert 'n2["Amine solvent absorbs CO2"]' in code  # quotes stripped from labels
    assert 'n2 -->|"CO2 released"| n3' in code and "zz" not in code  # edges to unknown nodes dropped
    hostile = {**FLOW, "nodes": [{"id": "a", "label": 'x"] click a "javascript:alert(1)'}, *FLOW["nodes"][1:]]}  # type: ignore[list-item]
    built = build_diagram(hostile)
    assert built is not None and "click" not in built[0].split("\n")[1].split('"')[0] and '"]' not in built[0].split("\n")[1][:-2]
    assert all(line.count('"') % 2 == 0 for line in built[0].splitlines())  # no label can break out of its quotes


def test_diagrams_must_be_drawn_from_their_claims() -> None:
    invented = {
        **FLOW,
        "nodes": [{"id": "a", "label": "Quantum sorbent breakthrough"}, {"id": "b", "label": "Orbital storage"}, {"id": "c", "label": "Lunar refinery"}],
    }
    assert _visuals({"diagrams": [invented]}).diagrams == []
    assert _visuals({"diagrams": [{**FLOW, "claims": ["C4"]}]}).diagrams == []  # only insufficient claims behind it


def test_timeline_and_hierarchy() -> None:
    timeline = build_diagram(
        {
            "kind": "timeline",
            "events": [{"period": "2023", "text": "Pilot: 1 plant"}, {"period": "2025", "text": "Scale-up"}, {"period": "2027", "text": "Launch"}],
        }
    )
    assert timeline is not None and timeline[0].splitlines() == [
        "flowchart TD",
        '    n1["2023<br>Pilot: 1 plant"]',
        '    n2["2025<br>Scale-up"]',
        '    n3["2027<br>Launch"]',
        "    n1 --> n2",
        "    n2 --> n3",
    ]
    tree = build_diagram(
        {"kind": "hierarchy", "root": "Capture methods", "children": [{"label": "Point source", "children": ["Solvents"]}, "Direct air capture"]}
    )
    assert tree is not None and tree[0].startswith("flowchart TD") and "n1 --> n2" in tree[0] and "n2 --> n3" in tree[0]
    assert build_diagram({"kind": "pie", "slices": []}) is None


# ------------------------------------------------------------------ figures


def test_figures_come_only_from_the_reports_own_sources() -> None:
    sources = [
        _source(
            "src-a",
            [
                {"url": "https://img.example/a1.jpg", "caption": "A solvent capture plant"},
                {"url": "https://img.example/a2.jpg", "caption": "Second"},
                {"url": "https://img.example/a3.jpg", "caption": "Third"},
            ],
        ),
        _source("src-d", [{"url": "https://img.example/d.jpg", "caption": "Recycling"}]),  # only backs an insufficient claim
        _source("src-x", [{"url": "https://img.example/x.jpg", "caption": "Unrelated"}]),  # not evidence at all
    ]
    sources[0].images[1]["caption"] = "Figure 3: Second"  # the page's own numbering is dropped (ours is added on display)
    candidates = image_candidates(sources, CLAIMS, EVIDENCE)
    assert [(c.id, c.url) for c in candidates] == [("I1", "https://img.example/a1.jpg"), ("I2", "https://img.example/a2.jpg")]
    assert candidates[1].caption == "Second"
    v = _visuals({"figures": [{"section": 2, "image": "I1"}, {"section": 2, "image": "I9"}, {"section": 1, "image": "I1"}]}, candidates=candidates)
    assert len(v.figures) == 1
    f = v.figures[0]
    assert f["caption"] == "A solvent capture plant" and f["credit"] == "SRC-A" and f["source_key"] == "src-a"  # the page's caption, not the model's
    quick = _visuals({"figures": [{"section": 1, "image": "I1"}, {"section": 1, "image": "I2"}]}, candidates=candidates, mode="quick")
    assert len(quick.figures) == 1  # per-mode limit


def test_visuals_go_after_the_first_paragraph_of_their_section() -> None:
    p = lambda t: {"type": "paragraph", "text": t}  # noqa: E731
    draft = ReportDraft(
        title="t",
        abstract=["a"],
        sections=[{"heading": "Introduction", "blocks": [p("intro")]}, {"heading": "Costs of capture", "blocks": [p("one"), p("two")]}],
        limitations=[],
    )
    v = _visuals({"tables": [{"section": 9, "caption": "Costs of capture approaches", "columns": ["A", "B"], "rows": [
        {"cells": ["Solvent", "$60"], "claims": ["C1"]}, {"cells": ["DAC", "$400–600"], "claims": ["C2"]}]}]}, n_sections=2)  # fmt: skip
    out = place_visuals(draft, v)
    assert [b["type"] for b in out.sections[1]["blocks"]] == ["paragraph", "table", "paragraph"]  # unknown section → best match, not intro


# ------------------------------------------------------------------ end to end


class PaperModel(FakeProvider):
    """Writes a paper from whatever claims it is given and proposes one of each visual."""

    supports_generation = True

    def __init__(self) -> None:
        super().__init__(768)

    async def generate(self, messages: list[ChatMessage], *, json: bool = False, temperature: float = 0.2, max_tokens: int | None = None) -> str:
        user = messages[-1].content
        ids = re.findall(r"^(C\d+)", user, re.M)
        if '"subqueries"' in user:
            return _j({"intent": "x", "subqueries": ["humanoid robots factory pilots"]})
        if "Extract up to" in user:
            ev = re.findall(r"^(E\d+): (.*)$", user, re.M)
            return _j({"claims": [{"text": t[:160], "evidence": [e]} for e, t in ev[:4]]})
        if '"results"' in user:
            return _j({"results": [{"id": c, "status": "supported", "confidence": 0.9} for c in re.findall(r"^(C\d+):", user, re.M)]})
        if "Sections of the paper:" in user:
            image = re.search(r"^(I\d+):", user, re.M)
            claim = re.search(r"^(C\d+): (.*)$", user, re.M)
            words = claim.group(2).split() if claim else ["a", "b", "c"]  # type: ignore[union-attr]
            return _j(
                {
                    "tables": [{"section": 2, "caption": "Evidence by source", "columns": ["Claim", "Detail"], "rows": [
                        {"cells": ["First", "humanoid robots"], "claims": [ids[0]]}, {"cells": ["Second", "factory pilots"], "claims": [ids[1]]}]}],
                    "diagrams": [{"section": 2, "caption": "Sequence", "kind": "flow", "claims": [claim.group(1)] if claim else [],  # type: ignore[union-attr]
                        "nodes": [{"id": k, "label": " ".join(words[i * 3 : i * 3 + 3])} for i, k in enumerate("abc")],
                        "edges": [{"from": "a", "to": "b"}, {"from": "b", "to": "c"}]}],
                    "figures": [{"section": 2, "image": image.group(1)}] if image else [],
                }
            )  # fmt: skip
        if "Verified claims (the only facts" in user:
            return _j(
                {
                    "title": "Humanoid robots on automotive assembly lines",
                    "keywords": ["humanoid robots", "automation"],
                    "abstract": [f"Humanoid robots are being piloted [{ids[0]}]."],
                    "sections": [
                        {"heading": "Introduction", "paragraphs": [f"Humanoid robots are piloted on assembly lines [{ids[0]}]."]},
                        {"heading": "Deployment in automotive manufacturing", "paragraphs": [f"{c} [{c}]." for c in ids[1:]]},
                        {"heading": "Discussion", "paragraphs": ["The pilots are early."]},
                        {"heading": "Conclusion", "paragraphs": ["Adoption is beginning."]},
                    ],
                }
            )
        return _j({})


def _j(x: object) -> str:
    return json.dumps(x)


class Pictures:
    """Page reading that finds a figure on each web page; the second image is unreachable."""

    async def read(self, sources: list[SourceItem], *, limit: int) -> int:
        for i, s in enumerate(sources):
            caption = f"Humanoid robot on an assembly line at {s.domain}"
            s.images = [{"url": f"https://img.example/{i}.jpg", "caption": caption}]
        return len(sources)


class Verifier:
    def __init__(self) -> None:
        self.checked: list[str] = []

    async def verify(self, urls: list[str]) -> set[str]:
        self.checked += urls
        return {u for u in urls if not u.endswith("/1.jpg")}


@pytest.fixture
def paper_deps(monkeypatch: pytest.MonkeyPatch) -> Verifier:
    verifier = Verifier()

    def factory(research_id: uuid.UUID) -> ResearchDeps:
        embed = FakeProvider(768)
        return ResearchDeps(
            llm=ResearchLLM(PaperModel()),
            embeddings=EmbeddingService(embed),
            web=FakeWeb(),
            academic=FakeAcademic(),
            retrieve=_retrieve,
            reporter=ProgressReporter(research_id),
            persist_sources=_persist_sources,
            reader=Pictures(),
            images=verifier,
        )

    monkeypatch.setattr(runner, "default_deps", factory)
    return verifier


async def test_a_research_run_produces_a_paper_with_visuals(client: AsyncClient, paper_deps: Verifier) -> None:
    r = await client.post(
        "/api/v1/research", headers=ALICE, json={"query": "How are humanoid robots used in car factories?", "mode": "standard", "sources": ["web"]}
    )
    await get_job_runner().drain()
    res = (await client.get(f"/api/v1/research/{r.json()['researchId']}", headers=ALICE)).json()
    assert res["status"] == "completed", res
    report = res["report"]
    assert report["format"] == "paper" and report["title"] == "Humanoid robots on automotive assembly lines"
    assert report["keywords"] == ["humanoid robots", "automation"] and report["summary"] and not report["findings"]
    assert [s["heading"] for s in report["sections"]][0] == "Introduction" and report["sections"][-1]["heading"] == "Conclusion"
    body = report["sections"][1]["blocks"]
    kinds = [b["type"] for b in body]
    assert {"table", "diagram"} <= set(kinds), kinds
    table = next(b for b in body if b["type"] == "table")
    assert re.search(r"\[\d+\]$", table["rows"][0][-1])  # each row ends with its citations
    diagram = next(b for b in body if b["type"] == "diagram")
    assert diagram["code"].startswith("flowchart") and re.search(r"\[\d+\]", diagram["caption"])
    figures = [b for b in body if b["type"] == "figure"]
    assert paper_deps.checked and all(not f["url"].endswith("/1.jpg") for f in figures)  # unreachable images never shown
    for f in figures:
        assert f["caption"].startswith("Humanoid robot on an assembly line") and f["sourceIndex"] >= 1 and f["sourceUrl"].startswith("https://")
    cited = {c["index"] for c in report["citations"]}
    assert all(int(n) in cited for n in re.findall(r"\[(\d+)\]", json.dumps(report["sections"])))
    synth = next(s for s in res["steps"] if s["id"] == "synthesizing")
    assert synth["detail"].startswith("Paper written:")


# ------------------------------------------------------------------ regressions from live runs


def test_flat_tables_and_claim_ids_in_cells_are_rejected_or_cleaned() -> None:
    flat = {
        "section": 2,
        "caption": "Capture methods",
        "columns": ["Method", "Capture rate"],
        "rows": [
            {"cells": ["Post-combustion", "90% (C1)"], "claims": ["C1"]},
            {"cells": ["Pre-combustion", "90% (C1)"], "claims": ["C1"]},
        ],
    }
    assert _visuals({"tables": [flat]}).tables == []  # every row says the same thing: not a comparison
    varied = {**flat, "rows": [flat["rows"][0], {"cells": ["Direct air capture", "$400–600 (C2)"], "claims": ["C2"]}]}
    t = _visuals({"tables": [varied]}).tables[0]
    assert [r["cells"][1] for r in t["rows"]] == ["90%", "$400–600"]  # "(C1)" never reaches the reader


def test_captions_cite_at_most_four_sources_and_text_is_plain() -> None:
    from app.research.citations import CitationMapper

    ev = [EvidenceItem(f"E{i}", f"s{i}", "p", 1 - i / 10) for i in range(1, 8)]
    claim = ClaimItem("C1", "x", [e.id for e in ev], ClaimStatus.supported, 0.9)
    assert CitationMapper([claim], ev).markers(["C1"]) == " [1][2][3][4]"
    assert CitationMapper._clean("85 % of post‑combustion capture") == "85% of post-combustion capture"


def test_figure_captions_are_trimmed_and_share_images_need_a_description() -> None:
    from app.services.content.html import parse_html, trim_caption

    long = (
        "With CCS, carbon dioxide is captured from a point source, such as an ethanol refinery. It is usually transported via pipelines "
        "and then either used to extract oil or stored in a dedicated geologic formation deep underground."
    )
    assert trim_caption(long) == "With CCS, carbon dioxide is captured from a point source, such as an ethanol refinery."
    assert trim_caption("word " * 60).endswith("…") and len(trim_caption("word " * 60)) <= 201
    page = '<html><head><title>Carbon Capture</title><meta property="og:image" content="https://cdn.example/photos/plant.jpg"></head><body></body></html>'
    assert parse_html(page, "https://c.example/a").images == []  # titled only by the page title: skipped
    described = page.replace("</head>", '<meta property="og:image:alt" content="The Petra Nova capture unit attached to a coal plant"></head>')
    assert [i.caption for i in parse_html(described, "https://c.example/a").images] == ["The Petra Nova capture unit attached to a coal plant"]
