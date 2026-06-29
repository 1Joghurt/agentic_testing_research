from __future__ import annotations

import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from experiment_orchestration.agent_networking import InternalAgentNetwork
from experiment_orchestration.constants import AGENT_IMAGE
from experiment_orchestration.data_classes import ExecutionRun, RunResult
from experiment_orchestration.settings import DockerResourceLimits, load_container_env, load_container_resource_settings
from experiment_orchestration.test_objects import TestObjectMeta

from .models import ExperimentConfig


class AgentRunner:
    """Run one configured agent inside a prepared experiment environment."""

    def __init__(
        self,
        config: ExperimentConfig,
        experiment_id: str,
        meta: TestObjectMeta,
        sandbox_base: Path,
        console_output: bool = False,
    ) -> None:
        """Initialize the instance."""
        self.config = config
        self.experiment_id = experiment_id
        self.meta = meta
        self.sandbox_base = sandbox_base
        self.console_output = console_output
        self.container_resource_limits = load_container_resource_settings().resource_limits()

    def run_agents_parallel(
        self,
        execution_runs: list[ExecutionRun],
        project_names: list[str],
        run_dirs: list[Path],
    ) -> list[RunResult]:
        """Run one agent per target instance and collect results as they finish."""
        # All agents in a batch are independent and can therefore run concurrently.
        with ThreadPoolExecutor(max_workers=len(execution_runs)) as executor:
            future_to_run = {
                executor.submit(
                    self._run_single_agent,
                    execution_run,
                    project_name,
                    run_dir,
                ): execution_run
                for execution_run, project_name, run_dir in zip(execution_runs, project_names, run_dirs, strict=True)
            }

            # Convert worker exceptions into results so one crash does not hide other runs.
            results: list[RunResult] = []
            for future in as_completed(future_to_run):
                execution_run = future_to_run[future]
                try:
                    results.append(future.result())
                except Exception as exc:
                    results.append(
                        RunResult(
                            run_id=execution_run.run_id,
                            run_name=execution_run.run_config.name,
                            execution=execution_run.execution,
                            exit_code=None,
                            timed_out=False,
                            error=str(exc),
                        )
                    )
        return results

    def _run_single_agent(
        self,
        execution_run: ExecutionRun,
        project_name: str,
        run_dir: Path,
    ) -> RunResult:
        """Start one agent container and persist its process-level result."""
        run_id = execution_run.run_id
        run_cfg = execution_run.run_config
        container_name = f"research-agent-{run_id}"

        sandbox_dir = (self.sandbox_base / self.experiment_id / run_id).resolve()
        inputs_dir = (run_dir / "inputs").resolve()
        host_uid = os.getuid()
        host_gid = os.getgid()

        # Combine approved provider settings with metadata for this concrete run.
        env_vars = load_container_env()
        agent_timeout_seconds = int(env_vars["AGENT_TIMEOUT_SECONDS"])
        outer_timeout_seconds = agent_timeout_seconds + int(env_vars["AGENT_TIMEOUT_GRACE_SECONDS"])
        env_vars.update(
            {
                "RUN_ID": run_id,
                "RUN_NAME": run_cfg.name,
                "EXPERIMENT_ID": self.experiment_id,
                "EXECUTION": str(execution_run.execution),
                "TARGET_URL": self.meta.service_url,
                "OUTPUT_PATH": "/agent_logs",
                "AGENT_SANDBOX_PATH": "/agent_sandbox",
                "OPEN_HTML_REPORT": "false",
                "ACTIVE_TOOLS": json.dumps(run_cfg.active_tools or []),
            }
        )
        # Join a temporary internal network and expose only this run's host directories.
        agent_network_manager = InternalAgentNetwork(project_name, self.meta, env_vars.get("BASE_URL"))

        # Record process timing independently from events emitted by the agent.
        started_at = datetime.now(UTC).isoformat()

        timed_out = False
        exit_code: int | None = None
        error: str | None = None
        out_f = None
        err_f = None

        try:
            network_config = agent_network_manager.create()
            # Matching the host UID/GID keeps generated files writable outside Docker.
            cmd = [
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
                f"{run_dir.resolve()}:/agent_logs",
                "-v",
                f"{sandbox_dir}:/agent_sandbox",
                "-v",
                f"{inputs_dir}:/run-input:ro",
            ]
            for add_host in network_config.add_hosts:
                cmd += ["--add-host", add_host]
            for key, value in env_vars.items():
                cmd += ["-e", f"{key}={value}"]
            cmd.append(AGENT_IMAGE)

            # Console mode inherits output; regular runs archive both output streams.
            if self.console_output:
                process = subprocess.Popen(cmd)
            else:
                stdout_log = run_dir / "stdout.log"
                stderr_log = run_dir / "stderr.log"
                out_f = stdout_log.open("wb")
                err_f = stderr_log.open("wb")
                process = subprocess.Popen(cmd, stdout=out_f, stderr=err_f)
            try:
                # The inner agent timeout writes final logs; the outer timeout is only a watchdog.
                exit_code = process.wait(timeout=outer_timeout_seconds)
                timed_out = exit_code == 124
            except subprocess.TimeoutExpired:
                timed_out = True
                process.kill()
                process.wait()
                print(
                    f"[experiment:{self.experiment_id[:8]}] Agent {run_cfg.name} "
                    f"({run_id[:8]}) timed out after {outer_timeout_seconds}s",
                    file=sys.stderr,
                )
        except Exception as exc:
            error = str(exc)
            print(
                f"[experiment:{self.experiment_id[:8]}] Agent {run_cfg.name} ({run_id[:8]}) error: {exc}",
                file=sys.stderr,
            )
        finally:
            # Close redirected streams before deleting the container that produced them.
            if out_f is not None:
                out_f.close()
            if err_f is not None:
                err_f.close()

            # Forced removal also handles containers left after timeouts or startup errors.
            subprocess.run(["docker", "rm", "-f", container_name], check=False, capture_output=True)
            agent_network_manager.remove()

        # run.json is the process-level summary used by analysis and follow-up runs.
        ended_at = datetime.now(UTC).isoformat()
        run_data: dict[str, Any] = {
            "run_id": run_id,
            "run_name": run_cfg.name,
            "experiment_id": self.experiment_id,
            "experiment_name": self.config.name,
            "execution": execution_run.execution,
            "test_object": self.config.test_object,
            "version": run_cfg.version,
            "target_url": self.meta.service_url,
            "container_name": container_name,
            "started_at": started_at,
            "ended_at": ended_at,
            "exit_code": exit_code,
            "timed_out": timed_out,
            "error": error,
            "container_resources": self._build_container_resources(self.container_resource_limits),
            "additional_script_executions": [],
        }
        (run_dir / "run.json").write_text(json.dumps(run_data, indent=2), encoding="utf-8")

        # Return structured state while keeping the console output compact.
        status = "timeout" if timed_out else ("ok" if exit_code == 0 else "failed")
        print(
            f"[experiment:{self.experiment_id[:8]}] "
            f"Execution {execution_run.execution}, agent {run_cfg.name} ({run_id[:8]}) — {status}"
        )
        return RunResult(
            run_id=run_id,
            run_name=run_cfg.name,
            execution=execution_run.execution,
            exit_code=exit_code,
            timed_out=timed_out,
            error=error,
        )

    def _build_container_resources(self, limits: DockerResourceLimits) -> dict[str, str]:
        """Return the Docker resource limits used for this run."""
        return {
            "cpus": str(limits.cpus),
            "memory": limits.memory,
        }
