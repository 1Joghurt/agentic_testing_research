import shlex
import shutil
import subprocess
from enum import StrEnum
from pathlib import Path
from typing import Any, NotRequired, TypedDict

from agent_runner.agent_tools.base import AgentToolBase
from agent_runner.agent_tools.sandbox import AgentSandbox
from agent_runner.collector.service import CollectorService

_SCAFFOLD_PATH = Path(__file__).parent / "playwright_scaffold"
_SUITE_FOLDER = "playwright_suite"


class PlaywrightEvent(StrEnum):
    """List collector event names emitted by Playwright tools."""

    SETUP_SKIPPED = "playwright_setup_skipped"
    SETUP_DONE = "playwright_setup_done"
    SETUP_FAILED = "playwright_setup_failed"
    RUN_STARTED = "playwright_run_started"
    RUN_FINISHED = "playwright_run_finished"
    RUN_FAILED = "playwright_run_failed"


# ── Tool 1: Setup ──────────────────────────────────────────────────────────────


class PlaywrightSetupParams(TypedDict):
    """Define arguments for initializing the Playwright scaffold."""

    pass


class PlaywrightSetupResult(TypedDict):
    """Describe the result of a Playwright scaffold setup."""

    ok: bool
    message: str
    suite_path: str
    error: NotRequired[str]


class PlaywrightSetup(AgentToolBase[PlaywrightSetupParams, PlaywrightSetupResult]):
    """Expose a tool that prepares the Playwright scaffold."""

    def __init__(self, collector: CollectorService) -> None:
        """Initialize the instance."""
        super().__init__(collector)
        self._sandbox = AgentSandbox(collector)

    def run_sync(self, params: PlaywrightSetupParams) -> PlaywrightSetupResult:
        """Run the tool synchronously."""
        suite_path = self._sandbox.get_current_run_path() / _SUITE_FOLDER
        result: PlaywrightSetupResult
        if suite_path.exists():
            result = {
                "ok": True,
                "message": f"Playwright suite already exists at '{suite_path.as_posix()}'. Nothing was changed.",
                "suite_path": suite_path.as_posix(),
            }
            self.collect(PlaywrightEvent.SETUP_SKIPPED, result)
            return result

        try:
            shutil.copytree(_SCAFFOLD_PATH, suite_path)
        except Exception as exc:
            result = {
                "ok": False,
                "message": "Failed to create Playwright suite.",
                "suite_path": suite_path.as_posix(),
                "error": str(exc),
            }
            self.collect(PlaywrightEvent.SETUP_FAILED, result)
            return result

        result = {
            "ok": True,
            "message": f"Playwright suite created at '{suite_path.as_posix()}'.",
            "suite_path": suite_path.as_posix(),
        }
        self.collect(PlaywrightEvent.SETUP_DONE, result)
        return result

    def get_tool_name(self) -> str:
        """Return the tool name exposed to the model."""
        return "Playwright-Setup"

    def get_tool_description(self) -> str:
        """Return the tool description exposed to the model."""
        return (
            "Initialize a Playwright test suite inside the agent sandbox by copying the scaffold. "
            "Does nothing if the suite folder already exists."
        )

    def get_tool_parameters(self) -> dict[str, Any]:
        """Return the JSON schema for tool parameters."""
        return {
            "type": "object",
            "properties": {},
            "required": [],
            "additionalProperties": False,
        }


# ── Tool 2: Test Runner ────────────────────────────────────────────────────────


class PlaywrightRunParams(TypedDict):
    """Define arguments for running Playwright tests."""

    timeout_seconds: int


class PlaywrightRunResult(TypedDict):
    """Describe the result of a Playwright test run."""

    ok: bool
    return_code: int | None
    stdout: str
    stderr: str
    timed_out: bool
    error: NotRequired[str]


class PlaywrightTestRunner(AgentToolBase[PlaywrightRunParams, PlaywrightRunResult]):
    """Expose a tool that executes Playwright tests."""

    def __init__(self, collector: CollectorService) -> None:
        """Initialize the instance."""
        super().__init__(collector)
        self._sandbox = AgentSandbox(collector)

    def run_sync(self, params: PlaywrightRunParams) -> PlaywrightRunResult:
        """Run the tool synchronously."""
        timeout_seconds = int(params.get("timeout_seconds", 60))
        suite_path = self._sandbox.get_current_run_path() / _SUITE_FOLDER

        result: PlaywrightRunResult
        if not suite_path.is_dir():
            result = {
                "ok": False,
                "return_code": None,
                "stdout": "",
                "stderr": "",
                "timed_out": False,
                "error": (
                    f"Playwright suite not found at '{suite_path.as_posix()}'. Run the Playwright-Setup tool first."
                ),
            }
            self.collect(PlaywrightEvent.RUN_FAILED, result)
            return result

        command = "npx playwright test"
        self.collect(PlaywrightEvent.RUN_STARTED, {"cwd": suite_path.as_posix()})

        try:
            completed = subprocess.run(
                shlex.split(command),
                cwd=suite_path,
                shell=False,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=timeout_seconds,
                check=False,
                env={"HOME": "/tmp", "PATH": "/usr/local/bin:/usr/bin:/bin"},
            )
        except subprocess.TimeoutExpired as exc:
            result = {
                "ok": False,
                "return_code": None,
                "stdout": self._decode(exc.stdout),
                "stderr": self._decode(exc.stderr),
                "timed_out": True,
                "error": f"Timed out after {timeout_seconds}s.",
            }
            self.collect(PlaywrightEvent.RUN_FAILED, result)
            return result
        except FileNotFoundError as exc:
            result = {
                "ok": False,
                "return_code": None,
                "stdout": "",
                "stderr": "",
                "timed_out": False,
                "error": str(exc),
            }
            self.collect(PlaywrightEvent.RUN_FAILED, result)
            return result

        result = {
            "ok": completed.returncode == 0,
            "return_code": completed.returncode,
            "stdout": completed.stdout,
            "stderr": completed.stderr,
            "timed_out": False,
        }
        event = PlaywrightEvent.RUN_FINISHED if completed.returncode == 0 else PlaywrightEvent.RUN_FAILED
        self.collect(event, result)
        return result

    def get_tool_name(self) -> str:
        """Return the tool name exposed to the model."""
        return "Playwright-Test-Runner"

    def get_tool_description(self) -> str:
        """Return the tool description exposed to the model."""
        return (
            "Run 'npx playwright test' inside the agent's Playwright suite folder. "
            "Requires the suite to be initialized first via Playwright-Setup."
        )

    def get_tool_parameters(self) -> dict[str, Any]:
        """Return the JSON schema for tool parameters."""
        return {
            "type": "object",
            "properties": {
                "timeout_seconds": {"type": "integer", "description": "Timeout in seconds. Defaults to 60."},
            },
            "required": [],
            "additionalProperties": False,
        }

    def _decode(self, output: str | bytes | None) -> str:
        """Decode process output into text."""
        if output is None:
            return ""
        if isinstance(output, bytes):
            return output.decode("utf-8", errors="replace")
        return output
