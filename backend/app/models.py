from typing import Optional
from sqlalchemy import Column, JSON
from sqlmodel import Field, SQLModel


class ChallengeConfig(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    description: str = ""
    docker_image_name: str
    internal_ports: list[int] = Field(default_factory=list, sa_column=Column(JSON))
    ram_limit: str = "250m"


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


class ChallengeUpdate(SQLModel):
    name: str | None = None
    description: str | None = None
    docker_image_name: str | None = None
    internal_ports: list[int] | None = None
    ram_limit: str | None = None


class GlobalSettingsUpdate(SQLModel):
    default_ttl_minutes: int | None = None
    port_range_start: int | None = None
    port_range_end: int | None = None


class AuditLog(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: int
    actor: str
    action: str
    target: str
    meta: dict = Field(default_factory=dict, sa_column=Column(JSON))
