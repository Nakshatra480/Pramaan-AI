"""Central authorization rules. Every private resource is resolved through here.

Non-members receive 404 (not 403) so the API never confirms another user's
resource exists.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import Forbidden, NotFound
from app.db.models import Document, Project, ProjectDocument, ProjectMember, ProjectRole, ResearchSession, User

ROLE_RANK = {ProjectRole.viewer: 0, ProjectRole.editor: 1, ProjectRole.owner: 2}


async def project_role(db: AsyncSession, project_id: uuid.UUID, user: User) -> ProjectRole | None:
    return await db.scalar(select(ProjectMember.role).where(ProjectMember.project_id == project_id, ProjectMember.user_id == user.id))


async def require_project(db: AsyncSession, project_id: uuid.UUID, user: User, min_role: ProjectRole = ProjectRole.viewer) -> tuple[Project, ProjectRole]:
    role = await project_role(db, project_id, user)
    project = await db.get(Project, project_id) if role else None
    if role is None or project is None:
        raise NotFound("Project")
    if ROLE_RANK[role] < ROLE_RANK[min_role]:
        raise Forbidden(f"This action requires {min_role.value} access.")
    return project, role


async def require_document(db: AsyncSession, document_id: uuid.UUID, user: User, *, write: bool = False) -> Document:
    """Documents are private to their uploader. Attaching one to a project deliberately
    shares it (read-only) with that project's members."""
    doc = await db.get(Document, document_id)
    if doc is None:
        raise NotFound("Document")
    if doc.user_id == user.id:
        return doc
    if not write:
        shared = await db.scalar(
            select(ProjectDocument.project_id)
            .join(ProjectMember, ProjectMember.project_id == ProjectDocument.project_id)
            .where(ProjectDocument.document_id == document_id, ProjectMember.user_id == user.id)
            .limit(1)
        )
        if shared is not None:
            return doc
    raise NotFound("Document")


async def require_research(db: AsyncSession, research_id: uuid.UUID, user: User, *, write: bool = False) -> ResearchSession:
    """Research is readable by its author and by members of its project; writable by its author."""
    r = await db.get(ResearchSession, research_id)
    if r is None:
        raise NotFound("Research")
    if r.user_id == user.id:
        return r
    if not write and r.project_id and await project_role(db, r.project_id, user) is not None:
        return r
    raise NotFound("Research")
