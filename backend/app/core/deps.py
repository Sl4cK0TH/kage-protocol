from fastapi import HTTPException, Request, status
from app.core.config import get_settings
from app.core.security import verify_session_token
from app.core.csrf import verify_csrf as _verify_csrf


def get_current_admin(request: Request) -> str:
    """Validate the admin session cookie and return the username."""
    settings = get_settings()
    token = request.cookies.get(settings.session_cookie_name)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    username = verify_session_token(token, settings.session_max_age_seconds)
    if not username or username != settings.admin_username:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session")
    return username


def require_api_key(request: Request) -> str:
    """Validate the ``X-Kage-Key`` header for public API endpoints."""
    settings = get_settings()
    api_key = request.headers.get("X-Kage-Key")
    if not api_key or api_key != settings.kage_api_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")
    return api_key


def require_csrf(request: Request) -> None:
    """
    FastAPI dependency for CSRF validation on state-mutating admin routes.

    Delegates to the double-submit cookie implementation in ``csrf.py``.
    """
    _verify_csrf(request)
