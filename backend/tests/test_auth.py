import pytest
from sqlmodel import select

from app.core.security import create_session_token
from app.db import session_scope
from app.models import AuditLog
from tests.conftest import VALID_JUTSU
from tests.support import ADMIN_PASSWORD, ADMIN_USERNAME


def audit_actions() -> list[str]:
    with session_scope() as session:
        return [row.action for row in session.exec(select(AuditLog).order_by(AuditLog.id)).all()]


@pytest.mark.parametrize(
    "username, password",
    [(ADMIN_USERNAME, "wrong-password"), ("mallory", ADMIN_PASSWORD)],
    ids=["wrong-password", "unknown-user"],
)
def test_login_rejects_bad_credentials(client, username, password):
    response = client.post("/api/auth/login", json={"username": username, "password": password})

    assert response.status_code == 401
    assert "kage_session" not in client.cookies
    assert audit_actions() == []


def test_login_sets_session_and_csrf_cookies(admin_client):
    assert admin_client.cookies.get("kage_session")
    assert admin_client.cookies.get("kage_csrf")
    assert admin_client.get("/api/admin/jutsus").status_code == 200
    assert audit_actions() == ["login"]


@pytest.mark.parametrize(
    "path",
    [
        "/api/admin/jutsus",
        "/api/admin/settings",
        "/api/admin/docker/containers",
        "/api/admin/docker/stats",
        "/api/admin/audit",
        "/api/admin/audit/summary",
        "/api/admin/stream",
        "/api/admin/docker/containers/abc/logs/stream",
        "/api/admin/docker/images/pull/stream?image=nginx",
    ],
)
def test_admin_routes_require_session(client, path):
    assert client.get(path).status_code == 401


def test_forged_session_cookie_rejected(client):
    response = client.get("/api/admin/jutsus", headers={"Cookie": "kage_session=forged.token.value"})
    assert response.status_code == 401


def test_validly_signed_session_for_other_user_rejected(client):
    token = create_session_token("mallory")
    response = client.get("/api/admin/jutsus", headers={"Cookie": f"kage_session={token}"})
    assert response.status_code == 401


def test_mutation_without_csrf_header_rejected(admin_client):
    del admin_client.headers["X-CSRF-Token"]

    response = admin_client.post("/api/admin/jutsus", json=VALID_JUTSU)

    assert response.status_code == 403
    assert admin_client.get("/api/admin/jutsus").json() == []


def test_mutation_with_mismatched_csrf_header_rejected(admin_client):
    admin_client.headers["X-CSRF-Token"] = "0" * 64

    response = admin_client.post("/api/admin/jutsus", json=VALID_JUTSU)

    assert response.status_code == 403


def test_logout_ends_session(admin_client):
    response = admin_client.post("/api/auth/logout")

    assert response.status_code == 200
    assert admin_client.get("/api/admin/jutsus").status_code == 401
    assert audit_actions() == ["login", "logout"]
