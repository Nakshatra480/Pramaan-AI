"""Hybrid retrieval over the user's authorised documents (PRD §19).

query → embedding → vector search (HNSW) + full-text search → RRF fusion → rerank.
Scope is ALWAYS an explicit list of document ids computed by the caller from
authorisation rules; this service never widens it.
"""

from __future__ import annotations

import logging
import re
import uuid
from collections.abc import Sequence
from typing import Any, Protocol

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.research.state import ChunkHit
from app.research.text import STOP
from app.services.embeddings import EmbeddingService
from app.services.llm.base import ProviderError

logger = logging.getLogger("pramaan.retrieval")

RRF_K = 60

_SQL = text(
    """
    WITH vec AS (
        SELECT c.id, row_number() OVER (ORDER BY c.embedding <=> CAST(:qv AS vector)) AS rank,
               1 - (c.embedding <=> CAST(:qv AS vector)) AS sim
        FROM document_chunks c
        WHERE c.document_id = ANY(:doc_ids) AND c.embedding IS NOT NULL
        ORDER BY c.embedding <=> CAST(:qv AS vector)
        LIMIT :pool
    ),
    fts AS (
        SELECT c.id, row_number() OVER (ORDER BY ts_rank_cd(c.tsv, q) DESC) AS rank
        FROM document_chunks c, to_tsquery('english', :q) q
        WHERE c.document_id = ANY(:doc_ids) AND c.tsv @@ q
        ORDER BY ts_rank_cd(c.tsv, q) DESC
        LIMIT :pool
    ),
    fused AS (
        SELECT id, SUM(score)::float8 AS score, MAX(sim)::float8 AS sim FROM (
            SELECT id, 1.0 / (:k + rank) AS score, sim FROM vec
            UNION ALL
            SELECT id, 1.0 / (:k + rank) AS score, NULL AS sim FROM fts
        ) s GROUP BY id
    )
    SELECT c.id, c.document_id, d.title, c.content, f.score, COALESCE(f.sim, 0) AS sim, (c.metadata->>'page')::int AS page
    FROM fused f
    JOIN document_chunks c ON c.id = f.id
    JOIN documents d ON d.id = c.document_id
    WHERE d.status = 'ready'
    ORDER BY f.score DESC
    LIMIT :limit
    """
)


_FTS_ONLY_SQL = text(
    """
    SELECT c.id, c.document_id, d.title, c.content, ts_rank_cd(c.tsv, q)::float8 AS score, 0::float8 AS sim, (c.metadata->>'page')::int AS page
    FROM document_chunks c
    JOIN documents d ON d.id = c.document_id, to_tsquery('english', :q) q
    WHERE c.document_id = ANY(:doc_ids) AND d.status = 'ready' AND c.tsv @@ q
    ORDER BY score DESC
    LIMIT :limit
    """
)
_WORDS = re.compile(r"[a-z0-9]{2,}")


def any_terms_query(text_: str) -> str:
    """OR of the question's words for to_tsquery: a chunk matches if it shares any meaningful term
    (ranked by how many). websearch_to_tsquery would require every word of a natural-language
    question to appear, which almost never happens."""
    words = list(dict.fromkeys(w for w in _WORDS.findall(text_.lower()) if w not in STOP))[:24]
    return " | ".join(words) or "xyzzy_no_terms"


class Retriever(Protocol):
    async def search(self, query: str, document_ids: list[uuid.UUID], limit: int) -> list[ChunkHit]: ...


class HybridRetriever:
    def __init__(self, db: AsyncSession, embeddings: EmbeddingService | None = None) -> None:
        self.db = db
        self.embeddings = embeddings or EmbeddingService()

    async def search(self, query: str, document_ids: list[uuid.UUID], limit: int) -> list[ChunkHit]:
        if not document_ids:
            return []
        q = any_terms_query(query)
        try:
            qv = await self.embeddings.embed_query(query)
        except ProviderError as e:
            # Embedding provider down: keyword retrieval still finds the user's documents (audit C-02).
            logger.warning("retrieval_keyword_only", extra={"fields": {"error": e.code}})
            rows = (await self.db.execute(_FTS_ONLY_SQL, {"q": q, "doc_ids": document_ids, "limit": limit * 2})).all()
            return self._rerank(rows, limit)
        # With a document filter, a plain HNSW scan can stop before finding enough allowed rows.
        # pgvector ≥ 0.8 iterative scans keep searching (transaction-local; ignored by older versions).
        await self.db.execute(text("SET LOCAL hnsw.iterative_scan = relaxed_order"))
        rows = (
            await self.db.execute(
                _SQL,
                {
                    "qv": "[" + ",".join(f"{x:.6f}" for x in qv) + "]",
                    "q": q,
                    "doc_ids": document_ids,
                    "pool": max(limit * 4, 20),
                    "k": RRF_K,
                    "limit": limit * 2,
                },
            )
        ).all()
        return self._rerank(rows, limit)

    @staticmethod
    def _rerank(rows: Sequence[Any], limit: int) -> list[ChunkHit]:
        # Rerank: fused rank, lightly boosted by semantic similarity; drop near-duplicates.
        hits = sorted(rows, key=lambda r: r.score * (1 + max(0.0, r.sim)), reverse=True)
        out: list[ChunkHit] = []
        seen: set[str] = set()
        for r in hits:
            sig = r.content[:120]
            if sig in seen:
                continue
            seen.add(sig)
            out.append(ChunkHit(chunk_id=r.id, document_id=r.document_id, document_title=r.title, content=r.content, score=float(r.score), page=r.page))
            if len(out) >= limit:
                break
        return out
