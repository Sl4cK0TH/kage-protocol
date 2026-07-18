"""
In-memory sliding-window rate limiter.

Includes automatic cleanup of stale keys to prevent unbounded memory
growth over time.
"""

import time
from collections import defaultdict, deque
from threading import Lock

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_limits: dict[str, deque[float]] = defaultdict(deque)
_lock = Lock()

# Keys with no activity for this long are garbage-collected
_STALE_KEY_SECONDS = 600


def enforce_spawn_rate_limit(key: str) -> None:
    """
    Enforce the configured sliding-window rate limit for ``key``.

    Raises ``ValueError`` when the limit is exceeded.
    """
    settings = get_settings()
    now = time.time()
    window = settings.spawn_rate_limit_window_seconds
    limit = settings.spawn_rate_limit_count

    with _lock:
        bucket = _limits[key]
        while bucket and now - bucket[0] > window:
            bucket.popleft()
        if len(bucket) >= limit:
            logger.warning("Rate limit hit for key '%s' (%d/%d in %ds)", key, len(bucket), limit, window)
            raise ValueError("Rate limit exceeded")
        bucket.append(now)


def cleanup_stale_keys() -> int:
    """
    Remove rate-limit buckets that have been idle for longer than
    ``_STALE_KEY_SECONDS``.  Returns the number of keys purged.
    """
    now = time.time()
    purged = 0
    with _lock:
        stale_keys = [
            key
            for key, bucket in _limits.items()
            if not bucket or (now - bucket[-1]) > _STALE_KEY_SECONDS
        ]
        for key in stale_keys:
            del _limits[key]
            purged += 1
    if purged:
        logger.debug("Rate limiter cleanup: purged %d stale key(s)", purged)
    return purged
