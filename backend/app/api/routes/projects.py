from __future__ import annotations

import uuid
from typing import Literal

from fastapi import APIRouter, Query, status

from app.api.deps import DB, VerifiedUser
from app.schemas.projects import ActivityOut, InstructionOut, InstructionUpdate, MemberAdd, MemberUpdate, ProjectCreate, ProjectOut, ProjectUpdate
from app.services.projects import ProjectService

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=list[ProjectOut])
async def list_projects(user: VerifiedUser, db: DB, scope: Literal["all", "mine", "shared"] = "all") -> list[ProjectOut]:
    return await ProjectService(db).list_projects(user, scope)


@router.post("", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
async def create_project(data: ProjectCreate, user: VerifiedUser, db: DB) -> ProjectOut:
    return await ProjectService(db).create(user, data)


@router.get("/{project_id}", response_model=ProjectOut)
async def get_project(project_id: uuid.UUID, user: VerifiedUser, db: DB) -> ProjectOut:
    return await ProjectService(db).get(user, project_id)


@router.patch("/{project_id}", response_model=ProjectOut)
async def update_project(project_id: uuid.UUID, data: ProjectUpdate, user: VerifiedUser, db: DB) -> ProjectOut:
    return await ProjectService(db).update(user, project_id, data)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(project_id: uuid.UUID, user: VerifiedUser, db: DB) -> None:
    await ProjectService(db).delete(user, project_id)


@router.get("/{project_id}/instructions", response_model=InstructionOut)
async def get_instructions(project_id: uuid.UUID, user: VerifiedUser, db: DB) -> InstructionOut:
    return await ProjectService(db).get_instructions(user, project_id)


@router.put("/{project_id}/instructions", response_model=InstructionOut)
async def put_instructions(project_id: uuid.UUID, data: InstructionUpdate, user: VerifiedUser, db: DB) -> InstructionOut:
    return await ProjectService(db).put_instructions(user, project_id, data.content)


@router.get("/{project_id}/activity", response_model=list[ActivityOut])
async def project_activity(project_id: uuid.UUID, user: VerifiedUser, db: DB, limit: int = Query(50, ge=1, le=200)) -> list[ActivityOut]:
    return await ProjectService(db).project_activity(user, project_id, limit)


@router.post("/{project_id}/members", response_model=ProjectOut, status_code=status.HTTP_201_CREATED, summary="Add a member by email (owner only)")
async def add_member(project_id: uuid.UUID, data: MemberAdd, user: VerifiedUser, db: DB) -> ProjectOut:
    return await ProjectService(db).add_member(user, project_id, data)


@router.patch("/{project_id}/members/{member_id}", response_model=ProjectOut, summary="Change a member's role (owner only)")
async def update_member(project_id: uuid.UUID, member_id: uuid.UUID, data: MemberUpdate, user: VerifiedUser, db: DB) -> ProjectOut:
    return await ProjectService(db).update_member(user, project_id, member_id, data.role)


@router.delete("/{project_id}/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Remove a member, or leave the project")
async def remove_member(project_id: uuid.UUID, member_id: uuid.UUID, user: VerifiedUser, db: DB) -> None:
    await ProjectService(db).remove_member(user, project_id, member_id)
