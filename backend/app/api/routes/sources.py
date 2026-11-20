from __future__ import annotations

import uuid

from fastapi import APIRouter
from sqlalchemy import select

from app.api.deps import DB, VerifiedUser
from app.core.exceptions import NotFound
from app.db.models import Source
from app.schemas.research import SourceOut
from app.services.access import require_research

router = APIRouter(tags=["sources"])


@router.get("/research/{research_id}/sources/{source_id}", response_model=SourceOut)
async def get_source(research_id: uuid.UUID, source_id: uuid.UUID, user: VerifiedUser, db: DB) -> SourceOut:
    await require_research(db, research_id, user)
    source = await db.scalar(select(Source).where(Source.id == source_id, Source.research_id == research_id))
    if source is None:
        raise NotFound("Source")
    return SourceOut.model_validate(source)
