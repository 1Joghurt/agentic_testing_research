from __future__ import annotations

import json
import subprocess
import time
from dataclasses import dataclass
from urllib.parse import urlsplit

from experiment_orchestration.constants import PROXY_IMAGE
from experiment_orchestration.test_objects import TestObjectMeta


@dataclass(frozen=True)
class AgentNetworkConfig:
    """Docker network settings for one agent container."""

    name: str
    add_hosts: tuple[str, ...] = ()


@dataclass(frozen=True)
class LlmEndpoint:
    """External LLM endpoint that should be reachable from the internal agent network."""

    base_url: str
    hostname: str
    port: int

    @classmethod
    def from_base_url(cls, base_url: str | None) -> LlmEndpoint | None:
        """Build proxy settings from an API base URL."""
        if base_url is None or not base_url.strip():
            return None

        parsed = urlsplit(base_url.strip())
        if parsed.scheme not in {"http", "https"}:
            raise ValueError(f"BASE_URL must use http or https, got: {base_url}")
        if parsed.hostname is None:
            raise ValueError(f"BASE_URL has no hostname: {base_url}")

        default_port = 443 if parsed.scheme == "https" else 80
        return cls(base_url=base_url.strip(), hostname=parsed.hostname, port=parsed.port or default_port)


class InternalAgentNetwork:
    """Expose the target service to the agent without Docker internet egress."""

    def __init__(self, project_name: str, meta: TestObjectMeta, llm_base_url: str | None = None) -> None:
        """Initialize the instance."""
        self.project_name = project_name
        self.meta = meta
        self.name = f"{project_name}_agent_internal"
        self._connected_container_ids: set[str] = set()
        self._llm_endpoint = LlmEndpoint.from_base_url(llm_base_url)
        self._llm_proxy_container_name = f"{self.name}_llm_proxy"

    def create(self) -> AgentNetworkConfig:
        """Create an internal network and connect the target service to it."""
        self._ensure_network()

        target_service = self._target_service_name()
        for container_id in self._service_container_ids(target_service):
            self._connect_container(container_id, target_service)

        add_hosts: tuple[str, ...] = ()
        if self._llm_endpoint is not None:
            proxy_ip = self._start_llm_proxy(self._llm_endpoint)
            add_hosts = (f"{self._llm_endpoint.hostname}:{proxy_ip}",)
        return AgentNetworkConfig(name=self.name, add_hosts=add_hosts)

    def remove(self) -> None:
        """Disconnect target containers and remove the temporary agent network."""
        if self._llm_endpoint is not None:
            subprocess.run(
                ["docker", "rm", "--force", self._llm_proxy_container_name],
                check=False,
                capture_output=True,
            )
        for container_id in self._connected_container_ids:
            subprocess.run(
                ["docker", "network", "disconnect", "--force", self.name, container_id],
                check=False,
                capture_output=True,
            )
        subprocess.run(["docker", "network", "rm", self.name], check=False, capture_output=True)

    def _ensure_network(self) -> None:
        """Ensure the Docker network for agents exists."""
        inspect_result = subprocess.run(
            ["docker", "network", "inspect", self.name],
            check=False,
            capture_output=True,
            text=True,
        )
        if inspect_result.returncode == 0:
            return

        counter = 0
        while counter < 4:
            try:
                subprocess.run(
                    [
                        "docker",
                        "network",
                        "create",
                        "--internal",
                        "--label",
                        "research.experiment.agent-network=true",
                        "--label",
                        f"research.experiment.project={self.project_name}",
                        self.name,
                    ],
                    check=True,
                    capture_output=True,
                )
                return
            except subprocess.CalledProcessError as e:
                counter += 1
                time.sleep(counter)
                if counter == 3:
                    raise RuntimeError(f"Failed to create internal agent network '{self.name}': {e.stderr}") from e

    def _target_service_name(self) -> str:
        """Build the Docker service name for a target port."""
        target = urlsplit(self.meta.service_url)
        if target.hostname is None:
            raise ValueError(f"Target URL has no hostname: {self.meta.service_url}")
        return target.hostname

    def _service_container_ids(self, service_name: str) -> list[str]:
        """Return container IDs for a Compose service."""
        result = subprocess.run(
            [
                "docker",
                "container",
                "ls",
                "--filter",
                f"label=com.docker.compose.project={self.project_name}",
                "--filter",
                f"label=com.docker.compose.service={service_name}",
                "--format",
                "{{.ID}}",
            ],
            capture_output=True,
            text=True,
            check=True,
        )
        container_ids = [container_id.strip() for container_id in result.stdout.splitlines() if container_id.strip()]
        if not container_ids:
            raise RuntimeError(
                f"No running container for service '{service_name}' in Compose project '{self.project_name}'"
            )
        return container_ids

    def _connect_container(self, container_id: str, service_name: str) -> None:
        """Connect a container to the agent Docker network."""
        result = subprocess.run(
            [
                "docker",
                "network",
                "connect",
                "--alias",
                service_name,
                self.name,
                container_id,
            ],
            check=False,
            capture_output=True,
            text=True,
        )
        if result.returncode != 0 and "already exists" not in result.stderr.lower():
            raise RuntimeError(f"Could not connect service '{service_name}' to internal agent network: {result.stderr}")
        self._connected_container_ids.add(container_id)

    def _start_llm_proxy(self, endpoint: LlmEndpoint) -> str:
        """Start the local proxy that exposes the LLM endpoint."""
        subprocess.run(
            ["docker", "rm", "--force", self._llm_proxy_container_name],
            check=False,
            capture_output=True,
        )
        subprocess.run(
            [
                "docker",
                "run",
                "--detach",
                "--name",
                self._llm_proxy_container_name,
                "--network",
                "bridge",
                PROXY_IMAGE,
                str(endpoint.port),
                endpoint.hostname,
                str(endpoint.port),
            ],
            check=True,
            capture_output=True,
        )
        subprocess.run(
            [
                "docker",
                "network",
                "connect",
                self.name,
                self._llm_proxy_container_name,
            ],
            check=True,
            capture_output=True,
        )
        return self._container_ip(self._llm_proxy_container_name, self.name)

    def _container_ip(self, container_name: str, network_name: str) -> str:
        """Return a container IP address on the agent network."""
        result = subprocess.run(
            [
                "docker",
                "container",
                "inspect",
                "--format",
                "{{json .NetworkSettings.Networks}}",
                container_name,
            ],
            check=True,
            capture_output=True,
            text=True,
        )
        networks = json.loads(result.stdout)
        if not isinstance(networks, dict):
            raise RuntimeError(f"Could not inspect networks for container '{container_name}'")

        network = networks.get(network_name)
        if not isinstance(network, dict):
            raise RuntimeError(f"Container '{container_name}' is not attached to network '{network_name}'")

        ip_address = network.get("IPAddress")
        if not isinstance(ip_address, str) or not ip_address:
            raise RuntimeError(f"Container '{container_name}' has no IP on network '{network_name}'")
        return ip_address
