from __future__ import annotations

import uuid
from typing import Annotated, Literal
from urllib.parse import quote

from fastapi import APIRouter, File, Form, Query, Response, UploadFile, status

from app.api.deps import DB, VerifiedUser
from app.core.config import get_settings
from app.core.exceptions import PayloadTooLarge
from app.schemas.common import ApiModel
from app.schemas.library import CollectionCreate, CollectionOut, DocumentDetailOut, DocumentOut, UploadOut
from app.services.library import LibraryService

router = APIRouter(tags=["library"])


class UrlCreate(ApiModel):
    url: str
    project_id: uuid.UUID | None = None


@router.get("/library", response_model=list[DocumentOut])
async def list_documents(
    user: VerifiedUser,
    db: DB,
    filter: Literal["all", "pdf", "documents", "papers", "websites"] = "all",
    project_id: Annotated[uuid.UUID | None, Query(alias="projectId")] = None,
    collection_id: Annotated[uuid.UUID | None, Query(alias="collectionId")] = None,
    q: Annotated[str | None, Query(max_length=200)] = None,
) -> list[DocumentOut]:
    return await LibraryService(db).list_documents(user, project_id=project_id, collection_id=collection_id, kind_filter=filter, q=q)


@router.post("/library/upload", response_model=UploadOut, status_code=status.HTTP_201_CREATED)
async def upload(
    user: VerifiedUser,
    db: DB,
    response: Response,
    file: Annotated[UploadFile, File(description="PDF, DOCX, TXT or Markdown")],
    project_id: Annotated[uuid.UUID | None, Form(alias="projectId")] = None,
) -> UploadOut:
    limit = get_settings().max_upload_bytes
    data = await file.read(limit + 1)
    if len(data) > limit:
        raise PayloadTooLarge(f"Files can be up to {limit // (1024 * 1024)} MB.")
    doc, created = await LibraryService(db).upload(user, file.filename or "document", data, project_id)
    if not created:
        response.status_code = status.HTTP_200_OK
    return UploadOut(**doc.model_dump(by_alias=False), duplicate=not created)


@router.post("/library/urls", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
async def add_url(data: UrlCreate, user: VerifiedUser, db: DB) -> DocumentOut:
    return await LibraryService(db).add_url(user, data.url, data.project_id)


@router.get("/library/collections", response_model=list[CollectionOut])
async def collections(user: VerifiedUser, db: DB) -> list[CollectionOut]:
    return await LibraryService(db).collections(user)


@router.post("/library/collections", response_model=CollectionOut, status_code=status.HTTP_201_CREATED)
async def create_collection(data: CollectionCreate, user: VerifiedUser, db: DB) -> CollectionOut:
    return await LibraryService(db).create_collection(user, data.name)


@router.post("/library/collections/{collection_id}/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def add_to_collection(collection_id: uuid.UUID, document_id: uuid.UUID, user: VerifiedUser, db: DB) -> None:
    await LibraryService(db).add_to_collection(user, collection_id, document_id)


@router.get("/library/{document_id}", response_model=DocumentDetailOut)
async def get_document(document_id: uuid.UUID, user: VerifiedUser, db: DB) -> DocumentDetailOut:
    return await LibraryService(db).get(user, document_id)


@router.get(
    "/library/{document_id}/download",
    summary="Download the original file (ownership-checked; streamed through the API)",
    response_class=Response,
    responses={200: {"content": {"application/octet-stream": {}}}},
)
async def download(document_id: uuid.UUID, user: VerifiedUser, db: DB) -> Response:
    doc, data = await LibraryService(db).download(user, document_id)
    safe = "".join(ch for ch in doc.filename if ch.isalnum() or ch in "._- ")[:150] or "document"
    return Response(
        content=data,
        media_type=doc.mime_type or "application/octet-stream",
        headers={
            "Content-Disposition": f"attachment; filename=\"{safe}\"; filename*=UTF-8''{quote(doc.filename[:150])}",
            "Cache-Control": "private, no-store",  # nosniff is added globally by the middleware
        },
    )


@router.post("/library/{document_id}/retry", response_model=DocumentOut)
async def retry(document_id: uuid.UUID, user: VerifiedUser, db: DB) -> DocumentOut:
    return await LibraryService(db).retry(user, document_id)


@router.delete("/library/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(document_id: uuid.UUID, user: VerifiedUser, db: DB) -> None:
    await LibraryService(db).delete(user, document_id)


@router.post("/projects/{project_id}/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def attach(project_id: uuid.UUID, document_id: uuid.UUID, user: VerifiedUser, db: DB) -> None:
    await LibraryService(db).attach(user, project_id, document_id)


@router.delete("/projects/{project_id}/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def detach(project_id: uuid.UUID, document_id: uuid.UUID, user: VerifiedUser, db: DB) -> None:
    await LibraryService(db).detach(user, project_id, document_id)
