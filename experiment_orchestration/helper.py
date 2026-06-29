from __future__ import annotations

import os
import re
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from pathlib import Path

from experiment_orchestration.constants import (
    PROJECT_ROOT,
    READINESS_INTERVAL_SECONDS,
    READINESS_TIMEOUT_SECONDS,
)
from experiment_orchestration.models import ExperimentConfig, RunConfig
from experiment_orchestration.test_objects import TestObjectMeta


def archive_inputs(exp_config: ExperimentConfig, run_cfg: RunConfig, inputs_dir: Path, target_url: str) -> None:
    """Write the resolved prompts and optional context into the run log."""
    # Archived resolved inputs remain reproducible after the source config changes.
    system_prompt = exp_config.render_system_prompt(run_cfg)
    (inputs_dir / "system_prompt.txt").write_text(system_prompt, encoding="utf-8")
    user_prompt = exp_config.render_user_prompt(run_cfg, target_url)
    (inputs_dir / "user_prompt.txt").write_text(user_prompt, encoding="utf-8")


def additional_project_name(
    run_id: str,
    version: str,
    batch_execution: int,
    meta: TestObjectMeta,
    experiment_id: str,
    launch_id: str,
) -> str:
    """Create a unique Compose project name for a follow-up run."""
    return (
        f"research-{meta.name}-{sanitize_docker_component(version)}-"
        f"script-{experiment_id[:8]}-{batch_execution}-{run_id[:8]}-{launch_id}"
    )


def sanitize_docker_component(value: str) -> str:
    """Normalize a configuration value for use in Docker resource names."""
    sanitized = re.sub(r"[^a-z0-9_.-]+", "-", value.lower()).strip("-_.")
    return sanitized or "version"


def test_object_image_prefix(version: str, meta: TestObjectMeta) -> str:
    """Return the image prefix used for one test-object version."""
    return f"research-{meta.name}-{sanitize_docker_component(version)}"


@contextmanager
def test_object_image_override(version: str, meta: TestObjectMeta) -> Iterator[Path | None]:
    """Create a temporary Compose override that isolates built images by version."""
    if not meta.image_service_suffixes:
        yield None
        return

    prefix = test_object_image_prefix(version, meta)
    lines = ["services:"]
    for service_name, image_suffix in meta.image_service_suffixes.items():
        lines.extend(
            [
                f"  {service_name}:",
                f'    image: "{prefix}-{image_suffix}"',
            ]
        )

    override_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            suffix=".compose.yml",
            prefix=f"{prefix}-",
            delete=False,
        ) as override_file:
            override_path = Path(override_file.name)
            override_file.write("\n".join(lines))
            override_file.write("\n")
        yield override_path
    finally:
        if override_path is not None:
            override_path.unlink(missing_ok=True)


def compose_run(
    instance: int,
    project_name: str,
    version: str,
    meta: TestObjectMeta,
    *args: str,
    compose_dir: Path | None = None,
) -> None:
    """Run one Compose command with version- and instance-specific settings."""
    resolved_compose_dir = compose_dir or get_compose_dir(version, meta)
    env = get_compose_env(instance, meta)

    # The project name isolates all Compose-created resources.
    with test_object_image_override(version, meta) as image_override_file:
        command = [
            "docker",
            "compose",
            "--progress",
            "plain",
            "--ansi",
            "never",
            "--project-name",
            project_name,
            "--file",
            "docker-compose.yml",
        ]
        if image_override_file is not None:
            command.extend(["--file", str(image_override_file)])
        command.extend(args)

        subprocess.run(
            command,
            cwd=resolved_compose_dir,
            env=env,
            check=True,
            capture_output=False,
        )


def destroy_test_objects(
    instances: list[int],
    project_names: list[str],
    version: str,
    meta: TestObjectMeta,
    experiment_id: str,
    compose_dirs: list[Path] | None = None,
    suppress_errors: bool = False,
    versions: list[str] | None = None,
) -> None:
    """Remove several Compose projects and their persistent volumes in parallel."""
    resolved_versions = versions or [version] * len(instances)
    if len(resolved_versions) != len(instances):
        raise ValueError("versions must contain one value per test-object instance")

    resolved_compose_dirs = compose_dirs or [get_compose_dir(run_version, meta) for run_version in resolved_versions]
    if len(resolved_compose_dirs) != len(instances):
        raise ValueError("compose_dirs must contain one directory per test-object instance")

    # Each instance has a distinct project name, so cleanup operations are independent.
    with ThreadPoolExecutor(max_workers=len(instances)) as executor:
        futures = [
            executor.submit(
                compose_run,
                instance,
                project_name,
                run_version,
                meta,
                "down",
                "--volumes",
                "--remove-orphans",
                compose_dir=compose_dir,
            )
            for instance, project_name, run_version, compose_dir in zip(
                instances,
                project_names,
                resolved_versions,
                resolved_compose_dirs,
                strict=True,
            )
        ]

        # Cleanup errors are fatal during setup but best-effort in finally blocks.
        for future in futures:
            try:
                future.result()
            except Exception as exc:
                if not suppress_errors:
                    raise
                print(f"[experiment:{experiment_id[:8]}] Cleanup error: {exc}", file=sys.stderr)


def get_compose_dir(version: str, meta: TestObjectMeta) -> Path:
    """Resolve the selected test-object version's Compose directory."""
    return PROJECT_ROOT / "test-objects" / meta.compose_dir_name / version


def get_compose_env(instance: int, meta: TestObjectMeta) -> dict[str, str]:
    """Create host-port assignments for one isolated test-object instance."""
    env = os.environ.copy()

    # Increment all exposed base ports consistently for parallel instances.
    for var, base_port in meta.port_variables.items():
        env[var] = str(base_port + instance - 1)
    return env


def wait_for_instance(instance: int, project_name: str, experiment_id: str, meta: TestObjectMeta) -> None:
    """Poll the host-facing application port until it responds or times out."""
    base_port = meta.port_variables[meta.health_port_variable]
    port = base_port + instance - 1
    url = f"http://localhost:{port}"
    headers: dict[str, str] = {}
    request = urllib.request.Request(url, headers=headers)
    deadline = time.monotonic() + READINESS_TIMEOUT_SECONDS

    # Host polling works before an agent or Playwright runner joins the network.
    print(f"[experiment:{experiment_id[:8]}] Waiting for {project_name} on {url}…")
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(request, timeout=5):
                print(f"[experiment:{experiment_id[:8]}] {project_name} ready on port {port}")
                return
        except Exception:
            time.sleep(READINESS_INTERVAL_SECONDS)
    raise TimeoutError(f"Test object {project_name} not ready after {READINESS_TIMEOUT_SECONDS}s (port {port})")
