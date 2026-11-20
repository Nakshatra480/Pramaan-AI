from __future__ import annotations

from functools import lru_cache

from fastapi import APIRouter, Request, Response, status
from sqlalchemy import text
from starlette.exceptions import HTTPException

from app.core.config import get_settings
from app.core.exceptions import RateLimited
from app.core.rate_limit import SlidingWindowLimiter
from app.core.redis import ping as redis_ping
from app.db.database import get_engine

router = APIRouter(tags=["health"])


@router.get("/health", summary="Liveness")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@lru_cache
def _warmup_limiter() -> SlidingWindowLimiter:
    return SlidingWindowLimiter(30)


@router.get("/health/warmup", summary="Idle keep-warm ping for external schedulers (no side effects)")
async def warmup(request: Request) -> dict[str, str]:
    """Answers from process memory only: no database, Redis, model, graph, search or storage calls and no writes.

    An external scheduler (e.g. UptimeRobot every 10 min) may call this to reduce idle spin-downs on
    Render Free. It is an optimisation only — nothing in the application depends on it.
    """
    if not get_settings().warmup_enabled:
        raise HTTPException(status_code=404, detail="Not Found")
    client = request.client.host if request.client else "anon"
    if not await _warmup_limiter().hit(f"warmup:{client}"):
        raise RateLimited()
    return {"status": "ok"}


@router.get("/ready", summary="Readiness — checks the database and pgvector without leaking details")
async def ready(response: Response) -> dict[str, object]:
    checks: dict[str, str] = {}
    try:
        async with get_engine().connect() as conn:
            await conn.execute(text("select 1"))
            has_vector = await conn.scalar(text("select count(*) from pg_extension where extname = 'vector'"))
            checks["database"] = "ok"
            checks["pgvector"] = "ok" if has_vector else "missing"
    except Exception:
        checks["database"] = "unavailable"
    ok = all(v == "ok" for v in checks.values())
    # Redis is optional (everything falls back without it), so it is reported but never fails readiness.
    checks["redis"] = await redis_ping()
    if not ok:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return {"status": "ok" if ok else "degraded", "checks": checks}
