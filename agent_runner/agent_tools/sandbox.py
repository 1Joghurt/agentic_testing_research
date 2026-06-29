from pathlib import Path

from agent_runner.collector.service import CollectorService
from agent_runner.settings import settings


class AgentSandbox:
    """Resolve agent-visible paths inside an isolated run directory."""

    def __init__(self, collector: CollectorService) -> None:
        """Initialize the instance."""
        self._collector = collector
        self._base_path = Path(settings.agent_sandbox_path)

    def get_current_run_path(self) -> Path:
        """Return the active run directory."""
        run_path = self._base_path.resolve()
        run_path.mkdir(parents=True, exist_ok=True)
        return run_path

    def resolve_agent_path(self, path: str) -> Path:
        """Resolve an agent path under the active run directory."""
        run_path = self.get_current_run_path()
        clean_path = self._normalize_agent_path(path)
        target_path = (run_path / clean_path).resolve()

        if target_path != run_path and run_path not in target_path.parents:
            msg = f"Path '{path}' is outside the agent run sandbox."
            raise ValueError(msg)

        return target_path

    def _normalize_agent_path(self, path: str) -> Path:
        """Normalize a path supplied by the agent."""
        raw_path = Path(path.strip() or ".")
        if raw_path.is_absolute():
            raw_path = Path(*raw_path.parts[1:])
        return raw_path
