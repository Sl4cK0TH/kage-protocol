"""
Double-submit cookie CSRF protection.

On login a non-HttpOnly ``kage_csrf`` cookie is set so the JS frontend
can read it and send it back as an ``X-CSRF-Token`` header on every
state-mutating request.  The ``verify_csrf`` dependency validates that
the header value matches the cookie value.
"""

import secrets
from fastapi import HTTPException, Request, Response, status
from app.core.config import get_settings

CSRF_COOKIE_NAME = "kage_csrf"


def generate_csrf_token() -> str:
    """Return a cryptographically-secure random CSRF token."""
    return secrets.token_hex(32)


def set_csrf_cookie(response: Response, token: str) -> None:
    """Attach the CSRF token as a readable (non-HttpOnly) cookie."""
    settings = get_settings()
    response.set_cookie(
        key=CSRF_COOKIE_NAME,
        value=token,
        httponly=False,  # JS must be able to read it
        samesite="lax",
        secure=settings.cookie_secure,
    )


def verify_csrf(request: Request) -> None:
    """
    FastAPI dependency that validates double-submit CSRF.

    Raises 403 if the ``X-CSRF-Token`` header is missing or does not
    match the ``kage_csrf`` cookie.
    """
    cookie_token = request.cookies.get(CSRF_COOKIE_NAME)
    header_token = request.headers.get("X-CSRF-Token")

    if not cookie_token or not header_token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="CSRF token missing",
        )
    if not secrets.compare_digest(cookie_token, header_token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="CSRF token mismatch",
        )
