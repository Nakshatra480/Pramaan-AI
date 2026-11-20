"""Startup configuration guards for the Groq + OpenRouter + S3 (Supabase) + Redis stack. No database needed."""

from __future__ import annotations

from collections.abc import Iterator

import pytest

from app.core.config import get_settings

PROD = {"ENVIRONMENT": "production", "FIREBASE_PROJECT_ID": "pramaan-ai-prod", "DATABASE_URL": "postgresql://u:p@ep-x.neon.tech/db?sslmode=require"}
S3 = {
    "STORAGE_BACKEND": "s3",
    "S3_ENDPOINT": "https://abcdefghijklmnop.supabase.co/storage/v1/s3",
    "S3_BUCKET": "documents",
    "S3_ACCESS_KEY_ID": "k",
    "S3_SECRET_ACCESS_KEY": "s",
}
MODELS = {"LLM_PROVIDER": "groq", "MODEL_PROVIDER": "groq", "GROQ_API_KEY": "gsk_x", "EMBEDDING_PROVIDER": "openrouter", "OPENROUTER_API_KEY": "sk-or-x"}


@pytest.fixture
def env(monkeypatch: pytest.MonkeyPatch) -> Iterator[pytest.MonkeyPatch]:
    for k in ("ENVIRONMENT", "LLM_PROVIDER", "MODEL_PROVIDER", "EMBEDDING_PROVIDER", "STORAGE_BACKEND", "REDIS_URL", "GROQ_API_KEY", "OPENROUTER_API_KEY"):
        monkeypatch.delenv(k, raising=False)
    get_settings.cache_clear()
    yield monkeypatch
    get_settings.cache_clear()


def apply(mp: pytest.MonkeyPatch, values: dict[str, str]) -> None:
    for k, v in values.items():
        mp.setenv(k, v)
    get_settings.cache_clear()


@pytest.mark.parametrize(
    ("values", "msg"),
    [
        ({**PROD, **MODELS, "STORAGE_BACKEND": "local"}, "durable object storage"),
        ({**PROD, **S3, **MODELS, "LLM_PROVIDER": "fake", "MODEL_PROVIDER": "fake"}, "LLM_PROVIDER=groq"),
        ({**PROD, **S3, **MODELS, "EMBEDDING_PROVIDER": "fake"}, "EMBEDDING_PROVIDER=openrouter"),
        ({**PROD, **S3, **MODELS, "GROQ_API_KEY": ""}, "GROQ_API_KEY"),
        ({**PROD, **S3, **MODELS, "OPENROUTER_API_KEY": ""}, "OPENROUTER_API_KEY"),
        ({**PROD, **S3, **MODELS, "S3_ENDPOINT": "http://abcdefghijklmnop.supabase.co/storage/v1/s3"}, "https"),
        ({**PROD, **S3, **MODELS, "REDIS_URL": "redis://default:pw@eu1-x.upstash.io:6379"}, "rediss://"),
    ],
)
def test_production_guards(values: dict[str, str], msg: str, env: pytest.MonkeyPatch) -> None:
    apply(env, values)
    with pytest.raises(RuntimeError, match=msg):
        get_settings()


def test_s3_requires_all_settings(env: pytest.MonkeyPatch) -> None:
    apply(env, {"STORAGE_BACKEND": "s3"})
    with pytest.raises(RuntimeError, match="S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY"):
        get_settings()


def test_production_accepts_the_target_stack(env: pytest.MonkeyPatch) -> None:
    apply(env, {**PROD, **S3, **MODELS, "REDIS_URL": "rediss://default:pw@eu1-x.upstash.io:6379"})
    s = get_settings()
    assert s.is_production and s.storage_backend == "s3" and s.llm_provider == "groq" and s.embedding_provider == "openrouter"
    assert s.groq_model == "openai/gpt-oss-120b" and s.embedding_model == "nvidia/nemotron-3.5-embed-8b:free" and s.embedding_dim == 768


def test_redis_is_optional_in_production(env: pytest.MonkeyPatch) -> None:
    apply(env, {**PROD, **S3, **MODELS})
    assert get_settings().redis_url.get_secret_value() == ""


def test_factories_pick_groq_and_openrouter(env: pytest.MonkeyPatch) -> None:
    from app.services.llm import factory
    from app.services.llm.groq import GroqProvider
    from app.services.llm.openrouter import OpenRouterEmbedder

    apply(env, MODELS)
    factory.get_llm.cache_clear()
    factory.get_embedder.cache_clear()
    try:
        assert isinstance(factory.get_llm(), GroqProvider)
        assert isinstance(factory.get_embedder(), OpenRouterEmbedder)
    finally:
        factory.get_llm.cache_clear()
        factory.get_embedder.cache_clear()
