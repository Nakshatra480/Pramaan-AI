"""FastAPI dependencies: authentication, rate limiting, DB session, services."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.exceptions import Forbidden, RateLimited, Unauthenticated
from app.core.logging import user_id_var
from app.core.rate_limit import RateLimiter, get_rate_limiter
from app.core.security import AppCheckVerifier, TokenVerifier, VerifiedIdentity, get_app_check_verifier, get_token_verifier
from app.db.database import get_db
from app.db.models import User
from app.repositories.users import UserRepository

DB = Annotated[AsyncSession, Depends(get_db)]


async def verified_identity(
    authorization: Annotated[str | None, Header()] = None,
    x_firebase_appcheck: Annotated[str | None, Header()] = None,
    verifier: TokenVerifier = Depends(get_token_verifier),
    app_check: AppCheckVerifier = Depends(get_app_check_verifier),
    settings: Settings = Depends(get_settings),
) -> VerifiedIdentity:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise Unauthenticated()
    token = authorization[7:].strip()
    if not token or len(token) > 4096:
        raise Unauthenticated(code="TOKEN_INVALID")
    if settings.firebase_app_check_required:
        if not x_firebase_appcheck:
            raise Unauthenticated("App verification required.", code="APP_CHECK_REQUIRED")
        await app_check.verify(x_firebase_appcheck)
    return await verifier.verify(token)


async def current_user(
    db: DB,
    identity: VerifiedIdentity = Depends(verified_identity),
    limiter: RateLimiter = Depends(get_rate_limiter),
) -> User:
    """Resolve (and upsert) the Neon user for the verified Firebase identity."""
    if not await limiter.hit(identity.uid):
        raise RateLimited()
    user = await UserRepository(db).upsert_from_identity(identity)
    user_id_var.set(str(user.id))
    return user


async def verified_user(user: User = Depends(current_user)) -> User:
    """Application routes require a verified email (Google accounts are verified by Firebase)."""
    if not user.email_verified:
        raise Forbidden("Verify your email to continue.", code="EMAIL_NOT_VERIFIED")
    return user


CurrentUser = Annotated[User, Depends(current_user)]
VerifiedUser = Annotated[User, Depends(verified_user)]
