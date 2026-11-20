from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import Conflict, Forbidden, NotFound, ValidationFailed
from app.db.models import ActivityEvent, ActivityKind, Project, ProjectInstruction, ProjectMember, ProjectRole, User
from app.repositories.projects import ActivityRepository, ProjectRepository
from app.schemas.projects import ActivityOut, InstructionOut, MemberAdd, MemberOut, ProjectCreate, ProjectOut, ProjectUpdate
from app.services.access import require_project


def initials(name: str | None) -> str:
    parts = [p for p in (name or "").split() if p]
    return "".join(p[0].upper() for p in parts[:2]) or "·"


def display(user: User) -> str:
    return user.display_name or (user.email or "Member").split("@")[0]


class ProjectService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.repo = ProjectRepository(db)
        self.activity = ActivityRepository(db)

    async def _to_out(self, pairs: list[tuple[Project, ProjectRole]]) -> list[ProjectOut]:
        ids = [p.id for p, _ in pairs]
        counts = await self.repo.research_counts(ids)
        docs = await self.repo.document_ids(ids)
        out = []
        for p, role in pairs:
            owner = next((m.user for m in p.members if m.role == ProjectRole.owner), None)
            out.append(
                ProjectOut(
                    id=p.id,
                    name=p.name,
                    description=p.description,
                    icon=p.icon,
                    owner_id=p.owner_id,
                    owner_name=display(owner) if owner else "Owner",
                    role=role,
                    members=[MemberOut(user_id=m.user_id, name=display(m.user), role=m.role, initials=initials(display(m.user))) for m in p.members],
                    created_at=p.created_at,
                    updated_at=p.updated_at,
                    research_count=counts.get(p.id, 0),
                    document_ids=docs.get(p.id, []),
                    instructions=p.instruction.content if p.instruction else "",
                    visibility=p.visibility,
                )
            )
        return out

    async def list_projects(self, user: User, scope: str) -> list[ProjectOut]:
        return await self._to_out(list(await self.repo.list_for_member(user.id, scope)))

    async def get(self, user: User, project_id: uuid.UUID) -> ProjectOut:
        project, role = await require_project(self.db, project_id, user)
        return (await self._to_out([(project, role)]))[0]

    async def create(self, user: User, data: ProjectCreate) -> ProjectOut:
        project = await self.repo.create(user, data.name.strip(), data.description.strip(), data.icon)
        await self.activity.add(user.id, ActivityKind.project_created, f"Created {project.name}", project_id=project.id)
        await self.db.refresh(project)
        return (await self._to_out([(project, ProjectRole.owner)]))[0]

    async def update(self, user: User, project_id: uuid.UUID, data: ProjectUpdate) -> ProjectOut:
        project, role = await require_project(self.db, project_id, user, ProjectRole.editor)
        patch = data.model_dump(exclude_unset=True, by_alias=False)
        if "visibility" in patch and role != ProjectRole.owner:
            patch.pop("visibility")  # only owners change access
        for k, v in patch.items():
            if v is not None:
                setattr(project, k, v.strip() if isinstance(v, str) else v)
        await self.db.flush()
        await self.db.refresh(project)
        return (await self._to_out([(project, role)]))[0]

    async def delete(self, user: User, project_id: uuid.UUID) -> None:
        project, _ = await require_project(self.db, project_id, user, ProjectRole.owner)
        await self.repo.delete(project)

    # ------------------------------------------------------------ members

    async def add_member(self, user: User, project_id: uuid.UUID, data: MemberAdd) -> ProjectOut:
        """Owners add an existing Pramaan account by email as an editor or viewer."""
        project, _ = await require_project(self.db, project_id, user, ProjectRole.owner)
        email = data.email.strip().lower()
        invitee = await self.db.scalar(select(User).where(func.lower(User.email) == email, User.email_verified.is_(True)))
        if invitee is None:
            raise NotFound("Account")  # message: "Account not found." — owners can only add people who already use Pramaan
        if invitee.id == user.id or any(m.user_id == invitee.id for m in project.members):
            raise Conflict("That person is already a member of this project.", code="ALREADY_MEMBER")
        project.members.append(ProjectMember(user_id=invitee.id, role=ProjectRole(data.role)))
        await self.activity.add(
            invitee.id, ActivityKind.member_joined, f"{display(invitee)} joined {project.name}", project_id=project.id, detail=f"Added as {data.role}"
        )
        await self.repo.touch(project.id)
        await self.db.flush()
        await self.db.refresh(project)
        return (await self._to_out([(project, ProjectRole.owner)]))[0]

    async def update_member(self, user: User, project_id: uuid.UUID, member_id: uuid.UUID, role: str) -> ProjectOut:
        project, _ = await require_project(self.db, project_id, user, ProjectRole.owner)
        member = next((m for m in project.members if m.user_id == member_id), None)
        if member is None:
            raise NotFound("Member")
        if member.role == ProjectRole.owner:
            raise ValidationFailed("The owner's role can't be changed.", code="OWNER_ROLE_FIXED")
        member.role = ProjectRole(role)
        await self.db.flush()
        return (await self._to_out([(project, ProjectRole.owner)]))[0]

    async def remove_member(self, user: User, project_id: uuid.UUID, member_id: uuid.UUID) -> None:
        """Owners remove members; any member may leave. The owner can't be removed."""
        project, role = await require_project(self.db, project_id, user)
        if member_id != user.id and role != ProjectRole.owner:
            raise Forbidden("Only the owner can remove other members.")
        member = next((m for m in project.members if m.user_id == member_id), None)
        if member is None:
            raise NotFound("Member")
        if member.role == ProjectRole.owner:
            raise ValidationFailed("The owner can't leave or be removed. Delete the project instead.", code="OWNER_CANNOT_LEAVE")
        project.members.remove(member)
        await self.db.flush()

    async def get_instructions(self, user: User, project_id: uuid.UUID) -> InstructionOut:
        project, _ = await require_project(self.db, project_id, user)
        ins = project.instruction
        return InstructionOut(project_id=project.id, content=ins.content if ins else "", updated_at=ins.updated_at if ins else None)

    async def put_instructions(self, user: User, project_id: uuid.UUID, content: str) -> InstructionOut:
        project, _ = await require_project(self.db, project_id, user, ProjectRole.editor)
        content = content.replace("\r\n", "\n").strip()
        if project.instruction is None:
            project.instruction = ProjectInstruction(content=content, updated_by=user.id)
        else:
            project.instruction.content = content
            project.instruction.updated_by = user.id
        await self.repo.touch(project.id)
        first_line = next((line for line in content.split("\n") if line.strip()), None)
        await self.activity.add(
            user.id, ActivityKind.instructions_updated, "Updated project instructions", project_id=project.id, detail=first_line[:80] if first_line else None
        )
        await self.db.flush()
        await self.db.refresh(project.instruction)
        return InstructionOut(project_id=project.id, content=project.instruction.content, updated_at=project.instruction.updated_at)

    async def project_activity(self, user: User, project_id: uuid.UUID, limit: int) -> list[ActivityOut]:
        await require_project(self.db, project_id, user)
        return [self._activity_out(a, user) for a in await self.activity.for_project(project_id, limit)]

    async def user_activity(self, user: User, limit: int) -> list[ActivityOut]:
        return [self._activity_out(a, user) for a in await self.activity.for_user(user.id, limit)]

    @staticmethod
    def _activity_out(a: ActivityEvent, viewer: User) -> ActivityOut:
        return ActivityOut(
            id=a.id,
            project_id=a.project_id,
            kind=a.kind,
            actor="You" if a.user_id == viewer.id else display(a.actor),
            title=a.title,
            detail=a.detail,
            href=a.href,
            created_at=a.created_at,
        )
