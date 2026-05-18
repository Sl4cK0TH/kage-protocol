import asyncio
import time
from app.services.docker_service import DockerService, EXPIRES_LABEL


async def _reap_once() -> None:
    docker_service = DockerService()
    containers = docker_service.list_kage_containers()
    now = int(time.time())

    for container in containers:
        expires_at = container.get("labels", {}).get(EXPIRES_LABEL)
        if expires_at and str(expires_at).isdigit():
            if now > int(expires_at):
                await asyncio.to_thread(docker_service.kill_container, container["id"])


async def reaper_loop() -> None:
    while True:
        await _reap_once()
        await asyncio.sleep(60)
