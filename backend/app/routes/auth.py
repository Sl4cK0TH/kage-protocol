from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel
from app.core.config import get_settings
from app.core.deps import get_current_admin
from app.core.security import create_session_token
from app.db import get_session
from app.services.audit_service import log_event
from sqlmodel import Session

router = APIRouter()


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/login")
def login(payload: LoginRequest, request: Request, response: Response, session: Session = Depends(get_session)) -> dict[str, str]:
    settings = get_settings()
    if payload.username != settings.admin_username or payload.password != settings.admin_password:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    token = create_session_token(payload.username)
    response.set_cookie(
        key=settings.session_cookie_name,
        value=token,
        httponly=True,
        samesite="lax",
        max_age=settings.session_max_age_seconds,
    )
    client_ip = request.client.host if request.client else "unknown"
    log_event(session, actor=payload.username, action="login", target="admin", meta={"ip": client_ip})
    return {"status": "ok"}


@router.post("/logout")
def logout(
    response: Response,
    request: Request,
    session: Session = Depends(get_session),
    admin: str = Depends(get_current_admin),
) -> dict[str, str]:
    settings = get_settings()
    response.delete_cookie(settings.session_cookie_name)
    client_ip = request.client.host if request.client else "unknown"
    log_event(session, actor=admin, action="logout", target="admin", meta={"ip": client_ip})
    return {"status": "ok"}
