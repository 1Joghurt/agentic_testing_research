import asyncio
import sys

from agent_runner.agent import Agent
from agent_runner.collector.outputs.console import ConsoleOutput
from agent_runner.collector.outputs.jsonl import JsonlOutput
from agent_runner.collector.service import CollectorService
from agent_runner.settings import settings


def _load_prompts() -> tuple[str, str]:
    """Load system and user prompts from disk."""
    run_input = settings.run_input_path
    system_prompt = (run_input / "system_prompt.txt").read_text(encoding="utf-8")
    user_prompt = (run_input / "user_prompt.txt").read_text(encoding="utf-8")
    return system_prompt, user_prompt


async def async_main() -> int:
    """Run the asynchronous command-line entry point."""
    if not settings.target_url:
        print("[agent] TARGET_URL is not set. Aborting.", file=sys.stderr)
        return 1

    run_id = settings.run_id

    system_prompt, user_prompt = _load_prompts()

    outputs = [JsonlOutput(), ConsoleOutput()]
    collector = CollectorService(outputs=outputs)
    agent = Agent(collector=collector)

    try:
        await asyncio.wait_for(
            agent.run(system_prompt=system_prompt, user_prompt=user_prompt, run_id=run_id),
            timeout=settings.agent_timeout_seconds,
        )
    except TimeoutError:
        return 124
    return 0


def main() -> int:
    """Run the command-line entry point."""
    return asyncio.run(async_main())


if __name__ == "__main__":
    raise SystemExit(main())
