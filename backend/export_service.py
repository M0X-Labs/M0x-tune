import json
import os
import shutil
import subprocess
import sys
import threading
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path
from queue import Empty, Queue
from typing import Any

from fastapi import HTTPException
from pydantic import BaseModel

PROJECT_ROOT = Path(__file__).resolve().parents[1]
EXPORT_SCRIPT = PROJECT_ROOT / "export_gguf.py"


@dataclass
class ExportRuntime:
    export_id: str
    payload: "ExportPayload"
    status: str = "idle"
    logs: deque[str] = field(default_factory=lambda: deque(maxlen=500))
    process: subprocess.Popen[str] | None = None
    subscribers: list[Queue[str]] = field(default_factory=list)
    lock: threading.Lock = field(default_factory=threading.Lock)


exports: dict[str, ExportRuntime] = {}
exports_lock = threading.Lock()


class ExportPayload(BaseModel):
    modelPath: str
    outputGgufName: str
    maxSeqLength: int = 1024
    quantizationMethods: list[str] = ["q4_k_m"]


def sse_message(event: str, data: Any) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def broadcast_export(exp: ExportRuntime, event: str, data: Any) -> None:
    message = sse_message(event, data)
    with exp.lock:
        stale: list[Queue[str]] = []
        for subscriber in exp.subscribers:
            try:
                subscriber.put_nowait(message)
            except Exception:
                stale.append(subscriber)
        for subscriber in stale:
            if subscriber in exp.subscribers:
                exp.subscribers.remove(subscriber)


def update_export_status(exp: ExportRuntime, status: str) -> None:
    with exp.lock:
        exp.status = status
    broadcast_export(exp, "status", {"status": status, "exportId": exp.export_id})


def append_export_log(exp: ExportRuntime, line: str) -> None:
    with exp.lock:
        exp.logs.append(line)
    broadcast_export(exp, "log", {"text": line, "exportId": exp.export_id})


def export_stream_reader(exp: ExportRuntime, stream: Any) -> None:
    try:
        for raw_line in iter(stream.readline, ""):
            line = raw_line.rstrip()
            if line:
                append_export_log(exp, line)
    finally:
        stream.close()


def run_export(exp: ExportRuntime) -> None:
    update_export_status(exp, "exporting")

    # Create a temporary config for the export
    temp_config = PROJECT_ROOT / f".tmp_export_config_{exp.export_id}.json"
    config_data = {
        "output_gguf_name": exp.payload.outputGgufName,
        "max_seq_length": exp.payload.maxSeqLength,
        "model_path": exp.payload.modelPath,
        "quantization_methods": exp.payload.quantizationMethods,
    }
    temp_config.write_text(json.dumps(config_data, indent=2), encoding="utf-8")

    env = dict(os.environ)
    env["PYTHONUNBUFFERED"] = "1"
    env["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"
    env["UNSLOTH_COMPILE_DISABLE"] = "1"
    env["UNSLOTH_LLAMA_CPP_PATH"] = str(PROJECT_ROOT / ".unsloth" / "llama.cpp")
    env["UV_CACHE_DIR"] = str(PROJECT_ROOT / ".uv_cache")
    env["PIP_CACHE_DIR"] = str(PROJECT_ROOT / ".pip_cache")
    env["TEMP"] = str(PROJECT_ROOT / ".tmp")
    env["TMP"] = str(PROJECT_ROOT / ".tmp")

    process = subprocess.Popen(
        [sys.executable, str(EXPORT_SCRIPT), "--config", str(temp_config)],
        cwd=PROJECT_ROOT,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
        bufsize=1,
    )

    with exp.lock:
        exp.process = process

    stdout_thread = threading.Thread(
        target=export_stream_reader, args=(exp, process.stdout), daemon=True
    )
    stderr_thread = threading.Thread(
        target=export_stream_reader, args=(exp, process.stderr), daemon=True
    )
    stdout_thread.start()
    stderr_thread.start()

    return_code = process.wait()
    stdout_thread.join(timeout=1)
    stderr_thread.join(timeout=1)

    # Cleanup temp config
    try:
        temp_config.unlink(missing_ok=True)
    except Exception:
        pass

    with exp.lock:
        cancelled = exp.status == "cancelled"
        exp.process = None

    if cancelled:
        append_export_log(exp, "[SYSTEM] Export terminated by user.")
        return

    if return_code == 0:
        update_export_status(exp, "completed")
    else:
        update_export_status(exp, "failed")


def get_export(export_id: str) -> ExportRuntime:
    with exports_lock:
        exp = exports.get(export_id)
    if exp is None:
        raise HTTPException(status_code=404, detail=f"Unknown export: {export_id}")
    return exp


def create_export_sse_stream(exp: ExportRuntime):
    subscriber: Queue[str] = Queue()

    initial_messages = [
        sse_message("status", {"status": exp.status, "exportId": exp.export_id}),
    ]
    initial_messages.extend(
        sse_message("log", {"text": log, "exportId": exp.export_id}) for log in exp.logs
    )

    with exp.lock:
        exp.subscribers.append(subscriber)

    def event_generator():
        try:
            for message in initial_messages:
                yield message
            while True:
                try:
                    yield subscriber.get(timeout=15)
                except Empty:
                    yield ": keep-alive\n\n"
        finally:
            with exp.lock:
                if subscriber in exp.subscribers:
                    exp.subscribers.remove(subscriber)

    return event_generator()


def list_exported_files() -> list[dict[str, Any]]:
    files: list[dict[str, Any]] = []
    # Look for GGUF files in project root
    for item in PROJECT_ROOT.iterdir():
        if item.is_file() and item.suffix.lower() == ".gguf":
            stat = item.stat()
            files.append(
                {
                    "name": item.name,
                    "path": str(item.resolve()),
                    "size_bytes": stat.st_size,
                    "modified_at": stat.st_mtime,
                }
            )
    # Sort by modified time, newest first
    files.sort(key=lambda x: x["modified_at"], reverse=True)
    return files
