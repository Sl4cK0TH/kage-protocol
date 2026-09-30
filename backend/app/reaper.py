"""
The Reaper — background task that auto-kills expired challenge containers.

Runs on a configurable interval (default 60s) and removes any container
whose ``expires_at`` label timestamp has passed.
"""

import asyncio
import time

from app.core.logging import get_logger
from app.core.rate_limit import cleanup_stale_keys
from app.db import session_scope
from app.services import lifecycle_service
from app.services.docker_service import get_docker_service, EXPIRES_LABEL

logger = get_logger(__name__)

REAPER_INTERVAL_SECONDS = 60


async def _reap_once() -> None:
    """Check all Kage containers and kill any that have expired."""
    docker_service = get_docker_service()
    containers = docker_service.list_kage_containers()
    now = int(time.time())
    reaped = 0

    # A DB expiry override (set when a clone's TTL is extended) takes precedence
    # over the immutable spawn-time label.
    with session_scope() as session:
        overrides = lifecycle_service.get_all_expiries(session)
        live_ids = {c["id"] for c in containers}

        for container in containers:
            cid = container["id"]
            label_expiry = container.get("labels", {}).get(EXPIRES_LABEL)
            expires_at = overrides.get(cid)
            if expires_at is None and label_expiry and str(label_expiry).isdigit():
                expires_at = int(label_expiry)
            if expires_at is None or now <= expires_at:
                continue

            image = container.get("image", ["unknown"])
            age_minutes = (now - expires_at) // 60
            try:
                await asyncio.to_thread(docker_service.kill_container, cid)
                lifecycle_service.remove_expiry(session, cid)
                reaped += 1
                logger.info(
                    "Reaped expired container %s (image=%s, expired %dm ago)",
                    cid[:12],
                    image,
                    age_minutes,
                )
            except Exception as exc:
                logger.error("Failed to reap container %s: %s", cid[:12], exc)

        # Prune orphaned expiry rows for containers that no longer exist
        # (e.g. killed out-of-band) so the table can't grow unbounded.
        for orphan_id in set(overrides) - live_ids:
            lifecycle_service.remove_expiry(session, orphan_id)

    if reaped:
        logger.info("Reaper cycle complete — removed %d container(s)", reaped)


async def reaper_loop() -> None:
    """
    Infinite loop that runs the reaper on a fixed interval.

    Exceptions are caught and logged so the loop never dies.
    """
    logger.info("Reaper started (interval=%ds)", REAPER_INTERVAL_SECONDS)
    while True:
        try:
            await _reap_once()
            cleanup_stale_keys()
        except Exception as exc:
            logger.error("Reaper cycle failed: %s", exc, exc_info=True)
        await asyncio.sleep(REAPER_INTERVAL_SECONDS)
