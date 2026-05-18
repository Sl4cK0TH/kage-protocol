import time
from collections import defaultdict, deque
from threading import Lock
from app.core.config import get_settings

_limits: dict[str, deque[float]] = defaultdict(deque)
_lock = Lock()


def enforce_spawn_rate_limit(key: str) -> None:
    settings = get_settings()
    now = time.time()
    window = settings.spawn_rate_limit_window_seconds
    limit = settings.spawn_rate_limit_count

    with _lock:
        bucket = _limits[key]
        while bucket and now - bucket[0] > window:
            bucket.popleft()
        if len(bucket) >= limit:
            raise ValueError("Rate limit exceeded")
        bucket.append(now)
