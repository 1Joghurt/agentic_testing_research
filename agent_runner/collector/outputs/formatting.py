from typing import Any

from agent_runner.collector.service import CollectorEvent


class EventFormatter:
    """Convert collector events into short display labels."""

    @classmethod
    def display_event(cls, event: str, data: dict[str, Any]) -> str:
        """Return a human-readable label for a collector event."""
        if event == CollectorEvent.AGENT_RUN_STARTED.value:
            return "Run started"

        if event == CollectorEvent.AGENT_RUN_FINISHED.value:
            return "Run finished"

        if event == CollectorEvent.AGENT_RUN_TIMED_OUT.value:
            return "Run timed out"

        if event == CollectorEvent.MESSAGE.value:
            message = data.get("message")
            if isinstance(message, dict):
                role = str(message.get("role", "unknown"))
                if role == "system":
                    return "System prompt"
                if role == "user":
                    return "User message"
                if role == "assistant":
                    return "Assistant message"
                if role == "tool":
                    return "Tool response"

            return "Message"

        if event == CollectorEvent.COMPLETION.value:
            return "Assistant completion"

        if event == CollectorEvent.TOOL_CALL_STARTED.value:
            return "Tool started"

        if event == CollectorEvent.TOOL_CALL_FINISHED.value:
            return "Tool finished"

        if event == CollectorEvent.TOOL_CALL_FAILED.value:
            return "Tool failed"

        if event == CollectorEvent.TOOL_INTERNAL_EVENT.value:
            tool_event = data.get("tool_event")
            if tool_event is not None:
                return cls.humanize_identifier(str(tool_event))

            return "Tool event"

        return cls.humanize_identifier(event)

    @classmethod
    def humanize_identifier(cls, value: str) -> str:
        """Convert an identifier into a display label."""
        return value.replace("_", " ").strip().capitalize()
