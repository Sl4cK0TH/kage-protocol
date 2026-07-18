import time
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import desc
from sqlmodel import Session, select
from app.core.deps import get_current_admin, require_csrf
from app.db import get_session
from app.models import AuditLog, ChallengeConfig, ChallengeCreate, ChallengeUpdate, GlobalSettings, GlobalSettingsUpdate
from app.services.audit_service import log_event
from app.services.docker_service import get_docker_service, EXPIRES_LABEL
from app.services.settings_service import get_global_settings

router = APIRouter()


# ---------------------------------------------------------------------------
# Jutsu CRUD
# ---------------------------------------------------------------------------

@router.get("/jutsus", dependencies=[Depends(get_current_admin)])
def list_jutsus(session: Session = Depends(get_session)) -> list[ChallengeConfig]:
    return session.exec(select(ChallengeConfig)).all()


@router.post("/jutsus", dependencies=[Depends(get_current_admin), Depends(require_csrf)])
def create_jutsu(
    payload: ChallengeCreate,
    request: Request,
    session: Session = Depends(get_session),
    admin: str = Depends(get_current_admin),
) -> ChallengeConfig:
    jutsu = ChallengeConfig.model_validate(payload)
    session.add(jutsu)
    session.commit()
    session.refresh(jutsu)
    client_ip = request.client.host if request.client else "unknown"
    log_event(session, actor=admin, action="create_jutsu", target=str(jutsu.id), meta={"ip": client_ip})
    return jutsu


@router.get("/jutsus/{jutsu_id}", dependencies=[Depends(get_current_admin)])
def get_jutsu(jutsu_id: int, session: Session = Depends(get_session)) -> ChallengeConfig:
    jutsu = session.get(ChallengeConfig, jutsu_id)
    if not jutsu:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Challenge not found")
    return jutsu


@router.put("/jutsus/{jutsu_id}", dependencies=[Depends(get_current_admin), Depends(require_csrf)])
def update_jutsu(
    jutsu_id: int,
    payload: ChallengeUpdate,
    request: Request,
    session: Session = Depends(get_session),
    admin: str = Depends(get_current_admin),
) -> ChallengeConfig:
    jutsu = session.get(ChallengeConfig, jutsu_id)
    if not jutsu:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Challenge not found")

    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(jutsu, key, value)

    session.add(jutsu)
    session.commit()
    session.refresh(jutsu)
    client_ip = request.client.host if request.client else "unknown"
    log_event(session, actor=admin, action="update_jutsu", target=str(jutsu.id), meta={"ip": client_ip})
    return jutsu


@router.delete("/jutsus/{jutsu_id}", dependencies=[Depends(get_current_admin), Depends(require_csrf)])
def delete_jutsu(
    jutsu_id: int,
    request: Request,
    session: Session = Depends(get_session),
    admin: str = Depends(get_current_admin),
) -> dict[str, str]:
    jutsu = session.get(ChallengeConfig, jutsu_id)
    if not jutsu:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Challenge not found")
    session.delete(jutsu)
    session.commit()
    client_ip = request.client.host if request.client else "unknown"
    log_event(session, actor=admin, action="delete_jutsu", target=str(jutsu_id), meta={"ip": client_ip})
    return {"status": "deleted"}


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

@router.get("/settings", dependencies=[Depends(get_current_admin)])
def get_settings_route(session: Session = Depends(get_session)) -> GlobalSettings:
    return get_global_settings(session)


@router.put("/settings", dependencies=[Depends(get_current_admin), Depends(require_csrf)])
def update_settings(
    payload: GlobalSettingsUpdate,
    request: Request,
    session: Session = Depends(get_session),
    admin: str = Depends(get_current_admin),
) -> GlobalSettings:
    settings = get_global_settings(session)
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(settings, key, value)
    session.add(settings)
    session.commit()
    session.refresh(settings)
    client_ip = request.client.host if request.client else "unknown"
    log_event(session, actor=admin, action="update_settings", target="global", meta={"ip": client_ip})
    return settings


# ---------------------------------------------------------------------------
# Docker operations
# ---------------------------------------------------------------------------

@router.get("/docker/images", dependencies=[Depends(get_current_admin)])
def list_images() -> list[dict[str, object]]:
    return get_docker_service().list_images()


@router.get("/docker/stats", dependencies=[Depends(get_current_admin)])
def docker_stats() -> dict[str, object]:
    return get_docker_service().get_kage_stats()


@router.get("/docker/containers", dependencies=[Depends(get_current_admin)])
def list_containers() -> list[dict[str, object]]:
    items = get_docker_service().list_kage_containers()
    now = int(time.time())

    for item in items:
        expires_at = item.get("labels", {}).get(EXPIRES_LABEL)
        if expires_at and str(expires_at).isdigit():
            expires_at_int = int(expires_at)
            item["expires_at"] = expires_at_int
            item["time_remaining_seconds"] = max(0, expires_at_int - now)
        else:
            item["expires_at"] = None
            item["time_remaining_seconds"] = None
    return items


@router.get("/docker/containers/{container_id}/logs", dependencies=[Depends(get_current_admin)])
def container_logs(container_id: str) -> dict[str, str]:
    return {"logs": get_docker_service().container_logs(container_id)}


@router.delete("/docker/containers/{container_id}", dependencies=[Depends(get_current_admin), Depends(require_csrf)])
def kill_container(
    container_id: str,
    request: Request,
    session: Session = Depends(get_session),
    admin: str = Depends(get_current_admin),
) -> dict[str, str]:
    get_docker_service().kill_container(container_id)
    client_ip = request.client.host if request.client else "unknown"
    log_event(session, actor=admin, action="kill_container", target=container_id, meta={"ip": client_ip})
    return {"status": "killed"}


# ---------------------------------------------------------------------------
# Admin spawn (avoids leaking API key to the frontend)
# ---------------------------------------------------------------------------

@router.post("/spawn/{jutsu_id}", dependencies=[Depends(get_current_admin), Depends(require_csrf)])
def admin_spawn(
    jutsu_id: int,
    request: Request,
    session: Session = Depends(get_session),
    admin: str = Depends(get_current_admin),
) -> dict[str, object]:
    """
    Spawn a challenge container from the admin dashboard.

    This endpoint exists so the frontend doesn't need to embed the
    public API key (``NEXT_PUBLIC_KAGE_KEY``) in the client-side JS
    bundle — preventing key leakage via browser DevTools.
    """
    from app.core.config import get_settings as _get_settings

    challenge = session.get(ChallengeConfig, jutsu_id)
    if not challenge:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Challenge not found")

    app_settings = _get_settings()
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

    client_ip = request.client.host if request.client else "unknown"
    assigned_ports = result["assigned_ports"]

    log_event(
        session,
        actor=admin,
        action="admin_spawn",
        target=str(jutsu_id),
        meta={"container_id": result["container_id"], "ip": client_ip},
    )

    return {
        "container_id": result["container_id"],
        "host": app_settings.public_host,
        "port": assigned_ports[0],
        "port_map": result["port_map"],
        "expires_at": expires_at,
    }


# ---------------------------------------------------------------------------
# Audit log
# ---------------------------------------------------------------------------

@router.get("/audit", dependencies=[Depends(get_current_admin)])
def list_audit(session: Session = Depends(get_session), limit: int = 50) -> list[AuditLog]:
    statement = select(AuditLog).order_by(desc(AuditLog.created_at)).limit(limit)
    return session.exec(statement).all()

