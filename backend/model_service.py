"""Hugging Face model discovery and download management for the backend.

This module deliberately avoids importing optional heavy dependencies such as
``huggingface_hub`` at module import time. Network lookups and downloads are
attempted lazily and fall back to graceful local-only responses when the
Hub client or the network is unavailable.

A long-running download is tracked in an in-memory registry. Progress is
exposed through snapshot helpers so the FastAPI layer can stream it to the
Next.js UI.
"""

from __future__ import annotations

import json
import os
import re
import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Callable

PROJECT_ROOT = Path(__file__).resolve().parents[1]
MODELS_DIR = PROJECT_ROOT / "base_model"
DOWNLOADS_DIR = PROJECT_ROOT / "backend" / "runtime" / "models"
DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)

DEFAULT_LOCAL_MODEL = "./base_model"
SAFE_ID_PATTERN = re.compile(r"^[A-Za-z0-9._-]+$")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _safe_local_dir(repo_id: str) -> str:
    """Translate a Hugging Face ``repo_id`` to a local directory name.

    Hugging Face repo ids are typically ``org/model``. We allow only safe
    characters and refuse anything else to keep the directory structure
    predictable and to avoid path traversal.
    """

    if not repo_id:
        raise ValueError("repo_id is required")
    parts = repo_id.split("/")
    for part in parts:
        if not part or not SAFE_ID_PATTERN.match(part):
            raise ValueError(f"repo_id contains unsupported characters: {part}")
    return parts[-1]


def list_local_models(base_dir: Path = MODELS_DIR) -> list[dict[str, Any]]:
    """List local model directories that look like a Hugging Face snapshot.

    A directory is considered a model when it contains a ``config.json``
    file. A size estimate is provided for the UI.
    """

    if not base_dir.exists():
        return []

    models: list[dict[str, Any]] = []

    # Check if the base directory itself is a model snapshot (contains config.json)
    base_config = base_dir / "config.json"
    if base_config.exists():
        total_bytes = 0
        file_count = 0
        for root, dirs, files in os.walk(base_dir):
            # Exclude hidden directories like .cache in-place to avoid deep scans
            dirs[:] = [d for d in dirs if not d.startswith(".")]
            for name in files:
                if name.startswith("."):
                    continue
                file_count += 1
                try:
                    total_bytes += (Path(root) / name).stat().st_size
                except OSError:
                    continue
        models.append(
            {
                "id": base_dir.name,
                "localPath": str(base_dir).replace("\\", "/"),
                "configPath": str(base_config).replace("\\", "/"),
                "sizeBytes": total_bytes,
                "sizeGb": round(total_bytes / (1024 ** 3), 3),
                "fileCount": file_count,
            }
        )

    # Check sub-directories (like downloaded repos org__repo)
    for entry in sorted(base_dir.iterdir()):
        if not entry.is_dir() or entry.name.startswith("."):
            continue
        config = entry / "config.json"
        if not config.exists():
            continue
        total_bytes = 0
        file_count = 0
        for root, dirs, files in os.walk(entry):
            dirs[:] = [d for d in dirs if not d.startswith(".")]
            for name in files:
                if name.startswith("."):
                    continue
                file_count += 1
                try:
                    total_bytes += (Path(root) / name).stat().st_size
                except OSError:
                    continue
        models.append(
            {
                "id": entry.name.replace("__", "/"),
                "localPath": str(entry).replace("\\", "/"),
                "configPath": str(config).replace("\\", "/"),
                "sizeBytes": total_bytes,
                "sizeGb": round(total_bytes / (1024 ** 3), 3),
                "fileCount": file_count,
            }
        )
    return models


def _hf_api():
    try:
        from huggingface_hub import HfApi  # type: ignore
    except Exception:
        return None
    return HfApi()


def search_hub_models(query: str, limit: int = 12) -> list[dict[str, Any]]:
    """Search the Hugging Face Hub for models matching ``query``.

    Returns an empty list when the Hub client or the network is unavailable
    so the UI can degrade gracefully.
    """

    api = _hf_api()
    if api is None or not query.strip():
        return []

    try:
        results = api.list_models(search=query, limit=limit, sort="downloads", expand=["safetensors"])
    except Exception:
        return []

    items: list[dict[str, Any]] = []
    for model in results:
        safetensors = getattr(model, "safetensors", None)
        size_bytes = getattr(safetensors, "total", None) if safetensors else None
        items.append(
            {
                "id": model.id,
                "downloads": getattr(model, "downloads", 0) or 0,
                "likes": getattr(model, "likes", 0) or 0,
                "lastModified": getattr(model, "lastModified", None) and model.lastModified.isoformat(),
                "tags": list(getattr(model, "tags", []) or [])[:8],
                "pipeline": getattr(model, "pipeline_tag", None),
                "sizeBytes": size_bytes,
                "hasSafetensors": safetensors is not None,
            }
        )
    return items


def resolve_hf_token(token: str | None) -> str | None:
    """Resolve a usable Hugging Face token from request/env, returning None when none is set."""

    if token:
        return token
    env_token = os.environ.get("HF_TOKEN") or os.environ.get("HUGGINGFACE_HUB_TOKEN")
    return env_token or None


