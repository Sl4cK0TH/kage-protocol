import time
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlmodel import Session
from app.core.config import get_settings
from app.core.deps import require_api_key
from app.core.rate_limit import enforce_spawn_rate_limit
from app.core.logging import get_logger
from app.db import get_session
from app.models import ChallengeConfig, SpawnRequest
from app.services.audit_service import log_event
from app.services.docker_service import get_docker_service
from app.services.settings_service import get_global_settings

logger = get_logger(__name__)

router = APIRouter()


@router.post("/spawn/{challenge_id}")
def spawn_challenge(
    challenge_id: int,
    body: SpawnRequest | None = None,
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

    app_settings = get_settings()
    global_settings = get_global_settings(session)
    expires_at = int(time.time()) + (global_settings.default_ttl_minutes * 60)

    docker_service = get_docker_service()
    result = docker_service.spawn_container(
        image_name=challenge.docker_image_name,
        internal_ports=challenge.internal_ports,
        ram_limit=challenge.ram_limit,
        cpu_limit=challenge.cpu_limit,
        expires_at=expires_at,
        port_range_start=global_settings.port_range_start,
        port_range_end=global_settings.port_range_end,
        network_name=app_settings.challenge_network,
    )

    # Build audit metadata with optional platform info
    meta: dict[str, object] = {
        "container_id": result["container_id"],
        "ip": client_ip,
    }
    if body:
        if body.platform:
            meta["platform"] = body.platform
        if body.team_id:
            meta["team_id"] = body.team_id
        if body.player_id:
            meta["player_id"] = body.player_id

    assigned_ports = result["assigned_ports"]
    log_event(
        session,
        actor="api_key",
        action="spawn",
        target=str(challenge_id),
        meta=meta,
    )

    logger.info(
        "Spawn request: challenge=%d platform=%s ip=%s",
        challenge_id,
        (body.platform if body else "unknown"),
        client_ip,
    )

    return {
        "container_id": result["container_id"],
        "host": app_settings.public_host,
        "port": assigned_ports[0],
        "port_map": result["port_map"],
        "expires_at": expires_at,
    }


# ==========================================
# PUBLIC KILL (CTFd / TryHackMe Stop Button)
# ==========================================
@router.delete("/spawn/{container_id}")
def public_kill_container(
    container_id: str,
    session: Session = Depends(get_session),
    request: Request = None,
    api_key: str = Depends(require_api_key),
) -> dict[str, str]:
    # Rate limit the kill requests to prevent spam
    client_ip = request.client.host if request and request.client else "unknown"
    rate_key = f"{api_key}:kill:{client_ip}"
    try:
        enforce_spawn_rate_limit(rate_key)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Rate limit exceeded")

    docker_service = get_docker_service()
    try:
        docker_service.kill_container(container_id)
        log_event(
            session,
            actor="api_key",
            action="public_kill",
            target=container_id,
            meta={"ip": client_ip},
        )
        return {"status": "success", "message": "Challenge terminated."}
    except Exception:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Container not found or already dead")