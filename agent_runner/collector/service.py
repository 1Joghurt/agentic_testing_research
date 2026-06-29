from collections.abc import Mapping, Sequence
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any

from agent_runner.collector.outputs.base import CollectorEntry, OutputBase
from agent_runner.settings import settings


class CollectorEvent(StrEnum):
    """List event names emitted by the collector."""

    AGENT_RUN_STARTED = "agent_run_started"
    AGENT_RUN_FINISHED = "agent_run_finished"
    AGENT_RUN_TIMED_OUT = "agent_run_timed_out"
    AGENT_RUN_FAILED = "agent_run_failed"
    MESSAGE = "message"
    COMPLETION = "completion"
    TOOL_CALL_STARTED = "tool_call_started"
    TOOL_CALL_FINISHED = "tool_call_finished"
    TOOL_CALL_FAILED = "tool_call_failed"
    TOOL_INTERNAL_EVENT = "tool_internal_event"
    TOKEN_LIMIT_REACHED = "token_limit_reached"
    UNEXPECTED_COMPLETION_STOP = "unexpected_completion_stop"
    MISSING_ASSISTANT_MESSAGE = "missing_assistant_message"


class CollectorService:
    """Fan collector events out to configured output adapters."""

    def __init__(
        self,
        outputs: Sequence[OutputBase],
    ) -> None:
        """Initialize the instance."""
        self.outputs = list(outputs)
        self.run_id: str | None = None

    def begin_agent_run(self, run_id: str) -> str:
        """Start collector outputs for one agent run."""
        self.run_id = run_id

        for output in self.outputs:
            output.begin_run(self.run_id)

        self.collect(CollectorEvent.AGENT_RUN_STARTED, data={"metadata": settings.to_collector_metadata()})
        return self.run_id

    def end_agent_run(self) -> None:
        """Finish collector outputs for one agent run."""
        self.collect(CollectorEvent.AGENT_RUN_FINISHED)
        for output in self.outputs:
            output.end_run()

        self.run_id = None

    def collect(self, event: CollectorEvent, data: Mapping[str, Any] | None = None) -> None:
        """Collect one event entry."""
        self._collect(event.value, data)

    def collect_tool_event(self, event: StrEnum, data: Mapping[str, Any] | None = None) -> None:
        """Collect an internal event emitted by a tool."""
        self._collect(event=CollectorEvent.TOOL_INTERNAL_EVENT.value, data={**(data or {}), "tool_event": event.value})

    def get_agent_run_id(self) -> str:
        """Return the active agent run identifier."""
        if self.run_id is None:
            raise ValueError("No active agent run.")
        return self.run_id

    def _collect(self, event: str, data: Mapping[str, Any] | None = None) -> None:
        """Write one collector entry to all outputs."""
        if self.run_id is None:
            return

        entry: CollectorEntry = {
            "timestamp": datetime.now(UTC).isoformat(),
            "run_id": self.run_id,
            "event": event,
            "data": data or {},
        }

        for output in self.outputs:
            output.collect(entry)
