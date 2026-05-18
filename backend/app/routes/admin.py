import time
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import desc
from sqlmodel import Session, select
from app.core.deps import get_current_admin
from app.db import get_session
from app.models import AuditLog, ChallengeConfig, ChallengeCreate, ChallengeUpdate, GlobalSettings, GlobalSettingsUpdate
from app.services.audit_service import log_event
from app.services.docker_service import DockerService, EXPIRES_LABEL

router = APIRouter()


def _get_settings(session: Session) -> GlobalSettings:
    settings = session.exec(select(GlobalSettings)).first()
    if not settings:
        settings = GlobalSettings()
        session.add(settings)
        session.commit()
        session.refresh(settings)
    return settings


@router.get("/jutsus", dependencies=[Depends(get_current_admin)])
def list_jutsus(session: Session = Depends(get_session)) -> list[ChallengeConfig]:
    return session.exec(select(ChallengeConfig)).all()


@router.post("/jutsus", dependencies=[Depends(get_current_admin)])
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


@router.put("/jutsus/{jutsu_id}", dependencies=[Depends(get_current_admin)])
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


@router.delete("/jutsus/{jutsu_id}", dependencies=[Depends(get_current_admin)])
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


@router.get("/settings", dependencies=[Depends(get_current_admin)])
def get_settings(session: Session = Depends(get_session)) -> GlobalSettings:
    return _get_settings(session)


@router.put("/settings", dependencies=[Depends(get_current_admin)])
def update_settings(
    payload: GlobalSettingsUpdate,
    request: Request,
    session: Session = Depends(get_session),
    admin: str = Depends(get_current_admin),
) -> GlobalSettings:
    settings = _get_settings(session)
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(settings, key, value)
    session.add(settings)
    session.commit()
    session.refresh(settings)
    client_ip = request.client.host if request.client else "unknown"
    log_event(session, actor=admin, action="update_settings", target="global", meta={"ip": client_ip})
    return settings


@router.get("/docker/images", dependencies=[Depends(get_current_admin)])
def list_images() -> list[dict[str, object]]:
    docker_service = DockerService()
    return docker_service.list_images()


@router.get("/docker/stats", dependencies=[Depends(get_current_admin)])
def docker_stats() -> dict[str, object]:
    docker_service = DockerService()
    return docker_service.get_kage_stats()


@router.get("/docker/containers", dependencies=[Depends(get_current_admin)])
def list_containers() -> list[dict[str, object]]:
    docker_service = DockerService()
    items = docker_service.list_kage_containers()
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
    docker_service = DockerService()
    return {"logs": docker_service.container_logs(container_id)}


@router.delete("/docker/containers/{container_id}", dependencies=[Depends(get_current_admin)])
def kill_container(
    container_id: str,
    request: Request,
    session: Session = Depends(get_session),
    admin: str = Depends(get_current_admin),
) -> dict[str, str]:
    docker_service = DockerService()
    docker_service.kill_container(container_id)
    client_ip = request.client.host if request.client else "unknown"
    log_event(session, actor=admin, action="kill_container", target=container_id, meta={"ip": client_ip})
    return {"status": "killed"}


@router.get("/audit", dependencies=[Depends(get_current_admin)])
def list_audit(session: Session = Depends(get_session), limit: int = 50) -> list[AuditLog]:
    statement = select(AuditLog).order_by(desc(AuditLog.created_at)).limit(limit)
    return session.exec(statement).all()
