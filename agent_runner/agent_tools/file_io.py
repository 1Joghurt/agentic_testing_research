from enum import StrEnum
from pathlib import Path
from typing import Any, TypedDict

from agent_runner.agent_tools.base import AgentToolBase
from agent_runner.agent_tools.sandbox import AgentSandbox
from agent_runner.collector.service import CollectorService


class FileIOEvent(StrEnum):
    """List collector event names emitted by file I/O tools."""

    LIST_STARTED = "file_list_started"
    LIST_FINISHED = "file_list_finished"
    READ_STARTED = "file_read_started"
    READ_FINISHED = "file_read_finished"
    WRITE_STARTED = "file_write_started"
    WRITE_FINISHED = "file_write_finished"
    DELETE_STARTED = "file_delete_started"
    DELETE_FINISHED = "file_delete_finished"


class ListFilesParams(TypedDict):
    """Define arguments for listing sandbox files."""

    path: str


class ReadFileParams(TypedDict):
    """Define arguments for reading a sandbox file."""

    path: str


class WriteFileParams(TypedDict):
    """Define arguments for writing a sandbox file."""

    path: str
    content: str
    overwrite: bool


class DeleteFileParams(TypedDict):
    """Define arguments for deleting a sandbox file."""

    path: str


class FileIOBase[ParamT, ResultT](AgentToolBase[ParamT, ResultT]):
    """Share sandbox path handling for file I/O tools."""

    def __init__(self, collector: CollectorService) -> None:
        """Initialize the instance."""
        super().__init__(collector)
        self.sandbox = AgentSandbox(collector)

    def _resolve_path(self, path: str) -> Path:
        """Resolve an agent path inside the sandbox."""
        return self.sandbox.resolve_agent_path(path)


class ListFiles(FileIOBase[ListFilesParams, list[str]]):
    """Expose a tool that lists files under the sandbox."""

    def run_sync(self, params: ListFilesParams) -> list[str]:
        """Run the tool synchronously."""
        path = params["path"]
        self.collect(FileIOEvent.LIST_STARTED, {"path": path})
        target_path = self._resolve_path(path)
        base_path = self.sandbox.get_current_run_path()

        if not target_path.exists():
            raise ValueError(f"Path '{path}' does not exist.")

        if target_path.is_file():
            result = [f"{target_path.relative_to(base_path).as_posix()} (file)"]
            self.collect(
                FileIOEvent.LIST_FINISHED, {"path": path, "exists": True, "target_type": "file", "result": result}
            )
            return result

        if not target_path.is_dir():
            raise ValueError(f"Path '{path}' is not a file or directory.")

        entries = []
        for item in sorted(target_path.iterdir(), key=lambda i: i.name):
            item_type = "folder" if item.is_dir() else "file"
            entries.append(f"{item.relative_to(base_path).as_posix()} ({item_type})")

        self.collect(
            FileIOEvent.LIST_FINISHED,
            {"path": path, "exists": True, "target_type": "folder", "entry_count": len(entries), "result": entries},
        )
        return entries

    def get_tool_name(self) -> str:
        """Return the tool name exposed to the model."""
        return "ListFiles"

    def get_tool_description(self) -> str:
        """Return the tool description exposed to the model."""
        return "Lists files and folders."

    def get_tool_parameters(self) -> dict[str, Any]:
        """Return the JSON schema for tool parameters."""
        return {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path inside the FileIO workspace."},
            },
            "required": ["path"],
            "additionalProperties": False,
        }


class ReadFile(FileIOBase[ReadFileParams, str]):
    """Expose a tool that reads a sandbox file."""

    def run_sync(self, params: ReadFileParams) -> str:
        """Run the tool synchronously."""
        path = params["path"]
        self.collect(FileIOEvent.READ_STARTED, {"path": path})
        target_path = self._resolve_path(path)

        if not target_path.is_file():
            raise ValueError(f"Path '{path}' is not a file.")

        result = target_path.read_text(encoding="utf-8")
        self.collect(
            FileIOEvent.READ_FINISHED,
            {"path": path, "is_file": True, "content_length": len(result), "result": result},
        )
        return result

    def get_tool_name(self) -> str:
        """Return the tool name exposed to the model."""
        return "ReadFile"

    def get_tool_description(self) -> str:
        """Return the tool description exposed to the model."""
        return "Reads a file and returns its UTF-8 content."

    def get_tool_parameters(self) -> dict[str, Any]:
        """Return the JSON schema for tool parameters."""
        return {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path inside the FileIO workspace."},
            },
            "required": ["path"],
            "additionalProperties": False,
        }


class WriteFile(FileIOBase[WriteFileParams, str]):
    """Expose a tool that writes a sandbox file."""

    def run_sync(self, params: WriteFileParams) -> str:
        """Run the tool synchronously."""
        path = params["path"]
        content = params["content"]
        overwrite = params.get("overwrite", False)
        self.collect(FileIOEvent.WRITE_STARTED, {"path": path, "content_length": len(content)})
        target_path = self._resolve_path(path)

        if target_path.exists() and target_path.is_dir():
            raise ValueError(f"Path '{path}' is a directory.")
        if target_path.exists() and not overwrite:
            raise ValueError(f"Path '{path}' already exists. Refusing to overwrite.")

        target_path.parent.mkdir(parents=True, exist_ok=True)
        target_path.write_text(content, encoding="utf-8")
        result = f"Wrote {len(content)} characters to {path}."
        self.collect(
            FileIOEvent.WRITE_FINISHED,
            {"path": path, "target_is_directory": False, "content_length": len(content), "result": result},
        )
        return result

    def get_tool_name(self) -> str:
        """Return the tool name exposed to the model."""
        return "WriteFile"

    def get_tool_description(self) -> str:
        """Return the tool description exposed to the model."""
        return "Writes UTF-8 text to a new file. Refuses to overwrite existing files."

    def get_tool_parameters(self) -> dict[str, Any]:
        """Return the JSON schema for tool parameters."""
        return {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path inside the FileIO workspace."},
                "content": {"type": "string", "description": "UTF-8 text content to write."},
                "overwrite": {
                    "type": "boolean",
                    "description": "Whether to overwrite existing files. Defaults to false.",
                },
            },
            "required": ["path", "content"],
            "additionalProperties": False,
        }


class DeleteFile(FileIOBase[DeleteFileParams, str]):
    """Expose a tool that deletes a sandbox file."""

    def run_sync(self, params: DeleteFileParams) -> str:
        """Run the tool synchronously."""
        path = params["path"]
        self.collect(FileIOEvent.DELETE_STARTED, {"path": path})
        target_path = self._resolve_path(path)

        if not target_path.is_file():
            raise ValueError(f"Path '{path}' is not a file.")

        target_path.unlink()
        result = f"Deleted {path}."
        self.collect(FileIOEvent.DELETE_FINISHED, {"path": path, "is_file": True, "result": result})
        return result

    def get_tool_name(self) -> str:
        """Return the tool name exposed to the model."""
        return "DeleteFile"

    def get_tool_description(self) -> str:
        """Return the tool description exposed to the model."""
        return "Deletes a file."

    def get_tool_parameters(self) -> dict[str, Any]:
        """Return the JSON schema for tool parameters."""
        return {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path inside the FileIO workspace."},
            },
            "required": ["path"],
            "additionalProperties": False,
        }
