from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired
from app.core.config import get_settings


def _get_serializer() -> URLSafeTimedSerializer:
    settings = get_settings()
    return URLSafeTimedSerializer(settings.session_secret, salt="kage-session")


def create_session_token(username: str) -> str:
    serializer = _get_serializer()
    return serializer.dumps({"username": username})


def verify_session_token(token: str, max_age: int) -> str | None:
    serializer = _get_serializer()
    try:
        data = serializer.loads(token, max_age=max_age)
    except (BadSignature, SignatureExpired):
        return None
    return data.get("username")
