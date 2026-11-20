"""Groq — the production text-generation provider (OpenAI-compatible chat completions)."""

from __future__ import annotations

import time
from typing import Any

import httpx

from app.services.llm.base import ChatMessage, MalformedOutput, ModelNotInstalled
from app.services.llm.hosted import HostedProvider

DEFAULT_BASE_URL = "https://api.groq.com/openai/v1"


class GroqProvider(HostedProvider):
    name = "groq"
    supports_generation = True

    def __init__(
        self,
        api_key: str,
        model: str,
        *,
        base_url: str = DEFAULT_BASE_URL,
        timeout_s: float = 60.0,
        connect_timeout_s: float = 10.0,
        retries: int = 2,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        super().__init__(base_url, api_key, timeout_s=timeout_s, connect_timeout_s=connect_timeout_s, retries=retries, transport=transport)
        self.model = model
        self._preflight_ok_until = 0.0

    async def generate(self, messages: list[ChatMessage], *, json: bool = False, temperature: float = 0.2, max_tokens: int | None = None) -> str:
        self._require_key("generate", "GROQ_API_KEY")
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "temperature": temperature,
            "stream": False,
        }
        if max_tokens:
            payload["max_completion_tokens"] = max_tokens
        if json:
            payload["response_format"] = {"type": "json_object"}
        data = await self._request("POST", "/chat/completions", json=payload, what="generate")
        try:
            content = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as e:
            raise MalformedOutput("groq generate: response missing message content") from e
        if not isinstance(content, str):
            raise MalformedOutput("groq generate: response missing message content")
        return content

    async def preflight(self) -> None:
        """Cached (5 min) check that the key works and the configured model exists."""
        if time.monotonic() < self._preflight_ok_until:
            return
        self._require_key("preflight", "GROQ_API_KEY")
        data = await self._request("GET", "/models", what="preflight")
        models = data.get("data")
        ids = {m.get("id") for m in models if isinstance(m, dict)} if isinstance(models, list) else set()
        if self.model not in ids:
            raise ModelNotInstalled(f"groq preflight: model '{self.model}' is not available for this API key")
        self._preflight_ok_until = time.monotonic() + 300
