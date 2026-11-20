from httpx import AsyncClient

from tests.conftest import ALICE, BOB


async def create(client: AsyncClient, headers: dict[str, str], name: str = "AI Research") -> dict:
    r = await client.post("/api/v1/projects", headers=headers, json={"name": name, "description": "Applied ML", "icon": "sparkle"})
    assert r.status_code == 201, r.text
    return r.json()


async def test_project_crud(client: AsyncClient) -> None:
    p = await create(client, ALICE)
    assert p["role"] == "owner" and p["researchCount"] == 0 and p["members"][0]["name"] == "Alice Rao"

    listed = (await client.get("/api/v1/projects", headers=ALICE)).json()
    assert [x["id"] for x in listed] == [p["id"]]

    r = await client.patch(f"/api/v1/projects/{p['id']}", headers=ALICE, json={"name": "AI Research 2"})
    assert r.json()["name"] == "AI Research 2"

    ins = await client.put(f"/api/v1/projects/{p['id']}/instructions", headers=ALICE, json={"content": "Prefer peer-reviewed papers.\n\nCite everything."})
    assert ins.status_code == 200 and ins.json()["content"].startswith("Prefer")
    assert (await client.get(f"/api/v1/projects/{p['id']}", headers=ALICE)).json()["instructions"].startswith("Prefer")

    kinds = [a["kind"] for a in (await client.get(f"/api/v1/projects/{p['id']}/activity", headers=ALICE)).json()]
    assert kinds == ["instructions_updated", "project_created"]

    assert (await client.delete(f"/api/v1/projects/{p['id']}", headers=ALICE)).status_code == 204
    assert (await client.get(f"/api/v1/projects/{p['id']}", headers=ALICE)).status_code == 404


async def test_validation_errors_are_consistent(client: AsyncClient) -> None:
    r = await client.post("/api/v1/projects", headers=ALICE, json={"name": ""})
    assert r.status_code == 422
    err = r.json()["error"]
    assert err["code"] == "VALIDATION_FAILED" and err["details"][0]["field"] == "name"
    r = await client.put("/api/v1/projects/not-a-uuid/instructions", headers=ALICE, json={"content": "x"})
    assert r.status_code == 422


async def test_instructions_length_limit(client: AsyncClient) -> None:
    p = await create(client, ALICE)
    r = await client.put(f"/api/v1/projects/{p['id']}/instructions", headers=ALICE, json={"content": "x" * 4001})
    assert r.status_code == 422


async def test_other_user_cannot_see_or_modify_project(client: AsyncClient) -> None:
    p = await create(client, ALICE)
    pid = p["id"]
    assert (await client.get("/api/v1/projects", headers=BOB)).json() == []
    for method, path, body in [
        ("GET", f"/api/v1/projects/{pid}", None),
        ("PATCH", f"/api/v1/projects/{pid}", {"name": "pwned"}),
        ("DELETE", f"/api/v1/projects/{pid}", None),
        ("GET", f"/api/v1/projects/{pid}/instructions", None),
        ("PUT", f"/api/v1/projects/{pid}/instructions", {"content": "pwned"}),
        ("GET", f"/api/v1/projects/{pid}/activity", None),
    ]:
        r = await client.request(method, path, headers=BOB, json=body)
        assert r.status_code == 404, (method, path, r.status_code)
        assert r.json()["error"]["code"] == "PROJECT_NOT_FOUND"
    assert (await client.get(f"/api/v1/projects/{pid}", headers=ALICE)).json()["name"] == "AI Research"


async def test_missing_project(client: AsyncClient) -> None:
    r = await client.get("/api/v1/projects/00000000-0000-0000-0000-000000000000", headers=ALICE)
    assert r.status_code == 404
