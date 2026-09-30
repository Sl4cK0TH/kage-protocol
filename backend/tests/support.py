"""
Shared test constants and an in-memory stand-in for ``docker.DockerClient``.

The fake sits *underneath* the real ``DockerService``, so tests exercise the
service's own logic (port allocation, labelling, ownership checks, stats
fan-out) rather than a mock of it.
"""

import asyncio
import hashlib
import itertools
import json
import threading
import time
from typing import Any

from docker.errors import NotFound
from starlette.requests import Request

ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "correct horse battery staple"
API_KEY = "test-api-key"
PUBLIC_HOST = "ctf.example.test"
RATE_LIMIT_COUNT = 5

SPAWNER_LABELS = {"spawner": "kage-protocol"}

# A plausible `docker stats` payload: 1e9 of 10e9 system ticks on 2 CPUs = 20%.
DEFAULT_STATS = {
    "cpu_stats": {"cpu_usage": {"total_usage": 2_000_000_000}, "system_cpu_usage": 20_000_000_000, "online_cpus": 2},
    "precpu_stats": {"cpu_usage": {"total_usage": 1_000_000_000}, "system_cpu_usage": 10_000_000_000},
    "memory_stats": {"usage": 50 * 1024 * 1024, "limit": 256 * 1024 * 1024},
}


class FakeContainer:
    def __init__(self, client: "FakeDockerClient", cid: str, name: str, image: str,
                 labels: dict[str, str], ports: dict[str, Any]):
        self._client = client
        self.id = cid
        self.name = name
        self.labels = labels
        self.status = "running"
        self.attrs = {"Config": {"Image": image, "Labels": labels}, "NetworkSettings": {"Ports": ports}}
        self.log_output = b"booting\nlistening on :80\n"
        self.stats_payload: dict[str, Any] = DEFAULT_STATS
        self.stats_delay = 0.0
        self.stats_error: Exception | None = None
        self.remove_error: Exception | None = None

    def stats(self, stream: bool = False) -> dict[str, Any]:
        self._client._stats_enter()
        try:
            if self.stats_delay:
                time.sleep(self.stats_delay)
            if self.stats_error:
                raise self.stats_error
            return self.stats_payload
        finally:
            self._client._stats_exit()

    def logs(self, tail: int = 200, stdout: bool = True, stderr: bool = True) -> bytes:
        return self.log_output

    def remove(self, force: bool = False) -> None:
        if self.remove_error:
            raise self.remove_error
        self._client.containers._remove(self.id)


class FakeContainers:
    def __init__(self, client: "FakeDockerClient"):
        self._client = client
        self._items: dict[str, FakeContainer] = {}
        self._counter = itertools.count(1)
        self.run_calls: list[dict[str, Any]] = []
        self.list_calls: list[dict[str, Any]] = []

    def seed(self, *, name: str | None = None, image: str = "challenge:latest", kage: bool = True,
             labels: dict[str, str] | None = None, host_ports: dict[str, int] | None = None) -> FakeContainer:
        """Add a container directly (as if started earlier / by someone else)."""
        all_labels = {**(SPAWNER_LABELS if kage else {}), **(labels or {})}
        ports = {k: [{"HostIp": "0.0.0.0", "HostPort": str(v)}] for k, v in (host_ports or {}).items()}
        return self._create(name=name, image=image, labels=all_labels, ports=ports)

    def _create(self, *, name: str | None, image: str, labels: dict[str, str], ports: dict[str, Any]) -> FakeContainer:
        n = next(self._counter)
        cid = hashlib.sha256(f"container-{n}".encode()).hexdigest()
        container = FakeContainer(self._client, cid, name or f"clone_{n}", image, labels, ports)
        self._items[cid] = container
        return container

    def _remove(self, cid: str) -> None:
        if cid not in self._items:
            raise NotFound(f"No such container: {cid}")
        del self._items[cid]

    def exists(self, cid: str) -> bool:
        return cid in self._items

    # -- docker-py API surface -------------------------------------------

    def list(self, all: bool = False, filters: dict[str, str] | None = None,
             ignore_removed: bool = False, **_: Any) -> list[FakeContainer]:
        self.list_calls.append({"filters": filters, "ignore_removed": ignore_removed})
        items = list(self._items.values())
        if filters and "label" in filters:
            key, _, value = filters["label"].partition("=")
            items = [c for c in items if c.labels.get(key) == value]
        return items

    def get(self, container_id: str) -> FakeContainer:
        if container_id in self._items:
            return self._items[container_id]
        # Like the real daemon, resolve names and unique ID prefixes too.
        for container in self._items.values():
            if container.name == container_id or container.id.startswith(container_id):
                return container
        raise NotFound(f"No such container: {container_id}")

    def run(self, image: str, detach: bool = True, ports: dict[str, int] | None = None,
            labels: dict[str, str] | None = None, mem_limit: str | None = None,
            nano_cpus: int | None = None, network: str | None = None, **_: Any) -> FakeContainer:
        self.run_calls.append({"image": image, "ports": ports, "labels": labels, "mem_limit": mem_limit,
                               "nano_cpus": nano_cpus, "network": network})
        port_map = {k: [{"HostIp": "0.0.0.0", "HostPort": str(v)}] for k, v in (ports or {}).items()}
        return self._create(name=None, image=image, labels=dict(labels or {}), ports=port_map)


