import json
from enum import StrEnum
from pathlib import Path
from typing import Any, TypedDict

from jsonschema import Draft202012Validator, FormatChecker

from agent_runner.agent_tools.base import AgentToolBase

_SCHEMA_PATH = Path(__file__).parent / "result.schema.json"


class JSONEvent(StrEnum):
    """List collector event names emitted by JSON tools."""

    VALIDATION_RUN_STARTED = "json_validation_run_started"
    VALIDATION_RUN_FINISHED = "json_validation_run_finished"
    GET_SCHEMA_RUN_STARTED = "get_json_schema_run_started"
    GET_SCHEMA_RUN_FINISHED = "get_json_schema_run_finished"


class GetJsonSchemaParams(TypedDict):
    """Define arguments for returning the result JSON schema."""

    pass


class ValidateJsonParams(TypedDict):
    """Define arguments for validating result JSON."""

    json_content: str


def _load_schema() -> str:
    """Load the result JSON schema from resources."""
    return _SCHEMA_PATH.read_text(encoding="utf-8")


class GetJsonSchema(AgentToolBase[GetJsonSchemaParams, str]):
    """Expose a tool that returns the expected result JSON schema."""

    def run_sync(self, params: GetJsonSchemaParams) -> str:
        """Run the tool synchronously."""
        self.collect(JSONEvent.GET_SCHEMA_RUN_STARTED, {"params": params})
        result = _load_schema()
        self.collect(JSONEvent.GET_SCHEMA_RUN_FINISHED, {"result": result})
        return result

    def get_tool_name(self) -> str:
        """Return the tool name exposed to the model."""
        return "GetJsonSchema"

    def get_tool_description(self) -> str:
        """Return the tool description exposed to the model."""
        return "Returns the JSON schema that the result JSON must conform to."

    def get_tool_parameters(self) -> dict[str, Any]:
        """Return the JSON schema for tool parameters."""
        return {
            "type": "object",
            "properties": {},
            "required": [],
            "additionalProperties": False,
        }


class ValidateJson(AgentToolBase[ValidateJsonParams, str]):
    """Expose a tool that validates result JSON against the schema."""

    def run_sync(self, params: ValidateJsonParams) -> str:
        """Run the tool synchronously."""
        self.collect(JSONEvent.VALIDATION_RUN_STARTED, {"params": params})
        result = self._validate(params["json_content"])
        self.collect(JSONEvent.VALIDATION_RUN_FINISHED, {"result": result})
        return result

    def get_tool_name(self) -> str:
        """Return the tool name exposed to the model."""
        return "ValidateJson"

    def get_tool_description(self) -> str:
        """Return the tool description exposed to the model."""
        return (
            "Validates JSON content against the result schema. Returns success or a detailed list of validation errors."
        )

    def get_tool_parameters(self) -> dict[str, Any]:
        """Return the JSON schema for tool parameters."""
        return {
            "type": "object",
            "properties": {
                "json_content": {
                    "type": "string",
                    "description": "The JSON content to validate against the schema.",
                },
            },
            "required": ["json_content"],
            "additionalProperties": False,
        }

    def _validate(self, json_content: str) -> str:
        """Validate JSON text against the result schema."""
        schema = json.loads(_load_schema())

        try:
            report = json.loads(json_content)
        except json.JSONDecodeError as e:
            return f"Invalid JSON content: {e.msg} at line {e.lineno} column {e.colno}"

        validator = Draft202012Validator(schema, format_checker=FormatChecker())
        errors = sorted(validator.iter_errors(report), key=lambda error: list(error.path))

        if not errors:
            return "Success. JSON is valid according to the schema."

        result = "Failure. JSON is not valid according to the schema.\nDetails:\n"
        for index, error in enumerate(errors, start=1):
            path = ".".join(str(part) for part in error.path)
            schema_path = " -> ".join(str(part) for part in error.schema_path)
            result += f"{index}. Path: {path or '<root>'}\n"
            result += f"   Error: {error.message}\n"
            result += f"   Schema: {schema_path}\n"
            result += "\n"
        return result
