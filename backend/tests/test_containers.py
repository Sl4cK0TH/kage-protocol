"""Admin container operations: spawn, list, logs, kill, extend, stats."""

import time

import pytest

from app.db import session_scope
from app.services import lifecycle_service
from tests.support import SPAWNER_LABELS


def expiry_of(container_id: str) -> int | None:
    with session_scope() as session:
        return lifecycle_service.get_expiry(session, container_id)


def seed_clone(docker_client, *, expires_in: int = 600, name: str | None = None, challenge: str = "Web 101"):
    return docker_client.containers.seed(
        name=name,
        labels={"expires_at": str(int(time.time()) + expires_in), "kage_challenge_id": "1",
                "kage_challenge_name": challenge},
        host_ports={"80/tcp": 31234},
    )


def test_admin_spawn_creates_labelled_isolated_container(admin_client, docker_client, jutsu):
    before = int(time.time())
    response = admin_client.post(f"/api/admin/spawn/{jutsu['id']}")

    assert response.status_code == 200, response.text
    body = response.json()
    run = docker_client.containers.run_calls[-1]
    assert run["image"] == "web101:latest"
    assert run["labels"]["spawner"] == "kage-protocol"
    assert run["labels"]["kage_challenge_id"] == str(jutsu["id"])
    assert run["labels"]["kage_challenge_name"] == "Web 101"
    assert run["labels"]["expires_at"] == str(body["expires_at"])
    assert run["mem_limit"] == "256m"
    assert run["nano_cpus"] == 500_000_000
    assert run["network"] == "kage-challenges-test"
    assert "kage-challenges-test" in docker_client.networks.names
    assert 30000 <= body["port"] <= 40000
    assert body["port_map"] == {"80/tcp": body["port"]}
    assert before + 30 * 60 <= body["expires_at"] <= int(time.time()) + 30 * 60
    # The mutable expiry is recorded so the TTL can be extended later.
    assert expiry_of(body["container_id"]) == body["expires_at"]

    event = admin_client.get("/api/admin/audit?action=admin_spawn").json()[0]
    assert event["meta"]["challenge_name"] == "Web 101"
    assert event["meta"]["container_id"] == body["container_id"]


def test_admin_spawn_unknown_jutsu_is_404(admin_client, docker_client):
    assert admin_client.post("/api/admin/spawn/999").status_code == 404
    assert docker_client.containers.run_calls == []


def test_list_containers_shows_jutsu_image_and_ttl(admin_client, docker_client):
    clone = seed_clone(docker_client, expires_in=600)
    docker_client.containers.seed(name="unrelated-db", kage=False)

    items = admin_client.get("/api/admin/docker/containers").json()

    assert [item["id"] for item in items] == [clone.id]
    item = items[0]
    assert item["challenge_id"] == 1
    assert item["challenge_name"] == "Web 101"
    assert item["image"] == ["challenge:latest"]
    assert 590 <= item["time_remaining_seconds"] <= 600
    # docker-py's list() must tolerate a clone reaped between list and inspect.
    assert docker_client.containers.list_calls[-1]["ignore_removed"] is True


def test_list_prefers_db_expiry_override_over_label(admin_client, docker_client):
    clone = seed_clone(docker_client, expires_in=60)
    override = int(time.time()) + 3600
    with session_scope() as session:
        lifecycle_service.set_expiry(session, clone.id, override)

    item = admin_client.get("/api/admin/docker/containers").json()[0]

    assert item["expires_at"] == override


def test_logs_returned_for_kage_container(admin_client, docker_client):
    clone = seed_clone(docker_client)
    response = admin_client.get(f"/api/admin/docker/containers/{clone.id}/logs")
    assert response.json() == {"logs": "booting\nlistening on :80\n"}


