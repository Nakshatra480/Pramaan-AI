"""EmbeddingService — the only place embeddings are produced."""

from __future__ import annotations

import asyncio

from app.core.config import get_settings
from app.services import cache
from app.services.llm.base import EmbeddingProvider, EmbeddingTask, MalformedOutput
from app.services.llm.factory import get_embedder

EMBED_CONCURRENCY = 4


class EmbeddingService:
    def __init__(self, provider: EmbeddingProvider | None = None, batch_size: int | None = None) -> None:
        s = get_settings()
        self.provider = provider or get_embedder()
        self.dim = s.embedding_dim
        self.batch_size = max(1, batch_size or s.embedding_batch_size)
        self._query_ttl = s.cache_ttl_embed_s

    async def _embed(self, texts: list[str], task: EmbeddingTask) -> list[list[float]]:
        """Batches of the configured size run concurrently (a few at a time) instead of one after another, which
        made evidence ranking the slowest step of a research run. The number of requests is unchanged."""
        gate = asyncio.Semaphore(EMBED_CONCURRENCY)
        # Full-size batches: the fewest requests (free embedding tiers cap requests per day), sent in parallel.
        size = self.batch_size

        async def one(chunk: list[str]) -> list[list[float]]:
            async with gate:
                batch = await self.provider.embed(chunk, task=task)
            for v in batch:
                if len(v) != self.dim:
                    # A different embedding model would silently corrupt retrieval — refuse it.
                    raise MalformedOutput(f"embedding dimension {len(v)} != {self.dim} (check EMBEDDING_MODEL)")
            return batch

        batches = await asyncio.gather(*(one(texts[i : i + size]) for i in range(0, len(texts), size)))
        return [v for b in batches for v in b]

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return await self._embed(texts, "document")

    async def embed_query(self, text: str) -> list[float]:
        """Question embeddings are cached (Redis, when configured): the same question or sub-query
        is embedded once per TTL. Only questions are cached — never document text."""
        parts = {"provider": self.provider.name, "model": self.provider.model, "dim": self.dim, "text": text}
        hit = await cache.get_json("embed_query", parts)
        if isinstance(hit, list) and len(hit) == self.dim:
            return [float(x) for x in hit]
        vector = (await self._embed([text], "query"))[0]
        await cache.set_json("embed_query", parts, vector, self._query_ttl)
        return vector
