import asyncio

from alembic import context
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import get_settings
from app.db.database import engine_options
from app.db.models import Base

target_metadata = Base.metadata


def _migration_url() -> str:
    """Prefer the direct (non-pooled) endpoint for DDL; never print it."""
    s = get_settings()
    return s.migrations_database_url.get_secret_value() or s.database_url.get_secret_value()


def run_migrations_offline() -> None:
    url, _ = engine_options(_migration_url(), prepared_statements=False)
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def _run(connection) -> None:  # type: ignore[no-untyped-def]
    context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    url, connect_args = engine_options(_migration_url(), prepared_statements=False)  # DDL: no statement cache
    engine = create_async_engine(url, connect_args=connect_args)
    async with engine.connect() as conn:
        await conn.run_sync(_run)
    await engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
