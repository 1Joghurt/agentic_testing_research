from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings

ReasoningEffort = Literal["none", "minimal", "low", "medium", "high", "xhigh"]


class AppSettings(BaseSettings):
    """Application settings loaded from environment variables or .env."""

    api_key: SecretStr = Field(default=SecretStr(""), validation_alias="API_KEY")
    model: str = Field(default="deepseek-v4-pro", validation_alias="MODEL")
    base_url: str | None = Field(default="https://api.deepseek.com", validation_alias="BASE_URL")
    max_tokens: int = Field(default=0, validation_alias="MAX_TOKENS", ge=0)
    temperature: float = Field(default=0.0, validation_alias="TEMPERATURE", ge=0.0, le=2.0)
    reasoning_effort: ReasoningEffort | None = Field(default="high", validation_alias="REASONING_EFFORT")
    output_path: Path = Field(default=Path("agent_logs"), validation_alias="OUTPUT_PATH")
    agent_sandbox_path: Path = Field(default=Path("agent_sandbox"), validation_alias="AGENT_SANDBOX_PATH")

    # Container-specific: set by the experiment runner via env vars
    run_id: str = Field(default="", validation_alias="RUN_ID")
    target_url: str = Field(default="", validation_alias="TARGET_URL")
    agent_timeout_seconds: int = Field(default=1, validation_alias="AGENT_TIMEOUT_SECONDS", ge=1)
    run_input_path: Path = Field(default=Path("/run-input"), validation_alias="RUN_INPUT_PATH")
    active_tools: list[str] = Field(default_factory=list, validation_alias="ACTIVE_TOOLS")

    @field_validator("api_key")
    @classmethod
    def validate_api_key(cls, value: SecretStr) -> SecretStr:
        # Allow empty key during validate-only mode; actual runs will fail at LLM call
        """Validate that an API key is available."""
        return value

    @field_validator("model")
    @classmethod
    def validate_model(cls, value: str) -> str:
        """Validate that a model name is configured."""
        value = value.strip()
        if not value:
            msg = "MODEL must not be empty."
            raise ValueError(msg)
        return value

    @field_validator("base_url")
    @classmethod
    def normalize_base_url(cls, value: str | None) -> str | None:
        """Normalize the configured API base URL."""
        if value is None:
            return None

        value = value.strip()
        return value or None

    def to_collector_metadata(self) -> dict[str, object]:
        """Return run metadata that is useful for logs and safe to persist."""
        return {
            "model": self.model,
            "base_url": self.base_url,
            "target_url": self.target_url,
            "max_tokens": self.max_tokens,
            "temperature": self.temperature,
            "reasoning_effort": self.reasoning_effort,
            "output_path": self.output_path.as_posix(),
            "agent_sandbox_path": self.agent_sandbox_path.as_posix(),
            "agent_timeout_seconds": self.agent_timeout_seconds,
        }


settings = AppSettings()
