import pytest

from tests.conftest import VALID_JUTSU


def test_jutsu_crud_roundtrip(admin_client):
    created = admin_client.post("/api/admin/jutsus", json=VALID_JUTSU).json()
    jutsu_id = created["id"]
    assert created["name"] == "Web 101"
    assert created["internal_ports"] == [80]

    assert [j["id"] for j in admin_client.get("/api/admin/jutsus").json()] == [jutsu_id]
    assert admin_client.get(f"/api/admin/jutsus/{jutsu_id}").json()["docker_image_name"] == "web101:latest"

    updated = admin_client.put(f"/api/admin/jutsus/{jutsu_id}", json={"ram_limit": "1g"}).json()
    assert updated["ram_limit"] == "1g"
    assert updated["name"] == "Web 101"  # partial update leaves other fields alone

    assert admin_client.delete(f"/api/admin/jutsus/{jutsu_id}").status_code == 200
    assert admin_client.get(f"/api/admin/jutsus/{jutsu_id}").status_code == 404

    actions = [e["action"] for e in admin_client.get("/api/admin/audit").json()]
    assert actions[:3] == ["delete_jutsu", "update_jutsu", "create_jutsu"]


@pytest.mark.parametrize(
    "override",
    [
        {"name": "   "},
        {"name": "x" * 129},
        {"docker_image_name": ""},
        {"ram_limit": "lots"},
        {"internal_ports": []},
        {"internal_ports": [0]},
        {"internal_ports": [70000]},
        {"cpu_limit": 0},
        {"cpu_limit": 32},
    ],
)
def test_jutsu_validation(admin_client, override):
    response = admin_client.post("/api/admin/jutsus", json={**VALID_JUTSU, **override})

    assert response.status_code == 422
    assert admin_client.get("/api/admin/jutsus").json() == []


@pytest.mark.parametrize("method", ["get", "put", "delete"])
def test_missing_jutsu_is_404(admin_client, method):
    kwargs = {"json": {"name": "x"}} if method == "put" else {}
    assert getattr(admin_client, method)("/api/admin/jutsus/999", **kwargs).status_code == 404


def test_settings_defaults_and_update(admin_client):
    assert admin_client.get("/api/admin/settings").json() == {
        "id": 1,
        "default_ttl_minutes": 30,
        "port_range_start": 30000,
        "port_range_end": 40000,
    }

    response = admin_client.put("/api/admin/settings", json={"default_ttl_minutes": 45})

    assert response.status_code == 200
    # Regression: the body used to be {} because the audit commit expired the row.
    assert response.json()["default_ttl_minutes"] == 45
    assert admin_client.get("/api/admin/settings").json()["default_ttl_minutes"] == 45


@pytest.mark.parametrize(
    "payload",
    [
        {"default_ttl_minutes": 0},
        {"default_ttl_minutes": 1441},
        {"port_range_start": 80},
        {"port_range_start": 35000, "port_range_end": 31000},
        # Partial update that inverts the range relative to the stored end (40000).
        {"port_range_start": 45000},
    ],
)
def test_settings_validation(admin_client, payload):
    response = admin_client.put("/api/admin/settings", json=payload)

    assert response.status_code == 422
    assert admin_client.get("/api/admin/settings").json()["port_range_start"] == 30000
