"""DockerService internals exercised against the fake daemon."""

import pytest
from fastapi import HTTPException


def spawn(service, *, internal_ports=(80,), start=30000, end=30010):
    return service.spawn_container(
        image_name="web101:latest",
        internal_ports=list(internal_ports),
        ram_limit="256m",
        cpu_limit=0.25,
        expires_at=2_000_000_000,
        port_range_start=start,
        port_range_end=end,
        network_name="kage-net",
        challenge_id=3,
        challenge_name="Pwn 200",
    )


@pytest.mark.parametrize(
    "image, expected",
    [
        ("nginx", ("nginx", None)),
        ("nginx:1.25", ("nginx", "1.25")),
        ("registry.local:5000/team/web", ("registry.local:5000/team/web", None)),
        ("registry.local:5000/team/web:v2", ("registry.local:5000/team/web", "v2")),
        # Regression: the Phase 3 parser split this into ("nginx@sha256", "abc123").
        ("nginx@sha256:abc123", ("nginx", "sha256:abc123")),
    ],
)
def test_pull_image_parses_references(docker_service, docker_client, image, expected):
    frames = list(docker_service.pull_image(image))

    assert docker_client.api.pull_calls == [expected]
    assert frames[-1]["status"] == "Pull complete"


def test_spawn_requires_internal_ports(docker_service):
    with pytest.raises(HTTPException) as exc:
        spawn(docker_service, internal_ports=())
    assert exc.value.status_code == 400


def test_spawn_skips_host_ports_already_in_use(docker_service, docker_client):
    # Occupy every port in 30000-30004 except 30003, including via a foreign container.
    docker_client.containers.seed(host_ports={"80/tcp": 30000, "81/tcp": 30001})
    docker_client.containers.seed(kage=False, host_ports={"5432/tcp": 30002, "6379/tcp": 30004})

    result = spawn(docker_service, start=30000, end=30004)

    assert result["assigned_ports"] == [30003]


def test_spawn_assigns_distinct_ports_per_internal_port(docker_service, docker_client):
    result = spawn(docker_service, internal_ports=(80, 443, 8080))

    assert len(set(result["assigned_ports"])) == 3
    run = docker_client.containers.run_calls[-1]
    assert set(run["ports"]) == {"80/tcp", "443/tcp", "8080/tcp"}
    assert run["nano_cpus"] == 250_000_000
    assert run["labels"]["kage_challenge_name"] == "Pwn 200"


def test_spawn_with_too_few_free_ports_is_409(docker_service, docker_client):
    with pytest.raises(HTTPException) as exc:
        spawn(docker_service, internal_ports=(80, 443), start=30000, end=30000)
    assert exc.value.status_code == 409
    assert docker_client.containers.run_calls == []


def test_challenge_network_is_created_once(docker_service, docker_client):
    spawn(docker_service)
    spawn(docker_service)

    assert docker_client.networks.names == {"kage-net"}
    assert docker_client.networks.create_calls == 1


def test_stats_are_sampled_concurrently(docker_service, docker_client):
    for _ in range(4):
        docker_client.containers.seed().stats_delay = 0.2

    stats = docker_service.get_kage_stats()

    assert docker_client.max_stats_in_flight > 1
    assert len(stats["containers"]) == 4
    assert stats["total_cpu_percent"] == 80.0


def test_stats_skip_containers_that_error(docker_service, docker_client):
    docker_client.containers.seed()
    docker_client.containers.seed().stats_error = RuntimeError("container went away")

    stats = docker_service.get_kage_stats()

    assert len(stats["containers"]) == 1
    assert stats["total_memory_limit"] == 256 * 1024 * 1024


def test_stats_are_cached_briefly(docker_service, docker_client):
    docker_client.containers.seed()
    docker_service.get_kage_stats()
    calls = len(docker_client.containers.list_calls)

    docker_service.get_kage_stats()

    assert len(docker_client.containers.list_calls) == calls


def test_stats_with_no_clones(docker_service):
    assert docker_service.get_kage_stats() == {
        "total_cpu_percent": 0,
        "total_memory_usage": 0,
        "total_memory_limit": 0,
        "containers": [],
    }


def test_cpu_percent_is_zero_without_deltas(docker_service):
    assert docker_service._calculate_cpu_percent({}) == 0.0
