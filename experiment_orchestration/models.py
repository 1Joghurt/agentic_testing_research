from __future__ import annotations

import json
import re
from pathlib import Path

from pydantic import BaseModel, Field, PrivateAttr, RootModel, field_validator

from .test_objects import REGISTRY

SYSTEM_PARADIGM_PLACEHOLDER = "{{paradigm_prompt}}"
TARGET_URL_PLACEHOLDER = "{{target_url}}"
CONTEXT_PLACEHOLDER = "{{context}}"
APPINFO_PLACEHOLDER = "{{application_info}}"


def _normalize_version(value: str, label: str) -> str:
    """Normalize a version string for comparison."""
    version = value.strip()
    if not version:
        raise ValueError(f"{label} must not be empty.")
    if re.fullmatch(r"[A-Za-z0-9._-]+", version) is None:
        raise ValueError(f"{label} contains unsupported characters.")
    return version


class AdditionalScriptExecutionConfig(BaseModel):
    """Configure an additional script execution step."""

    executions: int = Field(default=1, ge=1)
    versions: list[str] = Field(min_length=1)

    @field_validator("versions")
    @classmethod
    def versions_valid(cls, values: list[str]) -> list[str]:
        """Validate that script versions are unique."""
        normalized_versions: list[str] = []
        for value in values:
            version = _normalize_version(value, "Additional script execution version")
            if version in normalized_versions:
                raise ValueError(f"Duplicate additional script execution version '{version}'.")
            normalized_versions.append(version)
        return normalized_versions


class RunConfig(BaseModel):
    """Configure one versioned experiment run."""

    model_config = {"extra": "forbid"}

    name: str
    version: str
    system_base_prompt: str
    system_paradigm_prompt: str
    user_prompt: str
    app_specifications: str
    context: str | None
    active_tools: list[str] | None
    additional_script_executions: AdditionalScriptExecutionConfig | None = None

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        """Validate that the run name is not empty."""
        v = v.strip()
        if not v:
            raise ValueError("Run name must not be empty.")
        return v

    @field_validator("version")
    @classmethod
    def version_valid(cls, v: str) -> str:
        """Validate that the run version is normalized."""
        return _normalize_version(v, "Run version")


