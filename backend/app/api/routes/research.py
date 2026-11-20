from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Query, Request, status
from fastapi.responses import StreamingResponse

from app.api.deps import DB, VerifiedUser
from app.schemas.research import (
    FollowUpCreate,
    FollowUpOut,
    ResearchCreate,
    ResearchCreated,
    ResearchOut,
    ResearchSummaryOut,
    ResearchUpdate,
    ShareOut,
    ShareUpdate,
)
from app.services.access import require_research
from app.services.research import ResearchService
from app.services.research_stream import stream_events

router = APIRouter(prefix="/research", tags=["research"])


@router.post("", response_model=ResearchCreated, status_code=status.HTTP_202_ACCEPTED, summary="Start research (runs asynchronously)")
async def create_research(data: ResearchCreate, user: VerifiedUser, db: DB) -> ResearchCreated:
    return await ResearchService(db).create(user, data)


@router.get("", response_model=list[ResearchSummaryOut], summary="Research history")
async def list_research(
    user: VerifiedUser, db: DB, project_id: Annotated[uuid.UUID | None, Query(alias="projectId")] = None, limit: int = Query(100, ge=1, le=500)
) -> list[ResearchSummaryOut]:
    return await ResearchService(db).list_research(user, project_id, limit)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT, summary="Delete all of your research (Settings → Privacy)")
async def delete_all_research(user: VerifiedUser, db: DB, confirm: Annotated[str, Query(pattern="^delete-all$")]) -> None:
    await ResearchService(db).delete_all(user)


@router.get("/{research_id}", response_model=ResearchOut)
async def get_research(research_id: uuid.UUID, user: VerifiedUser, db: DB) -> ResearchOut:
    return await ResearchService(db).get(user, research_id)


@router.get(
    "/{research_id}/stream",
    summary="Progress stream (Server-Sent Events)",
    response_class=StreamingResponse,
    responses={200: {"content": {"text/event-stream": {}}}},
)
async def stream(research_id: uuid.UUID, request: Request, user: VerifiedUser, db: DB) -> StreamingResponse:
    await require_research(db, research_id, user)  # authorise before streaming
    await db.close()  # don't hold a pooled connection for the life of the stream
    return StreamingResponse(
        stream_events(research_id, request.is_disconnected),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )


@router.patch("/{research_id}", response_model=ResearchOut)
async def update_research(research_id: uuid.UUID, data: ResearchUpdate, user: VerifiedUser, db: DB) -> ResearchOut:
    return await ResearchService(db).update(user, research_id, data)


@router.delete("/{research_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_research(research_id: uuid.UUID, user: VerifiedUser, db: DB) -> None:
    await ResearchService(db).delete(user, research_id)


@router.post("/{research_id}/retry", response_model=ResearchCreated, status_code=status.HTTP_202_ACCEPTED)
async def retry(research_id: uuid.UUID, user: VerifiedUser, db: DB) -> ResearchCreated:
    return await ResearchService(db).retry(user, research_id)


@router.post("/{research_id}/cancel", status_code=status.HTTP_204_NO_CONTENT)
async def cancel(research_id: uuid.UUID, user: VerifiedUser, db: DB) -> None:
    await ResearchService(db).cancel(user, research_id)


@router.put("/{research_id}/share", response_model=ShareOut)
async def share(research_id: uuid.UUID, data: ShareUpdate, user: VerifiedUser, db: DB) -> ShareOut:
    return await ResearchService(db).set_visibility(user, research_id, data.visibility)


@router.post("/{research_id}/follow-ups", response_model=FollowUpOut, status_code=status.HTTP_202_ACCEPTED)
async def follow_up(research_id: uuid.UUID, data: FollowUpCreate, user: VerifiedUser, db: DB) -> FollowUpOut:
    return await ResearchService(db).follow_up(user, research_id, data.question)
