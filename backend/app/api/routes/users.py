from __future__ import annotations

from fastapi import APIRouter, Response, status

from app.api.deps import DB, CurrentUser
from app.repositories.users import UserRepository
from app.schemas.users import UserOut, UserUpdate
from app.services.account import AccountService

router = APIRouter(tags=["users"])


@router.get("/me", response_model=UserOut, summary="Current user (created on first call)")
async def me(user: CurrentUser) -> UserOut:
    return UserOut.model_validate(user)


@router.patch("/me", response_model=UserOut, summary="Update profile and preferences")
async def update_me(data: UserUpdate, user: CurrentUser, db: DB) -> UserOut:
    patch = data.model_dump(exclude_unset=True, by_alias=False)
    if "avatar_url" in patch and patch["avatar_url"] is not None:
        patch["avatar_url"] = str(patch["avatar_url"])
    if "preferences" in patch and patch["preferences"] is not None:
        patch["preferences"] = {**(user.preferences or {}), **patch["preferences"]}
    await UserRepository(db).update(user, **{k: v for k, v in patch.items() if v is not None or k == "avatar_url"})
    return UserOut.model_validate(user)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT, summary="Permanently delete your account and all of its data")
async def delete_me(user: CurrentUser, db: DB) -> None:
    """Deletes the Pramaan profile, projects you own, your library (rows and stored files) and your research.
    The Firebase sign-in itself is deleted by the client right after this succeeds (it holds the fresh credential)."""
    await AccountService(db).delete_account(user)


@router.get("/me/export", summary="Export everything you own as JSON")
async def export_me(user: CurrentUser, db: DB) -> Response:
    import json

    data = await AccountService(db).export(user)
    stamp = data["exportedAt"][:10]
    return Response(
        content=json.dumps(data, ensure_ascii=False, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="pramaan-export-{stamp}.json"', "Cache-Control": "private, no-store"},
    )


@router.get("/me/usage", summary="Usage this month (Settings → Billing)")
async def usage_me(user: CurrentUser, db: DB) -> dict[str, object]:
    return await AccountService(db).usage(user)