class ExperimentConfig(BaseModel):
    """Configure one experiment and its prompts, files, and runs."""

    model_config = {"arbitrary_types_allowed": True, "extra": "forbid"}

    name: str
    test_object: str
    executions: int = Field(default=1, ge=1)
    runs: list[RunConfig] = Field(min_length=1)

    _base_dir: Path = PrivateAttr(default_factory=Path)

    def resolve_path(self, relative: str) -> Path:
        """Resolve a path relative to the experiment base directory."""
        return (self._base_dir / relative).resolve()

    def render_system_prompt(self, run: RunConfig) -> str:
        """Render the configured system prompt template."""
        base_path = self.resolve_path(run.system_base_prompt)
        base_prompt = base_path.read_text(encoding="utf-8")
        if SYSTEM_PARADIGM_PLACEHOLDER not in base_prompt:
            raise ValueError(
                f"Run '{run.name}': system_base_prompt missing {SYSTEM_PARADIGM_PLACEHOLDER} placeholder in {base_path}"
            )

        paradigm_prompt = self.resolve_path(run.system_paradigm_prompt).read_text(encoding="utf-8")
        return base_prompt.replace(SYSTEM_PARADIGM_PLACEHOLDER, paradigm_prompt)

    def render_user_prompt(self, run: RunConfig, target_url: str) -> str:
        """Render the configured user prompt template."""
        user_prompt = self.resolve_path(run.user_prompt).read_text(encoding="utf-8")

        context = ""
        if run.context is not None:
            context = self.resolve_path(run.context).read_text(encoding="utf-8").strip()
            context = context.replace(TARGET_URL_PLACEHOLDER, target_url)

        app_specifications = self.resolve_path(run.app_specifications).read_text(encoding="utf-8")
        return (
            user_prompt.replace(TARGET_URL_PLACEHOLDER, target_url)
            .replace(APPINFO_PLACEHOLDER, app_specifications)
            .replace(CONTEXT_PLACEHOLDER, context)
        )

    def _validate_existing_file(self, run: RunConfig, relative: str, label: str, errors: list[str]) -> Path:
        """Validate that a configured file exists."""
        path = self.resolve_path(relative)
        if not path.is_file():
            errors.append(f"Run '{run.name}': {label} file not found: {path}")
        return path

    def validate_files(self) -> list[str]:
        """Validate configured file paths."""
        errors: list[str] = []

        if self.test_object not in REGISTRY:
            errors.append(f"Unknown test_object '{self.test_object}'. Valid: {sorted(REGISTRY)}")

        for run in self.runs:
            if self.test_object in REGISTRY:
                meta = REGISTRY[self.test_object]
                test_object_base = Path(__file__).resolve().parents[1] / "test-objects" / meta.compose_dir_name

                primary_compose_file = test_object_base / run.version / "docker-compose.yml"
                if not primary_compose_file.is_file():
                    errors.append(
                        f"Run '{run.name}': version '{run.version}' has no compose file: {primary_compose_file}"
                    )

                if run.additional_script_executions is not None:
                    for version in run.additional_script_executions.versions:
                        compose_file = test_object_base / version / "docker-compose.yml"
                        if not compose_file.is_file():
                            errors.append(
                                f"Run '{run.name}': additional script execution version "
                                f"'{version}' has no compose file: {compose_file}"
                            )

            system_base_path = self._validate_existing_file(run, run.system_base_prompt, "system_base_prompt", errors)
            self._validate_existing_file(run, run.system_paradigm_prompt, "system_paradigm_prompt", errors)
            if system_base_path.is_file():
                content = system_base_path.read_text(encoding="utf-8")
                if SYSTEM_PARADIGM_PLACEHOLDER not in content:
                    errors.append(
                        f"Run '{run.name}': system_base_prompt missing {SYSTEM_PARADIGM_PLACEHOLDER} "
                        f"placeholder in {system_base_path}"
                    )

            user_prompt_path = self._validate_existing_file(run, run.user_prompt, "user_prompt", errors)
            if user_prompt_path.is_file():
                content = user_prompt_path.read_text(encoding="utf-8")
                if TARGET_URL_PLACEHOLDER not in content:
                    errors.append(
                        f"Run '{run.name}': user_prompt missing {TARGET_URL_PLACEHOLDER} "
                        f"placeholder in {user_prompt_path}"
                    )
                if CONTEXT_PLACEHOLDER not in content:
                    errors.append(f"Run '{run.name}': user_prompt missing {CONTEXT_PLACEHOLDER} placeholder")
                if APPINFO_PLACEHOLDER not in content:
                    errors.append(f"Run '{run.name}': user_prompt missing {APPINFO_PLACEHOLDER} placeholder")

            if run.context is not None:
                p = self.resolve_path(run.context)
                if not p.is_file():
                    errors.append(f"Run '{run.name}': context file not found: {p}")

        return errors


class ExperimentSuiteConfig(RootModel[list[ExperimentConfig]]):
    """Configure a full experiment suite loaded from YAML."""

    @field_validator("root")
    @classmethod
    def experiments_not_empty(cls, experiments: list[ExperimentConfig]) -> list[ExperimentConfig]:
        """Validate that the suite contains experiments."""
        if not experiments:
            raise ValueError("At least one experiment must be configured.")
        return experiments

    @classmethod
    def load(cls, path: Path) -> ExperimentSuiteConfig:
        """Load an experiment suite configuration from disk."""
        suite = cls.model_validate(json.loads(path.read_text(encoding="utf-8")))
        base_dir = path.parent.resolve()
        for experiment in suite.root:
            experiment._base_dir = base_dir
        return suite

    def validate_files(self) -> list[str]:
        """Validate configured file paths."""
        errors: list[str] = []
        for index, experiment in enumerate(self.root, start=1):
            prefix = f"Experiment {index} ('{experiment.name}')"
            errors.extend(f"{prefix}: {error}" for error in experiment.validate_files())
        return errors
