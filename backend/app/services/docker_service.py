"""
Docker SDK service for The Kage Protocol.

Manages container lifecycle, image discovery, stats collection, and
network isolation.  Uses a module-level singleton to avoid creating
a new Docker client on every request.
"""

import random
import time
from typing import Any

import docker
from docker.errors import NotFound, APIError
from fastapi import HTTPException, status

from app.core.logging import get_logger

logger = get_logger(__name__)

SPAWNER_LABEL = "spawner"
SPAWNER_VALUE = "kage-protocol"
EXPIRES_LABEL = "expires_at"

# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------
_instance: "DockerService | None" = None


def get_docker_service() -> "DockerService":
    """Return (and lazily create) the singleton DockerService."""
    global _instance
    if _instance is None:
        _instance = DockerService()
    return _instance


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------
class DockerService:
    def __init__(self) -> None:
        # docker.from_env() respects the DOCKER_HOST env var, so when
        # running behind a socket proxy it will connect via TCP.
        self.client = docker.from_env()
        self._stats_cache: dict[str, Any] | None = None
        self._stats_cache_ts: float = 0
        logger.info("Docker client initialised (API %s)", self.client.version().get("ApiVersion", "?"))

    # -- images -----------------------------------------------------------

    def list_images(self) -> list[dict[str, Any]]:
        images = self.client.images.list()
        return [{"id": image.id, "tags": image.tags} for image in images]

    # -- containers -------------------------------------------------------

    def list_kage_containers(self) -> list[dict[str, Any]]:
        containers = self.client.containers.list(filters={"label": f"{SPAWNER_LABEL}={SPAWNER_VALUE}"})
        items = []
        for container in containers:
            container.reload()
            labels = container.labels or {}
            ports = container.attrs.get("NetworkSettings", {}).get("Ports", {})
            items.append(
                {
                    "id": container.id,
                    "name": container.name,
                    "image": container.image.tags,
                    "status": container.status,
                    "labels": labels,
                    "ports": ports,
                }
            )
        return items

    def get_kage_stats(self) -> dict[str, Any]:
        """Return aggregate CPU/memory stats with a 5-second TTL cache."""
        now = time.monotonic()
        if self._stats_cache is not None and (now - self._stats_cache_ts) < 5.0:
            return self._stats_cache

        containers = self.client.containers.list(filters={"label": f"{SPAWNER_LABEL}={SPAWNER_VALUE}"})
        stats_list: list[dict[str, Any]] = []
        total_cpu = 0.0
        total_mem = 0
        total_mem_limit = 0

        for container in containers:
            try:
                raw = container.stats(stream=False)
            except Exception:
                continue
            cpu_percent = self._calculate_cpu_percent(raw)
            mem_usage = int(raw.get("memory_stats", {}).get("usage", 0))
            mem_limit = int(raw.get("memory_stats", {}).get("limit", 0))

            total_cpu += cpu_percent
            total_mem += mem_usage
            total_mem_limit += mem_limit

            stats_list.append(
                {
                    "id": container.id,
                    "name": container.name,
                    "cpu_percent": round(cpu_percent, 2),
                    "memory_usage": mem_usage,
                    "memory_limit": mem_limit,
                }
            )

        result = {
            "total_cpu_percent": round(total_cpu, 2),
            "total_memory_usage": total_mem,
            "total_memory_limit": total_mem_limit,
            "containers": stats_list,
        }
        self._stats_cache = result
        self._stats_cache_ts = now
        return result

    def _calculate_cpu_percent(self, stats: dict[str, Any]) -> float:
        cpu_stats = stats.get("cpu_stats", {})
        precpu_stats = stats.get("precpu_stats", {})
        cpu_delta = cpu_stats.get("cpu_usage", {}).get("total_usage", 0) - precpu_stats.get("cpu_usage", {}).get(
            "total_usage", 0
        )
        system_delta = cpu_stats.get("system_cpu_usage", 0) - precpu_stats.get("system_cpu_usage", 0)
        online_cpus = cpu_stats.get("online_cpus") or len(cpu_stats.get("cpu_usage", {}).get("percpu_usage", []) or [])

        if system_delta > 0 and cpu_delta > 0 and online_cpus:
            return (cpu_delta / system_delta) * online_cpus * 100.0
        return 0.0

    def container_logs(self, container_id: str, tail: int = 200) -> str:
        try:
            container = self.client.containers.get(container_id)
        except NotFound:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Container not found")
        logs = container.logs(tail=tail, stdout=True, stderr=True)
        return logs.decode("utf-8", errors="replace")

    def kill_container(self, container_id: str) -> None:
        try:
            container = self.client.containers.get(container_id)
            container.remove(force=True)
            logger.info("Killed container %s", container_id[:12])
        except NotFound:
            logger.warning("Attempted to kill non-existent container %s", container_id[:12])
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Container not found")

    # -- network ----------------------------------------------------------

    def ensure_challenge_network(self, network_name: str) -> None:
        """Create the challenge network if it doesn't already exist."""
        try:
            self.client.networks.get(network_name)
            logger.debug("Challenge network '%s' already exists", network_name)
        except NotFound:
            self.client.networks.create(
                name=network_name,
                driver="bridge",
                internal=False,  # Containers can reach the internet
            )
            logger.info("Created challenge network '%s'", network_name)

    # -- port allocation --------------------------------------------------

    def get_used_host_ports(self) -> set[int]:
        used_ports: set[int] = set()
        containers = self.client.containers.list()
        for container in containers:
            container.reload()
            ports = container.attrs.get("NetworkSettings", {}).get("Ports", {})
            for mappings in ports.values():
                if not mappings:
                    continue
                for mapping in mappings:
                    host_port = mapping.get("HostPort")
                    if host_port and host_port.isdigit():
                        used_ports.add(int(host_port))
        return used_ports

    # -- spawning ---------------------------------------------------------

    def spawn_container(
        self,
        image_name: str,
        internal_ports: list[int],
        ram_limit: str,
        cpu_limit: float,
        expires_at: int,
        port_range_start: int,
        port_range_end: int,
        network_name: str = "kage-challenges",
    ) -> dict[str, Any]:
        if not internal_ports:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No internal ports defined")

        used_ports = self.get_used_host_ports()
        candidate_ports = [p for p in range(port_range_start, port_range_end + 1) if p not in used_ports]
        if len(candidate_ports) < len(internal_ports):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="No available ports")

        random.shuffle(candidate_ports)
        port_map: dict[str, int] = {}
        assigned_ports: list[int] = []

        for internal_port in internal_ports:
            host_port = candidate_ports.pop()
            port_map[f"{internal_port}/tcp"] = host_port
            assigned_ports.append(host_port)

        labels = {
            SPAWNER_LABEL: SPAWNER_VALUE,
            EXPIRES_LABEL: str(expires_at),
        }

        # Ensure the challenge network exists
        self.ensure_challenge_network(network_name)

        # Convert cpu_limit (fractional cores) to nano_cpus
        # 0.5 core = 500_000_000 nano CPUs
        nano_cpus = int(cpu_limit * 1_000_000_000)

        container = self.client.containers.run(
            image=image_name,
            detach=True,
            ports=port_map,
            labels=labels,
            mem_limit=ram_limit,
            nano_cpus=nano_cpus,
            network=network_name,
        )

        logger.info(
            "Spawned container %s (image=%s, ports=%s, ram=%s, cpu=%.1f)",
            container.id[:12],
            image_name,
            assigned_ports,
            ram_limit,
            cpu_limit,
        )

        return {
            "container_id": container.id,
            "port_map": port_map,
            "assigned_ports": assigned_ports,
        }

    # -- health -----------------------------------------------------------

    def ping(self) -> bool:
        """Return True if the Docker daemon is reachable."""
        try:
            self.client.ping()
            return True
        except (APIError, Exception):
            return False
