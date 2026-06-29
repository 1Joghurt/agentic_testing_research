import asyncio
from contextlib import AsyncExitStack
from typing import Any

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from mcp.types import CallToolResult

from agent_runner.agent_tools.base import AgentToolBase
from agent_runner.agent_tools.sandbox import AgentSandbox
from agent_runner.collector.service import CollectorService
from agent_runner.settings import settings

PLAYWRIGHT_CAPABILITIES = "network,storage,testing,config,vision,pdf,devtools"
PLAYWRIGHT_CHROMIUM_EXECUTABLE = "/usr/local/bin/playwright-chromium"


class PlaywrightMCPTool(AgentToolBase[Any, Any]):
    """Wrap one Playwright MCP tool for agent execution."""

    def __init__(
        self,
        collector: CollectorService,
        session: PlaywrightMCPSession,
        tool_name: str,
        tool_description: str,
        tool_parameters: dict[str, Any],
    ) -> None:
        """Initialize the instance."""
        super().__init__(collector)
        self._session = session
        self.display_name = f"playwright__{tool_name}"
        self.tool_name = tool_name
        self.tool_description = tool_description
        self.tool_parameters = tool_parameters

    def get_tool_name(self) -> str:
        """Return the tool name exposed to the model."""
        return self.display_name

    def get_tool_description(self) -> str:
        """Return the tool description exposed to the model."""
        return self.tool_description

    def get_tool_parameters(self) -> dict[str, Any]:
        """Return the JSON schema for tool parameters."""
        return self.tool_parameters

    def is_async(self) -> bool:
        """Return whether the tool must be awaited."""
        return True

    async def run_async(self, params: dict[str, Any]) -> Any:
        """Run the tool asynchronously."""
        return await self._session.call_tool(self.tool_name, params)


class PlaywrightMCPSession:
    """Manage the lifecycle of the Playwright MCP session."""

    def __init__(self, collector: CollectorService) -> None:
        """Initialize the instance."""
        self._collector = collector
        self._sandbox = AgentSandbox(collector)
        self._exit_stack: AsyncExitStack | None = None
        self._session: ClientSession | None = None
        self._tools: list[PlaywrightMCPTool] | None = None
        self._startup_lock = asyncio.Lock()
        self._call_lock = asyncio.Lock()

    async def get_tools(self) -> list[PlaywrightMCPTool]:
        """Return tool definitions exposed to the model."""
        await self._ensure_started()
        if self._tools is None:
            session = self._get_session()
            tools_result = await session.list_tools()
            self._tools = [
                PlaywrightMCPTool(self._collector, self, tool.name, tool.description or "", tool.inputSchema)
                for tool in tools_result.tools
                if tool.name
                not in ["browser_run_code_unsafe", "browser_resume", "browser_annotate", "browser_evaluate"]
            ]
        return self._tools

    async def call_tool(self, tool_name: str, params: dict[str, Any]) -> Any:
        """Call tool."""
        await self._ensure_started()
        async with self._call_lock:
            result: CallToolResult = await self._get_session().call_tool(tool_name, params)
        return _format_call_tool_result(result)

    async def close(self) -> None:
        """Release tool service resources."""
        if self._exit_stack is not None:
            await self._exit_stack.aclose()
        self._exit_stack = None
        self._session = None
        self._tools = None

    async def _ensure_started(self) -> None:
        """Start the MCP session when needed."""
        if self._session is not None:
            return
        async with self._startup_lock:
            if self._session is not None:
                return
            exit_stack = AsyncExitStack()
            try:
                read, write = await exit_stack.enter_async_context(stdio_client(self._build_server_params()))
                session = await exit_stack.enter_async_context(ClientSession(read, write))
                await session.initialize()
            except Exception:
                await exit_stack.aclose()
                raise
            self._exit_stack = exit_stack
            self._session = session

    def _get_session(self) -> ClientSession:
        """Return the active MCP client session."""
        if self._session is None:
            raise RuntimeError("Playwright MCP session is not initialized.")
        return self._session

    def _build_server_params(self) -> StdioServerParameters:
        """Build stdio server parameters for the MCP process."""
        agent_sandbox_path = self._sandbox.get_current_run_path()
        allowed_origin = settings.target_url
        cache_path = agent_sandbox_path / ".cache"
        cache_path.mkdir(parents=True, exist_ok=True)

        return StdioServerParameters(
            # Use the globally installed binary directly to avoid npm downloads.
            command="playwright-mcp",
            args=[
                "--executable-path",
                PLAYWRIGHT_CHROMIUM_EXECUTABLE,
                f"--caps={PLAYWRIGHT_CAPABILITIES}",
                "--headless",
                "--output-mode",
                "file",
                "--allowed-origins",
                allowed_origin,
            ],
            cwd=agent_sandbox_path,
            env={
                "HOME": str(agent_sandbox_path),
                "XDG_CACHE_HOME": str(cache_path),
            },
        )


def _format_call_tool_result(result: CallToolResult) -> dict[str, Any]:
    """Convert an MCP tool result into serializable content."""
    if len(result.content) == 1 and hasattr(result.content[0], "text"):
        return {"result": result.content[0].text}
    return {"result": [content.model_dump(mode="json") for content in result.content]}
