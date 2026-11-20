"""OpenRouter — the production embedding provider (OpenAI-compatible /embeddings).

Default model: `nvidia/nemotron-3.5-embed-8b:free`, truncated to 768 dimensions (`dimensions`)
to match the schema. Asymmetric retrieval uses `input_type`: documents are embedded as
`passage`, questions as `query`. Only models that accept `dimensions=768` fit the schema.
"""

from __future__ import annotations

import time
from typing import Any

import httpx

from app.services.llm.base import EmbeddingTask, MalformedOutput, ModelUnavailable
from app.services.llm.hosted import HostedProvider

DEFAULT_BASE_URL = "https://openrouter.ai/api/v1"
INPUT_TYPE: dict[EmbeddingTask, str] = {"document": "passage", "query": "query"}
# OpenRouter sometimes reports upstream failures inside a 200 body; these codes mean "try again later".
_UNAVAILABLE_CODES = {402, 408, 429, 500, 502, 503, 504}


class OpenRouterEmbedder(HostedProvider):
    name = "openrouter"

    def __init__(
        self,
        api_key: str,
        model: str = "nvidia/nemotron-3.5-embed-8b:free",
        *,
        dim: int = 768,
        base_url: str = DEFAULT_BASE_URL,
        timeout_s: float = 60.0,
        connect_timeout_s: float = 10.0,
        retries: int = 2,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        super().__init__(base_url, api_key, timeout_s=timeout_s, connect_timeout_s=connect_timeout_s, retries=retries, transport=transport)
        self._client.headers["X-Title"] = "Pramaan AI"  # OpenRouter app attribution (optional, non-secret)
        self.model = model
        self.dim = dim
        self._preflight_ok_until = 0.0

    async def embed(self, texts: list[str], *, task: EmbeddingTask = "document") -> list[list[float]]:
        self._require_key("embed", "OPENROUTER_API_KEY")
        if not texts:
            return []
        payload = {"model": self.model, "input": texts, "dimensions": self.dim, "input_type": INPUT_TYPE[task]}
        data = await self._request("POST", "/embeddings", json=payload, what="embed")
        if data.get("error") and not data.get("data"):
            raise self._body_error(data["error"])
        items: Any = data.get("data")
        if not isinstance(items, list) or len(items) != len(texts):
            raise MalformedOutput("openrouter embed: unexpected response shape")
        ordered = sorted(items, key=lambda x: x.get("index", 0) if isinstance(x, dict) else 0)
        vectors: list[list[float]] = []
        for x in ordered:
            v = x.get("embedding") if isinstance(x, dict) else None
            if not isinstance(v, list):
                raise MalformedOutput("openrouter embed: unexpected response shape")
            vectors.append([float(n) for n in v])
        return vectors

    @staticmethod
    def _body_error(err: Any) -> Exception:
        code = err.get("code") if isinstance(err, dict) else None
        try:
            status = int(code) if code is not None else 0
        except (TypeError, ValueError):
            status = 0
        if status in _UNAVAILABLE_CODES:
            return ModelUnavailable(f"openrouter embed: provider error {status}")
        return MalformedOutput(f"openrouter embed: provider error {status or 'unknown'}")

    async def preflight(self) -> None:
        """Cached (10 min) end-to-end check: key, model and dimension, with a one-word embedding."""
        if time.monotonic() < self._preflight_ok_until:
            return
        await self.embed(["ping"], task="query")
        self._preflight_ok_until = time.monotonic() + 600
