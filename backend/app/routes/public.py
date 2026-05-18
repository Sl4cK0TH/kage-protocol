import time
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlmodel import Session, select
from app.core.config import get_settings
from app.core.deps import require_api_key
from app.core.rate_limit import enforce_spawn_rate_limit
from app.db import get_session
from app.models import ChallengeConfig, GlobalSettings
from app.services.audit_service import log_event
from app.services.docker_service import DockerService

router = APIRouter()


def _get_settings(session: Session) -> GlobalSettings:
    settings = session.exec(select(GlobalSettings)).first()
    if not settings:
        settings = GlobalSettings()
        session.add(settings)
        session.commit()
        session.refresh(settings)
    return settings


@router.post("/spawn/{challenge_id}")
def spawn_challenge(
    challenge_id: int,
    session: Session = Depends(get_session),
    request: Request = None,
    api_key: str = Depends(require_api_key),
) -> dict[str, object]:
    challenge = session.get(ChallengeConfig, challenge_id)
    if not challenge:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Challenge not found")

    client_ip = request.client.host if request and request.client else "unknown"
    rate_key = f"{api_key}:{client_ip}"
    try:
        enforce_spawn_rate_limit(rate_key)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Rate limit exceeded")

    settings = _get_settings(session)
    expires_at = int(time.time()) + (settings.default_ttl_minutes * 60)

    docker_service = DockerService()
    result = docker_service.spawn_container(
        image_name=challenge.docker_image_name,
        internal_ports=challenge.internal_ports,
        ram_limit=challenge.ram_limit,
        expires_at=expires_at,
        port_range_start=settings.port_range_start,
        port_range_end=settings.port_range_end,
    )

    assigned_ports = result["assigned_ports"]
    log_event(
        session,
        actor="api_key",
        action="spawn",
        target=str(challenge_id),
        meta={"container_id": result["container_id"], "ip": client_ip},
    )
    return {
        "container_id": result["container_id"],
        "host": get_settings().public_host,
        "port": assigned_ports[0],
        "port_map": result["port_map"],
        "expires_at": expires_at,
    }
