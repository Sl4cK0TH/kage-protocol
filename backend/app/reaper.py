"""
The Reaper — background task that auto-kills expired challenge containers.

Runs on a fixed interval (default 60s) and removes any container whose
expiry has passed (the DB override if the TTL was extended, otherwise the
spawn-time ``expires_at`` label). It also prunes orphaned expiry rows and,
hourly, audit entries older than the configured retention.
"""

import asyncio
import time

from app.core.config import get_settings
from app.core.logging import get_logger
from app.core.rate_limit import cleanup_stale_keys
from app.db import session_scope
from app.services import lifecycle_service
from app.services.audit_service import log_event, prune_audit_log
from app.services.docker_service import get_docker_service, EXPIRES_LABEL

logger = get_logger(__name__)

REAPER_INTERVAL_SECONDS = 60
AUDIT_PRUNE_INTERVAL_SECONDS = 3600

_last_audit_prune: float = 0.0


async def _reap_once() -> int:
    """Kill every expired Kage container. Returns the number reaped."""
    docker_service = get_docker_service()
    reaped = 0

    with session_scope() as session:
        # Read overrides *before* listing containers: any row that exists now
        # belongs to a container created earlier, so it will be in the list
        # below unless it is really gone. The reverse order could mistake a
        # clone spawned mid-cycle for an orphan.
        overrides = lifecycle_service.get_all_expiries(session)
        containers = await asyncio.to_thread(docker_service.list_kage_containers)
        now = int(time.time())
        live_ids = {c["id"] for c in containers}

        for container in containers:
            cid = container["id"]
            label_expiry = container.get("labels", {}).get(EXPIRES_LABEL)
            expires_at = overrides.get(cid)
            if expires_at is None and label_expiry and str(label_expiry).isdigit():
                expires_at = int(label_expiry)
            if expires_at is None or now <= expires_at:
                continue

            age_minutes = (now - expires_at) // 60
            try:
                await asyncio.to_thread(docker_service.kill_container, cid)
            except Exception as exc:
                logger.error("Failed to reap container %s: %s", cid[:12], exc)
                continue

            lifecycle_service.remove_expiry(session, cid)
            log_event(
                session,
                actor="reaper",
                action="reap",
                target=cid,
                meta={"challenge_name": container.get("challenge_name"), "expired_minutes": age_minutes},
            )
            reaped += 1
            logger.info(
                "Reaped expired container %s (image=%s, expired %dm ago)",
                cid[:12],
                container.get("image"),
                age_minutes,
            )

        # Prune orphaned expiry rows for containers that no longer exist
        # (e.g. removed out-of-band) so the table can't grow unbounded.
        for orphan_id in set(overrides) - live_ids:
            lifecycle_service.remove_expiry(session, orphan_id)

    if reaped:
        logger.info("Reaper cycle complete — removed %d container(s)", reaped)
    return reaped


def _maybe_prune_audit(now: float | None = None) -> int:
    """Apply audit-log retention at most once per AUDIT_PRUNE_INTERVAL_SECONDS."""
    global _last_audit_prune
    now = time.monotonic() if now is None else now
    if _last_audit_prune and now - _last_audit_prune < AUDIT_PRUNE_INTERVAL_SECONDS:
        return 0
    _last_audit_prune = now
    with session_scope() as session:
        removed = prune_audit_log(session, get_settings().audit_retention_days)
    if removed:
        logger.info("Pruned %d audit entr%s past retention", removed, "y" if removed == 1 else "ies")
    return removed


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
            await asyncio.to_thread(_maybe_prune_audit)
        except Exception as exc:
            logger.error("Reaper cycle failed: %s", exc, exc_info=True)
        await asyncio.sleep(REAPER_INTERVAL_SECONDS)
