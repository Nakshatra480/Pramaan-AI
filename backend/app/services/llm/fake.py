"""Deterministic provider for tests and offline development.

No generation (the research pipeline uses its extractive fallbacks), and
lexical hashing embeddings so retrieval behaves sensibly without a model.
Refused in production.
"""

from __future__ import annotations

import hashlib
import math
import re

from app.services.llm.base import ChatMessage, EmbeddingTask, MalformedOutput

_WORD = re.compile(r"[a-z0-9]{3,}")


class FakeProvider:
    name = "fake"
    model = "fake-hash"
    supports_generation = False

    def __init__(self, dim: int) -> None:
        self.dim = dim

    async def generate(self, messages: list[ChatMessage], *, json: bool = False, temperature: float = 0.2, max_tokens: int | None = None) -> str:
        raise MalformedOutput("fake provider does not generate text")

    async def embed(self, texts: list[str], *, task: EmbeddingTask = "document") -> list[list[float]]:
        out = []
        for t in texts:
            v = [0.0] * self.dim
            for w in _WORD.findall(t.lower()):
                h = int.from_bytes(hashlib.blake2b(w.encode(), digest_size=8).digest(), "big")
                v[h % self.dim] += 1.0 if (h >> 32) & 1 else -1.0
            n = math.sqrt(sum(x * x for x in v)) or 1.0
            out.append([x / n for x in v])
        return out

    async def preflight(self) -> None:
        return None
