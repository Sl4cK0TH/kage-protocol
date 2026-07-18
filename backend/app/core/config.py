import os
from dataclasses import dataclass
from functools import lru_cache
from dotenv import load_dotenv
from app.core.logging import get_logger

load_dotenv()

logger = get_logger(__name__)


def _require_env(key: str) -> str:
    """
    Return the value of a required environment variable.

    Raises ``RuntimeError`` at startup if the variable is missing,
    preventing the application from silently falling back to insecure
    defaults.
    """
    value = os.getenv(key)
    if not value:
        raise RuntimeError(
            f"Required environment variable '{key}' is not set. "
            f"Check your .env file or container environment."
        )
    return value


def _split_csv(value: str) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


@dataclass(frozen=True)
class Settings:
    # --- Required (no defaults — crash if missing) ---
    admin_username: str
    admin_password_hash: str
    kage_api_key: str
    session_secret: str

    # --- Optional (safe defaults) ---
    session_cookie_name: str
    session_max_age_seconds: int
    cors_origins: list[str]
    db_url: str
    public_host: str
    spawn_rate_limit_count: int
    spawn_rate_limit_window_seconds: int
    log_level: str
    json_logs: bool
    challenge_network: str
    default_cpu_limit: float
    cookie_secure: bool


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings(
        # Required — will raise RuntimeError if missing
        admin_username=_require_env("ADMIN_USERNAME"),
        admin_password_hash=_require_env("ADMIN_PASSWORD_HASH"),
        kage_api_key=_require_env("KAGE_API_KEY"),
        session_secret=_require_env("SESSION_SECRET"),
        # Optional — sensible defaults
        session_cookie_name=os.getenv("SESSION_COOKIE_NAME", "kage_session"),
        session_max_age_seconds=int(os.getenv("SESSION_MAX_AGE_SECONDS", "3600")),
        cors_origins=_split_csv(os.getenv("CORS_ORIGINS", "http://localhost:3000")),
        db_url=os.getenv("DB_URL", "sqlite:///./data/kage.db"),
        public_host=os.getenv("PUBLIC_HOST", "localhost"),
        spawn_rate_limit_count=int(os.getenv("SPAWN_RATE_LIMIT_COUNT", "30")),
        spawn_rate_limit_window_seconds=int(os.getenv("SPAWN_RATE_LIMIT_WINDOW_SECONDS", "60")),
        log_level=os.getenv("LOG_LEVEL", "INFO"),
        json_logs=os.getenv("JSON_LOGS", "false").lower() == "true",
        challenge_network=os.getenv("CHALLENGE_NETWORK", "kage-challenges"),
        default_cpu_limit=float(os.getenv("DEFAULT_CPU_LIMIT", "0.5")),
        cookie_secure=os.getenv("COOKIE_SECURE", "false").lower() == "true",
    )
