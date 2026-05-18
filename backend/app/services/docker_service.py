import random
from typing import Any
import docker
from fastapi import HTTPException, status

SPAWNER_LABEL = "spawner"
SPAWNER_VALUE = "kage-protocol"
EXPIRES_LABEL = "expires_at"


class DockerService:
    def __init__(self) -> None:
        self.client = docker.from_env()

    def list_images(self) -> list[dict[str, Any]]:
        images = self.client.images.list()
        return [{"id": image.id, "tags": image.tags} for image in images]

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
        containers = self.client.containers.list(filters={"label": f"{SPAWNER_LABEL}={SPAWNER_VALUE}"})
        stats_list: list[dict[str, Any]] = []
        total_cpu = 0.0
        total_mem = 0
        total_mem_limit = 0

        for container in containers:
            raw = container.stats(stream=False)
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

        return {
            "total_cpu_percent": round(total_cpu, 2),
            "total_memory_usage": total_mem,
            "total_memory_limit": total_mem_limit,
            "containers": stats_list,
        }

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
        container = self.client.containers.get(container_id)
        logs = container.logs(tail=tail, stdout=True, stderr=True)
        return logs.decode("utf-8", errors="replace")

    def kill_container(self, container_id: str) -> None:
        container = self.client.containers.get(container_id)
        container.remove(force=True)

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

    def spawn_container(
        self,
        image_name: str,
        internal_ports: list[int],
        ram_limit: str,
        expires_at: int,
        port_range_start: int,
        port_range_end: int,
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

        container = self.client.containers.run(
            image=image_name,
            detach=True,
            ports=port_map,
            labels=labels,
            mem_limit=ram_limit,
        )

        return {
            "container_id": container.id,
            "port_map": port_map,
            "assigned_ports": assigned_ports,
        }
