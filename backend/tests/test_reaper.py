"""The Reaper: expiry resolution, cleanup, and fault isolation."""

import asyncio
import time

from sqlmodel import select

from app import reaper
from app.db import session_scope
from app.models import AuditLog, ContainerExpiry
from app.services import lifecycle_service


def seed_clone(docker_client, *, label_expires_in: int, name: str | None = None):
    return docker_client.containers.seed(
        name=name,
        labels={"expires_at": str(int(time.time()) + label_expires_in), "kage_challenge_name": "Web 101"},
    )


def set_override(container_id: str, expires_in: int) -> None:
    with session_scope() as session:
        lifecycle_service.set_expiry(session, container_id, int(time.time()) + expires_in)


def reap() -> int:
    return asyncio.run(reaper._reap_once())


def test_reaps_expired_and_keeps_live_clones(docker_client):
    expired = seed_clone(docker_client, label_expires_in=-60)
    live = seed_clone(docker_client, label_expires_in=600)

    assert reap() == 1
    assert not docker_client.containers.exists(expired.id)
    assert docker_client.containers.exists(live.id)


def test_reap_is_audited_for_the_activity_feed(docker_client):
    expired = seed_clone(docker_client, label_expires_in=-180)

    reap()

    with session_scope() as session:
        event = session.exec(select(AuditLog)).one()
    assert (event.actor, event.action, event.target) == ("reaper", "reap", expired.id)
    assert event.meta == {"challenge_name": "Web 101", "expired_minutes": 3}


def test_extended_ttl_overrides_expired_label(docker_client):
    clone = seed_clone(docker_client, label_expires_in=-60)
    set_override(clone.id, expires_in=600)

    assert reap() == 0
    assert docker_client.containers.exists(clone.id)


def test_expired_override_wins_over_future_label(docker_client):
    clone = seed_clone(docker_client, label_expires_in=600)
    set_override(clone.id, expires_in=-60)

    assert reap() == 1
    assert not docker_client.containers.exists(clone.id)
    with session_scope() as session:
        assert lifecycle_service.get_expiry(session, clone.id) is None


def test_orphaned_expiry_rows_are_pruned(docker_client):
    live = seed_clone(docker_client, label_expires_in=600)
    set_override(live.id, expires_in=600)
    set_override("gone-" + "0" * 59, expires_in=600)

    reap()

    with session_scope() as session:
        remaining = [row.container_id for row in session.exec(select(ContainerExpiry)).all()]
    assert remaining == [live.id]


def test_one_failed_kill_does_not_stop_the_cycle(docker_client):
    stuck = seed_clone(docker_client, label_expires_in=-60)
    stuck.remove_error = RuntimeError("daemon hiccup")
    other = seed_clone(docker_client, label_expires_in=-60)

    assert reap() == 1
    assert docker_client.containers.exists(stuck.id)
    assert not docker_client.containers.exists(other.id)


def test_non_kage_containers_are_never_reaped(docker_client):
    foreign = docker_client.containers.seed(
        kage=False, labels={"expires_at": str(int(time.time()) - 3600)}
    )

    assert reap() == 0
    assert docker_client.containers.exists(foreign.id)
