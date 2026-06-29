import asyncio
from abc import ABC, abstractmethod
from collections.abc import Mapping
from enum import StrEnum
from typing import Any

from agent_runner.collector.service import CollectorService


class AgentToolBase[ParamT, ResultT](ABC):
    """Define the common interface for tools exposed to the agent."""

    def __init__(self, collector: CollectorService) -> None:
        """Initialize the instance."""
        self.collector = collector

    def collect(self, event: StrEnum, data: Mapping[str, Any] | None = None) -> None:
        """Collect one event entry."""
        self.collector.collect_tool_event(
            event,
            {
                "tool_name": self.get_tool_name(),
                **(data or {}),
            },
        )

    async def run_async(self, params: ParamT) -> ResultT:
        """Run the tool asynchronously."""
        return self.run_sync(params)

    def run_sync(self, params: ParamT) -> ResultT:
        """Run the tool synchronously."""
        return asyncio.run(self.run_async(params))

    @abstractmethod
    def get_tool_name(self) -> str:
        """Return the tool name exposed to the model."""
        pass

    @abstractmethod
    def get_tool_description(self) -> str:
        """Return the tool description exposed to the model."""
        pass

    @abstractmethod
    def get_tool_parameters(self) -> dict[str, Any]:
        """Return the JSON schema for tool parameters."""
        pass

    def is_async(self) -> bool:
        """Return whether the tool must be awaited."""
        return False
