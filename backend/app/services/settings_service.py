"""
Shared helper for loading GlobalSettings from the database.

Previously duplicated in admin.py and public.py — now centralised.
"""

from sqlmodel import Session, select
from app.models import GlobalSettings


def get_global_settings(session: Session) -> GlobalSettings:
    """
    Return the single ``GlobalSettings`` row, creating it with defaults
    if it does not yet exist.
    """
    settings = session.exec(select(GlobalSettings)).first()
    if not settings:
        settings = GlobalSettings()
        session.add(settings)
        session.commit()
        session.refresh(settings)
    return settings
