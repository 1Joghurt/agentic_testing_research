import json
from datetime import UTC, datetime
from typing import Any, cast

from rich.console import Console
from rich.markdown import Markdown
from rich.panel import Panel
from rich.rule import Rule
from rich.style import Style
from rich.text import Text

from agent_runner.collector.outputs.base import CollectorEntry, OutputBase
from agent_runner.collector.service import CollectorEvent

console = Console()

_DIM = Style(dim=True)
_SYSTEM = Style(bold=True, color="magenta")
_USER = Style(bold=True, color="cyan")
_ASSISTANT = Style(bold=True, color="green")
_TOOL = Style(bold=True, color="yellow")
_ERROR = Style(bold=True, color="red")
_SUCCESS = Style(color="green")


class ConsoleOutput(OutputBase):
    """Render collector events to the terminal."""

    def __init__(self) -> None:
        """Initialize the instance."""
        self.run_id: str | None = None
        self._start_time: datetime | None = None
        self._total_tokens: int = 0
        self._total_input_tokens: int = 0
        self._total_cached_input_tokens: int = 0
        self._total_output_tokens: int = 0

    def begin_run(self, run_id: str) -> None:
        """Prepare the output adapter for a new run."""
        self.run_id = run_id
        self._start_time = datetime.now(UTC)
        self._total_tokens = 0
        self._total_input_tokens = 0
        self._total_cached_input_tokens = 0
        self._total_output_tokens = 0
        console.print()
        console.print()
        console.print(Rule(Text(f"  Agent Run · {run_id[:8]}  ", style="bold white"), style="bright_blue"))

    def collect(self, entry: CollectorEntry) -> None:
        """Collect one event entry."""
        event = str(entry.get("event", "unknown"))
        data = cast(dict[str, Any], entry.get("data", {}))
        self._render(event, data)

    def end_run(self) -> None:
        """Finalize the output adapter after a run."""
        elapsed_s = None
        if self._start_time is not None:
            elapsed_s = (datetime.now(UTC) - self._start_time).total_seconds()

        parts: list[str] = ["Done"]
        if self.run_id:
            parts.append(self.run_id[:8])
        if self._total_tokens:
            miss = self._total_input_tokens
            hit = self._total_cached_input_tokens
            out = self._total_output_tokens
            total = self._total_tokens
            parts.append(f"{miss:,}↑ | {hit:,}↑ᶜ | {out:,}↓ | {total:,} ∑")
        if elapsed_s is not None:
            parts.append(f"{elapsed_s:.1f}s")

        title = Text(f"  {' · '.join(parts)}  ", style="bold white")
        console.print(Rule(title, style="bright_blue"))
        self.run_id = None
        self._start_time = None

    def _render(self, event: str, data: dict[str, Any]) -> None:
        """Render one collector event to the console."""
        if event == CollectorEvent.MESSAGE.value:
            self._render_message(data)
        elif event == CollectorEvent.COMPLETION.value:
            self._render_completion(data)
        elif event == CollectorEvent.TOOL_CALL_STARTED.value:
            self._render_tool_started(data)
        elif event == CollectorEvent.TOOL_CALL_FINISHED.value:
            self._render_tool_finished(data)
        elif event == CollectorEvent.TOOL_CALL_FAILED.value:
            self._render_tool_failed(data)
        elif event == CollectorEvent.TOOL_INTERNAL_EVENT.value:
            self._render_tool_internal(data)
        elif event == CollectorEvent.TOKEN_LIMIT_REACHED.value:
            used = data.get("session_tokens", "?")
            limit = data.get("max_tokens", "?")
            console.print(Text(f"  Token limit reached ({used}/{limit})", style="yellow"))
        elif event == CollectorEvent.UNEXPECTED_COMPLETION_STOP.value:
            reason = data.get("stop_reason", "unknown")
            console.print(Text(f"  Unexpected stop  stop_reason={reason}", style="yellow"))
        elif event == CollectorEvent.MISSING_ASSISTANT_MESSAGE.value:
            console.print(Text("  Missing assistant message", style="yellow"))

    def _render_message(self, data: dict[str, Any]) -> None:
        """Render a chat message event."""
        message = data.get("message")
        if not isinstance(message, dict):
            return
        role = message.get("role", "unknown")
        content = message.get("content")
        if not isinstance(content, str) or not content.strip():
            return

        if role == "system":
            console.print()
            console.print(
                Panel(
                    Markdown(content.strip()),
                    title=Text("System", style=_SYSTEM),
                    title_align="left",
                    border_style="magenta",
                    padding=(0, 1),
                )
            )
        elif role == "user":
            console.print()
            line = Text("User  ", style=_USER)
            line.append(content.strip(), style="white")
            console.print(line)

    def _render_completion(self, data: dict[str, Any]) -> None:
        """Render an assistant completion event."""
        content = data.get("content")
        tool_calls = data.get("tool_calls") or []
        input_cache_miss = data.get("input_tokens_cache_miss", 0) or 0
        input_cache_hit = data.get("input_tokens_cache_hit", 0) or 0
        output_tokens = data.get("output_tokens", 0) or 0
        total = data.get("total_tokens", 0) or 0
        if total:
            self._total_tokens += total
            self._total_input_tokens += input_cache_miss
            self._total_cached_input_tokens += input_cache_hit
            self._total_output_tokens += output_tokens
        reasoning_content = data.get("reasoning_content")
        # For tool calls: prefer content, fall back to reasoning_content as a brief hint
        thinking = content if (isinstance(content, str) and content.strip()) else reasoning_content
        if tool_calls:
            if isinstance(thinking, str) and thinking.strip():
                console.print()
                line = Text("  ↳ ", style=_DIM)
                line.append(self._truncate(thinking.strip().replace("\n", " "), 120), style=_DIM)
                console.print(line)
        elif not isinstance(content, str) or not content.strip():
            pass
        else:
            console.print()
            console.print(
                Panel(
                    Markdown(content.strip()),
                    title=Text("Assistant", style=_ASSISTANT),
                    title_align="left",
                    border_style="green",
                    padding=(0, 1),
                )
            )
        if self._total_tokens:
            self._render_token_summary()

    def _render_token_summary(self) -> None:
        """Render accumulated token usage."""
        miss = self._total_input_tokens
        hit = self._total_cached_input_tokens
        out = self._total_output_tokens
        total = self._total_tokens
        line = Text(
            f"  {miss:,}↑ | {hit:,}↑ᶜ | {out:,}↓ | {total:,} ∑",
            style=_DIM,
        )
        console.print(line)

    def _render_tool_started(self, data: dict[str, Any]) -> None:
        """Render a started tool call."""
        tool_name = str(data.get("tool_name", "unknown"))
        arguments = data.get("arguments", {})
        line = Text("  ▸ ", style=_TOOL)
        line.append(tool_name, style=_TOOL)
        args_inline = self._format_args_inline(arguments)
        if args_inline:
            line.append(f"  {args_inline}", style=_DIM)
        console.print(line)

    def _render_tool_finished(self, data: dict[str, Any]) -> None:
        """Render a finished tool call."""
        result = data.get("result")
        preview = self._format_result(result)
        line = Text("    ← ", style=_DIM)
        line.append(preview, style=_SUCCESS)
        console.print(line)

    def _render_tool_failed(self, data: dict[str, Any]) -> None:
        """Render a failed tool call."""
        tool_name = str(data.get("tool_name", "unknown"))
        error = str(data.get("error", "unknown error"))
        console.print(Text(f"  ✗ {tool_name}  {error}", style=_ERROR))

    def _render_tool_internal(self, data: dict[str, Any]) -> None:
        """Render an internal tool event."""
        tool_event = data.get("tool_event", "")
        rest = {k: v for k, v in data.items() if k != "tool_event"}
        label = str(tool_event).replace("_", " ").capitalize()
        preview = self._truncate(json.dumps(rest, ensure_ascii=False, default=str), 80) if rest else ""
        line = Text(f"    {label}", style=_DIM)
        if preview:
            line.append(f"  {preview}", style=_DIM)
        console.print(line)

    def _format_args_inline(self, arguments: Any) -> str:
        """Format tool arguments as one compact line."""
        if not isinstance(arguments, dict) or not arguments:
            return ""
        parts = []
        for key, val in arguments.items():
            val_str = val if isinstance(val, str) else json.dumps(val, ensure_ascii=False, default=str)
            val_str = val_str.replace("\n", " ").replace("\r", "")
            parts.append(f"{key}={self._truncate(val_str, 40)}")
        return "  ".join(parts)

    def _format_result(self, result: Any) -> str:
        """Format a tool result preview."""
        if result is None:
            return "null"
        if isinstance(result, str):
            return self._truncate(result, 100)
        try:
            return self._truncate(json.dumps(result, ensure_ascii=False, default=str), 100)
        except Exception:
            return self._truncate(str(result), 100)

    def _truncate(self, value: str, max_length: int) -> str:
        """Shorten text to the requested length."""
        if len(value) <= max_length:
            return value
        return f"{value[: max_length - 3]}..."
