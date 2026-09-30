"""Server-Sent Event endpoints, driven directly (see support.collect_sse)."""

import time

from app.routes import admin
from tests.support import collect_sse, connected_request


def test_snapshot_stream_emits_containers_and_stats(docker_client):
    docker_client.containers.seed(
        labels={"expires_at": str(int(time.time()) + 600), "kage_challenge_name": "Web 101"}
    )

    frames = collect_sse(lambda: admin.stream_snapshots(connected_request(), admin="admin"), limit=1)

    event, data = frames[0]
    assert event == "snapshot"
    assert data["containers"][0]["challenge_name"] == "Web 101"
    assert data["containers"][0]["time_remaining_seconds"] > 0
    assert data["stats"]["total_cpu_percent"] == 20.0
    assert isinstance(data["ts"], int)


def test_snapshot_stream_survives_docker_errors(docker_client, monkeypatch):
    def boom():
        raise RuntimeError("daemon down")

    monkeypatch.setattr(admin, "_build_container_view", boom)

    frames = collect_sse(lambda: admin.stream_snapshots(connected_request(), admin="admin"), limit=1)

    assert frames == [("error", {"detail": "snapshot failed"})]


def test_log_stream_tails_container_logs(docker_client):
    clone = docker_client.containers.seed()

    frames = collect_sse(
        lambda: admin.stream_container_logs(clone.id, connected_request(), admin="admin"), limit=1
    )

    assert frames == [("logs", {"logs": "booting\nlistening on :80\n"})]


def test_log_stream_reports_gone_for_missing_or_foreign_containers(docker_client):
    foreign = docker_client.containers.seed(kage=False)

    for target in ("missing-container", foreign.id):
        frames = collect_sse(
            lambda: admin.stream_container_logs(target, connected_request(), admin="admin"), limit=5
        )
        assert frames == [("gone", {"detail": "container not found"})]


def test_pull_stream_forwards_progress_then_done(docker_client):
    frames = collect_sse(
        lambda: admin.stream_image_pull("web101:v2", connected_request(), admin="admin"),
        stop_on=("done", "error"),
        limit=10,
    )

    assert [event for event, _ in frames] == ["progress", "progress", "progress", "done"]
    assert frames[1][1]["progress"] == "[=====>    ] 5MB/10MB"
    assert frames[-1][1] == {"image": "web101:v2"}
    assert docker_client.api.pull_calls == [("web101", "v2")]


def test_pull_stream_reports_errors(docker_client):
    docker_client.api.pull_error = RuntimeError("manifest unknown")

    frames = collect_sse(
        lambda: admin.stream_image_pull("ghost:latest", connected_request(), admin="admin"),
        stop_on=("done", "error"),
        limit=10,
    )

    assert frames == [("error", {"detail": "manifest unknown"})]


def test_pull_stream_requires_an_image(admin_client):
    response = admin_client.get("/api/admin/docker/images/pull/stream", params={"image": "  "})
    assert response.status_code == 400
