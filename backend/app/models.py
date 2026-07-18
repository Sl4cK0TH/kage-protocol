import re
from typing import Optional
from sqlalchemy import Column, JSON
from sqlmodel import Field, SQLModel
from pydantic import field_validator


class ChallengeConfig(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    description: str = ""
    docker_image_name: str
    internal_ports: list[int] = Field(default_factory=list, sa_column=Column(JSON))
    ram_limit: str = "250m"
    cpu_limit: float = 0.5


class GlobalSettings(SQLModel, table=True):
    id: Optional[int] = Field(default=1, primary_key=True)
    default_ttl_minutes: int = 30
    port_range_start: int = 30000
    port_range_end: int = 40000


class ChallengeCreate(SQLModel):
    name: str
    description: str = ""
    docker_image_name: str
    internal_ports: list[int]
    ram_limit: str = "250m"
    cpu_limit: float = 0.5

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 1:
            raise ValueError("Name cannot be empty")
        if len(v) > 128:
            raise ValueError("Name must be 128 characters or fewer")
        return v

    @field_validator("docker_image_name")
    @classmethod
    def image_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Docker image name is required")
        return v

    @field_validator("ram_limit")
    @classmethod
    def validate_ram_limit(cls, v: str) -> str:
        if not re.match(r"^\d+[bkmgBKMG]?$", v):
            raise ValueError("Invalid RAM limit format (e.g., '256m', '1g', '512000')")
        return v

    @field_validator("cpu_limit")
    @classmethod
    def validate_cpu_limit(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("CPU limit must be greater than 0")
        if v > 16:
            raise ValueError("CPU limit cannot exceed 16 cores")
        return v

    @field_validator("internal_ports")
    @classmethod
    def validate_ports(cls, v: list[int]) -> list[int]:
        if not v:
            raise ValueError("At least one internal port is required")
        for port in v:
            if port < 1 or port > 65535:
                raise ValueError(f"Port {port} is out of range (1–65535)")
        return v


class ChallengeUpdate(SQLModel):
    name: str | None = None
    description: str | None = None
    docker_image_name: str | None = None
    internal_ports: list[int] | None = None
    ram_limit: str | None = None
    cpu_limit: float | None = None

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: str | None) -> str | None:
        if v is not None:
            v = v.strip()
            if len(v) < 1:
                raise ValueError("Name cannot be empty")
            if len(v) > 128:
                raise ValueError("Name must be 128 characters or fewer")
        return v

    @field_validator("ram_limit")
    @classmethod
    def validate_ram_limit(cls, v: str | None) -> str | None:
        if v is not None and not re.match(r"^\d+[bkmgBKMG]?$", v):
            raise ValueError("Invalid RAM limit format (e.g., '256m', '1g')")
        return v

    @field_validator("cpu_limit")
    @classmethod
    def validate_cpu_limit(cls, v: float | None) -> float | None:
        if v is not None:
            if v <= 0:
                raise ValueError("CPU limit must be greater than 0")
            if v > 16:
                raise ValueError("CPU limit cannot exceed 16 cores")
        return v

    @field_validator("internal_ports")
    @classmethod
    def validate_ports(cls, v: list[int] | None) -> list[int] | None:
        if v is not None:
            if not v:
                raise ValueError("At least one internal port is required")
            for port in v:
                if port < 1 or port > 65535:
                    raise ValueError(f"Port {port} is out of range (1–65535)")
        return v


class GlobalSettingsUpdate(SQLModel):
    default_ttl_minutes: int | None = None
    port_range_start: int | None = None
    port_range_end: int | None = None

    @field_validator("default_ttl_minutes")
    @classmethod
    def validate_ttl(cls, v: int | None) -> int | None:
        if v is not None and (v < 1 or v > 1440):
            raise ValueError("TTL must be between 1 and 1440 minutes (24h)")
        return v

    @field_validator("port_range_start", "port_range_end")
    @classmethod
    def validate_port_range(cls, v: int | None) -> int | None:
        if v is not None and (v < 1024 or v > 65535):
            raise ValueError("Port range must be between 1024 and 65535")
        return v


class SpawnRequest(SQLModel):
    """Optional metadata sent with a public spawn request."""
    platform: str | None = None       # "ctfd", "tryhackme", "custom", etc.
    team_id: str | None = None
    player_id: str | None = None


class AuditLog(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: int
    actor: str
    action: str
    target: str
    meta: dict = Field(default_factory=dict, sa_column=Column(JSON))
