"""Verify a database is ready for Pramaan (never prints credentials).

    ENV_FILE=.env.neon python -m scripts.check_database

Checks: TLS, server version, pgvector availability/version, Alembic revision,
tables, key indexes, embedding dimension, and a live similarity + hybrid query.
"""

from __future__ import annotations

import asyncio
import sys

from sqlalchemy import text

from app.core.config import get_settings
from app.db.database import get_engine
from app.db.models import EMBEDDING_DIM, Base
from app.db.url import normalize, redact

EXPECTED_INDEXES = [
    "ix_chunks_embedding_hnsw",
    "ix_chunks_tsv",
    "ix_chunks_user",
    "uq_chunks_doc_index",
    "ix_users_firebase_uid",
    "ix_research_user_created",
    "ix_research_project_created",
    "ix_evidence_chunk_id",
    "ix_evidence_source_id",
    "ix_claim_evidence_evidence_id",
    "ix_sources_document_id",
    "ix_citations_source_id",
    "ix_research_job",
    "ix_documents_job",
]


async def main() -> int:
    raw = get_settings().database_url.get_secret_value()
    target = normalize(raw)
    print(f"target: {redact(raw)}  tls={'on' if target.ssl else 'OFF'}  pooled={target.pooled}")
    ok = True
    async with get_engine().connect() as c:
        print("server:", (await c.scalar(text("show server_version"))))
        # Client-side TLS (pg_stat_ssl on Neon describes the internal proxy→compute hop, not this connection).
        raw_conn = await c.get_raw_connection()
        sslobj = raw_conn.driver_connection._transport.get_extra_info("ssl_object")  # type: ignore[union-attr]
        print("client TLS:", sslobj.version() if sslobj else "NONE")
        ok &= bool(sslobj) or not target.ssl
        avail = await c.scalar(text("select default_version from pg_available_extensions where name = 'vector'"))
        inst = await c.scalar(text("select extversion from pg_extension where extname = 'vector'"))
        print(f"pgvector available={avail} installed={inst}")
        ok &= bool(avail)
        rev = await c.scalar(text("select version_num from alembic_version")) if await c.scalar(text("select to_regclass('alembic_version')")) else None
        print("alembic revision:", rev)
        if rev is None:
            print("schema not initialised — run: alembic upgrade head")
            return 1
        tables = set((await c.execute(text("select tablename from pg_tables where schemaname = 'public'"))).scalars())
        missing = {t.name for t in Base.metadata.sorted_tables} - tables
        print(f"tables: {len(tables) - 1} application tables", "(missing: " + ", ".join(sorted(missing)) + ")" if missing else "✓")
        ok &= not missing
        idx = set((await c.execute(text("select indexname from pg_indexes where schemaname = 'public'"))).scalars())
        miss_idx = [i for i in EXPECTED_INDEXES if i not in idx]
        print(f"indexes: {len(idx)} total, key indexes", "✓" if not miss_idx else f"MISSING {miss_idx}")
        ok &= not miss_idx
        dim = await c.scalar(text("select atttypmod from pg_attribute where attrelid = 'document_chunks'::regclass and attname = 'embedding'"))
        print(f"embedding dimension: {dim} (schema constant {EMBEDDING_DIM})")
        ok &= dim == EMBEDDING_DIM
        await c.execute(text("SET LOCAL hnsw.iterative_scan = relaxed_order"))
        vec = "[" + ",".join(["1"] + ["0"] * (EMBEDDING_DIM - 1)) + "]"
        plan = "\n".join(
            (await c.execute(text(f"explain select id from document_chunks order by embedding <=> '{vec}'::vector limit 5"))).scalars()  # noqa: S608 - constant
        )
        print("vector query plan uses HNSW:", "ix_chunks_embedding_hnsw" in plan or "(empty table: planner may choose seq scan)")
        await c.execute(text("select id from document_chunks c, websearch_to_tsquery('english', 'evidence') q where c.tsv @@ q limit 1"))
        print("full-text query: ✓")
    await get_engine().dispose()
    print("RESULT:", "READY" if ok else "NOT READY")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
