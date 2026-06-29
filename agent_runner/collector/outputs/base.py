from abc import ABC, abstractmethod
from typing import Any

type CollectorEntry = dict[str, Any]


class OutputBase(ABC):
    """Define the interface for collector output adapters."""

    @abstractmethod
    def begin_run(self, run_id: str) -> None:
        """Prepare the output adapter for a new run."""
        pass

    @abstractmethod
    def collect(self, entry: CollectorEntry) -> None:
        """Collect one event entry."""
        pass

    @abstractmethod
    def end_run(self) -> None:
        """Finalize the output adapter after a run."""
        pass
