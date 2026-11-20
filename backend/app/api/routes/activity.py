from __future__ import annotations

from fastapi import APIRouter, Query

from app.api.deps import DB, VerifiedUser
from app.schemas.projects import ActivityOut
from app.services.projects import ProjectService

router = APIRouter(tags=["activity"])


@router.get("/activity", response_model=list[ActivityOut], summary="Activity across the user's projects (notifications)")
async def activity(user: VerifiedUser, db: DB, limit: int = Query(30, ge=1, le=100)) -> list[ActivityOut]:
    return await ProjectService(db).user_activity(user, limit)
