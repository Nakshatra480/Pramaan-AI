from __future__ import annotations

from functools import lru_cache

from app.core.config import get_settings
from app.services.llm.base import EmbeddingProvider, LLMProvider


@lru_cache
def get_llm() -> LLMProvider:
    """Text generation provider (LLM_PROVIDER): Groq, or the fake provider for tests/offline work."""
    s = get_settings()
    if s.llm_provider == "groq":
        from app.services.llm.groq import GroqProvider

        return GroqProvider(
            s.groq_api_key.get_secret_value(),
            s.groq_model,
            base_url=s.groq_base_url,
            timeout_s=s.groq_timeout_s,
            connect_timeout_s=s.groq_connect_timeout_s,
        )
    from app.services.llm.fake import FakeProvider

    return FakeProvider(s.embedding_dim)


@lru_cache
def get_embedder() -> EmbeddingProvider:
    """Embedding provider (EMBEDDING_PROVIDER): OpenRouter, or the fake provider for tests/offline work."""
    s = get_settings()
    if s.embedding_provider == "openrouter":
        from app.services.llm.openrouter import OpenRouterEmbedder

        return OpenRouterEmbedder(
            s.openrouter_api_key.get_secret_value(),
            s.embedding_model,
            dim=s.embedding_dim,
            base_url=s.openrouter_base_url,
            timeout_s=s.openrouter_timeout_s,
            retries=s.openrouter_retries,
        )
    from app.services.llm.fake import FakeProvider

    return FakeProvider(s.embedding_dim)
