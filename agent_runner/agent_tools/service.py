from typing import Any

from openai.types.chat import ChatCompletionFunctionToolParam

from agent_runner.agent_tools.base import AgentToolBase
from agent_runner.agent_tools.file_io import DeleteFile, ListFiles, ReadFile, WriteFile
from agent_runner.agent_tools.json_validator import GetJsonSchema, ValidateJson
from agent_runner.agent_tools.npx_playwright import PlaywrightSetup, PlaywrightTestRunner
from agent_runner.agent_tools.playwright_mcp import PlaywrightMCPSession
from agent_runner.collector.service import CollectorService
from agent_runner.settings import settings


class AgentToolService:
    """Register tools and dispatch tool calls for the agent."""

    def __init__(self, collector: CollectorService) -> None:
        """Initialize the instance."""
        self._collector = collector
        self._tools: list[AgentToolBase[Any, Any]] | None = None
        self._playwright_mcp_session = PlaywrightMCPSession(collector)

    async def get_tools(self) -> list[ChatCompletionFunctionToolParam]:
        """Return tool definitions exposed to the model."""
        tools = await self.init_tools()
        tool_params = []

        for tool in tools:
            tool_param = ChatCompletionFunctionToolParam(
                type="function",
                function={
                    "name": tool.get_tool_name(),
                    "description": tool.get_tool_description(),
                    "parameters": tool.get_tool_parameters(),
                },
            )
            tool_params.append(tool_param)
        return tool_params

    async def run_tool(self, tool_name: str, params: Any) -> Any:
        """Run one registered tool by name."""
        tools = await self.init_tools()
        for tool in tools:
            if tool.get_tool_name() == tool_name:
                if tool.is_async():
                    return await tool.run_async(params)
                return tool.run_sync(params)

        raise ValueError(f"Tool with name '{tool_name}' not found.")

    async def init_tools(self) -> list[AgentToolBase[Any, Any]]:
        """Initialize all configured tools."""
        if self._tools is None:
            self._tools = []

            active_tool_names = settings.active_tools

            if "ListFiles" in active_tool_names:
                self._tools.append(ListFiles(self._collector))
            if "ReadFile" in active_tool_names:
                self._tools.append(ReadFile(self._collector))
            if "WriteFile" in active_tool_names:
                self._tools.append(WriteFile(self._collector))
            if "DeleteFile" in active_tool_names:
                self._tools.append(DeleteFile(self._collector))
            if "GetJsonSchema" in active_tool_names:
                self._tools.append(GetJsonSchema(self._collector))
            if "ValidateJson" in active_tool_names:
                self._tools.append(ValidateJson(self._collector))
            if "PlaywrightSetup" in active_tool_names:
                self._tools.append(PlaywrightSetup(self._collector))
            if "PlaywrightTestRunner" in active_tool_names:
                self._tools.append(PlaywrightTestRunner(self._collector))
            if "PlaywrightMCP" in active_tool_names:
                self._tools.extend(await self._playwright_mcp_session.get_tools())

        return self._tools

    async def close(self) -> None:
        """Release tool service resources."""
        await self._playwright_mcp_session.close()
