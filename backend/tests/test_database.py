"""Database layer: URL normalisation, production guards, and the Alembic chain on a fresh database."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import asyncpg
import pytest

from app.db.database import engine_options
from app.db.models import EMBEDDING_DIM, Base
from app.db.url import normalize, redact

NEON = "postgresql://app_user:s3cret@ep-cool-name-123456-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"


def test_neon_url_is_normalised_for_asyncpg() -> None:
    t = normalize(NEON)
    assert t.url.startswith("postgresql+asyncpg://") and "ssl=require" in t.url
    assert "sslmode" not in t.url and "channel_binding" not in t.url
    assert t.ssl and t.pooled and t.host.endswith("neon.tech")
    assert not normalize(NEON.replace("-pooler", "")).pooled
    assert redact(NEON) == "ep-cool-name-123456-pooler.eu-central-1.aws.neon.tech/neondb"  # no credentials


def test_pooled_endpoint_caches_prepared_statements_with_unique_names() -> None:
    _, args = engine_options(NEON)
    assert "statement_cache_size" not in args and "prepared_statement_cache_size" not in args  # driver defaults: cached
    assert args["prepared_statement_name_func"]() != args["prepared_statement_name_func"]()  # never collide in the pooler


def test_prepared_statements_can_be_disabled() -> None:
    _, args = engine_options(NEON, prepared_statements=False)
    assert args["statement_cache_size"] == 0 and args["prepared_statement_cache_size"] == 0
    _, direct = engine_options(NEON.replace("-pooler", ""))
    assert "prepared_statement_name_func" not in direct


def test_non_postgres_url_rejected() -> None:
    with pytest.raises(ValueError):
        normalize("mysql://u:p@db/x")


@pytest.mark.parametrize(
    ("url", "msg"),
    [
        ("postgresql+asyncpg://u:p@localhost:5432/db?ssl=require", "local database"),
        ("postgresql://u:p@127.0.0.1/db?sslmode=require", "local database"),
        ("postgresql://u:p@ep-x.neon.tech/db", "TLS"),
        ("postgresql://u:p@ep-x.neon.tech/db?sslmode=disable", "TLS"),
    ],
)
def test_production_refuses_local_or_plaintext_database(url: str, msg: str, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.config import get_settings

    for k, v in {"ENVIRONMENT": "production", "FIREBASE_PROJECT_ID": "pramaan-ai-prod", "DATABASE_URL": url}.items():
        monkeypatch.setenv(k, v)
    get_settings.cache_clear()
    try:
        with pytest.raises(RuntimeError, match=msg):
            get_settings()
    finally:
        get_settings.cache_clear()


def test_production_accepts_neon(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.config import get_settings

    env = {
        "ENVIRONMENT": "production",
        "FIREBASE_PROJECT_ID": "pramaan-ai-prod",
        "DATABASE_URL": NEON,
        "STORAGE_BACKEND": "s3",
        "S3_ENDPOINT": "https://abcdefghijklmnop.supabase.co/storage/v1/s3",
        "S3_BUCKET": "pramaan-docs",
        "S3_ACCESS_KEY_ID": "test-key-id",
        "S3_SECRET_ACCESS_KEY": "test-secret",
        "LLM_PROVIDER": "groq",
        "MODEL_PROVIDER": "groq",
        "GROQ_API_KEY": "gsk_test",
        "EMBEDDING_PROVIDER": "openrouter",
        "OPENROUTER_API_KEY": "sk-or-test",
    }
    for k, v in env.items():
        monkeypatch.setenv(k, v)
    get_settings.cache_clear()
    try:
        assert get_settings().is_production
    finally:
        get_settings.cache_clear()


# ------------------------------------------------------------------ migrations

ROOT = Path(__file__).resolve().parents[1]
ADMIN_DSN = os.environ["DATABASE_URL"].replace("postgresql+asyncpg://", "postgresql://").rsplit("/", 1)[0] + "/postgres"
MIG_DB = "pramaan_migration_test"


def alembic(*args: str) -> None:
    env = {**os.environ, "DATABASE_URL": ADMIN_DSN.rsplit("/", 1)[0].replace("postgresql://", "postgresql+asyncpg://") + f"/{MIG_DB}"}
    subprocess.run([sys.executable, "-m", "alembic", *args], cwd=ROOT, env=env, check=True, capture_output=True)


async def test_alembic_chain_builds_the_full_schema_on_a_fresh_database() -> None:
    admin = await asyncpg.connect(ADMIN_DSN)
    await admin.execute(f'DROP DATABASE IF EXISTS "{MIG_DB}"')
    await admin.execute(f'CREATE DATABASE "{MIG_DB}"')
    try:
        alembic("upgrade", "head")
        alembic("downgrade", "base")  # reversible
        alembic("upgrade", "head")
        conn = await asyncpg.connect(ADMIN_DSN.rsplit("/", 1)[0] + f"/{MIG_DB}")
        try:
            assert await conn.fetchval("select count(*) from pg_extension where extname = 'vector'") == 1
            tables = {r["tablename"] for r in await conn.fetch("select tablename from pg_tables where schemaname = 'public'")}
            assert {t.name for t in Base.metadata.sorted_tables} | {"alembic_version"} == tables
            idx = {r["indexname"]: r["indexdef"] for r in await conn.fetch("select indexname, indexdef from pg_indexes where schemaname = 'public'")}
            assert "USING hnsw (embedding vector_cosine_ops)" in idx["ix_chunks_embedding_hnsw"]
            assert "USING gin (tsv)" in idx["ix_chunks_tsv"]
            for name in (
                "ix_evidence_chunk_id",
                "ix_evidence_source_id",
                "ix_claim_evidence_evidence_id",
                "ix_sources_document_id",
                "uq_users_firebase_uid_or_ix",
            ):
                if name != "uq_users_firebase_uid_or_ix":
                    assert name in idx, name
            assert any("firebase_uid" in d and "UNIQUE" in d for d in idx.values())
            dim = await conn.fetchval("select atttypmod from pg_attribute where attrelid = 'document_chunks'::regclass and attname = 'embedding'")
            assert dim == EMBEDDING_DIM
            fks = await conn.fetchval("select count(*) from information_schema.table_constraints where constraint_type = 'FOREIGN KEY'")
            assert fks >= 25
            assert await conn.fetchval("select '[1,0,0]'::vector <=> '[1,0,0]'::vector") == 0
        finally:
            await conn.close()
    finally:
        await admin.execute(f'DROP DATABASE IF EXISTS "{MIG_DB}"')
        await admin.close()
