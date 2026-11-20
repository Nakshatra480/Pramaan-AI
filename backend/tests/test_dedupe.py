"""Reports never state the same fact twice — across summary, findings and analysis, in every mode."""

import pytest

from app.db.models import ClaimStatus
from app.research.dedupe import dedupe_report
from app.research.llm import _fallback_report, report_shape
from app.research.state import ClaimItem, ReportDraft

RAG = "RAG typically uses only 17-38% of the tokens required by long-context approaches, reducing cost [C1]."
ACC = "Long-context models often achieve higher accuracy than RAG when powerful models are available [C2]."


def test_restated_sentences_are_removed_and_their_citations_kept() -> None:
    draft = ReportDraft(
        summary=[f"{RAG} {ACC}"],
        findings=[
            {
                "title": "Token efficiency",
                "body": "RAG typically uses only 17-38% of the tokens long-context approaches require, cutting cost [C1, C3].",
                "claims": ["C1"],
            },
            {"title": "Accuracy", "body": ACC, "claims": ["C2"]},
            {"title": "Freshness", "body": "RAG handles changing knowledge bases and keeps information current [C4].", "claims": ["C4"]},
        ],
        analysis=[{"heading": "Trade-offs", "paragraphs": [f"{ACC} Cost and freshness favour retrieval when budgets are tight [C1][C4]."]}],
        limitations=["Benchmarks vary.", "Benchmarks vary."],
    )
    out = dedupe_report(draft)
    every = [*out.summary, *(f["body"] for f in out.findings), *(p for a in out.analysis for p in a["paragraphs"])]
    text = " ".join(every)
    assert text.count("17-38%") == 1 and text.count("higher accuracy") == 1
    assert "C3" in text  # the dropped copy's extra citation moved onto the kept sentence
    assert out.analysis[0]["paragraphs"] == ["Cost and freshness favour retrieval when budgets are tight [C1][C4]."]
    assert out.limitations == ["Benchmarks vary."]


def test_summary_that_lists_the_findings_does_not_empty_them() -> None:
    bodies = [
        "A listing reports 161 live remote AI internships from 97 employers [C1].",
        "Amgen offers a remote undergraduate software engineering internship for summer 2027 [C2].",
        "Cohere has a remote software engineer intern position for winter 2027 [C3].",
    ]
    draft = ReportDraft(
        summary=[" ".join(bodies)], findings=[{"title": f"F{i}", "body": b, "claims": []} for i, b in enumerate(bodies)], analysis=[], limitations=[]
    )
    out = dedupe_report(draft)
    assert out.summary == [bodies[0]] and [f["body"] for f in out.findings] == bodies[1:]  # nothing lost, nothing repeated
    partly = ReportDraft(
        summary=[f"{bodies[0]} Remote roles are spread across many employers and seasons."], findings=draft.findings, analysis=[], limitations=[]
    )
    out = dedupe_report(partly)
    assert [f["body"] for f in out.findings] == bodies[1:]  # the one repeated finding is stated once, in the summary
    assert out.summary == [f"{bodies[0]} Remote roles are spread across many employers and seasons."]


def test_different_items_are_not_merged() -> None:
    a = "Amgen offers a remote undergraduate software engineering internship for summer 2027 [C2]."
    b = "Cohere has a remote software engineer intern position for winter 2027 [C3]."
    out = dedupe_report(ReportDraft(summary=[], findings=[{"title": "A", "body": a}, {"title": "B", "body": b}], analysis=[], limitations=[]))
    assert len(out.findings) == 2


@pytest.mark.parametrize("mode", ["quick", "standard", "deep"])
def test_shape_never_asks_for_more_text_than_the_claims_support(mode: str) -> None:
    for n in (1, 3, 6, 16):
        s = report_shape(mode, "comprehensive", n)
        assert s.findings <= n and s.sections <= n // 3 and s.summary <= 1 + n // 6


def test_fallback_report_uses_each_claim_once() -> None:
    claims = [
        ClaimItem(f"C{i}", f"Distinct fact number {i} about solid-state battery production timelines", [f"E{i}"], ClaimStatus.supported, 0.9)
        for i in range(1, 8)
    ]
    d = _fallback_report("q", claims, [])
    text = " ".join([*d.summary, *(f["body"] for f in d.findings), *(p for a in d.analysis for p in a["paragraphs"])])
    assert all(text.count(f"[C{i}]") == 1 for i in range(1, 8))


def test_analysis_that_only_glues_findings_together_is_dropped() -> None:
    """Regression from a real Deep run: analysis restating two findings with connective words."""
    draft = ReportDraft(
        summary=["Several remote internships accept undergraduates."],
        findings=[
            {"title": "Outreachy", "body": "The Outreachy program provides paid remote internships for underrepresented students [C1]."},
            {"title": "Explore", "body": "Microsoft Explore is a remote summer internship for first- and second-year college students [C2]."},
        ],
        analysis=[
            {
                "heading": "Diverse opportunities",
                "paragraphs": [
                    "Outreachy provides paid remote internships for underrepresented students, while Microsoft Explore offers a remote summer "
                    "internship aimed at first- and second-year college students, suggesting diverse pathways [C1][C2]."
                ],
            },
            {
                "heading": "Eligibility",
                "paragraphs": ["Bask Health's backend role does not require a degree, unlike Microsoft Explore's year limits [C2][C3]."],
            },
        ],
        limitations=[],
    )
    out = dedupe_report(draft)
    assert [a["heading"] for a in out.analysis] == ["Eligibility"]  # genuine comparison kept, restatement removed
