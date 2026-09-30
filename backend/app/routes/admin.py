import asyncio
import json
import time
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy import desc
from sqlmodel import Session, select
from app.core.deps import get_current_admin, require_csrf
from app.core.logging import get_logger
from app.db import get_session
from app.models import AuditLog, ChallengeConfig, ChallengeCreate, ChallengeUpdate, GlobalSettings, GlobalSettingsUpdate
from app.services.audit_service import log_event
from app.services.docker_service import get_docker_service, EXPIRES_LABEL
from app.services.settings_service import get_global_settings

logger = get_logger(__name__)
router = APIRouter()

# How often the live SSE snapshot stream pushes container + stats data.
STREAM_INTERVAL_SECONDS = 3
# How often a live log stream re-reads a container's log tail.
LOG_STREAM_INTERVAL_SECONDS = 1.5
LOG_STREAM_TAIL = 400


def _build_container_view() -> list[dict[str, object]]:
    """
    List Kage containers and annotate each with expiry / countdown fields.

    Shared by the REST ``/docker/containers`` route and the live SSE
    ``/stream`` endpoint so both return an identical shape.
    """
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
    return _build_container_view()


@router.get("/docker/containers/{container_id}/logs", dependencies=[Depends(get_current_admin)])
def container_logs(container_id: str) -> dict[str, str]:
    return {"logs": get_docker_service().container_logs(container_id)}


# ---------------------------------------------------------------------------
# Live streams (Server-Sent Events)
# ---------------------------------------------------------------------------

@router.get("/stream")
async def stream_snapshots(request: Request, admin: str = Depends(get_current_admin)) -> StreamingResponse:
    """
    Push a live snapshot of every Kage container plus aggregate stats over
    Server-Sent Events, replacing frontend polling.

    Emits an ``event: snapshot`` frame every ``STREAM_INTERVAL_SECONDS`` with
    ``{"containers": [...], "stats": {...}, "ts": <epoch>}``. The blocking
    Docker calls are offloaded to a thread so the event loop stays responsive.
    """

    async def event_generator():
        docker_service = get_docker_service()
        # Prime the client immediately so the UI has data before the first tick.
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    containers = await asyncio.to_thread(_build_container_view)
                    stats = await asyncio.to_thread(docker_service.get_kage_stats)
                    payload = json.dumps({"containers": containers, "stats": stats, "ts": int(time.time())})
                    yield f"event: snapshot\ndata: {payload}\n\n"
                except Exception as exc:  # keep the stream alive through transient Docker errors
                    logger.warning("Snapshot stream tick failed: %s", exc)
                    yield f"event: error\ndata: {json.dumps({'detail': 'snapshot failed'})}\n\n"
                await asyncio.sleep(STREAM_INTERVAL_SECONDS)
        except asyncio.CancelledError:  # client disconnected / server shutdown
            raise

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # disable proxy buffering (nginx)
        },
    )


@router.get("/docker/containers/{container_id}/logs/stream")
async def stream_container_logs(
    container_id: str,
    request: Request,
    admin: str = Depends(get_current_admin),
) -> StreamingResponse:
    """
    Live-tail a single container's logs over SSE.

    Re-reads the log tail on a short interval and emits it as an
    ``event: logs`` frame. Using a periodic tail read (rather than a blocking
    follow generator) keeps disconnect handling clean and predictable.
    """

    async def event_generator():
        docker_service = get_docker_service()
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    logs = await asyncio.to_thread(docker_service.container_logs, container_id, LOG_STREAM_TAIL)
                    yield f"event: logs\ndata: {json.dumps({'logs': logs})}\n\n"
                except HTTPException:
                    # Container vanished (reaped/killed) — tell the client and stop.
                    yield f"event: gone\ndata: {json.dumps({'detail': 'container not found'})}\n\n"
                    break
                except Exception as exc:
                    logger.warning("Log stream tick failed for %s: %s", container_id[:12], exc)
                    break
                await asyncio.sleep(LOG_STREAM_INTERVAL_SECONDS)
        except asyncio.CancelledError:
            raise

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


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
        challenge_id=challenge.id,
        challenge_name=challenge.name,
    )

    client_ip = request.client.host if request.client else "unknown"
    assigned_ports = result["assigned_ports"]

    log_event(
        session,
        actor=admin,
        action="admin_spawn",
        target=str(jutsu_id),
        meta={"container_id": result["container_id"], "ip": client_ip, "challenge_name": challenge.name},
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

