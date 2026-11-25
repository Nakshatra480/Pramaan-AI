"""Pramaan AI API — FastAPI application factory."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import activity, health, library, projects, research, search, sharing, sources, speech, users
from app.core.config import get_settings
from app.core.exceptions import install_exception_handlers
from app.core.logging import configure_logging
from app.core.middleware import CatchAllMiddleware, RequestContextMiddleware
from app.core.redis import close_redis
from app.db.database import get_engine
from app.db.models import EMBEDDING_DIM


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    worker = None
    if get_settings().run_job_worker:
        from app.services.jobs import get_job_runner

        worker = get_job_runner()
        await worker.start()  # startup recovery sweep + claim loop (state lives in Neon)
    yield
    if worker is not None:
        await worker.stop()  # finish or hand back in-flight jobs; unfinished leases expire immediately
    await close_redis()
    await get_engine().dispose()


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level)
    if settings.embedding_dim != EMBEDDING_DIM:
        raise RuntimeError(f"EMBEDDING_DIM={settings.embedding_dim} does not match the schema ({EMBEDDING_DIM}). Add a migration first.")

    app = FastAPI(
        title="Pramaan AI API",
        version="1.0.0",
        summary="Research, with evidence.",
        lifespan=lifespan,
        # Interactive docs and the schema are for development only (audit M-12).
        docs_url=None if settings.is_production else "/docs",
        redoc_url=None if settings.is_production else "/redoc",
        openapi_url=None if settings.is_production else "/openapi.json",
    )
    install_exception_handlers(app)
    # Order (outer → inner): RequestContext → CORS → CatchAll → routes. Every response, including 500s, gets CORS headers.
    app.add_middleware(CatchAllMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,  # bearer tokens, not cookies
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID", "X-Firebase-AppCheck"],
        expose_headers=["X-Request-ID", "Content-Disposition"],  # filename for original-file downloads
        max_age=600,
    )
    app.add_middleware(RequestContextMiddleware, max_body_bytes=settings.max_request_bytes, hsts=settings.is_production)

    app.include_router(health.router)
    api = settings.api_prefix
    for r in (users.router, projects.router, activity.router, library.router, research.router, sources.router, sharing.router, search.router, speech.router):
        app.include_router(r, prefix=api)
    return app


app = create_app()
