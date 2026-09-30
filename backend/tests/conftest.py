"""
Pytest fixtures for The Kage Protocol backend.

Environment is configured *before* the app is imported: settings are read
once and cached, and ``config.py`` calls ``load_dotenv()``, so every variable
is pinned here to keep a developer's local ``backend/.env`` from leaking in.
"""

import os
import tempfile

import bcrypt

from tests.support import ADMIN_PASSWORD, ADMIN_USERNAME, API_KEY, PUBLIC_HOST, RATE_LIMIT_COUNT

_TMP_DIR = tempfile.mkdtemp(prefix="kage-tests-")

os.environ.update(
    {
        "ADMIN_USERNAME": ADMIN_USERNAME,
        # Minimum bcrypt cost keeps the login-heavy suite fast.
        "ADMIN_PASSWORD_HASH": bcrypt.hashpw(ADMIN_PASSWORD.encode(), bcrypt.gensalt(rounds=4)).decode(),
        "KAGE_API_KEY": API_KEY,
        "SESSION_SECRET": "test-session-secret",
        "SESSION_COOKIE_NAME": "kage_session",
        "SESSION_MAX_AGE_SECONDS": "3600",
        "CORS_ORIGINS": "http://localhost:3000",
        "DB_URL": f"sqlite:///{_TMP_DIR}/kage-test.db",
        "PUBLIC_HOST": PUBLIC_HOST,
        "SPAWN_RATE_LIMIT_COUNT": str(RATE_LIMIT_COUNT),
        "SPAWN_RATE_LIMIT_WINDOW_SECONDS": "60",
        "LOG_LEVEL": "WARNING",
        "JSON_LOGS": "false",
        "CHALLENGE_NETWORK": "kage-challenges-test",
        "DEFAULT_CPU_LIMIT": "0.5",
        "COOKIE_SECURE": "false",
        "AUDIT_RETENTION_DAYS": "90",
    }
)

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlmodel import SQLModel  # noqa: E402

import app.services.docker_service as docker_service_module  # noqa: E402
from app import reaper  # noqa: E402
from app.core import rate_limit  # noqa: E402
from app.db import _get_engine  # noqa: E402
from app.main import app  # noqa: E402
from app.services.docker_service import DockerService  # noqa: E402
from tests.support import FakeDockerClient  # noqa: E402

VALID_JUTSU = {
    "name": "Web 101",
    "description": "Intro web challenge",
    "docker_image_name": "web101:latest",
    "internal_ports": [80],
    "ram_limit": "256m",
    "cpu_limit": 0.5,
}


@pytest.fixture
def docker_client() -> FakeDockerClient:
    return FakeDockerClient()


@pytest.fixture(autouse=True)
def _isolated_state(docker_client: FakeDockerClient):
    """Fresh database, rate limiter, and fake Docker daemon for every test."""
    engine = _get_engine()
    SQLModel.metadata.drop_all(engine)
    SQLModel.metadata.create_all(engine)
    rate_limit._limits.clear()
    reaper._last_audit_prune = 0.0

    # Install a real DockerService wired to the fake client, bypassing
    # __init__ (which would call docker.from_env()). No test can ever reach
    # a real daemon.
    service = DockerService.__new__(DockerService)
    service.client = docker_client
    service._stats_cache = None
    service._stats_cache_ts = 0.0
    docker_service_module._instance = service
    yield
    docker_service_module._instance = None


@pytest.fixture
def docker_service() -> DockerService:
    return docker_service_module.get_docker_service()


@pytest.fixture
def client() -> TestClient:
    # Not used as a context manager, so the lifespan (and the background
    # Reaper task) doesn't start; tests drive the Reaper explicitly.
    return TestClient(app)


@pytest.fixture
def admin_client(client: TestClient) -> TestClient:
    """A client with a logged-in admin session and the CSRF header set."""
    response = client.post("/api/auth/login", json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD})
    assert response.status_code == 200, response.text
    client.headers["X-CSRF-Token"] = client.cookies["kage_csrf"]
    return client


@pytest.fixture
def api_headers() -> dict[str, str]:
    return {"X-Kage-Key": API_KEY}


@pytest.fixture
def jutsu(admin_client: TestClient) -> dict:
    response = admin_client.post("/api/admin/jutsus", json=VALID_JUTSU)
    assert response.status_code == 200, response.text
    return response.json()
