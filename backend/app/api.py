from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlmodel import Session

from app.db import get_session
from app.routes import admin, auth, public
from app.services.docker_service import get_docker_service
from app.core.logging import get_logger

logger = get_logger(__name__)

api_router = APIRouter(prefix="/api")
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(public.router, tags=["public"])
api_router.include_router(admin.router, prefix="/admin", tags=["admin"])


@api_router.get("/health", tags=["health"])
def health_check(session: Session = Depends(get_session)) -> dict[str, object]:
    """
    Health check endpoint that verifies:
    - Docker daemon connectivity
    - SQLite database accessibility
    """
    # Check Docker
    docker_ok = False
    try:
        docker_ok = get_docker_service().ping()
    except Exception as exc:
        logger.error("Health check — Docker ping failed: %s", exc)

    # Check database
    db_ok = False
    try:
        session.execute(text("SELECT 1"))
        db_ok = True
    except Exception as exc:
        logger.error("Health check — Database query failed: %s", exc)

    healthy = docker_ok and db_ok
    return {
        "status": "healthy" if healthy else "degraded",
        "docker": docker_ok,
        "database": db_ok,
    }
