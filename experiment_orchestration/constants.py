# Shared image names and time limits for all experiment runner instances.
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]

AGENT_IMAGE = "research-agent"
PROXY_IMAGE = "research-tcp-proxy"
PLAYWRIGHT_RUNNER_IMAGE = "research-playwright-runner"

READINESS_TIMEOUT_SECONDS = 300
READINESS_INTERVAL_SECONDS = 5
