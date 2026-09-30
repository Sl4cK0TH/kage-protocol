"""
Container lifecycle helpers — mutable expiry overrides.

Docker container labels are immutable, so a clone's TTL can't be extended by
rewriting its ``expires_at`` label. These helpers persist an authoritative
expiry per container in the database, which the container view and the Reaper
prefer over the original label when present.
"""

from sqlmodel import Session, select

from app.models import ContainerExpiry


def set_expiry(session: Session, container_id: str, expires_at: int) -> None:
    """Insert or update the expiry override for a container."""
    row = session.get(ContainerExpiry, container_id)
    if row:
        row.expires_at = expires_at
    else:
        row = ContainerExpiry(container_id=container_id, expires_at=expires_at)
    session.add(row)
    session.commit()


def get_expiry(session: Session, container_id: str) -> int | None:
    """Return the expiry override for a container, or None if unset."""
    row = session.get(ContainerExpiry, container_id)
    return row.expires_at if row else None


def get_all_expiries(session: Session) -> dict[str, int]:
    """Return a mapping of container_id -> expiry for every override row."""
    return {row.container_id: row.expires_at for row in session.exec(select(ContainerExpiry)).all()}


def remove_expiry(session: Session, container_id: str) -> None:
    """Delete a container's expiry override if one exists (e.g. after a kill)."""
    row = session.get(ContainerExpiry, container_id)
    if row:
        session.delete(row)
        session.commit()
