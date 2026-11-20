"""Account-level operations: deletion, data export, usage and research retention."""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import log
from app.db.models import (
    Document,
    Project,
    ProjectMember,
    ResearchMode,
    ResearchSession,
    User,
)
from app.services.documents.processor import stored_text_key
from app.services.jobs import JobRunner, get_job_runner
from app.services.storage.base import StorageError, StorageService, get_storage

logger = logging.getLogger("pramaan.account")

RETENTION_CHOICES = {0, 30, 90, 365}


async def _delete_objects(storage: StorageService, keys: list[str]) -> None:
    for key in keys:
        try:
            await storage.delete(key)
        except StorageError:
            logger.error("storage_orphan", extra={"fields": {"object_key": key, "backend": storage.backend}})


class AccountService:
    def __init__(self, db: AsyncSession, storage: StorageService | None = None, jobs: JobRunner | None = None) -> None:
        self.db = db
        self.storage = storage or get_storage()
        self.jobs = jobs or get_job_runner()

    # ------------------------------------------------------------------ deletion

    async def delete_account(self, user: User) -> int:
        """Delete the user and everything they own. Every table referencing users cascades
        (projects they own, memberships, documents + chunks, research + artifacts, shares,
        activity), so one DELETE removes all database rows. Stored files are removed after
        the commit, like a single document delete. Returns the number of objects scheduled."""
        docs = (await self.db.scalars(select(Document).where(Document.user_id == user.id))).all()
        keys = [k for d in docs for k in (d.storage_key, stored_text_key(d)) if k]
        await self.db.execute(delete(User).where(User.id == user.id))
        await self.db.commit()
        log(logger, logging.INFO, "account_deleted", user_id=str(user.id), documents=len(docs))
        if keys:
            self.jobs.submit(f"account-delete:{user.id}", lambda: _delete_objects(self.storage, keys))
        return len(keys)

    # ------------------------------------------------------------------ export

    async def export(self, user: User) -> dict[str, Any]:
        """Everything the user owns, as one JSON document (original files are downloadable separately)."""
        from app.services.research import ResearchService

        projects = (await self.db.scalars(select(Project).where(Project.owner_id == user.id).order_by(Project.created_at))).all()
        docs = (await self.db.scalars(select(Document).where(Document.user_id == user.id).order_by(Document.created_at))).all()
        sessions = (await self.db.scalars(select(ResearchSession).where(ResearchSession.user_id == user.id).order_by(ResearchSession.created_at))).all()
        svc = ResearchService(self.db, jobs=self.jobs)
        research = [(await svc.assemble(r)).model_dump(mode="json", by_alias=True) for r in sessions]
        return {
            "exportedAt": datetime.now(UTC).isoformat(),
            "format": "pramaan-export/1",
            "profile": {
                "id": str(user.id),
                "email": user.email,
                "displayName": user.display_name,
                "createdAt": user.created_at.isoformat() if user.created_at else None,
                "preferences": user.preferences or {},
            },
            "projects": [
                {
                    "id": str(p.id),
                    "name": p.name,
                    "description": p.description,
                    "instructions": p.instruction.content if p.instruction else "",
                    "createdAt": p.created_at.isoformat(),
                    "members": [{"userId": str(m.user_id), "role": m.role.value} for m in p.members],
                }
                for p in projects
            ],
            "documents": [
                {
                    "id": str(d.id),
                    "title": d.title,
                    "filename": d.filename,
                    "kind": d.kind.value,
                    "sizeBytes": d.size_bytes,
                    "status": d.status.value,
                    "summary": d.summary,
                    "url": (d.meta or {}).get("url"),
                    "addedAt": d.created_at.isoformat(),
                }
                for d in docs
            ],
            "research": research,
        }

    # ------------------------------------------------------------------ usage

    async def usage(self, user: User) -> dict[str, Any]:
        """Real usage figures for the Billing page (no limits are enforced during early access)."""
        now = datetime.now(UTC)
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        mine = ResearchSession.user_id == user.id
        runs = await self.db.scalar(select(func.count()).select_from(ResearchSession).where(mine, ResearchSession.created_at >= month_start)) or 0
        deep = (
            await self.db.scalar(
                select(func.count())
                .select_from(ResearchSession)
                .where(mine, ResearchSession.created_at >= month_start, ResearchSession.mode == ResearchMode.deep)
            )
            or 0
        )
        total = await self.db.scalar(select(func.count()).select_from(ResearchSession).where(mine)) or 0
        n_docs = await self.db.scalar(select(func.count()).select_from(Document).where(Document.user_id == user.id)) or 0
        size = await self.db.scalar(select(func.coalesce(func.sum(Document.size_bytes), 0)).where(Document.user_id == user.id)) or 0
        n_projects = await self.db.scalar(select(func.count()).select_from(ProjectMember).where(ProjectMember.user_id == user.id)) or 0
        return {
            "periodStart": month_start.isoformat(),
            "researchRunsThisMonth": int(runs),
            "deepRunsThisMonth": int(deep),
            "researchTotal": int(total),
            "documents": int(n_docs),
            "storageBytes": int(size),
            "projects": int(n_projects),
            "plan": user.plan,
            "limitsEnforced": False,
        }


# ---------------------------------------------------------------------- retention


async def enforce_retention(db: AsyncSession, now: datetime | None = None) -> int:
    """Delete unsaved research older than each user's chosen retention period (Settings → Privacy).
    Saved research is always kept. Returns the number of sessions deleted."""
    now = now or datetime.now(UTC)
    users = (await db.execute(select(User.id, User.preferences["retentionDays"].astext).where(User.preferences.has_key("retentionDays")))).all()
    deleted = 0
    for uid, raw in users:
        try:
            days = int(raw)
        except (TypeError, ValueError):
            continue
        if days <= 0 or days not in RETENTION_CHOICES:
            continue
        ids = (
            await db.scalars(
                select(ResearchSession.id).where(
                    ResearchSession.user_id == uid,
                    ResearchSession.saved.is_(False),
                    ResearchSession.created_at < now - timedelta(days=days),
                )
            )
        ).all()
        if ids:
            await db.execute(delete(ResearchSession).where(ResearchSession.id.in_(ids)))
            deleted += len(ids)
    if deleted:
        await db.commit()
        log(logger, logging.INFO, "retention_enforced", deleted=deleted)
    return deleted
