"""Evidence extraction: pick exact, verbatim passages from sources (PRD §23)."""

from __future__ import annotations

import asyncio
import logging
import re
import time
from typing import Any

from app.db.models import SourceType
from app.research.deps import ResearchDeps
from app.research.nodes.common import node
from app.research.state import MODE_LIMITS, ChunkHit, EvidenceItem, ResearchState, SourceItem
from app.research.text import cosine, overlap, sentences, terms
from app.services.llm.base import ProviderError

logger = logging.getLogger("pramaan.research")

SEMANTIC_UNAVAILABLE = "semantic_ranking_unavailable"
MAX_CANDIDATES = 420
MIN_SCORE = 0.05
# A source's best passage is taken in the breadth-first pass only if it is at least this relevant.
BREADTH_FLOOR = 0.22
BREADTH_FLOOR_LEXICAL = 0.1


class NoSourcesFound(Exception):
    pass


def source_cap(total: int, n_sources: int) -> int:
    """Most passages any one source may contribute. Many sources → at least 2 each, for breadth;
    few sources → a fair share of the whole budget, so a single document can answer a multi-part
    question instead of being cut to two passages (audit H-03)."""
    return max(2, -(-total // max(1, n_sources)))


Candidate = tuple[str, str, "str | None", Any]


def select_evidence(
    scored: list[tuple[float, Candidate]],
    cap: int,
    *,
    breadth_floor: float,
    max_sources: int | None = None,
    priority: set[str] | None = None,
    priority_share: float = 1.0,
) -> list[EvidenceItem]:
    """See `_select`. With `priority` (the documents a research is built from), their most relevant passages fill
    up to `priority_share` of the budget first — regardless of the per-source cap — and other sources the rest."""
    if not priority:
        return _number(_select(scored, cap, breadth_floor=breadth_floor, max_sources=max_sources))
    first = [x for x in scored if x[1][0] in priority and x[0] > 0][: max(1, int(cap * priority_share))]
    rest = [x for x in scored if x[1][0] not in priority]
    return _number(first + _select(rest, cap - len(first), breadth_floor=breadth_floor, max_sources=max_sources))


def _number(chosen: list[tuple[float, Candidate]]) -> list[EvidenceItem]:
    return [
        EvidenceItem(id=f"E{n + 1}", source_key=key, passage=passage, relevance=round(max(0.0, min(1.0, score)), 3), location=loc, chunk_id=chunk_id)
        for n, (score, (key, passage, loc, chunk_id)) in enumerate(chosen)
    ]


def _select(scored: list[tuple[float, Candidate]], cap: int, *, breadth_floor: float, max_sources: int | None = None) -> list[tuple[float, Candidate]]:
    """Breadth first, then depth: every relevant source contributes its best passage before any source contributes
    a second, so the evidence (and the report's citations) span many sources instead of a few long pages.
    The remaining budget goes to the next-best passages, with a per-source cap. At most `max_sources` distinct
    sources are used (the most relevant ones)."""
    limit = max_sources or cap
    per_source_cap = source_cap(cap, min(limit, len({c[0] for _, c in scored})))
    chosen: list[tuple[float, Candidate]] = []
    taken: set[int] = set()
    first: set[str] = set()
    for i, (score, c) in enumerate(scored):  # scored is best-first
        if len(chosen) >= cap or len(first) >= limit:
            break
        if c[0] not in first and score >= breadth_floor:
            first.add(c[0])
            chosen.append((score, c))
            taken.add(i)
    per_source: dict[str, int] = {k: 1 for k in first}
    for i, (score, c) in enumerate(scored):
        if len(chosen) >= cap:
            break
        if i in taken or score <= MIN_SCORE or per_source.get(c[0], 0) >= per_source_cap:
            continue
        if c[0] not in per_source and len(per_source) >= limit:
            continue
        per_source[c[0]] = per_source.get(c[0], 0) + 1
        chosen.append((score, c))
    chosen.sort(key=lambda x: -x[0])
    return chosen


async def _empty() -> list[list[float]]:
    return []


def _library_sources(hits: list[ChunkHit]) -> list[SourceItem]:
    by_doc: dict[str, SourceItem] = {}
    for h in hits:
        key = f"doc:{h.document_id}"
        if key not in by_doc:
            by_doc[key] = SourceItem(
                key=key,
                title=h.document_title,
                url=f"/library/{h.document_id}",
                domain="Your library",
                publisher="Your library",
                type=SourceType.library,
                snippet="",
                relevance=0.0,
                document_id=h.document_id,
            )
    return list(by_doc.values())


# The question points at the user's own material ("according to the uploaded document", "my notes", …).
_DOC_REFERENCE = re.compile(
    r"\b(?:uploaded|attached|this|that|my|our)\s+(?:documents?|docs?|files?|pdfs?|papers?|notes?|reports?|uploads?|library|project)\b"
    r"|\bthe\s+(?:uploaded\s+|attached\s+)?(?:documents?|docs?|files?|pdfs?|notes?|uploads?)\b"
    r"|\bin\s+(?:my|our|the)\s+(?:library|project)\b",
    re.IGNORECASE,
)
# …unless it explicitly asks to look beyond it.
_WEB_REQUEST = re.compile(
    r"\b(?:web|online|internet|news|latest|recent(?:ly)?|current(?:ly)?|today|other\s+sources|external|compare|versus|vs\.?)\b",
    re.IGNORECASE,
)
_WORD = re.compile(r"[A-Za-z0-9][A-Za-z0-9\-]{2,}")


def _named_terms(query: str) -> set[str]:
    """Proper names / identifiers in the question: capitalised words after the first, or tokens with digits."""
    words = _WORD.findall(query)
    return {w.lower() for i, w in enumerate(words) if (i > 0 and w[0].isupper()) or any(c.isdigit() for c in w)}


def _document_focused(query: str, hits: list[ChunkHit], public: list[SourceItem]) -> bool:
    """Decide, before claims/synthesis, whether only the user's documents should answer this question.

    True when the user's documents are relevant (share a query term) and either the question refers to them
    explicitly, or it names something that appears in those documents but in none of the public sources —
    look-alike pages about a different entity must not supply the answer.
    """
    if not hits or _WEB_REQUEST.search(query):
        return False
    private_terms = set().union(*(terms(h.content) for h in hits))
    if not private_terms & terms(query):
        return False
    if _DOC_REFERENCE.search(query):
        return True
    public_terms = set().union(*(terms(f"{s.title} {s.snippet} {s.abstract or ''}") for s in public)) if public else set()
    return bool((_named_terms(query) & private_terms) - public_terms)


def _windows(text: str) -> list[str]:
    s = sentences(text)
    wins = [" ".join(s[i : i + 2]) for i in range(0, len(s), 2)]
    return [w for w in wins if 60 <= len(w) <= 700] or ([text[:600]] if len(text) >= 60 else [])


@node("evidence")
async def evidence(state: ResearchState, deps: ResearchDeps) -> dict[str, Any]:
    await deps.reporter.complete("searching", f"{len({s.key for s in state.get('sources', [])})} sources found")
    await deps.reporter.start("reading", "Reading sources and extracting passages")

    unique: dict[str, SourceItem] = {}
    for s in sorted(state.get("sources", []), key=lambda x: -x.relevance):
        unique.setdefault(s.key, s)
    hits = state.get("retrieved_chunks", [])
    document_focused = _document_focused(state["query"], hits, list(unique.values()))
    if document_focused:
        unique = {}  # answer from the user's documents only; public results stay out of evidence and citations
    for s in _library_sources(hits):
        unique.setdefault(s.key, s)
    if not unique:
        raise NoSourcesFound

    limits = MODE_LIMITS[state["mode"]]
    q = state["query"]
    qt = terms(q)
    # Open the best web results and parse their pages (BeautifulSoup), so evidence comes from the page itself
    # rather than only the search API's snippet. Wikipedia articles and library documents are already full text.
    read = 0
    t_read = time.perf_counter()
    if not document_focused:
        read = await deps.reader.read(list(unique.values()), limit=limits["read"])
        if read:
            await deps.reporter.start("reading", f"Read {read} pages in full; extracting passages")
    read_ms = round((time.perf_counter() - t_read) * 1000)

    # Candidate passages: (source_key, text, location, chunk_id)
    per_page = 4 if limits["evidence"] >= 50 else 3
    candidates: list[tuple[str, str, str | None, Any]] = []
    for s in unique.values():
        if s.type == SourceType.library:
            continue
        page = sorted(s.passages, key=lambda p: -overlap(qt, terms(p)))[:per_page] if s.passages else []
        snippet = _windows(s.snippet)[: 2 if page else 6]
        candidates += [(s.key, w, None, None) for w in dict.fromkeys([*page, *snippet])]
    focus = {f"doc:{d}" for d in state.get("focus_document_ids") or []}
    # A document the research is built from is read more closely (more windows per passage), within a fixed total.
    per_chunk = max(2, min(6, 300 // max(1, len(hits)))) if focus else 3
    private = [(f"doc:{h.document_id}", w, f"p. {h.page}" if h.page else None, h.chunk_id) for h in hits for w in _windows(h.content)[:per_chunk]]
    # Sources are in relevance order, so a cut drops the weakest public passages — never the user's own documents.
    candidates = candidates[: max(0, MAX_CANDIDATES - len(private))] + private

    # Embeddings sharpen the ranking but are not required: if the embedding provider is down or
    # misbehaves, rank by keyword overlap and RECORD it — the report states the limitation
    # (audit H-01). Generation outages still fail the job (they happen in later nodes).
    warnings: list[str] = []
    t_embed = time.perf_counter()
    try:
        vectors, qv = await asyncio.gather(
            deps.embeddings.embed_documents([c[1] for c in candidates]) if candidates else _empty(),
            deps.embeddings.embed_query(q),
        )
        sem = [cosine(qv, v) for v in vectors]
        semantic = True
    except ProviderError as e:
        logger.warning("semantic_ranking_unavailable", extra={"fields": {"error": e.code}})
        sem = [0.0] * len(candidates)
        semantic = False
        warnings.append(SEMANTIC_UNAVAILABLE)
    logger.info(
        "evidence_inputs",
        extra={"fields": {"pages_read": read, "read_ms": read_ms, "candidates": len(candidates), "embed_ms": round((time.perf_counter() - t_embed) * 1000)}},
    )
    scored = sorted(
        (((0.65 * sem[i] + 0.35 * overlap(qt, terms(c[1]))) if semantic else overlap(qt, terms(c[1])), c) for i, c in enumerate(candidates)),
        key=lambda x: -x[0],
    )
    items = select_evidence(
        scored,
        limits["evidence"],
        breadth_floor=BREADTH_FLOOR if semantic else BREADTH_FLOOR_LEXICAL,
        max_sources=limits["max_sources"],
        priority=focus,
        # Built from the user's documents: they fill the evidence first; other sources (if any) only supplement.
        priority_share=0.7 if any(c[0] not in focus for c in candidates) else 1.0,
    )

    for s in unique.values():
        rel = max((e.relevance for e in items if e.source_key == s.key), default=0.0)
        s.relevance = round(max(rel, s.relevance if s.type != SourceType.library else 0.0), 3)
    sources = list(unique.values())
    await deps.persist_sources(state["research_id"], sources)
    pages = f" from {read} pages read in full" if read else ""
    await deps.reporter.complete("reading", f"{len(items)} evidence passages extracted{pages}", sources=len(sources), evidence=len(items))
    if not items:
        raise NoSourcesFound
    return {"evidence": items, "errors": warnings, "metadata": {**state.get("metadata", {}), "sources": sources, "document_focused": document_focused}}
