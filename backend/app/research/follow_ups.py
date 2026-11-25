"""Follow-ups on a finished research report.

Every follow-up is routed to one of two workflows:

- **revise** — the user wants the report itself changed ("make it shorter", "focus on India", "add a
  section on costs", "rewrite it for executives"). Pramaan regenerates the report as a *new* research
  session that carries the user's instructions; the original report is never modified.
- **question** — the user asks something about the report or its topic. Pramaan searches the web
  (Tavily) and the scholarly literature (OpenAlex) for that question, and answers from the report's own
  evidence plus what it just found, citing both.

The intent is decided by the model when it's available, with a keyword heuristic as the fallback.
"""

from __future__ import annotations

import asyncio
import logging
import re
from dataclasses import dataclass
from typing import Any, Literal

import httpx

from app.research.state import EvidenceItem, SourceItem
from app.research.text import overlap, terms
from app.services.tavily import normalize_url

logger = logging.getLogger("pramaan.research")

Intent = Literal["revise", "question"]

# Phrases that ask for the report to be changed rather than for information.
_REVISE = re.compile(
    r"\b("
    r"re-?write|re-?generate|re-?do|re-?draft|re-?work|re-?structure|re-?format|re-?phrase|re-?word|revise|edit|update the (?:report|summary|findings)|"
    r"make (?:it|the (?:report|summary|findings|analysis)|this)\b|"
    r"(?:shorter|longer|simpler|briefer|more concise|more detailed|less technical|more technical)\b|"
    r"shorten|lengthen|condense|summari[sz]e (?:it|the report) (?:in|as|into)|simplify|expand (?:on )?(?:the|it|this|each)|"
    r"(?:focus|concentrate) (?:more )?on|(?:add|include) (?:a |an )?(?:section|paragraph|table|comparison|chapter|part)|"
    r"remove (?:the |a )?(?:section|paragraph|part)|drop the|leave out|exclude|"
    r"(?:in|as|into|with) (?:bullet points|bullets|a table|plain (?:english|language)|layman'?s terms|simple terms)|"
    r"for (?:executives|beginners|a (?:general|non-technical|technical) audience|students|investors|policymakers)|"
    r"(?:change|adjust|switch) (?:the )?(?:tone|style|focus|format|structure|length)|tone|"
    r"translate (?:it|the report|this)|in (?:hindi|spanish|french|german|simple english)|"
    r"(?:new|another|different) version|version of (?:the|this) report"
    r")",
    re.IGNORECASE,
)
_QUESTION_START = re.compile(r"^\s*(what|which|who|whom|whose|when|where|why|how|is|are|was|were|does|do|did|can|could|should|would|will|has|have)\b", re.I)


@dataclass(frozen=True)
class FollowUpIntent:
    kind: Intent
    instructions: str  # revise: what to change, in the user's terms; question: unused
    search_query: str  # question: a standalone search query (pronouns resolved against the report)


def heuristic_intent(question: str, topic: str = "") -> FollowUpIntent:
    """Keyword fallback. A request phrased as an edit is a revision unless it's clearly a question
    ("why is the report so short?" asks; "make the report shorter" edits; "can you make it shorter?" edits)."""
    q = question.strip()
    polite_request = re.match(r"^\s*(can|could|would|will) you\b", q, re.I) is not None
    asks = bool(_QUESTION_START.match(q)) and q.endswith("?") and not polite_request
    revise = bool(_REVISE.search(q)) and not asks
    return FollowUpIntent("revise" if revise else "question", q if revise else "", standalone_query(q, topic))


def standalone_query(question: str, topic: str) -> str:
    """Short or referential questions ("what about costs?", "and in Europe?") get the research topic attached."""
    q = question.strip().rstrip("?")
    referential = re.search(r"\b(it|this|that|these|those|they|them|the report|above|second|first|third|last one)\b", q, re.I)
    if topic and (len(terms(q)) < 4 or referential):
        return f"{q} {topic}"[:380]
    return q[:380]


def parse_intent(data: Any, question: str, topic: str) -> FollowUpIntent:
    """Validates the model's classification; anything unusable falls back to the heuristic."""
    if not isinstance(data, dict) or data.get("intent") not in ("revise", "question"):
        return heuristic_intent(question, topic)
    if data["intent"] == "revise":
        instructions = str(data.get("instructions") or "").strip() or question.strip()
        return FollowUpIntent("revise", instructions[:1500], standalone_query(question, topic))
    query = str(data.get("search_query") or "").strip()
    return FollowUpIntent("question", "", query[:380] if len(terms(query)) >= 2 else standalone_query(question, topic))


# ------------------------------------------------------------------ revisions

_SHORTER = re.compile(r"\b(shorter|shorten|brief|briefer|concise|condense|summar|tl;?dr|one page|less detail|fewer)\b", re.I)
_LONGER = re.compile(r"\b(longer|lengthen|more detail|in[- ]depth|deeper|comprehensive|expand|elaborate|thorough|more thorough)\b", re.I)


def revision_length(instructions: str, default: str) -> str:
    """Response length implied by a revision request ("make it shorter" → concise)."""
    if _SHORTER.search(instructions):
        return "concise"
    if _LONGER.search(instructions):
        return "comprehensive"
    return default


