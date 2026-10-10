import asyncio
import json
import threading
import time
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy import desc, func
from sqlmodel import Session, select
from app.core.deps import get_current_admin, require_csrf
from app.core.logging import get_logger
from app.db import get_session, session_scope
from app.models import (
    AuditLog,
    ChallengeConfig,
    ChallengeCreate,
    ChallengeUpdate,
    ExtendRequest,
    GlobalSettings,
    GlobalSettingsUpdate,
)
from app.services.audit_service import log_event
from app.services.docker_service import get_docker_service, EXPIRES_LABEL
from app.services import lifecycle_service
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
    # A DB expiry override (set when a clone's TTL is extended) takes precedence
    # over the immutable ``expires_at`` label baked in at spawn time.
    with session_scope() as session:
        overrides = lifecycle_service.get_all_expiries(session)
    for item in items:
        label_expiry = item.get("labels", {}).get(EXPIRES_LABEL)
        expires_at = overrides.get(item["id"])
        if expires_at is None and label_expiry and str(label_expiry).isdigit():
            expires_at = int(label_expiry)
        if expires_at is not None:
            item["expires_at"] = expires_at
            item["time_remaining_seconds"] = max(0, expires_at - now)
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
    # log_event commits, which expires `jutsu`; reload it or it serializes as {}.
    session.refresh(jutsu)
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
    session.refresh(jutsu)  # see create_jutsu
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

    # The update is partial, so validate the port range against the merged
    # result: an inverted range would make every spawn fail with "no ports".
    start = data.get("port_range_start", settings.port_range_start)
    end = data.get("port_range_end", settings.port_range_end)
    if start > end:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="port_range_start must be less than or equal to port_range_end",
        )

    for key, value in data.items():
        setattr(settings, key, value)
    session.add(settings)
    session.commit()
    session.refresh(settings)
    client_ip = request.client.host if request.client else "unknown"
    log_event(session, actor=admin, action="update_settings", target="global", meta={"ip": client_ip})
    session.refresh(settings)  # see create_jutsu
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


@router.get("/docker/images/pull/stream")
async def stream_image_pull(
    image: str,
    request: Request,
    admin: str = Depends(get_current_admin),
) -> StreamingResponse:
    """
    Pull a Docker image and stream progress to the client over SSE.

    The blocking pull generator runs in a worker thread that feeds an asyncio
    queue; the event loop drains it and forwards ``progress`` frames, ending
    with ``done`` or ``error``. Keepalive comments prevent idle connections
    from being dropped by intermediaries.
    """
    if not image or not image.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Image name is required")

    loop = asyncio.get_running_loop()
    queue: asyncio.Queue = asyncio.Queue()
    SENTINEL = object()

    def worker() -> None:
        try:
            for line in get_docker_service().pull_image(image):
                loop.call_soon_threadsafe(queue.put_nowait, ("progress", line))
        except Exception as exc:  # surface pull failures to the client
            loop.call_soon_threadsafe(queue.put_nowait, ("error", str(exc)))
        finally:
            loop.call_soon_threadsafe(queue.put_nowait, (SENTINEL, None))

    async def event_generator():
        threading.Thread(target=worker, name="image-pull", daemon=True).start()
        while True:
            if await request.is_disconnected():
                break
            try:
                kind, payload = await asyncio.wait_for(queue.get(), timeout=1.0)
            except asyncio.TimeoutError:
                yield ": keepalive\n\n"
                continue
            if kind is SENTINEL:
                yield f"event: done\ndata: {json.dumps({'image': image})}\n\n"
                break
            if kind == "error":
                logger.warning("Image pull failed for %s: %s", image, payload)
                yield f"event: error\ndata: {json.dumps({'detail': payload})}\n\n"
                break
            yield f"event: progress\ndata: {json.dumps(payload)}\n\n"

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
    killed = get_docker_service().kill_container(container_id)
    lifecycle_service.remove_expiry(session, killed["id"])
    client_ip = request.client.host if request.client else "unknown"
    log_event(
        session,
        actor=admin,
        action="kill_container",
        target=killed["id"],
        meta={"ip": client_ip, "challenge_name": killed["challenge_name"]},
    )
    return {"status": "killed"}


@router.post(
    "/docker/containers/{container_id}/extend",
    dependencies=[Depends(get_current_admin), Depends(require_csrf)],
)
def extend_container(
    container_id: str,
    payload: ExtendRequest,
    request: Request,
    session: Session = Depends(get_session),
    admin: str = Depends(get_current_admin),
) -> dict[str, object]:
    """Extend a running clone's TTL, resetting the Reaper's countdown for it."""
    # Confirm the container is a live Kage clone and read its current expiry.
    container = next((c for c in _build_container_view() if c["id"].startswith(container_id) or c["id"] == container_id), None)
    if not container:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Container not found")

    now = int(time.time())
    # Extend from the later of "now" and the current expiry so extending an
    # already-expired-but-not-yet-reaped clone still yields the full window.
    current_expiry = container.get("expires_at")
    base = max(now, int(current_expiry)) if current_expiry else now
    new_expiry = base + payload.minutes * 60

    lifecycle_service.set_expiry(session, container["id"], new_expiry)

    client_ip = request.client.host if request.client else "unknown"
    log_event(
        session,
        actor=admin,
        action="extend_ttl",
        target=container["id"],
        meta={
            "ip": client_ip,
            "minutes": payload.minutes,
            "expires_at": new_expiry,
            "challenge_name": container.get("challenge_name"),
        },
    )
    return {
        "container_id": container["id"],
        "expires_at": new_expiry,
        "time_remaining_seconds": max(0, new_expiry - now),
    }


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

    # Record the authoritative (mutable) expiry so the TTL can be extended later.
    lifecycle_service.set_expiry(session, result["container_id"], expires_at)

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

AUDIT_MAX_PAGE_SIZE = 500


@router.get("/audit", dependencies=[Depends(get_current_admin)])
def list_audit(
    response: Response,
    session: Session = Depends(get_session),
    limit: int = Query(50, ge=1, le=AUDIT_MAX_PAGE_SIZE),
    offset: int = Query(0, ge=0),
    action: str | None = Query(None, max_length=64),
) -> list[AuditLog]:
    """
    Page through the audit log, newest first, optionally filtered by action.

    The body stays a plain list for backward compatibility; the total number
    of matching rows is returned in the ``X-Total-Count`` header.
    """
    statement = select(AuditLog)
    count_statement = select(func.count()).select_from(AuditLog)
    if action:
        statement = statement.where(AuditLog.action == action)
        count_statement = count_statement.where(AuditLog.action == action)

    response.headers["X-Total-Count"] = str(session.exec(count_statement).one())
    # id breaks ties between events logged within the same second.
    statement = statement.order_by(desc(AuditLog.created_at), desc(AuditLog.id)).offset(offset).limit(limit)
    return session.exec(statement).all()


@router.get("/audit/summary", dependencies=[Depends(get_current_admin)])
def audit_summary(session: Session = Depends(get_session)) -> dict[str, object]:
    """Event counts across the whole audit log, grouped by action."""
    rows = session.exec(select(AuditLog.action, func.count()).group_by(AuditLog.action)).all()
    by_action = {action: count for action, count in rows}
    return {"total": sum(by_action.values()), "by_action": by_action}

