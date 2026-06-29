import json
from pathlib import Path

from agent_runner.collector.outputs.base import CollectorEntry, OutputBase
from agent_runner.settings import settings


class JsonlOutput(OutputBase):
    """Write collector events to a JSONL report file."""

    def __init__(self) -> None:
        """Initialize the instance."""
        self.output_path = Path(settings.output_path)
        self.log_path: Path | None = None

    def begin_run(self, run_id: str) -> None:
        """Prepare the output adapter for a new run."""
        self.log_path = self.output_path / "report.jsonl"
        self.log_path.parent.mkdir(parents=True, exist_ok=True)

    def collect(self, entry: CollectorEntry) -> None:
        """Collect one event entry."""
        if self.log_path is None:
            return

        with self.log_path.open("a", encoding="utf-8") as log_file:
            json.dump(entry, log_file, ensure_ascii=False, default=str)
            log_file.write("\n")

    def end_run(self) -> None:
        """Finalize the output adapter after a run."""
        self.log_path = None
