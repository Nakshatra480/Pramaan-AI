"""Evidence extraction: pick exact, verbatim passages from sources (PRD §23)."""

from __future__ import annotations

import logging
import re
from typing import Any

from app.db.models import SourceType
from app.research.deps import ResearchDeps
from app.research.nodes.common import node
from app.research.state import MODE_LIMITS, ChunkHit, EvidenceItem, ResearchState, SourceItem
from app.research.text import cosine, overlap, sentences, terms
from app.services.llm.base import ProviderError

logger = logging.getLogger("pramaan.research")

SEMANTIC_UNAVAILABLE = "semantic_ranking_unavailable"


class NoSourcesFound(Exception):
    pass


def source_cap(total: int, n_sources: int) -> int:
    """Most passages any one source may contribute. Many sources → at least 2 each, for breadth;
    few sources → a fair share of the whole budget, so a single document can answer a multi-part
    question instead of being cut to two passages (audit H-03)."""
    return max(2, -(-total // max(1, n_sources)))


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

    # Candidate passages: (source_key, text, location, chunk_id)
    candidates: list[tuple[str, str, str | None, Any]] = []
    for s in unique.values():
        if s.type != SourceType.library:
            candidates += [(s.key, w, None, None) for w in _windows(s.snippet)[:6]]
    for h in hits:
        candidates += [(f"doc:{h.document_id}", w, f"p. {h.page}" if h.page else None, h.chunk_id) for w in _windows(h.content)[:3]]
    candidates = candidates[:240]

    q = state["query"]
    qt = terms(q)
    # Embeddings sharpen the ranking but are not required: if the embedding provider is down or
    # misbehaves, rank by keyword overlap and RECORD it — the report states the limitation
    # (audit H-01). Generation outages still fail the job (they happen in later nodes).
    warnings: list[str] = []
    try:
        vectors = await deps.embeddings.embed_documents([c[1] for c in candidates]) if candidates else []
        qv = await deps.embeddings.embed_query(q)
        sem = [cosine(qv, v) for v in vectors]
        semantic = True
    except ProviderError as e:
        logger.warning("semantic_ranking_unavailable", extra={"fields": {"error": e.code}})
        sem = [0.0] * len(candidates)
        semantic = False
        warnings.append(SEMANTIC_UNAVAILABLE)
    scored = sorted(
        (((0.65 * sem[i] + 0.35 * overlap(qt, terms(c[1]))) if semantic else overlap(qt, terms(c[1])), c) for i, c in enumerate(candidates)),
        key=lambda x: -x[0],
    )

    cap = MODE_LIMITS[state["mode"]]["evidence"]
    per_source_cap = source_cap(cap, len({c[0] for c in candidates}))
    per_source: dict[str, int] = {}
    items: list[EvidenceItem] = []
    for score, (key, passage, loc, chunk_id) in scored:
        if per_source.get(key, 0) >= per_source_cap or score <= 0.05:
            continue
        per_source[key] = per_source.get(key, 0) + 1
        items.append(
            EvidenceItem(
                id=f"E{len(items) + 1}", source_key=key, passage=passage, relevance=round(max(0.0, min(1.0, score)), 3), location=loc, chunk_id=chunk_id
            )
        )
        if len(items) >= cap:
            break

    for s in unique.values():
        rel = max((e.relevance for e in items if e.source_key == s.key), default=0.0)
        s.relevance = round(max(rel, s.relevance if s.type != SourceType.library else 0.0), 3)
    sources = list(unique.values())
    await deps.persist_sources(state["research_id"], sources)
    await deps.reporter.complete("reading", f"{len(items)} evidence passages extracted", sources=len(sources), evidence=len(items))
    if not items:
        raise NoSourcesFound
    return {"evidence": items, "errors": warnings, "metadata": {**state.get("metadata", {}), "sources": sources, "document_focused": document_focused}}
