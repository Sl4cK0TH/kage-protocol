import os
from dataclasses import dataclass
from dotenv import load_dotenv

load_dotenv()


def _split_csv(value: str) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


@dataclass(frozen=True)
class Settings:
    admin_username: str
    admin_password: str
    kage_api_key: str
    session_secret: str
    session_cookie_name: str
    session_max_age_seconds: int
    cors_origins: list[str]
    db_url: str
    public_host: str
    spawn_rate_limit_count: int
    spawn_rate_limit_window_seconds: int


def get_settings() -> Settings:
    return Settings(
        admin_username=os.getenv("ADMIN_USERNAME", "Zor0ark"),
        admin_password=os.getenv("ADMIN_PASSWORD", "kal1@kal1"),
        kage_api_key=os.getenv("KAGE_API_KEY", "change-me"),
        session_secret=os.getenv("SESSION_SECRET", "change-me-please"),
        session_cookie_name=os.getenv("SESSION_COOKIE_NAME", "kage_session"),
        session_max_age_seconds=int(os.getenv("SESSION_MAX_AGE_SECONDS", "3600")),
        cors_origins=_split_csv(os.getenv("CORS_ORIGINS", "http://localhost:3000")),
        db_url=os.getenv("DB_URL", "sqlite:///./data/kage.db"),
        public_host=os.getenv("PUBLIC_HOST", "localhost"),
        spawn_rate_limit_count=int(os.getenv("SPAWN_RATE_LIMIT_COUNT", "30")),
        spawn_rate_limit_window_seconds=int(os.getenv("SPAWN_RATE_LIMIT_WINDOW_SECONDS", "60")),
    )
