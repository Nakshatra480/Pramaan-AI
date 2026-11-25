import io

from httpx import AsyncClient

from app.services.jobs import get_job_runner
from tests.conftest import ALICE, BOB

TEXT = (
    "Retrieval-augmented generation combines a retriever with a generator.\n\n"
    "Hybrid retrieval with PostgreSQL full-text search and pgvector similarity improves recall over either method alone. "
    "Reciprocal rank fusion merges the two ranked lists without score calibration.\n\n"
    "Long-context models lose accuracy on facts placed in the middle of very long prompts."
)


def docx_bytes(text: str) -> bytes:
    import docx

    d = docx.Document()
    for para in text.split("\n\n"):
        d.add_paragraph(para)
    buf = io.BytesIO()
    d.save(buf)
    return buf.getvalue()


async def upload(client: AsyncClient, headers: dict, name: str, data: bytes, **form: str):
    return await client.post("/api/v1/library/upload", headers=headers, files={"file": (name, data)}, data=form)


async def test_upload_index_and_read_markdown(client: AsyncClient) -> None:
    r = await upload(client, ALICE, "rag-notes.md", TEXT.encode())
    assert r.status_code == 201, r.text
    doc = r.json()
    assert doc["status"] == "uploading" and doc["kind"] == "markdown"
    await get_job_runner().drain()
    detail = (await client.get(f"/api/v1/library/{doc['id']}", headers=ALICE)).json()
    assert detail["status"] == "ready" and detail["chunks"] >= 1
    assert "Hybrid retrieval" in " ".join(detail["content"][0]["paragraphs"])


async def test_docx_is_extracted(client: AsyncClient) -> None:
    r = await upload(client, ALICE, "notes.docx", docx_bytes(TEXT))
    assert r.status_code == 201
    await get_job_runner().drain()
    assert (await client.get(f"/api/v1/library/{r.json()['id']}", headers=ALICE)).json()["status"] == "ready"


async def test_duplicate_upload_is_deduplicated(client: AsyncClient) -> None:
    a = await upload(client, ALICE, "a.md", TEXT.encode())
    b = await upload(client, ALICE, "b.md", TEXT.encode())
    assert b.status_code == 200 and b.json()["id"] == a.json()["id"]
    await get_job_runner().drain()


async def test_rejects_disguised_and_unsupported_files(client: AsyncClient) -> None:
    exe = await upload(client, ALICE, "paper.pdf", b"MZ\x90\x00binary")
    assert exe.status_code == 422 and exe.json()["error"]["code"] == "FILE_UNSUPPORTED"
    renamed = await upload(client, ALICE, "notes.txt", b"%PDF-1.7 fake")
    assert renamed.json()["error"]["code"] == "FILE_TYPE_MISMATCH"
    binary_txt = await upload(client, ALICE, "x.txt", b"abc\x00def")
    assert binary_txt.status_code == 422
    empty = await upload(client, ALICE, "e.md", b"")
    assert empty.json()["error"]["code"] == "FILE_EMPTY"


async def test_corrupt_pdf_fails_gracefully(client: AsyncClient) -> None:
    r = await upload(client, ALICE, "broken.pdf", b"%PDF-1.4\nnot really a pdf")
    assert r.status_code == 201
    await get_job_runner().drain()
    d = (await client.get(f"/api/v1/library/{r.json()['id']}", headers=ALICE)).json()
    assert d["status"] == "failed" and d["error"] and "Traceback" not in d["error"]


async def test_url_validation_blocks_ssrf(client: AsyncClient) -> None:
    for url in ["file:///etc/passwd", "ftp://example.com", "http://user:pw@example.com", "http://example.com:8080/x"]:
        r = await client.post("/api/v1/library/urls", headers=ALICE, json={"url": url})
        assert r.status_code == 422, url


async def test_private_address_fetch_is_refused() -> None:
    import pytest

    from app.core.exceptions import ValidationFailed
    from app.services.content.fetch import fetch_page

    for url in ["http://127.0.0.1/", "http://localhost/admin", "http://169.254.169.254/latest/meta-data/", "http://10.0.0.5/"]:
        with pytest.raises(ValidationFailed):
            await fetch_page(url)


async def test_project_attachment_and_scoping(client: AsyncClient) -> None:
    p = (await client.post("/api/v1/projects", headers=ALICE, json={"name": "P"})).json()
    doc = (await upload(client, ALICE, "rag.md", TEXT.encode(), projectId=p["id"])).json()
    assert doc["projectIds"] == [p["id"]]
    await get_job_runner().drain()
    listed = (await client.get("/api/v1/library", headers=ALICE, params={"projectId": p["id"]})).json()
    assert [d["id"] for d in listed] == [doc["id"]]
    assert (await client.delete(f"/api/v1/projects/{p['id']}/documents/{doc['id']}", headers=ALICE)).status_code == 204
    assert (await client.get("/api/v1/library", headers=ALICE, params={"projectId": p["id"]})).json() == []
    assert (await client.post(f"/api/v1/projects/{p['id']}/documents/{doc['id']}", headers=ALICE)).status_code == 204


async def test_library_is_private_between_users(client: AsyncClient) -> None:
    doc = (await upload(client, ALICE, "private.md", TEXT.encode())).json()
    await get_job_runner().drain()
    assert (await client.get("/api/v1/library", headers=BOB)).json() == []
    for method, path in [("GET", f"/api/v1/library/{doc['id']}"), ("DELETE", f"/api/v1/library/{doc['id']}"), ("POST", f"/api/v1/library/{doc['id']}/retry")]:
        r = await client.request(method, path, headers=BOB)
        assert r.status_code == 404, (method, path)
    # Bob cannot attach Alice's document to his own project.
    bp = (await client.post("/api/v1/projects", headers=BOB, json={"name": "Bob's"})).json()
    assert (await client.post(f"/api/v1/projects/{bp['id']}/documents/{doc['id']}", headers=BOB)).status_code == 404
    # Bob cannot upload into Alice's project.
    ap = (await client.post("/api/v1/projects", headers=ALICE, json={"name": "Alice's"})).json()
    assert (await upload(client, BOB, "x.md", b"hello world text", projectId=ap["id"])).status_code == 404
