from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, PydanticBaseSettingsSource, SettingsConfigDict

from experiment_orchestration.constants import PROJECT_ROOT

ReasoningEffort = Literal["none", "minimal", "low", "medium", "high", "xhigh"]


@dataclass(frozen=True)
class DockerResourceLimits:
    """CPU and memory limits for a Docker container."""

    cpus: float
    memory: str

    def to_docker_args(self) -> list[str]:
        """Convert resource limits into Docker CLI arguments."""
        return ["--cpus", str(self.cpus), "--memory", self.memory]


class ContainerEnvSettings(BaseSettings):
    """Approved settings forwarded into agent containers."""

    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=True,
        populate_by_name=True,
    )

    api_key: str | None = Field(default=None, alias="API_KEY")
    model: str | None = Field(default=None, alias="MODEL")
    base_url: str | None = Field(default=None, alias="BASE_URL")
    max_tokens: int | None = Field(default=None, alias="MAX_TOKENS", ge=0)
    temperature: float | None = Field(default=None, alias="TEMPERATURE", ge=0.0, le=2.0)
    reasoning_effort: ReasoningEffort | None = Field(default="high", alias="REASONING_EFFORT")
    agent_timeout_seconds: int = Field(default=0, alias="AGENT_TIMEOUT_SECONDS", ge=1)
    agent_timeout_grace_seconds: int = Field(default=0, alias="AGENT_TIMEOUT_GRACE_SECONDS", ge=1)
    playwright_timeout_seconds: int = Field(default=0, alias="PLAYWRIGHT_TIMEOUT_SECONDS", ge=1)

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls: type[BaseSettings],
        init_settings: PydanticBaseSettingsSource,
        env_settings: PydanticBaseSettingsSource,
        dotenv_settings: PydanticBaseSettingsSource,
        file_secret_settings: PydanticBaseSettingsSource,
    ) -> tuple[PydanticBaseSettingsSource, ...]:
        # Avoid leaking host environment variables into Docker containers.
        """Customize the order of settings sources."""
        return (init_settings, dotenv_settings)

    def to_env(self) -> dict[str, str]:
        """Serialize explicitly configured settings as Docker env values."""
        values = self.model_dump(by_alias=True, exclude_none=True, mode="json")
        return {key: str(value) for key, value in values.items()}


def load_container_env() -> dict[str, str]:
    """Load and validate approved agent settings from the project .env file."""
    return ContainerEnvSettings().to_env()


class ContainerResourceSettings(BaseSettings):
    """Docker resource settings for experiment-owned containers."""

    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=True,
        populate_by_name=True,
    )

    resource_container_cpus: float = Field(default=1.0, alias="AGENT_CONTAINER_CPUS", gt=0.0)
    resource_container_memory: str = Field(default="1g", alias="AGENT_CONTAINER_MEMORY", min_length=1)

    def resource_limits(self) -> DockerResourceLimits:
        """Build Docker resource limits from settings."""
        return DockerResourceLimits(cpus=self.resource_container_cpus, memory=self.resource_container_memory)


def load_container_resource_settings() -> ContainerResourceSettings:
    """Load Docker resource settings for containers."""
    return ContainerResourceSettings()
