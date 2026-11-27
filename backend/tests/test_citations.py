from app.db.models import ClaimStatus
from app.research.citations import CitationMapper, map_report
from app.research.state import ClaimItem, EvidenceItem, ReportDraft

EV = [
    EvidenceItem("E1", "src-a", "Passage A", 0.9),
    EvidenceItem("E2", "src-b", "Passage B", 0.8),
    EvidenceItem("E3", "src-a", "Passage A2", 0.7),
    EvidenceItem("E4", "src-c", "Passage C", 0.6),
]
CLAIMS = [
    ClaimItem("C1", "Battery costs fell sharply", ["E1", "E2"], ClaimStatus.supported, 0.9),
    ClaimItem("C2", "Solid electrolytes need dry rooms", ["E4"], ClaimStatus.partially_supported, 0.6),
    ClaimItem("C3", "Recycling rates doubled", ["E3"], ClaimStatus.insufficient_evidence, 0.2),
    ClaimItem("C4", "Cathode supply tightened", ["E99"], ClaimStatus.supported, 0.9),  # bogus evidence id
]


def paper(abstract: list[str], sections: list[dict] | None = None, limitations: list[str] | None = None) -> ReportDraft:  # type: ignore[type-arg]
    return ReportDraft(title="A title", abstract=abstract, sections=sections or [], limitations=limitations or [])


def para(text: str) -> dict:  # type: ignore[type-arg]
    return {"type": "paragraph", "text": text}


def test_indices_assigned_in_order_of_first_appearance() -> None:
    draft = paper(["Solid electrolytes need dry rooms [C2]."], [{"heading": "Costs", "blocks": [para("Battery costs fell sharply [C1].")]}])
    report, cites = map_report(draft, CLAIMS, EV)
    assert report["format"] == "paper" and report["title"] == "A title"
    assert report["summary"] == ["Solid electrolytes need dry rooms [1]."]  # the abstract
    assert report["sections"] == [{"heading": "Costs", "blocks": [{"type": "paragraph", "text": "Battery costs fell sharply [2][3]."}]}]
    assert [(c.index, c.source_key) for c in cites] == [(1, "src-c"), (2, "src-a"), (3, "src-b")]


def test_unsupported_unknown_and_invented_references_are_removed() -> None:
    draft = paper(
        [
            "Recycling rates doubled [C3]. Unknown [C9]. Cathode supply tightened [C4]. Fake number [7]. "
            "Link [site](https://evil.example/x) and https://evil.example/raw battery costs fell sharply ok [C1]."
        ]
    )
    report, cites = map_report(draft, CLAIMS, EV)
    s = report["summary"][0]
    assert "evil" not in s and "[7]" not in s and "C3" not in s and "C9" not in s
    assert s.endswith("ok [1][2].")
    assert {c.source_key for c in cites} == {"src-a", "src-b"}  # insufficient claim C3 never cited


def test_multi_claim_marker_and_dedup() -> None:
    m = CitationMapper(CLAIMS, EV)
    s = m.render("Battery costs fell and solid electrolytes need dry rooms [C1, C2] and battery costs fell sharply again [C1].")
    assert s == "Battery costs fell and solid electrolytes need dry rooms [1][2][3] and battery costs fell sharply again [1][2]."


def test_evidence_markers_for_follow_ups() -> None:
    m = CitationMapper(CLAIMS, EV)
    assert m.render("From E [E4] and [E1] and [E77].", kind="evidence") == "From E [1] and [2] and."


def test_bare_and_parenthesised_claim_ids_are_resolved_not_leaked() -> None:
    m = CitationMapper(CLAIMS, EV)
    assert m.render("Battery costs fell sharply, as C1 shows.") == "Battery costs fell sharply, as [1][2] shows."
    s = m.render("Solid electrolytes need dry rooms (C2) and battery costs fell sharply (C1 and C2).")
    assert s == "Solid electrolytes need dry rooms [3] and battery costs fell sharply [1][2][3]."
    # Unsupported claim in citation position: resolved to nothing, never shown as "C3".
    assert m.render("Recycling rates doubled, per C3.") == "Recycling rates doubled, per."


