"""Global search (⌘K) over the caller's own research, projects and documents."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query
from sqlalchemy import or_, select

from app.api.deps import DB, VerifiedUser
from app.db.models import Document, Project, ProjectDocument, ProjectMember, ResearchSession
from app.schemas.common import ApiModel

router = APIRouter(tags=["search"])


class SearchHit(ApiModel):
    id: str
    kind: str  # research | project | document
    title: str
    subtitle: str | None = None
    href: str


def _pattern(q: str) -> str:
    cleaned = q.replace("\\", "").replace("%", "").replace("_", "").strip()[:100]
    return f"%{cleaned}%"


@router.get("/search", response_model=list[SearchHit], summary="Search your research, projects and documents")
async def search(user: VerifiedUser, db: DB, q: Annotated[str, Query(min_length=1, max_length=200)], limit: int = Query(6, ge=1, le=20)) -> list[SearchHit]:
    like = _pattern(q)
    if like == "%%":
        return []
    member_projects = select(ProjectMember.project_id).where(ProjectMember.user_id == user.id)
    research = (
        await db.scalars(
            select(ResearchSession)
            .where(
                (ResearchSession.user_id == user.id) | ResearchSession.project_id.in_(member_projects),
                or_(ResearchSession.title.ilike(like), ResearchSession.query.ilike(like)),
            )
            .order_by(ResearchSession.created_at.desc())
            .limit(limit)
        )
    ).all()
    projects = (
        await db.scalars(
            select(Project)
            .where(Project.id.in_(member_projects), or_(Project.name.ilike(like), Project.description.ilike(like)))
            .order_by(Project.updated_at.desc())
            .limit(limit)
        )
    ).all()
    shared_docs = select(ProjectDocument.document_id).where(ProjectDocument.project_id.in_(member_projects))
    documents = (
        await db.scalars(
            select(Document)
            .where(
                (Document.user_id == user.id) | Document.id.in_(shared_docs),
                or_(Document.title.ilike(like), Document.filename.ilike(like), Document.summary.ilike(like)),
            )
            .order_by(Document.created_at.desc())
            .limit(limit)
        )
    ).all()
    hits = [SearchHit(id=str(r.id), kind="research", title=r.title, subtitle=r.status.value, href=f"/research/{r.id}") for r in research]
    hits += [SearchHit(id=str(p.id), kind="project", title=p.name, subtitle=p.description or None, href=f"/projects/{p.id}") for p in projects]
    hits += [SearchHit(id=str(d.id), kind="document", title=d.title, subtitle=d.filename, href=f"/library/{d.id}") for d in documents]
    return hits
