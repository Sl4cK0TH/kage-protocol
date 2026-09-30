"""
Docker SDK service for The Kage Protocol.

Manages container lifecycle, image discovery, stats collection, and
network isolation.  Uses a module-level singleton to avoid creating
a new Docker client on every request.
"""

import random
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import docker
from docker.errors import NotFound, APIError
from docker.utils import parse_repository_tag
from fastapi import HTTPException, status

from app.core.logging import get_logger

logger = get_logger(__name__)

SPAWNER_LABEL = "spawner"
SPAWNER_VALUE = "kage-protocol"
EXPIRES_LABEL = "expires_at"
# Labels that tie a running container back to the Jutsu (ChallengeConfig)
# that spawned it, so the dashboard can group/label clones by challenge.
CHALLENGE_ID_LABEL = "kage_challenge_id"
CHALLENGE_NAME_LABEL = "kage_challenge_name"

# Upper bound on concurrent `docker stats` calls. Each call blocks ~1-2s while
# the daemon samples CPU, so they are fanned out; this stays below docker-py's
# default connection pool size (10).
STATS_MAX_WORKERS = 8
STATS_CACHE_SECONDS = 5.0

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

    def pull_image(self, image_name: str):
        """
        Pull an image, yielding raw progress dicts from the Docker daemon.

        Uses docker-py's own reference parser so a registry ``host:port``
        prefix isn't mistaken for a tag and ``repo@sha256:...`` digests are
        pulled by digest.
        """
        repository, tag = parse_repository_tag(image_name.strip())

        logger.info("Pulling image %s (tag=%s)", repository, tag or "latest")
        for line in self.client.api.pull(repository, tag=tag, stream=True, decode=True):
            yield line

    # -- containers -------------------------------------------------------

    def _list_kage(self) -> list[Any]:
        """
        List Kage-spawned containers.

        ``containers.list()`` already inspects each container, so no extra
        ``reload()`` is needed. ``ignore_removed`` tolerates a clone being
        reaped between the list and inspect calls instead of raising.
        """
        return self.client.containers.list(
            filters={"label": f"{SPAWNER_LABEL}={SPAWNER_VALUE}"},
            ignore_removed=True,
        )

    def _get_kage_container(self, container_id: str) -> Any:
        """
        Fetch a container by ID/name, but only if Kage spawned it.

        ``containers.get`` also resolves names and short IDs, so without the
        label check an API-key holder could target *any* container on the
        host (including the backend and socket proxy). Foreign containers are
        reported as 404 so their existence isn't leaked.
        """
        try:
            container = self.client.containers.get(container_id)
        except NotFound:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Container not found")
        if (container.labels or {}).get(SPAWNER_LABEL) != SPAWNER_VALUE:
            logger.warning("Refused operation on non-Kage container %s", container_id[:12])
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Container not found")
        return container

    def list_kage_containers(self) -> list[dict[str, Any]]:
        items = []
        for container in self._list_kage():
            labels = container.labels or {}
            ports = container.attrs.get("NetworkSettings", {}).get("Ports", {})
            challenge_id = labels.get(CHALLENGE_ID_LABEL)
            # Use the image reference the container was started from rather
            # than ``container.image`` (an extra API call per container that
            # also raises if the image has since been deleted).
            image_ref = container.attrs.get("Config", {}).get("Image")
            items.append(
                {
                    "id": container.id,
                    "name": container.name,
                    "image": [image_ref] if image_ref else [],
                    "status": container.status,
                    "labels": labels,
                    "ports": ports,
                    # Surface the originating Jutsu so the UI can label clones
                    # without having to parse the raw label map.
                    "challenge_id": int(challenge_id) if challenge_id and str(challenge_id).isdigit() else None,
                    "challenge_name": labels.get(CHALLENGE_NAME_LABEL),
                }
            )
        return items

    def _container_stat(self, container: Any) -> dict[str, Any] | None:
        """Sample one container's stats; None if it vanished or errored."""
        try:
            raw = container.stats(stream=False)
        except Exception:
            return None
        return {
            "id": container.id,
            "name": container.name,
            "cpu_percent": round(self._calculate_cpu_percent(raw), 2),
            "memory_usage": int(raw.get("memory_stats", {}).get("usage", 0)),
            "memory_limit": int(raw.get("memory_stats", {}).get("limit", 0)),
        }

    def get_kage_stats(self) -> dict[str, Any]:
        """
        Return aggregate CPU/memory stats with a short TTL cache.

        ``stats(stream=False)`` blocks ~1-2s per container while the daemon
        takes a second CPU sample, so containers are sampled concurrently;
        otherwise a few dozen clones would stall every dashboard refresh.
        """
        now = time.monotonic()
        if self._stats_cache is not None and (now - self._stats_cache_ts) < STATS_CACHE_SECONDS:
            return self._stats_cache

        containers = self._list_kage()
        stats_list: list[dict[str, Any]] = []
        if containers:
            with ThreadPoolExecutor(max_workers=min(STATS_MAX_WORKERS, len(containers))) as pool:
                stats_list = [s for s in pool.map(self._container_stat, containers) if s is not None]

        result = {
            "total_cpu_percent": round(sum(s["cpu_percent"] for s in stats_list), 2),
            "total_memory_usage": sum(s["memory_usage"] for s in stats_list),
            "total_memory_limit": sum(s["memory_limit"] for s in stats_list),
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
        container = self._get_kage_container(container_id)
        logs = container.logs(tail=tail, stdout=True, stderr=True)
        return logs.decode("utf-8", errors="replace")

    def kill_container(self, container_id: str) -> str:
        """Force-remove a Kage container; returns its full ID."""
        container = self._get_kage_container(container_id)
        try:
            container.remove(force=True)
        except NotFound:
            logger.warning("Container %s vanished before it could be killed", container_id[:12])
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Container not found")
        logger.info("Killed container %s", container.id[:12])
        return container.id

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
        # All running containers (not just Kage's) can hold host ports.
        for container in self.client.containers.list(ignore_removed=True):
            ports = container.attrs.get("NetworkSettings", {}).get("Ports", {}) or {}
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
        challenge_id: int | None = None,
        challenge_name: str | None = None,
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
        # Tag the container with its originating Jutsu so clones can be
        # grouped, counted, and labelled by challenge in the dashboard.
        if challenge_id is not None:
            labels[CHALLENGE_ID_LABEL] = str(challenge_id)
        if challenge_name:
            labels[CHALLENGE_NAME_LABEL] = challenge_name

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
