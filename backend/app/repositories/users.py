from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import VerifiedIdentity
from app.db.models import User

# How stale `last_login_at` may get before a request refreshes it. Every authenticated request resolves the
# user; writing the row each time would serialise a page's parallel requests on its row lock until each commits.
LOGIN_REFRESH = timedelta(minutes=10)


class UserRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_by_firebase_uid(self, uid: str) -> User | None:
        return await self.db.scalar(select(User).where(User.firebase_uid == uid))

    async def upsert_from_identity(self, identity: VerifiedIdentity) -> User:
        """Idempotent create-or-refresh keyed on the verified Firebase UID (never email). A plain read when the
        stored profile already matches the token and the last-login time is recent, so requests don't write."""
        now = datetime.now(UTC)
        user = await self.get_by_firebase_uid(identity.uid)
        if (
            user is not None
            and user.email == identity.email
            and user.email_verified == identity.email_verified
            and user.last_login_at is not None
            and now - user.last_login_at < LOGIN_REFRESH
        ):
            return user
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
