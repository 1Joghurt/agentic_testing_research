from collections.abc import Sequence
from dataclasses import dataclass

from openai import APIConnectionError, AsyncOpenAI
from openai.types.chat import (
    ChatCompletionFunctionToolParam,
    ChatCompletionMessage,
    ChatCompletionMessageParam,
    ChatCompletionMessageToolCallUnion,
)

from agent_runner.settings import AppSettings

MAX_SUPPORTED_TOKENS_LIMIT = 393216


@dataclass(frozen=True)
class LLMResult:
    """Hold normalized model output and token accounting data."""

    content: str | None
    reasoning_content: str | None
    input_tokens_cache_miss: int
    input_tokens_cache_hit: int
    output_tokens: int
    total_tokens: int
    stop_reason: str | None = None
    tool_calls: list[ChatCompletionMessageToolCallUnion] | None = None
    assistant_message: ChatCompletionMessage | None = None


class LLMClient:
    """Create OpenAI-compatible chat completions for the agent."""

    def __init__(self, settings: AppSettings, client: AsyncOpenAI | None = None) -> None:
        """Initialize the instance."""
        self.settings = settings
        self.client = client or AsyncOpenAI(
            api_key=settings.api_key.get_secret_value(),
            base_url=settings.base_url,
        )

    async def create_completion(
        self,
        messages: Sequence[ChatCompletionMessageParam],
        max_tokens: int,
        tools: Sequence[ChatCompletionFunctionToolParam] | None = None,
    ) -> LLMResult:

        max_retries = 3

        while max_retries > 0:
            try:
                return await self._create_completion(messages, max_tokens, tools)
            except APIConnectionError:
                max_retries -= 1
                if max_retries <= 0:
                    raise
        raise RuntimeError("unreachable")  # satisfy type checker

    async def _create_completion(
        self,
        messages: Sequence[ChatCompletionMessageParam],
        max_tokens: int,
        tools: Sequence[ChatCompletionFunctionToolParam] | None = None,
    ) -> LLMResult:
        """Create a chat completion and normalize the result."""
        response = await self.client.chat.completions.create(
            model=self.settings.model,
            messages=list(messages),
            tools=list(tools or []),
            max_completion_tokens=min(max_tokens, MAX_SUPPORTED_TOKENS_LIMIT),
            temperature=self.settings.temperature,
            reasoning_effort=self.settings.reasoning_effort,
            stream=False,
        )

        choice = response.choices[0]

        usage = response.usage

        reasoning_content = getattr(choice.message, "reasoning_content", None) or None

        if usage is None:
            return LLMResult(
                content=choice.message.content,
                reasoning_content=reasoning_content,
                input_tokens_cache_miss=0,
                input_tokens_cache_hit=0,
                output_tokens=0,
                total_tokens=0,
                stop_reason=choice.finish_reason if choice.finish_reason else None,
                tool_calls=choice.message.tool_calls if choice.message.tool_calls else None,
                assistant_message=choice.message,
            )

        input_tokens_cache_hit = (usage.prompt_tokens_details.cached_tokens if usage.prompt_tokens_details else 0) or 0
        input_tokens_cache_miss = max(0, usage.prompt_tokens - input_tokens_cache_hit)

        return LLMResult(
            content=choice.message.content,
            reasoning_content=reasoning_content,
            input_tokens_cache_miss=input_tokens_cache_miss,
            input_tokens_cache_hit=input_tokens_cache_hit,
            output_tokens=usage.completion_tokens,
            total_tokens=usage.total_tokens,
            stop_reason=choice.finish_reason if choice.finish_reason else None,
            tool_calls=choice.message.tool_calls if choice.message.tool_calls else None,
            assistant_message=choice.message,
        )