def revision_context(instructions: str, previous_summary: list[str], project_instructions: str | None) -> str:
    """Guidance for the planner and writer of a revision: the user's requested changes, then project instructions."""
    previous = " ".join(previous_summary)[:1200]
    parts = [
        "The user asked to regenerate an earlier report on this question with these changes. Follow them for scope, focus, "
        f"structure, audience, tone and length, while every factual statement must still come from verified evidence:\n{instructions}",
    ]
    if previous:
        parts.append(f"The earlier report's summary, for reference only (do not copy it):\n{previous}")
    if project_instructions:
        parts.append(f"Project instructions:\n{project_instructions}")
    return "\n\n".join(parts)


def revision_title(title: str) -> str:
    base = re.sub(r"\s*\(revised(?: \d+)?\)$", "", title).strip()
    return f"{base} (revised)"[:300]


# ------------------------------------------------------------------ question answering

WEB_RESULTS = 5
ACADEMIC_RESULTS = 4
REPORT_EVIDENCE = 14
FRESH_EVIDENCE = 12
PASSAGE_CHARS = 700


@dataclass
class Candidate:
    """A citable source for a follow-up answer: one of the report's sources or a fresh search result."""

    key: str
    origin: Literal["report", "web", "academic"]
    title: str
    url: str
    domain: str
    publisher: str
    type: str
    published_at: Any = None
    authors: list[str] | None = None
    source_id: str | None = None

    def out(self) -> dict[str, Any]:
        return {
            "title": self.title,
            "url": self.url,
            "domain": self.domain,
            "publisher": self.publisher,
            "type": self.type,
            "publishedAt": self.published_at.isoformat() if hasattr(self.published_at, "isoformat") else self.published_at,
            "authors": list(self.authors or []),
            "origin": self.origin,
            "sourceId": self.source_id,
        }


def passages(text: str, q: set[str], limit: int = 2) -> list[str]:
    """The most question-relevant passages (~sentence groups) of a search result's text."""
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", " ".join(text.split())) if len(s.strip()) > 25]
    chunks: list[str] = []
    cur = ""
    for s in sentences:
        if cur and len(cur) + len(s) > PASSAGE_CHARS:
            chunks.append(cur)
            cur = s
        else:
            cur = f"{cur} {s}".strip()
    if cur:
        chunks.append(cur)
    ranked = sorted(chunks, key=lambda c: overlap(q, terms(c)), reverse=True)
    return [c for c in ranked[:limit] if c]


async def search_fresh(web: Any, academic: Any, query: str) -> tuple[list[tuple[str, SourceItem]], list[str]]:
    """Web (Tavily) and scholarly (OpenAlex) results for a follow-up, in parallel. Failures degrade, never raise."""
    tasks: list[Any] = []
    labels: list[str] = []
    if getattr(web, "configured", True):
        tasks.append(web.search(query, max_results=WEB_RESULTS, deep=False))
        labels.append("web")
    tasks.append(academic.search(query, max_results=ACADEMIC_RESULTS))
    labels.append("academic")
    results = await asyncio.gather(*tasks, return_exceptions=True)
    found: list[tuple[str, SourceItem]] = []
    errors: list[str] = []
    for label, r in zip(labels, results, strict=True):
        if isinstance(r, BaseException):
            if not isinstance(r, httpx.HTTPError | ValueError | TimeoutError):
                logger.warning("follow_up_search_error", extra={"fields": {"channel": label, "error": type(r).__name__}})
            errors.append(f"{label}_search_failed")
            continue
        found.extend((label, s) for s in r)
    return found, errors


def build_evidence(
    question: str, report_evidence: list[Any], report_sources: dict[str, Any], fresh: list[tuple[str, SourceItem]]
) -> tuple[list[EvidenceItem], dict[str, Candidate]]:
    """Evidence for the answer — the report's most relevant passages, then the best passages from the new results —
    and the citable candidate behind each passage's `source_key`."""
    q = terms(question)
    candidates: dict[str, Candidate] = {}
    by_url: dict[str, str] = {}
    for sid, s in report_sources.items():
        key = f"report:{sid}"
        candidates[key] = Candidate(
            key, "report", s.title, s.url, s.domain, s.publisher, getattr(s.type, "value", str(s.type)), s.published_at, list(s.authors or []), sid
        )
        if s.url:
            by_url[normalize_url(s.url)] = key

    items: list[EvidenceItem] = []
    ranked = sorted(report_evidence, key=lambda e: (overlap(q, terms(e.passage)), e.relevance), reverse=True)[:REPORT_EVIDENCE]
    for e in ranked:
        items.append(EvidenceItem(id=f"E{len(items) + 1}", source_key=f"report:{e.source_id}", passage=e.passage, relevance=e.relevance))

    fresh_items: list[tuple[float, EvidenceItem]] = []
    for channel, s in fresh:
        url_key = normalize_url(s.url) if s.url else s.key
        key = by_url.get(url_key) or f"fresh:{url_key}"
        if key not in candidates:
            origin: Literal["web", "academic"] = "academic" if channel == "academic" else "web"
            candidates[key] = Candidate(
                key, origin, s.title, s.url, s.domain, s.publisher, getattr(s.type, "value", str(s.type)), s.published_at, list(s.authors), None
            )
        text = s.snippet or s.abstract or ""
        for p in passages(text, q):
            score = overlap(q, terms(p)) + 0.25 * (s.relevance or 0)
            fresh_items.append((score, EvidenceItem(id="", source_key=key, passage=p, relevance=s.relevance or 0.5)))
    for _, e in sorted(fresh_items, key=lambda x: -x[0])[:FRESH_EVIDENCE]:
        e.id = f"E{len(items) + 1}"
        items.append(e)
    return items, candidates
