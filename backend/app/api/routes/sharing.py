from __future__ import annotations

from fastapi import APIRouter, Path, Request

from app.api.deps import DB
from app.core.exceptions import RateLimited
from app.core.rate_limit import get_rate_limiter
from app.schemas.research import ResearchOut
from app.services.research import ResearchService

router = APIRouter(tags=["sharing"])


@router.get("/shared/{token}", response_model=ResearchOut, summary="Public read-only report (no auth)")
async def shared(request: Request, db: DB, token: str = Path(min_length=16, max_length=64, pattern=r"^[A-Za-z0-9_\-]+$")) -> ResearchOut:
    if not await get_rate_limiter().hit(f"share:{request.client.host if request.client else 'anon'}"):
        raise RateLimited()
    return await ResearchService(db).get_shared(token)
