"""The API-key-protected spawn/kill endpoints used by CTF platforms."""

import time

import pytest

from app.db import session_scope
from app.services import lifecycle_service
from tests.support import API_KEY, PUBLIC_HOST, RATE_LIMIT_COUNT


@pytest.mark.parametrize("headers", [{}, {"X-Kage-Key": "wrong"}], ids=["missing", "wrong"])
def test_spawn_requires_valid_api_key(client, jutsu, docker_client, headers):
    response = client.post(f"/api/spawn/{jutsu['id']}", headers=headers)

    assert response.status_code == 401
    assert docker_client.containers.run_calls == []


def test_spawn_unknown_challenge_is_404(client, api_headers):
    assert client.post("/api/spawn/999", headers=api_headers).status_code == 404


def test_spawn_returns_connection_details_and_records_state(client, admin_client, jutsu, api_headers):
    before = int(time.time())
    response = client.post(
        f"/api/spawn/{jutsu['id']}",
        headers=api_headers,
        json={"platform": "ctfd", "team_id": "team-7", "player_id": "p-42"},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["host"] == PUBLIC_HOST
    assert 30000 <= body["port"] <= 40000
    assert before + 30 * 60 <= body["expires_at"] <= int(time.time()) + 30 * 60
    with session_scope() as session:
        assert lifecycle_service.get_expiry(session, body["container_id"]) == body["expires_at"]

    event = admin_client.get("/api/admin/audit?action=spawn").json()[0]
    assert event["actor"] == "api_key"
    assert event["target"] == str(jutsu["id"])
    assert event["meta"] | {"ip": None} == {
        "container_id": body["container_id"],
        "ip": None,
        "challenge_name": "Web 101",
        "platform": "ctfd",
        "team_id": "team-7",
        "player_id": "p-42",
    }


def test_spawn_without_body(client, jutsu, api_headers):
    assert client.post(f"/api/spawn/{jutsu['id']}", headers=api_headers).status_code == 200


def test_spawn_is_rate_limited(client, jutsu, api_headers, docker_client):
    for _ in range(RATE_LIMIT_COUNT):
        assert client.post(f"/api/spawn/{jutsu['id']}", headers=api_headers).status_code == 200

    response = client.post(f"/api/spawn/{jutsu['id']}", headers=api_headers)

    assert response.status_code == 429
    assert len(docker_client.containers.run_calls) == RATE_LIMIT_COUNT


def test_spawn_with_exhausted_port_range_is_409(client, admin_client, jutsu, api_headers, docker_client):
    admin_client.put("/api/admin/settings", json={"port_range_start": 30000, "port_range_end": 30000})
    docker_client.containers.seed(kage=False, host_ports={"8080/tcp": 30000})

    response = client.post(f"/api/spawn/{jutsu['id']}", headers=api_headers)

    assert response.status_code == 409
    assert docker_client.containers.run_calls == []


def test_public_kill_removes_clone_and_expiry(client, jutsu, api_headers, docker_client):
    container_id = client.post(f"/api/spawn/{jutsu['id']}", headers=api_headers).json()["container_id"]

    response = client.delete(f"/api/spawn/{container_id}", headers=api_headers)

    assert response.status_code == 200
    assert not docker_client.containers.exists(container_id)
    with session_scope() as session:
        assert lifecycle_service.get_expiry(session, container_id) is None


def test_public_kill_cannot_touch_non_kage_containers(client, api_headers, docker_client):
    """
    Security regression: the API key ships in browser JS for some integrations,
    and containers.get() resolves names, so this used to let anyone holding the
    key force-remove arbitrary containers (backend, socket proxy, ...).
    """
    backend = docker_client.containers.seed(name="kage-protocol-backend-1", kage=False)

    by_name = client.delete("/api/spawn/kage-protocol-backend-1", headers=api_headers)
    by_id = client.delete(f"/api/spawn/{backend.id}", headers=api_headers)

    assert by_name.status_code == 404
    assert by_id.status_code == 404
    assert docker_client.containers.exists(backend.id)


def test_public_kill_unknown_container_is_404(client, api_headers):
    assert client.delete("/api/spawn/does-not-exist", headers=api_headers).status_code == 404


def test_public_kill_requires_api_key(client, jutsu, api_headers, docker_client):
    container_id = client.post(f"/api/spawn/{jutsu['id']}", headers=api_headers).json()["container_id"]

    assert client.delete(f"/api/spawn/{container_id}").status_code == 401
    assert docker_client.containers.exists(container_id)


def test_api_key_is_not_an_admin_credential(client):
    assert client.get("/api/admin/jutsus", headers={"X-Kage-Key": API_KEY}).status_code == 401
