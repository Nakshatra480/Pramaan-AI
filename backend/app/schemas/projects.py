from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import Field

from app.db.models import ActivityKind, ProjectRole, Visibility
from app.schemas.common import ApiModel

ProjectIcon = Literal["sparkle", "leaf", "flask", "chart", "book", "globe", "cpu", "compass"]


class MemberOut(ApiModel):
    user_id: uuid.UUID
    name: str
    role: ProjectRole
    initials: str


class ProjectOut(ApiModel):
    id: uuid.UUID
    name: str
    description: str
    icon: str
    owner_id: uuid.UUID
    owner_name: str
    role: ProjectRole
    members: list[MemberOut]
    created_at: datetime
    updated_at: datetime
    research_count: int
    document_ids: list[uuid.UUID]
    instructions: str
    visibility: Visibility


class ProjectCreate(ApiModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=2000)
    icon: ProjectIcon = "sparkle"


class ProjectUpdate(ApiModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    icon: ProjectIcon | None = None
    visibility: Visibility | None = None


class InstructionOut(ApiModel):
    project_id: uuid.UUID
    content: str
    updated_at: datetime | None


class InstructionUpdate(ApiModel):
    content: str = Field(max_length=4000)


class ActivityOut(ApiModel):
    id: uuid.UUID
    project_id: uuid.UUID | None
    kind: ActivityKind
    actor: str
    title: str
    detail: str | None
    href: str | None
    created_at: datetime


class MemberAdd(ApiModel):
    email: str = Field(min_length=3, max_length=320, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    role: Literal["editor", "viewer"] = "viewer"


class MemberUpdate(ApiModel):
    role: Literal["editor", "viewer"]