def test_kill_removes_container_expiry_and_audits(admin_client, docker_client):
    clone = seed_clone(docker_client)
    with session_scope() as session:
        lifecycle_service.set_expiry(session, clone.id, int(time.time()) + 600)

    response = admin_client.delete(f"/api/admin/docker/containers/{clone.id}")

    assert response.status_code == 200
    assert not docker_client.containers.exists(clone.id)
    assert expiry_of(clone.id) is None
    event = admin_client.get("/api/admin/audit?action=kill_container").json()[0]
    assert event["target"] == clone.id
    # The Jutsu name is captured before removal so the activity feed can show it.
    assert event["meta"]["challenge_name"] == "Web 101"


def test_kill_by_name_cleans_up_expiry_keyed_by_full_id(admin_client, docker_client):
    """Regression: the expiry row is keyed by full ID, not whatever the caller passed."""
    clone = seed_clone(docker_client, name="kage_web_7")
    with session_scope() as session:
        lifecycle_service.set_expiry(session, clone.id, int(time.time()) + 600)

    assert admin_client.delete("/api/admin/docker/containers/kage_web_7").status_code == 200
    assert expiry_of(clone.id) is None


@pytest.mark.parametrize("operation", ["kill", "logs", "extend"])
def test_non_kage_containers_are_off_limits(admin_client, docker_client, operation):
    """Security regression: IDs/names of foreign containers must not be actionable."""
    foreign = docker_client.containers.seed(name="kage-protocol-backend-1", kage=False)

    if operation == "kill":
        response = admin_client.delete("/api/admin/docker/containers/kage-protocol-backend-1")
    elif operation == "logs":
        response = admin_client.get(f"/api/admin/docker/containers/{foreign.id}/logs")
    else:
        response = admin_client.post(f"/api/admin/docker/containers/{foreign.id}/extend", json={"minutes": 30})

    assert response.status_code == 404
    assert docker_client.containers.exists(foreign.id)


def test_extend_adds_to_current_expiry(admin_client, docker_client):
    clone = seed_clone(docker_client, expires_in=600)
    label_expiry = int(clone.labels["expires_at"])

    response = admin_client.post(f"/api/admin/docker/containers/{clone.id}/extend", json={"minutes": 15})

    assert response.status_code == 200
    assert response.json()["expires_at"] == label_expiry + 15 * 60
    assert expiry_of(clone.id) == label_expiry + 15 * 60
    event = admin_client.get("/api/admin/audit?action=extend_ttl").json()[0]
    assert event["meta"]["minutes"] == 15
    assert event["meta"]["challenge_name"] == "Web 101"


def test_extend_of_already_expired_clone_counts_from_now(admin_client, docker_client):
    clone = seed_clone(docker_client, expires_in=-300)  # expired, not yet reaped
    before = int(time.time())

    new_expiry = admin_client.post(
        f"/api/admin/docker/containers/{clone.id}/extend", json={"minutes": 10}
    ).json()["expires_at"]

    assert before + 600 <= new_expiry <= int(time.time()) + 600


@pytest.mark.parametrize("minutes", [0, 1441])
def test_extend_validates_minutes(admin_client, docker_client, minutes):
    clone = seed_clone(docker_client)
    response = admin_client.post(f"/api/admin/docker/containers/{clone.id}/extend", json={"minutes": minutes})
    assert response.status_code == 422


def test_extend_unknown_container_is_404(admin_client):
    response = admin_client.post("/api/admin/docker/containers/nope/extend", json={"minutes": 10})
    assert response.status_code == 404


def test_stats_endpoint_aggregates_clones(admin_client, docker_client):
    seed_clone(docker_client)
    seed_clone(docker_client)

    stats = admin_client.get("/api/admin/docker/stats").json()

    assert stats["total_cpu_percent"] == 40.0
    assert stats["total_memory_usage"] == 2 * 50 * 1024 * 1024
    assert len(stats["containers"]) == 2


def test_images_endpoint_lists_local_images(admin_client):
    assert admin_client.get("/api/admin/docker/images").json() == [
        {"id": "sha256:" + "a" * 64, "tags": ["web101:latest"]}
    ]


def test_spawner_labels_constant_matches_service():
    from app.services.docker_service import SPAWNER_LABEL, SPAWNER_VALUE

    assert SPAWNER_LABELS == {SPAWNER_LABEL: SPAWNER_VALUE}
