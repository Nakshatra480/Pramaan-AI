from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import Field, HttpUrl

from app.schemas.common import ApiModel


class UserOut(ApiModel):
    id: uuid.UUID
    firebase_uid: str
    email: str | None
    email_verified: bool
    display_name: str | None
    avatar_url: str | None
    auth_provider: str
    plan: str
    onboarded: bool
    preferences: dict[str, Any]
    created_at: datetime


class UserUpdate(ApiModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=200)
    avatar_url: HttpUrl | None = None
    onboarded: bool | None = None
    preferences: dict[str, Any] | None = Field(default=None, max_length=40)
