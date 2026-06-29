from __future__ import annotations

import json
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from experiment_orchestration.agent_runner import AgentRunner
from experiment_orchestration.constants import PROJECT_ROOT
from experiment_orchestration.data_classes import ExecutionRun, RunResult
from experiment_orchestration.helper import (
    archive_inputs,
    compose_run,
    destroy_test_objects,
    get_compose_dir,
    sanitize_docker_component,
    wait_for_instance,
)
from experiment_orchestration.script_runner import ScriptRunner

from .models import ExperimentConfig
from .test_objects import REGISTRY, TestObjectMeta


class ExperimentRunner:
    """Coordinate all containers, files, and results for one experiment."""

    def __init__(
        self,
        config: ExperimentConfig,
        config_path: Path,
        console_output: bool = False,
    ) -> None:
        # Resolve all host paths once so later Docker mounts remain deterministic.
        """Initialize the instance."""
        self.config: ExperimentConfig = config
        self.config_path = config_path
        self.base_dir = config_path.parent.resolve()
        self.logs_base = (PROJECT_ROOT / "agent_logs").resolve()
        self.sandbox_base = (PROJECT_ROOT / "agent_sandbox").resolve()
        self.console_output = console_output
        self.experiment_id = str(uuid4())

        print(f"[experiment: ID: {self.experiment_id}]")

        # Registry metadata supplies service names, ports, and Compose locations.
        meta: TestObjectMeta | None = REGISTRY.get(config.test_object)
        if meta is None:
            raise ValueError(f"Unknown test_object: '{config.test_object}'")
        self.meta = meta

        self.agent_runner = AgentRunner(
            self.config,
            self.experiment_id,
            self.meta,
            self.sandbox_base,
            console_output=console_output,
        )
        self.script_runner = ScriptRunner(
            self.experiment_id,
            self.meta,
            self.sandbox_base,
            console_output=console_output,
        )

    def run(self) -> int:
        """Run every configured agent batch and its optional follow-up Playwright suites."""
        # ===== Experiment setup: create result folders and immutable run metadata. =====
        # One experiment directory groups all agent runs and generated reports.
        experiment_dir = self.logs_base / self.experiment_id
        experiment_dir.mkdir(parents=True, exist_ok=True)

        # Each configured run gets its own test-object instance so agents can run in parallel.
        instances = list(range(1, len(self.config.runs) + 1))
        # Create stable run IDs up front for every run/execution combination.
        execution_runs = [
            ExecutionRun(run_id=str(uuid4()), run_config=run_config, execution=execution)
            for execution in range(1, self.config.executions + 1)
            for run_config in self.config.runs
        ]

        # Write the initial experiment manifest before starting external processes.
        started_at = datetime.now(UTC).isoformat()
        self._write_experiment_json(experiment_dir, started_at, execution_runs)

        # Prepare isolated log, input, and sandbox directories for every agent run.
        run_dirs: dict[str, Path] = {}
        for execution_run in execution_runs:
            run_dir = experiment_dir / execution_run.run_id
            run_dir.mkdir(parents=True, exist_ok=True)
            (run_dir / "inputs").mkdir(parents=True, exist_ok=True)
            (self.sandbox_base / self.experiment_id / execution_run.run_id).mkdir(parents=True, exist_ok=True)
            archive_inputs(self.config, execution_run.run_config, run_dir / "inputs", self.meta.service_url)
            run_dirs[execution_run.run_id] = run_dir

        results: list[RunResult] = []

        try:
            # ===== Test objects: build Docker images for the target application versions. =====
            primary_versions = list(dict.fromkeys(run.version for run in self.config.runs))
            print(f"[experiment:{self.experiment_id[:8]}] Building {len(primary_versions)} test object image(s)…")
            for version in primary_versions:
                build_project_name = (
                    f"research-{self.meta.name}-{sanitize_docker_component(version)}-build-{self.experiment_id}"
                )
                compose_run(instances[0], build_project_name, version, self.meta, "build")

            for execution in range(1, self.config.executions + 1):
                # Select the agent runs belonging to the current execution batch.
                current_runs = [run for run in execution_runs if run.execution == execution]
                current_run_dirs = [run_dirs[run.run_id] for run in current_runs]
                current_run_versions = [run.run_config.version for run in current_runs]
                project_names = [
                    (
                        f"research-{self.meta.name}-{sanitize_docker_component(run.run_config.version)}-"
                        f"{self.experiment_id[:8]}-{run.run_id[:8]}-{uuid4().hex[:8]}"
                    )
                    for run in current_runs
                ]

                agents_finished = False
                compose_dirs = [get_compose_dir(version, self.meta).resolve() for version in current_run_versions]

                print(f"[experiment:{self.experiment_id[:8]}] Starting execution {execution}/{self.config.executions}…")
                try:
                    # ===== Test objects: remove stale containers and start fresh target instances. =====
                    destroy_test_objects(
                        instances,
                        project_names,
                        current_run_versions[0],
                        self.meta,
                        self.experiment_id,
                        compose_dirs=compose_dirs,
                        versions=current_run_versions,
                    )

                    # Start one isolated test-object instance per configured agent run.
                    print(f"[experiment:{self.experiment_id[:8]}] Starting {len(instances)} test object instance(s)…")
                    with ThreadPoolExecutor(max_workers=len(instances)) as executor:
                        futures = [
                            executor.submit(
                                compose_run,
                                instance,
                                project_name,
                                version,
                                self.meta,
                                "up",
                                "--detach",
                                "--no-build",
                                "--remove-orphans",
                                compose_dir=compose_dir,
                            )
                            for instance, project_name, version, compose_dir in zip(
                                instances,
                                project_names,
                                current_run_versions,
                                compose_dirs,
                                strict=True,
                            )
                        ]
                        for future in futures:
                            future.result()

                    # Do not start agents until all target applications accept requests.
                    print(f"[experiment:{self.experiment_id[:8]}] Waiting for readiness…")
                    with ThreadPoolExecutor(max_workers=len(instances)) as executor:
                        futures = [
                            executor.submit(wait_for_instance, instance, project_name, self.experiment_id, self.meta)
                            for instance, project_name in zip(instances, project_names, strict=True)
                        ]
                        for future in futures:
                            future.result()

                    # ===== Agents: start one agent container per run against its test object. =====
                    print(f"[experiment:{self.experiment_id[:8]}] Starting {len(current_runs)} agent container(s)…")
                    results.extend(self.agent_runner.run_agents_parallel(current_runs, project_names, current_run_dirs))
                    agents_finished = True
                except Exception as exc:
                    print(
                        f"[experiment:{self.experiment_id[:8]}] Execution {execution} failed: {exc}",
                        file=sys.stderr,
                    )
                finally:
                    # Always remove primary test objects after each agent batch.
                    print(f"[experiment:{self.experiment_id[:8]}] Cleaning up test objects…")
                    destroy_test_objects(
                        instances,
                        project_names,
                        current_run_versions[0],
                        self.meta,
                        self.experiment_id,
                        compose_dirs=compose_dirs,
                        suppress_errors=True,
                        versions=current_run_versions,
                    )

                # ===== Scripts: replay generated Playwright suites after the agents finished. =====
                if agents_finished and any(
                    run.run_config.additional_script_executions is not None for run in current_runs
                ):
                    print(f"[experiment:{self.experiment_id[:8]}] Starting additional Playwright executions…")
                    self.script_runner.run_additional_scripts(current_runs, current_run_dirs)

                # Persist progress after every batch so partial experiments remain inspectable.
                self._write_experiment_json(experiment_dir, started_at, execution_runs, results=results)
        except Exception as exc:
            print(f"[experiment:{self.experiment_id[:8]}] Fatal error: {exc}", file=sys.stderr)

        # Finalize the manifest even when a batch or infrastructure step failed.
        ended_at = datetime.now(UTC).isoformat()
        self._write_experiment_json(
            experiment_dir,
            started_at,
            execution_runs,
            ended_at=ended_at,
            results=results,
        )

        # Additional Playwright failures are metadata only and do not affect this status.
        overall_success = len(results) == len(execution_runs) and all(result.success for result in results)
        status = "success" if overall_success else "failed"
        print(f"[experiment:{self.experiment_id[:8]}] Done — {status}")
        return 0 if overall_success else 1

    def _write_experiment_json(
        self,
        experiment_dir: Path,
        started_at: str,
        execution_runs: list[ExecutionRun],
        ended_at: str | None = None,
        results: list[RunResult] | None = None,
    ) -> None:
        """Write the current experiment manifest as a complete JSON snapshot."""
        # Index completed results while retaining pending runs in the manifest.
        result_map = {r.run_id: r for r in (results or [])}
        runs_data: list[dict[str, Any]] = []
        for execution_run in execution_runs:
            entry: dict[str, Any] = {
                "run_id": execution_run.run_id,
                "name": execution_run.run_config.name,
                "version": execution_run.run_config.version,
                "execution": execution_run.execution,
                "additional_script_executions": (
                    execution_run.run_config.additional_script_executions.model_dump()
                    if execution_run.run_config.additional_script_executions is not None
                    else None
                ),
            }
            if execution_run.run_id in result_map:
                r = result_map[execution_run.run_id]
                entry.update({"exit_code": r.exit_code, "timed_out": r.timed_out, "success": r.success})
            runs_data.append(entry)

        # Rewriting the file keeps every intermediate snapshot internally consistent.
        data: dict[str, Any] = {
            "experiment_id": self.experiment_id,
            "name": self.config.name,
            "test_object": self.config.test_object,
            "executions": self.config.executions,
            "started_at": started_at,
            "ended_at": ended_at,
            "runs": runs_data,
        }
        (experiment_dir / "experiment.json").write_text(json.dumps(data, indent=2), encoding="utf-8")