class FakeImage:
    def __init__(self, image_id: str, tags: list[str]):
        self.id = image_id
        self.tags = tags


class FakeImages:
    def __init__(self) -> None:
        self.items = [FakeImage("sha256:" + "a" * 64, ["web101:latest"])]

    def list(self) -> list[FakeImage]:
        return self.items


class FakeNetworks:
    def __init__(self) -> None:
        self.names: set[str] = set()
        self.create_calls = 0

    def get(self, name: str) -> str:
        if name not in self.names:
            raise NotFound(f"network {name} not found")
        return name

    def create(self, name: str, driver: str = "bridge", internal: bool = False) -> str:
        self.create_calls += 1
        self.names.add(name)
        return name


class FakeAPI:
    def __init__(self) -> None:
        self.pull_calls: list[tuple[str, str | None]] = []
        self.pull_error: Exception | None = None

    def pull(self, repository: str, tag: str | None = None, stream: bool = False, decode: bool = False):
        self.pull_calls.append((repository, tag))
        if self.pull_error:
            raise self.pull_error
        yield {"status": f"Pulling from {repository}", "id": tag or "latest"}
        yield {"status": "Downloading", "progress": "[=====>    ] 5MB/10MB", "id": "0123456789ab"}
        yield {"status": "Pull complete", "id": "0123456789ab"}


class FakeDockerClient:
    def __init__(self) -> None:
        self.containers = FakeContainers(self)
        self.images = FakeImages()
        self.networks = FakeNetworks()
        self.api = FakeAPI()
        self.reachable = True
        self._stats_lock = threading.Lock()
        self._stats_in_flight = 0
        self.max_stats_in_flight = 0

    def ping(self) -> bool:
        if not self.reachable:
            raise ConnectionError("daemon unreachable")
        return True

    def version(self) -> dict[str, str]:
        return {"ApiVersion": "1.45"}

    def _stats_enter(self) -> None:
        with self._stats_lock:
            self._stats_in_flight += 1
            self.max_stats_in_flight = max(self.max_stats_in_flight, self._stats_in_flight)

    def _stats_exit(self) -> None:
        with self._stats_lock:
            self._stats_in_flight -= 1


# ---------------------------------------------------------------------------
# SSE helpers
# ---------------------------------------------------------------------------

def connected_request() -> Request:
    """A Request whose client never disconnects (receive() never yields)."""

    async def receive() -> dict[str, str]:
        await asyncio.sleep(3600)
        return {"type": "http.disconnect"}

    scope = {"type": "http", "method": "GET", "path": "/", "headers": [], "query_string": b""}
    return Request(scope, receive)


def collect_sse(route_factory, stop_on: tuple[str, ...] = (), limit: int = 5) -> list[tuple[str, Any]]:
    """
    Call an async SSE route and collect ``(event, data)`` frames.

    Starlette's TestClient buffers whole responses, which never finish for
    infinite streams, so the route is invoked directly and its body iterator
    consumed until a stop event or ``limit`` frames, then closed.
    """

    async def run() -> list[tuple[str, Any]]:
        response = await route_factory()
        frames: list[tuple[str, Any]] = []
        try:
            async for chunk in response.body_iterator:
                if chunk.startswith(":"):  # keepalive comment
                    continue
                header, _, body = chunk.partition("\n")
                event = header.removeprefix("event: ")
                frames.append((event, json.loads(body.removeprefix("data: "))))
                if event in stop_on or len(frames) >= limit:
                    break
        finally:
            await response.body_iterator.aclose()
        return frames

    return asyncio.run(asyncio.wait_for(run(), timeout=10))
