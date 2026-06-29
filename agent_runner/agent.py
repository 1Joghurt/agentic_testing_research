import asyncio
import json
from typing import cast

from openai.types.chat import (
    ChatCompletionMessageFunctionToolCallParam,
    ChatCompletionMessageParam,
    ChatCompletionToolMessageParam,
)

from agent_runner.agent_tools.sandbox import AgentSandbox
from agent_runner.agent_tools.service import AgentToolService
from agent_runner.collector.service import CollectorEvent, CollectorService
from agent_runner.llm import LLMClient
from agent_runner.settings import settings


class Agent:
    """Coordinate model completions, tool calls, and collector events for one agent run."""

    def __init__(self, collector: CollectorService) -> None:
        """Initialize the instance."""
        self.settings = settings
        self.collector = collector
        self.llm_client = LLMClient(settings)
        self.tool_service = AgentToolService(collector)
        self.sandbox = AgentSandbox(collector)

    async def run(self, system_prompt: str, user_prompt: str, run_id: str) -> None:
        """Run the operation."""
        self.collector.begin_agent_run(run_id=run_id)
        self.sandbox.get_current_run_path()
        session_tokens = 0

        messages: list[ChatCompletionMessageParam] = [
            {
                "role": "system",
                "content": system_prompt or "You are a helpful assistant that can use tools.",
            },
            {
                "role": "user",
                "content": user_prompt,
            },
        ]
        for message in messages:
            self._collect_message(message)

        try:
            while True:
                remaining_tokens = self.settings.max_tokens - session_tokens

                result = await self.llm_client.create_completion(
                    messages,
                    max_tokens=remaining_tokens,
                    tools=await self.tool_service.get_tools(),
                )
                self.collector.collect(
                    CollectorEvent.COMPLETION,
                    {
                        "stop_reason": result.stop_reason,
                        "input_tokens_cache_miss": result.input_tokens_cache_miss,
                        "input_tokens_cache_hit": result.input_tokens_cache_hit,
                        "output_tokens": result.output_tokens,
                        "total_tokens": result.total_tokens,
                        "content": result.content,
                        "reasoning_content": result.reasoning_content,
                        "tool_calls": [
                            tool_call.model_dump(exclude_none=True) for tool_call in result.tool_calls or []
                        ],
                    },
                )

                if result.assistant_message is not None:
                    assistant_message = cast(
                        ChatCompletionMessageParam,
                        result.assistant_message.model_dump(exclude_none=True),
                    )
                    self._collect_message(assistant_message)

                session_tokens += result.total_tokens

                if self.settings.max_tokens > 0 and session_tokens >= self.settings.max_tokens:
                    self.collector.collect(
                        CollectorEvent.TOKEN_LIMIT_REACHED,
                        {
                            "session_tokens": session_tokens,
                            "max_tokens": self.settings.max_tokens,
                        },
                    )
                    return

                if result.stop_reason == "stop":
                    return

                if result.stop_reason != "tool_calls" or not result.tool_calls:
                    self.collector.collect(
                        CollectorEvent.UNEXPECTED_COMPLETION_STOP,
                        {
                            "stop_reason": result.stop_reason,
                            "has_tool_calls": bool(result.tool_calls),
                        },
                    )
                    return

                if result.assistant_message is None:
                    self.collector.collect(
                        CollectorEvent.MISSING_ASSISTANT_MESSAGE,
                        {
                            "stop_reason": result.stop_reason,
                            "tool_call_count": len(result.tool_calls),
                        },
                    )
                    return

                messages.append(assistant_message)

                for tool_call in result.tool_calls:
                    tool_message = await self._run_tool_call(
                        cast(
                            ChatCompletionMessageFunctionToolCallParam,
                            tool_call.model_dump(exclude_none=True),
                        )
                    )
                    messages.append(tool_message)
                    self._collect_message(tool_message)
        except asyncio.CancelledError:
            self.collector.collect(
                CollectorEvent.AGENT_RUN_TIMED_OUT,
                {
                    "timeout_seconds": self.settings.agent_timeout_seconds,
                },
            )
            raise
        except Exception as error:
            self.collector.collect(
                CollectorEvent.AGENT_RUN_FAILED,
                {
                    "error": str(object=error),
                },
            )
            raise
        finally:
            try:
                await self.tool_service.close()
            finally:
                self.collector.end_agent_run()

    def _collect_message(self, message: ChatCompletionMessageParam) -> None:
        """Record a message in the collector."""
        self.collector.collect(CollectorEvent.MESSAGE, data={"message": message})

    async def _run_tool_call(
        self,
        tool_call: ChatCompletionMessageFunctionToolCallParam,
    ) -> ChatCompletionToolMessageParam:
        """Execute one tool call and record its lifecycle events."""
        function = tool_call["function"]
        try:
            arguments = json.loads(function["arguments"])
        except json.JSONDecodeError as error:
            self.collector.collect(
                CollectorEvent.TOOL_CALL_FAILED,
                {
                    "tool_call_id": tool_call["id"],
                    "tool_name": function["name"],
                    "arguments": function["arguments"],
                    "error": str(error),
                },
            )
            return self._build_tool_error_message(tool_call["id"], function["name"], error)

        self.collector.collect(
            CollectorEvent.TOOL_CALL_STARTED,
            {
                "tool_call_id": tool_call["id"],
                "tool_name": function["name"],
                "arguments": arguments,
            },
        )
        try:
            result = await self.tool_service.run_tool(tool_name=function["name"], params=arguments)
        except Exception as error:
            self.collector.collect(
                CollectorEvent.TOOL_CALL_FAILED,
                {
                    "tool_call_id": tool_call["id"],
                    "tool_name": function["name"],
                    "arguments": arguments,
                    "error": str(error),
                },
            )
            return self._build_tool_error_message(tool_call["id"], function["name"], error)

        self.collector.collect(
            CollectorEvent.TOOL_CALL_FINISHED,
            {
                "tool_call_id": tool_call["id"],
                "tool_name": function["name"],
                "result": result,
            },
        )
        result_content = json.dumps(result)
        run_path = str(self.sandbox.get_current_run_path())
        if run_path in result_content:
            result_content = result_content.replace(run_path, "")

        return {
            "role": "tool",
            "tool_call_id": tool_call["id"],
            "content": result_content,
        }

    def _build_tool_error_message(
        self,
        tool_call_id: str,
        tool_name: str,
        error: Exception,
    ) -> ChatCompletionToolMessageParam:
        """Build the tool response sent back after a failed call."""
        return {
            "role": "tool",
            "tool_call_id": tool_call_id,
            "content": json.dumps(
                {
                    "ok": False,
                    "tool_name": tool_name,
                    "error": str(error),
                }
            ),
        }
