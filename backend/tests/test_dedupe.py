"""A paper never states the same fact twice in its body; the abstract and conclusion may summarise."""

import pytest

from app.db.models import ClaimStatus
from app.research.dedupe import dedupe_report
from app.research.llm import _fallback_report, report_shape
from app.research.state import ClaimItem, ReportDraft

RAG = "RAG typically uses only 17-38% of the tokens required by long-context approaches, reducing cost [C1]."
ACC = "Long-context models often achieve higher accuracy than RAG when powerful models are available [C2]."


def p(text: str) -> dict:  # type: ignore[type-arg]
    return {"type": "paragraph", "text": text}


def body(d: ReportDraft) -> str:
    return " ".join(b["text"] for s in d.sections for b in s["blocks"] if b["type"] == "paragraph")


def test_restated_sentences_are_removed_and_their_citations_kept() -> None:
    draft = ReportDraft(
        title="Retrieval versus long context",
        abstract=[f"{RAG} {ACC}"],
        sections=[
            {
                "heading": "Token efficiency",
                "blocks": [p("RAG typically uses only 17-38% of the tokens long-context approaches require, cutting cost [C1, C3].")],
            },
            {"heading": "Accuracy", "blocks": [p(ACC), {"type": "table", "caption": "x", "columns": [], "rows": []}]},
            {"heading": "Discussion", "blocks": [p(f"{ACC} Cost and freshness favour retrieval when budgets are tight [C1][C4].")]},
            {"heading": "Conclusion", "blocks": [p(f"{RAG} {ACC}")]},
        ],
        limitations=["Benchmarks vary.", "Benchmarks vary."],
    )
    out = dedupe_report(draft)
    text = " ".join(b["text"] for s in out.sections[:3] for b in s["blocks"] if b["type"] == "paragraph")
    assert text.count("17-38%") == 1 and text.count("higher accuracy") == 1
    assert out.sections[2]["blocks"] == [p("Cost and freshness favour retrieval when budgets are tight [C1][C4].")]
    assert out.abstract == draft.abstract  # the abstract summarises: untouched
    assert out.sections[3]["blocks"] == [p(f"{RAG} {ACC}")]  # so does the conclusion
    assert out.sections[1]["blocks"][1]["type"] == "table"  # visuals are never removed
    assert out.limitations == ["Benchmarks vary."]


def test_a_dropped_copy_hands_its_extra_citations_to_the_kept_sentence() -> None:
    draft = ReportDraft(
        title="t",
        abstract=["x"],
        sections=[
            {"heading": "A", "blocks": [p(RAG)]},
            {"heading": "B", "blocks": [p("RAG typically uses only 17-38% of the tokens of long-context approaches [C1, C5].")]},
        ],
        limitations=[],
    )
    out = dedupe_report(draft)
    assert [s["heading"] for s in out.sections] == ["A"]  # B had nothing new left
    assert "[C5]" in body(out)


def test_different_items_are_not_merged() -> None:
    a = "Amgen offers a remote undergraduate software engineering internship for summer 2027 [C2]."
    b = "Cohere has a remote software engineer intern position for winter 2027 [C3]."
    out = dedupe_report(ReportDraft(title="t", abstract=["x"], sections=[{"heading": "Roles", "blocks": [p(a), p(b)]}], limitations=[]))
    assert len(out.sections[0]["blocks"]) == 2


@pytest.mark.parametrize("mode", ["quick", "standard", "deep"])
def test_shape_never_asks_for_more_sections_than_the_claims_support(mode: str) -> None:
    for n in (1, 3, 6, 16):
        s = report_shape(mode, "comprehensive", n)
        assert 1 <= s.body <= max(1, n // 2) and s.abstract == 1


def test_fallback_report_uses_each_claim_once() -> None:
    claims = [
        ClaimItem(f"C{i}", f"Distinct fact number {i} about solid-state battery production timelines", [f"E{i}"], ClaimStatus.supported, 0.9)
        for i in range(1, 8)
    ]
    d = _fallback_report("when will solid-state batteries ship?", claims, [])
    text = " ".join([*d.abstract, body(d)])
    assert all(text.count(f"[C{i}]") == 1 for i in range(1, 8))
    assert d.title == "When will solid-state batteries ship" and d.sections[0]["heading"] == "Results"
