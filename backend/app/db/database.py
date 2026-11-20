"""Async engine + session factory. Built once per process from settings."""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from functools import lru_cache
from typing import Any

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.db.url import normalize


def engine_options(raw_url: str, *, prepared_statements: bool = True) -> tuple[str, dict[str, Any]]:
    """Normalised URL + connect args.

    Prepared-statement caching (the default) makes a repeated query one network round trip
    instead of two or three. Neon's pooled endpoint (PgBouncer ≥ 1.21, transaction mode) supports
    protocol-level prepared statements; statement names are made unique so they can never collide
    across pooled server connections. Set DB_PREPARED_STATEMENTS=false for a pooler without support.
    """
    target = normalize(raw_url)
    connect_args: dict[str, Any] = {}
    if not prepared_statements:
        connect_args.update(statement_cache_size=0, prepared_statement_cache_size=0)
    if target.pooled:
        connect_args["prepared_statement_name_func"] = lambda: f"__pramaan_{uuid.uuid4().hex}__"
    return target.url, connect_args


@lru_cache
def get_engine() -> AsyncEngine:
    s = get_settings()
    url, connect_args = engine_options(s.database_url.get_secret_value(), prepared_statements=s.db_prepared_statements)
    return create_async_engine(
        url,
        pool_size=s.db_pool_size,
        max_overflow=s.db_pool_size,
        pool_pre_ping=True,
        pool_recycle=s.db_pool_recycle_s,
        connect_args=connect_args,
    )


@lru_cache
def get_sessionmaker() -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(get_engine(), expire_on_commit=False)


async def get_db() -> AsyncIterator[AsyncSession]:
    """Request-scoped session. Commits on success, rolls back on error."""
    async with get_sessionmaker()() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
