"""Environment-driven configuration. No secrets have defaults."""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Annotated, Literal

from pydantic import AliasChoices, Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    # ENV_FILE selects the env file explicitly: backend/.env (local stack) or backend/.env.neon (Neon).
    # In production (Render) configuration comes from real environment variables / secrets.
    model_config = SettingsConfigDict(env_file=os.environ.get("ENV_FILE", ".env"), env_file_encoding="utf-8", extra="ignore", populate_by_name=True)

    environment: Literal["development", "test", "production"] = "development"
    log_level: str = "INFO"
    api_prefix: str = "/api/v1"

    # Database. Local: Docker Postgres + pgvector. Production: Neon (pooled endpoint).
    # Neon's libpq URL is accepted as-is and normalised for asyncpg (app/db/url.py).
    database_url: SecretStr = SecretStr("postgresql+asyncpg://localhost:5432/pramaan")
    # Optional direct (non-pooled) URL for Alembic DDL; falls back to DATABASE_URL.
    migrations_database_url: SecretStr = SecretStr("")
    db_pool_size: int = 5
    db_pool_recycle_s: int = 300  # Neon closes idle connections when it scales to zero
    db_prepared_statements: bool = True  # one round trip per repeated query; false for poolers without support

    # CORS — explicit list; never "*" for authenticated APIs.
    cors_origins: Annotated[list[str], NoDecode] = Field(default_factory=lambda: ["http://localhost:3000"])

    # Firebase Admin. Either a service account via env vars, or Application
    # Default Credentials (Cloud Run) when client_email/private_key are empty.
    firebase_project_id: str = ""
    firebase_client_email: str = ""
    firebase_private_key: SecretStr = SecretStr("")
    firebase_app_check_required: bool = False
    # Revocation checks call the Admin API and need credentials (ADC / service account).
    firebase_check_revoked: bool = False
    # Local Auth Emulator (development only). The Admin SDK reads this env var directly;
    # it is declared here so production startup can refuse it.
    firebase_auth_emulator_host: str = ""

    # Research providers
    tavily_api_key: SecretStr = SecretStr("")
    openalex_mailto: str = ""
    # Wikipedia (MediaWiki API). Works anonymously; an API key (a Wikimedia personal API token / OAuth 2 access token)
    # is sent as a bearer token for higher rate limits. The User-Agent identifies Pramaan, per Wikimedia's API policy.
    wikipedia_api_key: SecretStr = SecretStr("")
    wikipedia_language: str = "en"
    wikipedia_user_agent: str = "PramaanAI/1.0 (https://pramaan-ai-seven.vercel.app; research assistant)"
    # Search results whose pages are opened and parsed (BeautifulSoup) during research.
    page_reading_enabled: bool = True
    page_fetch_timeout_s: float = 8.0
    research_timeout_s: int = 600

    # Text generation — Groq in production; "fake" is for tests/offline demos (extractive reports).
    llm_provider: Literal["groq", "fake"] = Field(default="groq", validation_alias=AliasChoices("LLM_PROVIDER", "MODEL_PROVIDER"))
    groq_api_key: SecretStr = SecretStr("")
    groq_model: str = "openai/gpt-oss-120b"
    groq_base_url: str = "https://api.groq.com/openai/v1"
    groq_connect_timeout_s: float = 10.0
    groq_timeout_s: float = 60.0
    # Voice input fallback (browsers without built-in speech recognition): Groq Whisper.
    groq_stt_model: str = "whisper-large-v3-turbo"
    # Cleans up dictated questions (fillers, misheard words, spelling). A small, fast model with its own rate limit.
    groq_refine_model: str = "openai/gpt-oss-20b"
    max_audio_bytes: int = 10 * 1024 * 1024  # ~10 min of Opus; the composer stops recording after 2 min
    speech_per_minute: int = 12

    # Embeddings — OpenRouter in production. The dimension is fixed by the schema (vector(768)):
    # the model must accept `dimensions=768`. Changing the model requires re-indexing every document.
    embedding_provider: Literal["openrouter", "fake"] = "openrouter"
    openrouter_api_key: SecretStr = SecretStr("")
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    # Bounded so an outage degrades research to keyword ranking within ~1 min instead of minutes (audit C-02).
    openrouter_timeout_s: float = 25.0
    openrouter_retries: int = 1
    embedding_model: str = "nvidia/nemotron-3.5-embed-8b:free"
    embedding_dim: int = 768
    embedding_batch_size: int = 128  # texts per request — fewer requests against free-tier limits

    # Redis (optional). Empty = disabled; every Redis feature then falls back to its in-process behaviour.
    # Used for: shared rate limiting, Tavily/OpenAlex result cache, query-embedding cache, research progress pub/sub.
    redis_url: SecretStr = SecretStr("")
    cache_ttl_search_s: int = 86_400
    cache_ttl_embed_s: int = 604_800

    # Jobs (Neon-backed queue; see app/services/jobs.py)
    research_concurrency: int = 1
    indexing_concurrency: int = 1
    job_lease_s: int = 90
    job_max_attempts: int = 2
    job_poll_interval_s: float = 5.0
    job_sweep_interval_s: float = 60.0
    run_job_worker: bool = True  # start the worker loop with the app
    retention_interval_s: float = 3600.0  # how often Settings → Privacy → Data retention is enforced

    # Render/idle wake-ups: GET /health/warmup (never required for correctness)
    warmup_enabled: bool = True

    # Storage
    # local = filesystem (development only; refused in production); s3 = any S3-compatible service —
    # Supabase Storage in production (endpoint https://<project-ref>.supabase.co/storage/v1/s3).
    storage_backend: Literal["local", "s3"] = "local"
    local_storage_dir: str = "./.storage"
    s3_endpoint: str = ""
    s3_region: str = "us-east-1"  # Supabase: the project's region, shown next to the S3 endpoint
    s3_bucket: str = ""
    s3_access_key_id: SecretStr = SecretStr("")
    s3_secret_access_key: SecretStr = SecretStr("")
    max_upload_bytes: int = 20 * 1024 * 1024  # bytes are held in memory during validation/extraction
    max_request_bytes: int = 25 * 1024 * 1024

    # Observability
    langsmith_api_key: SecretStr = SecretStr("")

    # Rate limiting (requests per minute per user; 0 disables)
    # Per user per instance. An active session (SSE, indexing polls, list refreshes) makes bursts of requests.
    rate_limit_per_minute: int = 600

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, v: object) -> object:
        if isinstance(v, str) and not v.startswith("["):
            return [o.strip() for o in v.split(",") if o.strip()]
        return v

    @field_validator("cors_origins")
    @classmethod
    def _no_wildcard(cls, v: list[str]) -> list[str]:
        if "*" in v:
            raise ValueError("Wildcard CORS origins are not allowed for authenticated APIs.")
        return v

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    if s.is_production and s.firebase_auth_emulator_host:
        raise RuntimeError("FIREBASE_AUTH_EMULATOR_HOST must never be set in production (it disables token signature checks).")
    if s.is_production and not s.firebase_project_id:
        raise RuntimeError("FIREBASE_PROJECT_ID is required in production.")
    if s.is_production:
        from app.db.url import LOCAL_HOSTS, normalize

        target = normalize(s.database_url.get_secret_value())
        if target.host in LOCAL_HOSTS or not target.host:
            raise RuntimeError("Production DATABASE_URL points at a local database. Use the Neon connection string.")
        if not target.ssl:
            raise RuntimeError("Production DATABASE_URL must require TLS (sslmode=require).")
        if s.storage_backend == "local":
            raise RuntimeError("Production requires durable object storage (STORAGE_BACKEND=s3); server-local files are not durable.")
        if s.llm_provider != "groq" or s.embedding_provider != "openrouter":
            raise RuntimeError("Production requires LLM_PROVIDER=groq and EMBEDDING_PROVIDER=openrouter (the fake provider is for tests only).")
        if not s.groq_api_key.get_secret_value():
            raise RuntimeError("Production requires GROQ_API_KEY.")
        if not s.openrouter_api_key.get_secret_value():
            raise RuntimeError("Production requires OPENROUTER_API_KEY.")
        redis = s.redis_url.get_secret_value()
        if redis and not redis.startswith("rediss://"):
            raise RuntimeError("REDIS_URL must use TLS (rediss://) in production.")
    if s.storage_backend == "s3":
        missing = [
            name
            for name, value in (
                ("S3_ENDPOINT", s.s3_endpoint),
                ("S3_BUCKET", s.s3_bucket),
                ("S3_ACCESS_KEY_ID", s.s3_access_key_id.get_secret_value()),
                ("S3_SECRET_ACCESS_KEY", s.s3_secret_access_key.get_secret_value()),
            )
            if not value
        ]
        if missing:
            raise RuntimeError(f"STORAGE_BACKEND=s3 requires {', '.join(missing)}.")
        if s.is_production and not s.s3_endpoint.startswith("https://"):
            raise RuntimeError("S3_ENDPOINT must be an https:// URL in production.")
    return s
