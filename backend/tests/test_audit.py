"""Audit log pagination, filtering, summary, and retention."""

import time

import pytest
from sqlmodel import select

from app import reaper
from app.db import session_scope
from app.models import AuditLog
from app.services.audit_service import prune_audit_log

DAY = 86400


def seed_events(*events: tuple[str, int]) -> None:
    """Insert (action, created_at) rows directly."""
    with session_scope() as session:
        for action, created_at in events:
            session.add(AuditLog(created_at=created_at, actor="admin", action=action, target="t", meta={}))
        session.commit()


def all_actions() -> list[str]:
    with session_scope() as session:
        return sorted(row.action for row in session.exec(select(AuditLog)).all())


def test_pagination_with_total_count_header(admin_client):
    now = int(time.time())
    # login (from admin_client) + 6 seeded events = 7 total; seeded ones are newer.
    seed_events(*[(f"event_{i}", now + i) for i in range(6)])

    first = admin_client.get("/api/admin/audit?limit=3&offset=0")
    last = admin_client.get("/api/admin/audit?limit=3&offset=6")

    assert first.headers["X-Total-Count"] == "7"
    assert [e["action"] for e in first.json()] == ["event_5", "event_4", "event_3"]
    assert [e["action"] for e in last.json()] == ["login"]


def test_same_second_events_are_ordered_newest_first(admin_client):
    now = int(time.time()) + 100
    seed_events(("first", now), ("second", now), ("third", now))

    actions = [e["action"] for e in admin_client.get("/api/admin/audit?limit=3").json()]

    assert actions == ["third", "second", "first"]


def test_filter_by_action(admin_client):
    now = int(time.time())
    seed_events(("spawn", now), ("spawn", now), ("kill_container", now))

    response = admin_client.get("/api/admin/audit?action=spawn")

    assert response.headers["X-Total-Count"] == "2"
    assert {e["action"] for e in response.json()} == {"spawn"}


@pytest.mark.parametrize("query", ["limit=0", "limit=501", "offset=-1"])
def test_pagination_bounds_are_validated(admin_client, query):
    assert admin_client.get(f"/api/admin/audit?{query}").status_code == 422


def test_total_count_header_is_exposed_to_the_dashboard_origin(admin_client):
    response = admin_client.get("/api/admin/audit", headers={"Origin": "http://localhost:3000"})

    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert "x-total-count" in response.headers["access-control-expose-headers"].lower()


def test_summary_counts_whole_log_by_action(admin_client):
    now = int(time.time())
    seed_events(("spawn", now), ("spawn", now), ("reap", now))

    summary = admin_client.get("/api/admin/audit/summary").json()

    assert summary == {"total": 4, "by_action": {"login": 1, "spawn": 2, "reap": 1}}


def test_prune_removes_only_entries_past_retention():
    now = int(time.time())
    seed_events(("ancient", now - 100 * DAY), ("old", now - 91 * DAY), ("recent", now - 89 * DAY), ("today", now))

    with session_scope() as session:
        removed = prune_audit_log(session, retention_days=90, now=now)

    assert removed == 2
    assert all_actions() == ["recent", "today"]


def test_zero_retention_keeps_everything():
    seed_events(("ancient", int(time.time()) - 1000 * DAY))

    with session_scope() as session:
        assert prune_audit_log(session, retention_days=0) == 0
    assert all_actions() == ["ancient"]


def test_reaper_applies_retention_at_most_hourly():
    now = int(time.time())
    seed_events(("old", now - 91 * DAY))

    assert reaper._maybe_prune_audit(now=10_000.0) == 1
    seed_events(("old_again", now - 91 * DAY))
    assert reaper._maybe_prune_audit(now=10_000.0 + 60) == 0  # a minute later: skipped
    assert all_actions() == ["old_again"]
    assert reaper._maybe_prune_audit(now=10_000.0 + 3601) == 1  # an hour later: runs