@dataclass
class DownloadState:
    download_id: str
    repo_id: str
    local_dir: Path
    target_path: str
    status: str = "queued"
    percent: int = 0
    downloaded_bytes: int = 0
    total_bytes: int = 0
    speed_bps: float = 0.0
    log: list[str] = field(default_factory=list)
    started_at: str = field(default_factory=_now_iso)
    finished_at: str | None = None
    error: str | None = None
    _thread: threading.Thread | None = field(default=None, repr=False)
    _cancel: threading.Event = field(default_factory=threading.Event, repr=False)
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            return {
                "downloadId": self.download_id,
                "repoId": self.repo_id,
                "targetPath": self.target_path,
                "status": self.status,
                "percent": self.percent,
                "downloadedBytes": self.downloaded_bytes,
                "totalBytes": self.total_bytes,
                "speedBps": round(self.speed_bps, 1),
                "log": list(self.log)[-200:],
                "startedAt": self.started_at,
                "finishedAt": self.finished_at,
                "error": self.error,
            }

    def _append_log(self, line: str) -> None:
        with self._lock:
            self.log.append(f"[{_now_iso()}] {line}")
            if len(self.log) > 400:
                del self.log[: len(self.log) - 400]

    def cancel(self) -> None:
        with self._lock:
            self.status = "cancelled"
        self._cancel.set()


_DOWNLOADS: dict[str, DownloadState] = {}
_DOWNLOADS_LOCK = threading.Lock()


def list_downloads() -> list[dict[str, Any]]:
    with _DOWNLOADS_LOCK:
        states = list(_DOWNLOADS.values())
    return [state.snapshot() for state in states]


def get_download(download_id: str) -> dict[str, Any] | None:
    with _DOWNLOADS_LOCK:
        state = _DOWNLOADS.get(download_id)
    if state is None:
        return None
    return state.snapshot()


def _hf_snapshot_module():
    try:
        from huggingface_hub import snapshot_download  # type: ignore
    except Exception:
        return None
    return snapshot_download


def _run_download(
    state: DownloadState,
    progress_callback: Callable[[int, int], None] | None = None,
) -> None:
    snapshot_download = _hf_snapshot_module()
    if snapshot_download is None:
        with state._lock:
            state.status = "failed"
            state.error = "huggingface_hub is not installed in the backend environment"
        state._append_log(state.error or "huggingface_hub unavailable")
        return

    try:
        with state._lock:
            state.status = "running"
            state.started_at = state.started_at or _now_iso()
        state._append_log(f"Starting download of {state.repo_id} into {state.local_dir}")

        # Prefer the rich ``snapshot_download`` progress hook when available.
        try:
            from tqdm.auto import tqdm  # type: ignore  # noqa: F401

            def _tqdm_hook(t: Any) -> None:
                if state._cancel.is_set():
                    raise KeyboardInterrupt("download cancelled")
                total = getattr(t, "total", None) or state.total_bytes or 0
                n = int(getattr(t, "n", 0))
                if total and total > 0:
                    state._lock.acquire()
                    try:
                        state.total_bytes = int(total)
                        state.downloaded_bytes = n
                        state.percent = min(100, int(n * 100 / total))
                    finally:
                        state._lock.release()
                    if progress_callback:
                        progress_callback(n, int(total))

            from huggingface_hub import utils as hf_utils  # type: ignore

            try:
                hf_utils.tqdm = _tqdm_hook
                snapshot_download(
                    repo_id=state.repo_id,
                    local_dir=str(state.local_dir),
                    token=os.environ.get("HF_TOKEN"),
                    max_workers=4,
                    allow_patterns=["*.safetensors", "*.json", "*.model", "*.txt", "*.py"],
                )
            finally:
                hf_utils.tqdm = old_hook
        except ImportError:
            snapshot_download(
                repo_id=state.repo_id,
                local_dir=str(state.local_dir),
                token=os.environ.get("HF_TOKEN"),
                max_workers=4,
                allow_patterns=["*.safetensors", "*.json", "*.model", "*.txt", "*.py"],
            )
        except KeyboardInterrupt:
            with state._lock:
                state.status = "cancelled"
                state.finished_at = _now_iso()
            state._append_log("Download cancelled by user.")
            return

        with state._lock:
            state.percent = 100
            state.status = "completed"
            state.finished_at = _now_iso()
        state._append_log("Download completed.")
    except Exception as exc:  # noqa: BLE001
        with state._lock:
            state.status = "failed"
            state.error = str(exc)
            state.finished_at = _now_iso()
        state._append_log(f"Download failed: {exc}")


