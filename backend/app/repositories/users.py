from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import VerifiedIdentity
from app.db.models import User


class UserRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_by_firebase_uid(self, uid: str) -> User | None:
        return await self.db.scalar(select(User).where(User.firebase_uid == uid))

    async def upsert_from_identity(self, identity: VerifiedIdentity) -> User:
        """Idempotent create-or-refresh keyed on the verified Firebase UID (never email)."""
        now = datetime.now(UTC)
        stmt = (
            insert(User)
            .values(
                firebase_uid=identity.uid,
                email=identity.email,
                email_verified=identity.email_verified,
                display_name=identity.name,
                avatar_url=identity.picture,
                auth_provider=identity.provider,
                last_login_at=now,
                preferences={},
            )
            .on_conflict_do_update(
                index_elements=[User.firebase_uid],
                set_={
                    "email": identity.email,
                    "email_verified": identity.email_verified,
                    "last_login_at": now,
                },
            )
            .returning(User)
            .execution_options(populate_existing=True)
        )
        user = (await self.db.execute(stmt)).scalar_one()
        await self.db.flush()
        return user

    async def update(self, user: User, **fields: object) -> User:
        for k, v in fields.items():
            setattr(user, k, v)
        await self.db.flush()
        return user
