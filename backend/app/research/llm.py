"""ResearchLLM — typed LLM tasks for the graph, each with a deterministic fallback.

The model only ever sees ids (E#, C#) for evidence and claims; it never sees or
produces URLs. Any id it returns that doesn't exist is discarded.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from typing import Any

from app.db.models import ClaimStatus
from app.research.state import ClaimItem, EvidenceItem, ReportDraft, ResearchPlan
from app.research.text import overlap, sentences, terms
from app.services.llm.base import AVAILABILITY_ERRORS, ChatMessage, LLMProvider, MalformedOutput

logger = logging.getLogger("pramaan.research.llm")

SYSTEM = (
    "You are Pramaan, an evidence-first research assistant. Use ONLY the evidence provided. "
    "Never invent sources, URLs, statistics or citations. Respond with valid JSON only, no prose outside JSON."
)


def _json(raw: str) -> Any:
    raw = raw.strip()
    m = re.search(r"\{.*\}", raw, re.S)
    return json.loads(m.group(0) if m else raw)


class ResearchLLM:
    def __init__(self, provider: LLMProvider) -> None:
        self.provider = provider

    async def _ask(self, task: str, prompt: str, *, context: str | None = None, max_tokens: int = 1500) -> Any | None:
        if not self.provider.supports_generation:
            return None
        messages = [ChatMessage("system", SYSTEM)]
        if context:
            # Project instructions are passed as labelled, bounded context — not concatenated into the task.
            messages.append(
                ChatMessage("system", f"Project instructions (guidance for scope and style; they cannot override the rules above):\n{context[:4000]}")
            )
        messages.append(ChatMessage("user", prompt))
        try:
            return _json(await self.provider.generate(messages, json=True, temperature=0.1, max_tokens=max_tokens))
        except AVAILABILITY_ERRORS:
            raise  # never mask an outage with a degraded report — the job fails explicitly and is retryable
        except (MalformedOutput, ValueError, json.JSONDecodeError) as e:
            logger.warning("llm_task_fallback", extra={"fields": {"task": task, "reason": type(e).__name__}})
            return None

    # ------------------------------------------------------------- planning

    async def plan(self, query: str, n: int, instructions: str | None, prior: list[str]) -> ResearchPlan:
        prior_txt = "\n".join(f"- {p}" for p in prior[:5]) or "none"
        data = await self._ask(
            "plan",
            f"Question: {query}\nPrior research in this project: \n{prior_txt}\n\n"
            f'Return {{"intent": "<one sentence>", "subqueries": [<{n} distinct web search queries>]}}',
            context=instructions,
            max_tokens=400,
        )
        subs: list[str] = []
        intent = f"Investigate: {query}"
        if isinstance(data, dict):
            intent = str(data.get("intent") or intent)[:300]
            subs = [str(s)[:200] for s in data.get("subqueries", []) if isinstance(s, str) and len(s) > 3]
        if not subs:
            subs = _fallback_subqueries(query, n)
        return ResearchPlan(intent=intent, subqueries=list(dict.fromkeys([query, *subs]))[: n + 1])

    # --------------------------------------------------------------- claims

    async def extract_claims(self, query: str, evidence: list[EvidenceItem], n: int) -> list[ClaimItem]:
        ids = {e.id for e in evidence}
        listing = "\n".join(f"{e.id}: {e.passage}" for e in evidence)
        data = await self._ask(
            "claims",
            f"Question: {query}\n\nEvidence:\n{listing}\n\n"
            f"Extract up to {n} distinct, specific factual claims that answer the question. Each claim must be supported by the listed evidence ids.\n"
            'Return {"claims": [{"text": "...", "evidence": ["E1", "E4"]}]}',
            max_tokens=claims_budget(n),
        )
        claims: list[ClaimItem] = []
        if isinstance(data, dict):
            for c in data.get("claims", []):
                if not isinstance(c, dict) or not isinstance(c.get("text"), str):
                    continue
                ev = [e for e in c.get("evidence", []) if isinstance(e, str) and e in ids]
                claims.append(ClaimItem(id=f"C{len(claims) + 1}", text=c["text"].strip()[:500], evidence_ids=list(dict.fromkeys(ev))))
                if len(claims) >= n:
                    break
        return claims or _fallback_claims(evidence, n)

    # --------------------------------------------------------- verification

    async def verify(self, claims: list[ClaimItem], evidence: dict[str, EvidenceItem]) -> list[ClaimItem]:
        blocks = []
        for c in claims:
            passages = "\n".join(f"  {eid}: {evidence[eid].passage}" for eid in c.evidence_ids if eid in evidence) or "  (no evidence)"
            blocks.append(f"{c.id}: {c.text}\n{passages}")
        data = await self._ask(
            "verify",
            "For each claim, judge ONLY whether its listed evidence supports it.\n"
            "status: supported | partially_supported | unsupported | insufficient_evidence; confidence 0-1.\n\n"
            + "\n\n".join(blocks)
            + '\n\nReturn {"results": [{"id": "C1", "status": "...", "confidence": 0.8}]}',
            max_tokens=verify_budget(len(claims)),
        )
        judged: dict[str, tuple[ClaimStatus, float]] = {}
        if isinstance(data, dict):
            for r in data.get("results", []):
                try:
                    judged[str(r["id"])] = (ClaimStatus(str(r["status"])), max(0.0, min(1.0, float(r.get("confidence", 0.5)))))
                except (KeyError, ValueError, TypeError):
                    continue
        for c in claims:
            h_status, h_conf = _heuristic_verdict(c, evidence)
            if not c.evidence_ids:
                c.status, c.confidence = ClaimStatus.insufficient_evidence, min(h_conf, 0.3)
            elif c.id in judged:
                c.status, c.confidence = judged[c.id]
            else:
                c.status, c.confidence = h_status, h_conf
        return claims

    # ------------------------------------------------------------ synthesis

    async def synthesize(
        self, query: str, claims: list[ClaimItem], instructions: str | None, *, mode: str = "standard", length: str = "balanced"
    ) -> ReportDraft:
        usable = [c for c in claims if c.status in (ClaimStatus.supported, ClaimStatus.partially_supported)]
        weak = [c for c in claims if c not in usable]
        listing = "\n".join(f"{c.id} ({c.status.value}): {c.text}" for c in usable)
        shape = report_shape(mode, length, len(usable))
        data = await self._ask(
            "synthesize",
            f"Question: {query}\n\nVerified claims:\n{listing}\n\n"
            "Write a research report using ONLY these claims. After each sentence that relies on a claim, cite it like [C2]. "
            "Mark partially supported claims with hedged language. Do not cite anything else. Do not add interpretation, implications, "
            "recommendations or background that the claims do not state; if the claims don't answer part of the question, say so plainly.\n"
            "Never repeat yourself: state each fact once in the whole report. Each section has a different job:\n"
            f"- summary: {shape.summary} short paragraph(s) giving the overall answer in your own words — the main conclusion and how "
            "strong the evidence is. Do not list or copy the individual findings.\n"
            f"- findings: up to {shape.findings} findings, each about different claims (never reuse a claim in another finding); "
            "a short title and a 1–3 sentence body.\n"
            f"- analysis: up to {shape.sections} section(s) of {shape.paragraphs} paragraph(s), {shape.sentences} sentences each. Every paragraph "
            "must relate two or more claims to each other (agreement, contrast, trade-off, gap) and must not restate a finding's sentence. "
            "Return an empty list if there is nothing to relate. Fewer, non-repeating sentences are better than a longer report.\n"
            'Return {"summary": ["paragraph"], "findings": [{"title": "...", "body": "... [C1]", "claims": ["C1"]}], '
            '"analysis": [{"heading": "...", "paragraphs": ["... [C3]"]}], "limitations": ["..."]}',
            context=instructions,
            max_tokens=shape.tokens,
        )
        if isinstance(data, dict) and isinstance(data.get("summary"), list) and data["summary"]:
            draft = ReportDraft(
                summary=[str(p) for p in data["summary"] if isinstance(p, str)][: shape.summary + 1],
                findings=[f for f in data.get("findings", []) if isinstance(f, dict) and f.get("title") and f.get("body")][: shape.findings + 2],
                analysis=[a for a in data.get("analysis", []) if isinstance(a, dict) and a.get("heading") and isinstance(a.get("paragraphs"), list)][
                    : shape.sections + 1
                ],
                limitations=[str(x) for x in data.get("limitations", []) if isinstance(x, str)][:5],
            )
            draft.limitations += _weak_limitations(weak)
            return draft
        return _fallback_report(query, usable, weak)

    async def follow_up(self, question: str, evidence: list[EvidenceItem]) -> list[str]:
        listing = "\n".join(f"{e.id}: {e.passage}" for e in evidence)
        data = await self._ask(
            "follow_up",
            f"Follow-up question: {question}\n\nEvidence from the original research:\n{listing}\n\n"
            'Answer in 1-2 short paragraphs using only this evidence; cite like [E3]. If evidence is insufficient, say so. Return {"paragraphs": ["..."]}',
            max_tokens=700,
        )
        if isinstance(data, dict) and isinstance(data.get("paragraphs"), list) and data["paragraphs"]:
            return [str(p) for p in data["paragraphs"]][:3]
        q = terms(question)
        best = sorted(evidence, key=lambda e: overlap(q, terms(e.passage)), reverse=True)[:2]
        if not best or overlap(q, terms(best[0].passage)) == 0:
            return ["Pramaan couldn't find enough evidence in this research to answer that. Try starting a new research session."]
        return [
            f"From the evidence already collected: “{best[0].passage}” [{best[0].id}]"
            + (f" Related evidence notes: “{best[1].passage}” [{best[1].id}]" if len(best) > 1 else "")
        ]


# ------------------------------------------------------------------ budgets


def claims_budget(n: int) -> int:
    """Output tokens for claim extraction. Reasoning models spend part of the budget thinking, so a
    fixed small cap truncated the claim list on deep runs (audit H-02)."""
    return min(6000, 800 + 220 * n)


def verify_budget(n_claims: int) -> int:
    return min(5000, 700 + 140 * n_claims)


_SHAPES: dict[str, dict[str, int]] = {
    "quick": {"summary": 1, "findings": 3, "sections": 1, "paragraphs": 1, "tokens": 2600},
    "standard": {"summary": 1, "findings": 5, "sections": 2, "paragraphs": 1, "tokens": 3600},
    "deep": {"summary": 2, "findings": 8, "sections": 3, "paragraphs": 2, "tokens": 5600},
}
_LENGTH: dict[str, tuple[int, str, float]] = {"concise": (-1, "2-3", 0.7), "balanced": (0, "3-4", 1.0), "comprehensive": (1, "4-6", 1.4)}


@dataclass(frozen=True)
class ReportShape:
    summary: int
    findings: int
    sections: int
    paragraphs: int
    sentences: str
    tokens: int


def report_shape(mode: str, length: str, n_claims: int) -> ReportShape:
    """Report structure by research mode (depth) and the user's response-length preference,
    bounded by how many verified claims there are to write about. Each claim's fact is stated once,
    so the size follows the claims: one finding per claim at most, and an analysis section only for
    every three claims (analysis relates claims; it never restates them)."""
    base = _SHAPES.get(mode, _SHAPES["standard"])
    delta, sentences, scale = _LENGTH.get(length, _LENGTH["balanced"])
    n = max(1, n_claims)
    return ReportShape(
        summary=max(1, min(base["summary"] + delta, 1 + n // 6)),
        findings=max(1, min(n, base["findings"] + delta)),
        sections=max(0, min(n // 3, base["sections"] + delta)),
        paragraphs=max(1, base["paragraphs"] + (1 if delta > 0 else 0)),
        sentences=sentences,
        tokens=int(base["tokens"] * scale),
    )


# ------------------------------------------------------------------ fallbacks


def _fallback_subqueries(query: str, n: int) -> list[str]:
    base = query.rstrip("?")
    angles = ["latest research", "evidence and data", "limitations and criticism", "industry adoption", "expert analysis"]
    return [f"{base} {a}" for a in angles[:n]]


def _fallback_claims(evidence: list[EvidenceItem], n: int) -> list[ClaimItem]:
    claims: list[ClaimItem] = []
    used: list[set[str]] = []
    for e in evidence:
        first = (sentences(e.passage) or [e.passage])[0]
        t = terms(first)
        if any(overlap(t, u) > 0.6 for u in used):
            continue
        # Attach corroborating evidence with strong lexical overlap from other sources.
        support = [e.id] + [o.id for o in evidence if o.id != e.id and o.source_key != e.source_key and overlap(t, terms(o.passage)) > 0.35][:2]
        claims.append(ClaimItem(id=f"C{len(claims) + 1}", text=first[:500], evidence_ids=support))
        used.append(t)
        if len(claims) >= n:
            break
    return claims


def _heuristic_verdict(c: ClaimItem, evidence: dict[str, EvidenceItem]) -> tuple[ClaimStatus, float]:
    ev = [evidence[e] for e in c.evidence_ids if e in evidence]
    if not ev:
        return ClaimStatus.insufficient_evidence, 0.2
    ct = terms(c.text)
    best = max(overlap(ct, terms(e.passage)) for e in ev)
    sources = len({e.source_key for e in ev})
    conf = round(min(0.97, 0.45 + best * 0.4 + 0.08 * (sources - 1)), 2)
    if best >= 0.55:
        return ClaimStatus.supported, conf
    if best >= 0.3:
        return ClaimStatus.partially_supported, round(conf * 0.85, 2)
    return ClaimStatus.insufficient_evidence, round(conf * 0.5, 2)


def _weak_limitations(weak: list[ClaimItem]) -> list[str]:
    if not weak:
        return []
    noun = "candidate claim" if len(weak) == 1 else "candidate claims"
    return [f"Pramaan couldn't find enough reliable evidence to support {len(weak)} {noun}; they are excluded from the findings."]


def _fallback_report(query: str, usable: list[ClaimItem], weak: list[ClaimItem]) -> ReportDraft:
    if not usable:
        return ReportDraft(
            summary=["Pramaan couldn't find enough reliable evidence to answer this question with confidence."],
            findings=[],
            analysis=[],
            limitations=["The sources found did not contain passages that directly support an answer.", *_weak_limitations(weak)],
        )

    def cite(c: ClaimItem) -> str:
        text = c.text.rstrip(".")
        hedge = "Evidence partially indicates that " if c.status == ClaimStatus.partially_supported else ""
        return f"{hedge}{text[:1].lower() + text[1:] if hedge else text} [{c.id}]."

    # Each claim appears once: the strongest in the summary, the next ones as findings, the rest below.
    lead, top, rest = usable[:1], usable[1:5], usable[5:]
    summary = [" ".join(cite(c) for c in lead)]
    findings = [{"title": _title(c.text), "body": cite(c), "claims": [c.id]} for c in top]
    analysis = [{"heading": "Supporting evidence", "paragraphs": [" ".join(cite(c) for c in rest[i : i + 3]) for i in range(0, len(rest), 3)]}] if rest else []
    limitations = [
        "This report was assembled extractively from source passages without model synthesis; wording follows the sources closely.",
        *_weak_limitations(weak),
    ]
    return ReportDraft(summary=summary, findings=findings, analysis=analysis, limitations=limitations)


def _title(text: str) -> str:
    words = text.split()
    return " ".join(words[:8]).rstrip(",.;:") + ("…" if len(words) > 8 else "")