def start_download(repo_id: str, target_relative_path: str | None = None) -> dict[str, Any]:
    """Start a snapshot download in a background thread and return its initial snapshot."""

    if not repo_id or not repo_id.strip():
        raise ValueError("repo_id is required")
    try:
        local_name = _safe_local_dir(repo_id)
    except ValueError as exc:
        raise ValueError(str(exc)) from exc

    # Enforce that only models containing safetensors weights can be downloaded
    api = _hf_api()
    if api:
        try:
            info = api.model_info(repo_id)
            if not getattr(info, "safetensors", None):
                raise ValueError("Only safetensors models are allowed for download. This repository does not contain safetensors weights.")
        except Exception as exc:
            if "Only safetensors models" in str(exc):
                raise exc
            # Let it try downloading gated or private repositories (auth token is used during download thread run)
            pass

    target_path = target_relative_path or f"base_model/{local_name}"
    local_dir = PROJECT_ROOT / "base_model" / local_name

    download_id = uuid.uuid4().hex
    state = DownloadState(
        download_id=download_id,
        repo_id=repo_id,
        local_dir=local_dir,
        target_path=target_path,
    )
    state._append_log(f"Queued download of {repo_id}")

    thread = threading.Thread(target=_run_download, args=(state,), daemon=True)
    state._thread = thread

    with _DOWNLOADS_LOCK:
        _DOWNLOADS[download_id] = state

    thread.start()
    return state.snapshot()


def cancel_download(download_id: str) -> dict[str, Any] | None:
    with _DOWNLOADS_LOCK:
        state = _DOWNLOADS.get(download_id)
    if state is None:
        return None
    state.cancel()
    return state.snapshot()


def cleanup_completed(max_age_seconds: int = 3600) -> int:
    """Drop completed/failed download entries older than ``max_age_seconds``."""

    cutoff = time.time() - max_age_seconds
    removed = 0
    with _DOWNLOADS_LOCK:
        for download_id in list(_DOWNLOADS.keys()):
            state = _DOWNLOADS[download_id]
            if state.status in {"completed", "failed", "cancelled"} and state.finished_at:
                try:
                    finished_ts = datetime.fromisoformat(state.finished_at).timestamp()
                except ValueError:
                    continue
                if finished_ts < cutoff:
                    del _DOWNLOADS[download_id]
                    removed += 1
    return removed


def serialize_local_models_for_api() -> dict[str, Any]:
    return {
        "models": list_local_models(),
        "defaultModelPath": DEFAULT_LOCAL_MODEL,
    }


def serialize_downloads_for_api() -> dict[str, Any]:
    return {"downloads": list_downloads()}


def get_model_by_id(model_id: str) -> dict[str, Any] | None:
    models = list_local_models()
    for m in models:
        if m["id"] == model_id:
            return m
    return None


def list_model_files(model_id: str) -> list[dict[str, Any]]:
    model = get_model_by_id(model_id)
    if not model:
        raise ValueError("Model not found")
    model_path = Path(model["localPath"])

    files = []
    for root, dirs, filenames in os.walk(model_path):
        dirs[:] = [d for d in dirs if not d.startswith(".")]
        for name in filenames:
            if name.startswith("."):
                continue
            full_path = Path(root) / name
            try:
                rel_path = full_path.relative_to(model_path)
                rel_path_str = str(rel_path).replace("\\", "/")
                stat = full_path.stat()
                files.append({
                    "name": rel_path_str,
                    "sizeBytes": stat.st_size,
                    "isJson": name.lower().endswith(".json"),
                })
            except (OSError, ValueError):
                continue
    return sorted(files, key=lambda f: f["name"])


def read_model_file(model_id: str, file_path: str) -> str:
    model = get_model_by_id(model_id)
    if not model:
        raise ValueError("Model not found")
    model_path = Path(model["localPath"]).resolve()

    target_path = (model_path / file_path).resolve()
    try:
        target_path.relative_to(model_path)
    except ValueError as exc:
        raise ValueError("Access denied: path traversal detected") from exc

    if not target_path.exists() or not target_path.is_file():
        raise ValueError("File not found")

    if not target_path.name.lower().endswith(".json"):
        raise ValueError("Only JSON files can be read")

    with open(target_path, "r", encoding="utf-8") as f:
        return f.read()


def write_model_file(model_id: str, file_path: str, content: str) -> None:
    model = get_model_by_id(model_id)
    if not model:
        raise ValueError("Model not found")
    model_path = Path(model["localPath"]).resolve()

    target_path = (model_path / file_path).resolve()
    try:
        target_path.relative_to(model_path)
    except ValueError as exc:
        raise ValueError("Access denied: path traversal detected") from exc

    if not target_path.name.lower().endswith(".json"):
        raise ValueError("Only JSON files can be edited")

    # Validate JSON content is valid
    try:
        json.loads(content)
    except json.JSONDecodeError as e:
        raise ValueError(f"Invalid JSON content: {str(e)}")

    with open(target_path, "w", encoding="utf-8") as f:
        f.write(content)


__all__: Iterable[str] = (
    "search_hub_models",
    "list_local_models",
    "start_download",
    "cancel_download",
    "list_downloads",
    "get_download",
    "resolve_hf_token",
    "serialize_local_models_for_api",
    "serialize_downloads_for_api",
    "list_model_files",
    "read_model_file",
    "write_model_file",
)
