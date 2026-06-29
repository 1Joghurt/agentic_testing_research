import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from experiment_orchestration.agent_networking import InternalAgentNetwork
from experiment_orchestration.constants import PLAYWRIGHT_RUNNER_IMAGE
from experiment_orchestration.data_classes import AdditionalScriptRunResult, ExecutionRun
from experiment_orchestration.helper import (
    additional_project_name,
    compose_run,
    destroy_test_objects,
    get_compose_dir,
    sanitize_docker_component,
    wait_for_instance,
)
from experiment_orchestration.models import AdditionalScriptExecutionConfig
from experiment_orchestration.settings import ContainerEnvSettings, load_container_resource_settings
from experiment_orchestration.test_objects import TestObjectMeta


class ScriptRunner:
    """Run setup or evaluation scripts for an experiment."""

    def __init__(
        self,
        experiment_id: str,
        meta: TestObjectMeta,
        sandbox_base: Path,
        console_output: bool = False,
    ) -> None:
        """Initialize the instance."""
        self.experiment_id = experiment_id
        self.meta = meta
        self.sandbox_base = sandbox_base
        self.console_output = console_output
        self.container_resource_limits = load_container_resource_settings().resource_limits()

    def run_additional_scripts(
        self,
        execution_runs: list[ExecutionRun],
        run_dirs: list[Path],
    ) -> None:
        """Execute generated suites using each run's follow-up configuration."""
        configured_runs: list[tuple[ExecutionRun, Path, AdditionalScriptExecutionConfig]] = []
        for execution_run, run_dir in zip(execution_runs, run_dirs, strict=True):
            additional_config = execution_run.run_config.additional_script_executions
            if additional_config is not None:
                configured_runs.append((execution_run, run_dir, additional_config))

        if not configured_runs:
            return

        max_executions = max(config.executions for _, _, config in configured_runs)

        # Repetitions remain sequential, while all eligible run/version pairs run concurrently.
        for additional_execution in range(1, max_executions + 1):
            jobs = [
                (execution_run, run_dir, version)
                for execution_run, run_dir, config in configured_runs
                if additional_execution <= config.executions
                for version in config.versions
            ]
            print(
                f"[experiment:{self.experiment_id[:8]}] Running generated suites against "
                f"{len(jobs)} run/version pair(s) in additional execution {additional_execution}…"
            )

            with ThreadPoolExecutor(max_workers=len(jobs)) as executor:
                future_to_run = {}
                for instance, (execution_run, run_dir, version) in enumerate(jobs, start=1):
                    # Every concurrent version/run pair needs unique host ports.
                    future = executor.submit(
                        self._run_single_additional_script,
                        execution_run,
                        run_dir,
                        instance,
                        version,
                        additional_execution,
                    )
                    future_to_run[future] = (execution_run, run_dir, version)

                # Persist each result immediately so later failures cannot erase it.
                for future in as_completed(future_to_run):
                    execution_run, run_dir, version = future_to_run[future]
                    try:
                        result = future.result()
                    except Exception as exc:
                        # Unexpected worker failures still become visible metadata.
                        now = datetime.now(UTC).isoformat()
                        result = AdditionalScriptRunResult(
                            run_id=execution_run.run_id,
                            version=version,
                            execution=additional_execution,
                            started_at=now,
                            ended_at=now,
                            report_file=None,
                            exit_code=None,
                            timed_out=False,
                            error=str(exc),
                        )
                    self._append_additional_script_result(run_dir, result)

    def _run_single_additional_script(
        self,
        execution_run: ExecutionRun,
        run_dir: Path,
        instance: int,
        version: str,
        additional_execution: int,
    ) -> AdditionalScriptRunResult:
        """Run one generated suite against one fresh test-object instance."""
        started_at = datetime.now(UTC).isoformat()

        # Suites live in the sandbox, while reports belong to the original log directory.
        suite_dir = (self.sandbox_base / self.experiment_id / execution_run.run_id / "playwright_suite").resolve()
        report_name = f"playwright-report-{self.meta.name}-{version}_{additional_execution}.json"
        report_path = run_dir / report_name

        # Unique names isolate networks, containers, and volumes for concurrent suites.
        launch_id = uuid4().hex[:8]
        project_name = additional_project_name(
            execution_run.run_id,
            version,
            additional_execution,
            self.meta,
            self.experiment_id,
            launch_id,
        )
        container_name = (
            f"research-playwright-{execution_run.run_id[:8]}-"
            f"{sanitize_docker_component(version)}-{additional_execution}-{launch_id}"
        )

        exit_code: int | None = None
        timed_out = False
        error: str | None = None
        command_stderr = ""
        compose_dir: Path | None = None
        network_manager: InternalAgentNetwork | None = None
        timeout_seconds = ContainerEnvSettings().playwright_timeout_seconds

        if not suite_dir.is_dir():
            # A missing suite is recorded without blocking other agents or versions.
            error = f"Playwright suite not found: {suite_dir}"
        else:
            try:
                compose_dir = get_compose_dir(version, self.meta).resolve()

                # Remove stale resources before creating the target.
                destroy_test_objects(
                    [instance],
                    [project_name],
                    version,
                    self.meta,
                    self.experiment_id,
                    compose_dirs=[compose_dir],
                    suppress_errors=True,
                )
                compose_run(
                    instance,
                    project_name,
                    version,
                    self.meta,
                    "up",
                    "--detach",
                    "--build",
                    "--remove-orphans",
                    compose_dir=compose_dir,
                )

                # Join an internal network only after the application is reachable.
                wait_for_instance(instance, project_name, self.experiment_id, self.meta)
                network_manager = InternalAgentNetwork(project_name, self.meta)
                network_config = network_manager.create()
                host_uid = os.getuid()
                host_gid = os.getgid()

                print(f"[experiment:{self.experiment_id[:8]}] Starting additional Playwright run against {version}")

                # Mount the suite and write the JSON report directly into agent_logs.
                command = [
                    "docker",
                    "run",
                    "--name",
                    container_name,
                    *self.container_resource_limits.to_docker_args(),
                    "--user",
                    f"{host_uid}:{host_gid}",
                    "--network",
                    network_config.name,
                    "-v",
                    f"{suite_dir}:/runner/suite",
                    "-v",
                    f"{run_dir.resolve()}:/agent_logs",
                    "-e",
                    f"PLAYWRIGHT_JSON_OUTPUT_FILE=/agent_logs/{report_name}",
                    "-e",
                    "HOME=/tmp",
                    "-e",
                    f"TARGET_URL={self.meta.service_url}",
                    PLAYWRIGHT_RUNNER_IMAGE,
                    "--reporter=json",
                    "--output=/tmp/test-results",
                ]
                try:
                    # Test failures are non-zero but still expected to produce a JSON report.
                    completed = subprocess.run(
                        command,
                        capture_output=True,
                        text=True,
                        encoding="utf-8",
                        errors="replace",
                        timeout=timeout_seconds,
                        check=False,
                    )
                    exit_code = completed.returncode
                    command_stderr = completed.stderr.strip()
                except subprocess.TimeoutExpired:
                    timed_out = True
                    error = f"Playwright execution timed out after {timeout_seconds}s."

                # No report means the runner itself failed before completing normal test reporting.
                if not timed_out and not report_path.is_file():
                    error = "Playwright execution did not create a JSON report."
                    if command_stderr:
                        error = f"{error} {command_stderr[-2000:]}"
            except Exception as exc:
                error = str(exc)
            finally:
                # Always remove the runner and its fresh target resources.
                subprocess.run(
                    ["docker", "rm", "-f", container_name],
                    check=False,
                    capture_output=True,
                )
                if network_manager is not None:
                    network_manager.remove()
                if compose_dir is not None:
                    destroy_test_objects(
                        [instance],
                        [project_name],
                        version,
                        self.meta,
                        self.experiment_id,
                        compose_dirs=[compose_dir],
                        suppress_errors=True,
                    )

        # Follow-up failures are recorded but deliberately do not alter the agent result.
        ended_at = datetime.now(UTC).isoformat()
        status = "timeout" if timed_out else ("ok" if exit_code == 0 else "failed")
        print(
            f"[experiment:{self.experiment_id[:8]}] Additional Playwright run "
            f"{execution_run.run_id[:8]} against {version} #{additional_execution} — {status}"
        )
        return AdditionalScriptRunResult(
            run_id=execution_run.run_id,
            version=version,
            execution=additional_execution,
            started_at=started_at,
            ended_at=ended_at,
            report_file=report_name if report_path.is_file() else None,
            exit_code=exit_code,
            timed_out=timed_out,
            error=error,
        )

    def _append_additional_script_result(
        self,
        run_dir: Path,
        result: AdditionalScriptRunResult,
    ) -> None:
        """Append one follow-up execution result to the agent's run.json file."""
        run_file = run_dir / "run.json"
        try:
            run_data = json.loads(run_file.read_text(encoding="utf-8"))
        except Exception as exc:
            print(
                f"[experiment:{self.experiment_id[:8]}] Could not update {run_file}: {exc}",
                file=sys.stderr,
            )
            return

        # Repair an unexpected field type rather than dropping a valid new result.
        additional_results = run_data.setdefault("additional_script_executions", [])
        if not isinstance(additional_results, list):
            additional_results = []
            run_data["additional_script_executions"] = additional_results

        # Preserve target identity, report location, timing, and infrastructure outcome.
        additional_results.append(
            {
                "test_object": self.meta.name,
                "version": result.version,
                "execution": result.execution,
                "target_url": self.meta.service_url,
                "started_at": result.started_at,
                "ended_at": result.ended_at,
                "report_file": result.report_file,
                "exit_code": result.exit_code,
                "timed_out": result.timed_out,
                "error": result.error,
                "container_resources": {
                    "cpus": str(self.container_resource_limits.cpus),
                    "memory": self.container_resource_limits.memory,
                },
            }
        )
        run_file.write_text(json.dumps(run_data, indent=2), encoding="utf-8")
