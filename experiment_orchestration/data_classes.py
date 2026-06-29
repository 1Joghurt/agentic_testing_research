from dataclasses import dataclass

from experiment_orchestration.models import RunConfig


@dataclass(frozen=True)
class ExecutionRun:
    """Bind one configured run to its generated ID and batch number."""

    run_id: str
    run_config: RunConfig
    execution: int


@dataclass
class RunResult:
    """Persistable outcome of one agent container execution."""

    run_id: str
    run_name: str
    execution: int
    exit_code: int | None
    timed_out: bool
    error: str | None = None

    @property
    def success(self) -> bool:
        """Return whether the agent completed without process or runner errors."""
        return self.exit_code == 0 and not self.timed_out and self.error is None


@dataclass
class AdditionalScriptRunResult:
    """Describe one generated Playwright suite execution against one version."""

    run_id: str
    version: str
    execution: int
    started_at: str
    ended_at: str
    report_file: str | None
    exit_code: int | None
    timed_out: bool
    error: str | None
