from __future__ import annotations

import sys
from pathlib import Path

from experiment_orchestration.experiment_runner import ExperimentRunner

from .models import ExperimentSuiteConfig


class ExperimentSuiteRunner:
    """Run a validated list of experiments sequentially."""

    def __init__(
        self,
        suite: ExperimentSuiteConfig,
        config_path: Path,
        console_output: bool = False,
    ) -> None:
        """Initialize the instance."""
        self.suite = suite
        self.config_path = config_path
        self.console_output = console_output

    def run(self) -> int:
        """Run all experiments in order and combine their exit codes."""
        experiment_results: list[int] = []
        experiment_count = len(self.suite.root)

        # Sequential execution avoids port collisions between experiment configurations.
        for index, config in enumerate(self.suite.root, start=1):
            print(f"[suite] Starting experiment {index}/{experiment_count}: {config.name}")
            try:
                runner = ExperimentRunner(
                    config,
                    self.config_path,
                    console_output=self.console_output,
                )

                result = runner.run()
            except Exception as exc:
                # One failed experiment does not prevent later suite entries from running.
                result = 1
                print(f"[suite] Experiment {index}/{experiment_count} failed: {exc}", file=sys.stderr)

            experiment_results.append(result)
            status = "success" if result == 0 else "failed"
            print(f"[suite] Experiment {index}/{experiment_count} finished — {status}")

        # The suite succeeds only if every configured experiment succeeded.
        overall_success = all(result == 0 for result in experiment_results)
        status = "success" if overall_success else "failed"
        print(f"[suite] Done — {status}")
        return 0 if overall_success else 1
