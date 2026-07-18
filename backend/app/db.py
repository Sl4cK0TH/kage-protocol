from typing import Generator
from sqlmodel import SQLModel, Session, create_engine
from sqlalchemy import Engine
from app.core.config import get_settings

_engine: Engine | None = None


def _get_engine() -> Engine:
    """Lazily create the SQLAlchemy engine on first use."""
    global _engine
    if _engine is None:
        settings = get_settings()
        connect_args = {}
        if settings.db_url.startswith("sqlite"):
            connect_args = {"check_same_thread": False}
        _engine = create_engine(settings.db_url, connect_args=connect_args)
    return _engine


def init_db() -> None:
    SQLModel.metadata.create_all(_get_engine())


def get_session() -> Generator[Session, None, None]:
    """
    Yield a SQLModel session and guarantee cleanup via try/finally.

    This prevents connection leaks when used as a FastAPI dependency.
    """
    session = Session(_get_engine())
    try:
        yield session
    finally:
        session.close()