def test_identifiers_that_look_like_ids_are_not_deleted() -> None:
    """Regression (carried-over review item): "C4" the dataset and "E10" the road are ordinary words."""
    m = CitationMapper(CLAIMS, EV)
    assert m.render("Models trained on C4 and the E10 cluster improved.") == "Models trained on C4 and the E10 cluster improved."
    assert m.render("Use C99 or C12 settings.") == "Use C99 or C12 settings."  # unknown ids: untouched even after a cue
    assert m.render("The E10 road was widened.", kind="evidence") == "The E10 road was widened."


# --- M-05: a citation is kept only when the sentence actually restates the cited claim


ORCHID = [
    ClaimItem(
        "C1", "Sensor logs under the Orchid Protocol are retained for exactly 41 days before being archived to cold storage", ["E1"], ClaimStatus.supported, 0.9
    ),
    ClaimItem("C2", "The Orchid Protocol is owned by the Meridian reliability team", ["E2"], ClaimStatus.supported, 0.9),
]
ORCHID_EV = [EvidenceItem("E1", "doc:1", "…retained for exactly 41 days…", 0.9), EvidenceItem("E2", "doc:1", "…owner is the Meridian…", 0.9)]


def test_commentary_loses_its_citation_but_faithful_sentences_keep_theirs() -> None:
    """Regression for the audit example: the model attached [C1] to its own interpretation."""
    draft = paper(
        [
            "Sensor logs are retained for exactly 41 days before being archived to cold storage [C1]. "
            "A 41-day retention window provides a balance between data availability for troubleshooting and storage cost management [C1]. "
            "The protocol is owned by the Meridian reliability team [C2]."
        ]
    )
    report, cites = map_report(draft, ORCHID, ORCHID_EV)
    s = report["summary"][0]
    assert "cold storage [1]." in s
    assert "storage cost management." in s and "management [1]" not in s  # commentary kept, citation removed
    assert "Meridian reliability team [1]." in s
    assert len(cites) == 1


def test_fidelity_accepts_paraphrase_and_hedging() -> None:
    m = CitationMapper(ORCHID, ORCHID_EV)
    assert m.render("Evidence partially indicates that sensor logs are kept for 41 days under the Orchid Protocol [C1].").endswith("Protocol [1].")
    assert m.render("Meridian's reliability team owns the Orchid Protocol [C2].").endswith("Protocol [1].")


def test_adjacent_citations_are_merged_and_deduplicated() -> None:
    from app.research.citations import CitationMapper
    from app.research.state import EvidenceItem

    ev = [EvidenceItem(id=f"E{i}", source_key=k, passage="p", relevance=0.5) for i, k in enumerate(["a", "b", "b", "c"], start=1)]
    out = CitationMapper([], ev).render("Leaders are Mitsubishi and Daikin [E1] [E2] [E3][E4]. Done [E1].", kind="evidence")
    assert out == "Leaders are Mitsubishi and Daikin [1][2][3]. Done [1]."


def test_tables_diagrams_and_figures_carry_resolved_citations() -> None:
    table = {
        "type": "table",
        "caption": "Costs [C1]",
        "columns": ["Item", "Change"],
        "rows": [
            {"cells": ["Batteries [C1]", "fell sharply"], "claims": ["C1"]},
            {"cells": ["Rooms", "dry"], "claims": ["C2", "C3"]},  # C3 is insufficient: not cited
            {"cells": ["Recycling", "doubled"], "claims": ["C3"]},  # nothing citable: row dropped
        ],
    }
    diagram = {"type": "diagram", "caption": "Flow", "code": "flowchart LR\n    n1 --> n2", "claims": ["C2"]}
    figure = {
        "type": "figure",
        "caption": "A cell",
        "url": "https://img.example/a.jpg",
        "credit": "Lab",
        "page_url": "https://c.example",
        "source_key": "src-c",
    }
    report, cites = map_report(paper(["Battery costs fell sharply [C1]."], [{"heading": "Data", "blocks": [table, diagram, figure]}]), CLAIMS, EV)
    t, d, f = report["sections"][0]["blocks"]  # type: ignore[index]
    assert t == {"type": "table", "caption": "Costs", "columns": ["Item", "Change"], "rows": [["Batteries", "fell sharply [1][2]"], ["Rooms", "dry [3]"]]}
    assert d == {"type": "diagram", "caption": "Flow [3]", "code": "flowchart LR\n    n1 --> n2"}
    assert f["sourceIndex"] == 3 and f["url"] == "https://img.example/a.jpg" and f["sourceUrl"] == "https://c.example"
    assert [c.source_key for c in cites] == ["src-a", "src-b", "src-c"]
