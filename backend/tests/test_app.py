"""App-level wiring: health check and the startup/shutdown lifespan."""

from fastapi.testclient import TestClient

from app.main import app


def test_health_reports_healthy(client):
    assert client.get("/api/health").json() == {"status": "healthy", "docker": True, "database": True}


def test_health_reports_degraded_when_docker_is_down(client, docker_client):
    docker_client.reachable = False

    body = client.get("/api/health").json()

    assert body["status"] == "degraded"
    assert body["docker"] is False


def test_lifespan_starts_and_stops_cleanly(docker_client):
    with TestClient(app) as client:
        assert client.get("/").json() == {"status": "ok", "service": "kage-protocol"}
        # Startup ensures the isolated challenge network exists.
        assert "kage-challenges-test" in docker_client.networks.names
