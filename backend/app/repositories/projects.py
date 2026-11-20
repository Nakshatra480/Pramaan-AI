from __future__ import annotations

import uuid
from collections.abc import Sequence

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    ActivityEvent,
    ActivityKind,
    Project,
    ProjectDocument,
    ProjectInstruction,
    ProjectMember,
    ProjectRole,
    ResearchSession,
    User,
)


class ProjectRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def list_for_member(self, user_id: uuid.UUID, scope: str = "all") -> Sequence[tuple[Project, ProjectRole]]:
        stmt = (
            select(Project, ProjectMember.role)
            .join(ProjectMember, ProjectMember.project_id == Project.id)
            .where(ProjectMember.user_id == user_id)
            .order_by(Project.updated_at.desc())
        )
        if scope == "mine":
            stmt = stmt.where(Project.owner_id == user_id)
        elif scope == "shared":
            stmt = stmt.where(Project.owner_id != user_id)
        return [(p, r) for p, r in (await self.db.execute(stmt)).all()]

    async def research_counts(self, project_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
        if not project_ids:
            return {}
        rows = await self.db.execute(
            select(ResearchSession.project_id, func.count()).where(ResearchSession.project_id.in_(project_ids)).group_by(ResearchSession.project_id)
        )
        return {pid: n for pid, n in rows.all() if pid is not None}

    async def document_ids(self, project_ids: list[uuid.UUID]) -> dict[uuid.UUID, list[uuid.UUID]]:
        out: dict[uuid.UUID, list[uuid.UUID]] = {pid: [] for pid in project_ids}
        if project_ids:
            rows = await self.db.execute(select(ProjectDocument.project_id, ProjectDocument.document_id).where(ProjectDocument.project_id.in_(project_ids)))
            for pid, did in rows.all():
                out[pid].append(did)
        return out

    async def create(self, owner: User, name: str, description: str, icon: str) -> Project:
        project = Project(owner_id=owner.id, name=name, description=description, icon=icon)
        project.members.append(ProjectMember(user_id=owner.id, role=ProjectRole.owner))
        project.instruction = ProjectInstruction(content="", updated_by=owner.id)
        self.db.add(project)
        await self.db.flush()
        return project

    async def delete(self, project: Project) -> None:
        await self.db.delete(project)
        await self.db.flush()

    async def touch(self, project_id: uuid.UUID) -> None:
        p = await self.db.get(Project, project_id)
        if p:
            p.updated_at = func.now()

    async def attach_document(self, project_id: uuid.UUID, document_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        exists = await self.db.get(ProjectDocument, (project_id, document_id))
        if exists:
            return False
        self.db.add(ProjectDocument(project_id=project_id, document_id=document_id, added_by=user_id))
        await self.db.flush()
        return True

    async def detach_document(self, project_id: uuid.UUID, document_id: uuid.UUID) -> None:
        await self.db.execute(delete(ProjectDocument).where(ProjectDocument.project_id == project_id, ProjectDocument.document_id == document_id))


class ActivityRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def add(
        self, user_id: uuid.UUID, kind: ActivityKind, title: str, *, project_id: uuid.UUID | None = None, detail: str | None = None, href: str | None = None
    ) -> None:
        self.db.add(ActivityEvent(user_id=user_id, project_id=project_id, kind=kind, title=title, detail=detail, href=href))
        await self.db.flush()

    async def for_project(self, project_id: uuid.UUID, limit: int) -> Sequence[ActivityEvent]:
        return (
            await self.db.scalars(select(ActivityEvent).where(ActivityEvent.project_id == project_id).order_by(ActivityEvent.created_at.desc()).limit(limit))
        ).all()

    async def for_user(self, user_id: uuid.UUID, limit: int) -> Sequence[ActivityEvent]:
        """The user's own events plus events in projects they belong to."""
        member_projects = select(ProjectMember.project_id).where(ProjectMember.user_id == user_id)
        stmt = (
            select(ActivityEvent)
            .where((ActivityEvent.user_id == user_id) | (ActivityEvent.project_id.in_(member_projects)))
            .order_by(ActivityEvent.created_at.desc())
            .limit(limit)
        )
        return (await self.db.scalars(stmt)).all()
