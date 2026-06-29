from dataclasses import dataclass


@dataclass(frozen=True)
class TestObjectMeta:
    """Describe metadata for a test object directory."""

    name: str
    service_url: str
    health_port_variable: str
    port_variables: dict[str, int]
    compose_dir_name: str
    image_service_suffixes: dict[str, str]


REGISTRY: dict[str, TestObjectMeta] = {
    "realworld": TestObjectMeta(
        name="realworld",
        service_url="http://frontend:3000",
        health_port_variable="FRONTEND_PORT",
        port_variables={
            "FRONTEND_PORT": 3001,
            "BACKEND_PORT": 8081,
            "DB_PORT": 5433,
        },
        compose_dir_name="RealWorld",
        image_service_suffixes={"frontend": "frontend", "backend": "backend"},
    ),
    "workshophub": TestObjectMeta(
        name="workshophub",
        service_url="http://workshophub:3000",
        health_port_variable="APP_PORT",
        port_variables={
            "APP_PORT": 3001,
        },
        compose_dir_name="WorkshopHub",
        image_service_suffixes={"workshophub": "app"},
    ),
}
