import time
from typing import Any
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
