import time
from typing import Any
from sqlalchemy import delete
from sqlmodel import Session
from app.models import AuditLog


def log_event(session: Session, actor: str, action: str, target: str, meta: dict[str, Any] | None = None) -> None:
    entry = AuditLog(
        created_at=int(time.time()),
        actor=actor,
        action=action,
        target=target,
        meta=meta or {},
    )
    session.add(entry)
    session.commit()


def prune_audit_log(session: Session, retention_days: int, now: int | None = None) -> int:
    """
    Delete audit entries older than ``retention_days``. Returns rows removed.

    A retention of 0 disables pruning (keep everything forever).
    """
    if retention_days <= 0:
        return 0
    cutoff = (now if now is not None else int(time.time())) - retention_days * 86400
    result = session.exec(delete(AuditLog).where(AuditLog.created_at < cutoff))
    session.commit()
    return result.rowcount or 0
