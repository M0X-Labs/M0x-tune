from __future__ import annotations

import pyarrow  # Must be imported before torch to prevent Windows DLL conflicts/segfaults
import json
import os
import re
import subprocess
import sys
import threading
import uuid
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path
from queue import Empty, Queue
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

from backend.datasets_service import (
    create_dataset,
    delete_dataset,
    delete_file_from_dataset,
    list_datasets,
    upload_file_to_dataset,
    get_file_preview,
    map_file_columns,
)
from backend.export_service import (
    ExportPayload,
    ExportRuntime,
    create_export_sse_stream,
    exports,
    exports_lock,
    get_export,
    list_exported_files,
    run_export,
    update_export_status,
)
from backend.model_service import (
    cancel_download,
    cleanup_completed,
    get_download,
    resolve_hf_token,
    search_hub_models,
    serialize_downloads_for_api,
    serialize_local_models_for_api,
    start_download,
    list_model_files,
    read_model_file,
    write_model_file,
)
from backend.train.schemas import JobStatus, TrainingJobPayload, TrainingJobSnapshot
from backend.inference_service import inference_manager


PROJECT_ROOT = Path(__file__).resolve().parents[1]
RUNTIME_DIR = PROJECT_ROOT / "backend" / "runtime" / "jobs"
LOSS_PATTERN = re.compile(r"'loss':\s*'([^']*)'")
LR_PATTERN = re.compile(r"'learning_rate':\s*([0-9eE.\-]+)")
EPOCH_PATTERN = re.compile(r"'epoch':\s*([0-9.\-]+)")
PROGRESS_PATTERN = re.compile(r"(\d+)%\s*\|.*\|\s*(\d+)\/(\d+)\s*\[([^\]]+)\]")


def sse_message(event: str, data: Any) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


@dataclass
class JobRuntime:
    job_id: str
    payload: TrainingJobPayload
    config_path: Path
    status: JobStatus = "queued"
    logs: deque[str] = field(default_factory=lambda: deque(maxlen=500))
    step: int = 0
    total_steps: int = 0
    percent: int = 0
    loss: float | None = None
    learning_rate: float | None = None
    epoch: float | None = None
    process: subprocess.Popen[str] | None = None
    subscribers: list[Queue[str]] = field(default_factory=list)
    lock: threading.Lock = field(default_factory=threading.Lock)

    def snapshot(self) -> TrainingJobSnapshot:
        return TrainingJobSnapshot(
            job_id=self.job_id,
            status=self.status,
            step=self.step,
            total_steps=self.total_steps,
            percent=self.percent,
            loss=self.loss,
            learning_rate=self.learning_rate,
            epoch=self.epoch,
            logs=list(self.logs),
        )


jobs: dict[str, JobRuntime] = {}
jobs_lock = threading.Lock()

app = FastAPI(title="m0x-tune backend", version="0.1.0")


def broadcast(job: JobRuntime, event: str, data: Any) -> None:
    message = sse_message(event, data)
    with job.lock:
        stale: list[Queue[str]] = []
        for subscriber in job.subscribers:
            try:
                subscriber.put_nowait(message)
            except Exception:
                stale.append(subscriber)
        for subscriber in stale:
            if subscriber in job.subscribers:
                job.subscribers.remove(subscriber)


def update_job_status(job: JobRuntime, status: JobStatus) -> None:
    with job.lock:
        job.status = status
    broadcast(job, "status", {"status": status, "jobId": job.job_id})


def append_log(job: JobRuntime, line: str) -> None:
    with job.lock:
        job.logs.append(line)
    broadcast(job, "log", {"text": line, "jobId": job.job_id})

    loss_match = LOSS_PATTERN.search(line)
    if loss_match:
        with job.lock:
            job.loss = float(loss_match.group(1))
            lr_match = LR_PATTERN.search(line)
            epoch_match = EPOCH_PATTERN.search(line)
            job.learning_rate = float(lr_match.group(1)) if lr_match else job.learning_rate
            job.epoch = float(epoch_match.group(1)) if epoch_match else job.epoch
            payload = {
                "loss": job.loss,
                "learningRate": job.learning_rate,
                "epoch": job.epoch or 0.0,
                "jobId": job.job_id,
            }
        broadcast(job, "metrics", payload)

    progress_match = PROGRESS_PATTERN.search(line)
    if progress_match:
        percent = int(progress_match.group(1))
        step = int(progress_match.group(2))
        total_steps = int(progress_match.group(3))
        time_info = progress_match.group(4)
        with job.lock:
            job.percent = percent
            job.step = step
            job.total_steps = total_steps
        broadcast(
            job,
            "progress",
            {
                "percent": percent,
                "step": step,
                "totalSteps": total_steps,
                "timeInfo": time_info,
                "jobId": job.job_id,
            },
        )


def stream_reader(job: JobRuntime, stream: Any) -> None:
    try:
        for raw_line in iter(stream.readline, ""):
            line = raw_line.rstrip()
            if line:
                append_log(job, line)
    finally:
        stream.close()


def run_job(job: JobRuntime) -> None:
    update_job_status(job, "running")
    with job.lock:
        job.total_steps = job.payload.max_steps
    broadcast(
        job,
        "progress",
        {"percent": 0, "step": 0, "totalSteps": job.payload.max_steps, "jobId": job.job_id},
    )

    env = dict(os.environ)
    env["PYTHONUNBUFFERED"] = "1"

    try:
        process = subprocess.Popen(
            [sys.executable, "-m", "backend.train.runner", "--job-config", str(job.config_path)],
            cwd=PROJECT_ROOT,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
        )

        with job.lock:
            job.process = process

        stdout_thread = threading.Thread(target=stream_reader, args=(job, process.stdout), daemon=True)
        stderr_thread = threading.Thread(target=stream_reader, args=(job, process.stderr), daemon=True)
        stdout_thread.start()
        stderr_thread.start()

        return_code = process.wait()
        stdout_thread.join(timeout=1)
        stderr_thread.join(timeout=1)

        with job.lock:
            cancelled = job.status == "cancelled"
            job.process = None

        if cancelled:
            append_log(job, "[SYSTEM] Training terminated by user.")
            return

        if return_code == 0:
            with job.lock:
                job.percent = 100
            update_job_status(job, "completed")
        else:
            update_job_status(job, "failed")
            append_log(job, f"[SYSTEM] Training failed with return code {return_code}.")
    except Exception as exc:
        with job.lock:
            job.process = None
        update_job_status(job, "failed")
        import traceback
        err_msg = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
        append_log(job, f"[SYSTEM] Failed to start training runner process:\n{err_msg}")



def persist_job_payload(job_id: str, payload: TrainingJobPayload) -> Path:
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    config_path = RUNTIME_DIR / f"{job_id}.json"
    config_path.write_text(payload.model_dump_json(indent=2), encoding="utf-8")
    return config_path


def get_job(job_id: str) -> JobRuntime:
    with jobs_lock:
        job = jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Unknown job: {job_id}")
    return job


def create_sse_stream(job: JobRuntime):
    subscriber: Queue[str] = Queue()
    snapshot = job.snapshot()
    initial_messages = [
        sse_message("status", {"status": snapshot.status, "jobId": snapshot.job_id}),
        sse_message(
            "progress",
            {
                "percent": snapshot.percent,
                "step": snapshot.step,
                "totalSteps": snapshot.total_steps,
                "jobId": snapshot.job_id,
            },
        ),
    ]
    if snapshot.loss is not None:
        initial_messages.append(
            sse_message(
                "metrics",
                {
                    "loss": snapshot.loss,
                    "learningRate": snapshot.learning_rate,
                    "epoch": snapshot.epoch or 0.0,
                    "jobId": snapshot.job_id,
                },
            )
        )
    initial_messages.extend(sse_message("log", {"text": log, "jobId": snapshot.job_id}) for log in snapshot.logs)

    with job.lock:
        job.subscribers.append(subscriber)

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
            with job.lock:
                if subscriber in job.subscribers:
                    job.subscribers.remove(subscriber)

    return event_generator()


@app.get("/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


class ModelSearchPayload(BaseModel):
    query: str
    limit: int = 12


class ModelDownloadPayload(BaseModel):
    repoId: str
    targetPath: str | None = None
    token: str | None = None


class TrainingConfigPayload(BaseModel):
    localModelPath: str
    codingDatasetPath: str = "datasets/train_clean.parquet"
    codingDatasetPaths: list[str] = []
    outputGgufName: str
    learningRate: float
    maxSteps: int
    perDeviceTrainBatchSize: int
    gradientAccumulationSteps: int
    maxSeqLength: int
    loraR: int
    loraAlpha: int
    quantization: str = "q4_k_m"
    use4bit: bool = True
    useGradientCheckpointing: bool = True
    ropeScaling: str | None = None
    warmupSteps: int = 10
    seed: int = 3407


QUANTIZATION_METHODS = {"q2_k", "q3_k_m", "q4_0", "q4_k_m", "q5_0", "q5_k_m", "q6_k", "q8_0", "f16", "f32"}


@app.post("/api/config/validate")
def validate_training_config(payload: TrainingConfigPayload) -> dict[str, Any]:
    warnings: list[str] = []
    errors: list[str] = []

    if payload.learningRate <= 0 or payload.learningRate > 1:
        errors.append("learningRate must be between 0 and 1.")
    if payload.maxSteps <= 0:
        errors.append("maxSteps must be a positive integer.")
    if payload.perDeviceTrainBatchSize <= 0:
        errors.append("perDeviceTrainBatchSize must be a positive integer.")
    if payload.gradientAccumulationSteps <= 0:
        errors.append("gradientAccumulationSteps must be a positive integer.")
    if payload.maxSeqLength < 64 or payload.maxSeqLength > 32768:
        errors.append("maxSeqLength must be between 64 and 32768.")
    if payload.loraR <= 0 or payload.loraR > 256:
        errors.append("loraR must be between 1 and 256.")
    if payload.loraAlpha <= 0 or payload.loraAlpha > 512:
        errors.append("loraAlpha must be between 1 and 512.")
    if payload.quantization not in QUANTIZATION_METHODS:
        errors.append(
            f"quantization must be one of: {', '.join(sorted(QUANTIZATION_METHODS))}."
        )
    if payload.ropeScaling not in (None, "linear", "dynamic", "yarn"):
        errors.append("ropeScaling must be one of: linear, dynamic, yarn.")

    if not payload.localModelPath.strip():
        errors.append("localModelPath is required.")
    if not payload.outputGgufName.strip():
        errors.append("outputGgufName is required.")

    try:
        from backend.hardware import build_hardware_report

        hw = build_hardware_report()
    except Exception:
        hw = None

    if hw:
        if hw.get("vram_mb"):
            vram_mb = int(hw["vram_mb"])
            per_step_bytes = (
                payload.perDeviceTrainBatchSize
                * payload.gradientAccumulationSteps
                * payload.maxSeqLength
                * 2
                * 1_200_000
            )
            if per_step_bytes > vram_mb * 1024 * 1024 * 0.85:
                warnings.append(
                    "Estimated memory per step exceeds 85% of detected VRAM. Consider lowering maxSeqLength or batchSize."
                )
            if not payload.use4bit and vram_mb < 20_000:
                warnings.append("Disabling 4-bit quantization on sub-20GB GPUs is likely to OOM.")
        
        # Check Windows pagefile for GGUF export
        if hw.get("os") == "win32" and hw.get("pagefile"):
            pagefile = hw["pagefile"]
            if pagefile.get("total_pagefile_gb", 0) < 32:
                warnings.append(
                    f"Windows pagefile size ({pagefile.get('total_pagefile_gb', 0)} GB) may be insufficient for GGUF export. "
                    "Consider increasing pagefile size to at least 32 GB or setting it to system-managed."
                )

    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
        "hardware": hw,
        "config": payload.model_dump(),
    }


@app.get("/api/config/quantizations")
def list_quantization_methods() -> dict[str, Any]:
    return {
        "methods": [
            {"value": "q2_k", "label": "Q2_K (smallest, lower quality)"},
            {"value": "q3_k_m", "label": "Q3_K_M (small, decent quality)"},
            {"value": "q4_0", "label": "Q4_0 (fast, moderate quality)"},
            {"value": "q4_k_m", "label": "Q4_K_M (recommended balance)"},
            {"value": "q5_0", "label": "Q5_0 (larger, better quality)"},
            {"value": "q5_k_m", "label": "Q5_K_M (large, strong quality)"},
            {"value": "q6_k", "label": "Q6_K (large, near-f16 quality)"},
            {"value": "q8_0", "label": "Q8_0 (very large, near-lossless)"},
            {"value": "f16", "label": "F16 (lossless, largest)"},
            {"value": "f32", "label": "F32 (full precision, reference only)"},
        ]
    }


@app.get("/api/models")
def get_models() -> dict[str, Any]:
    cleanup_completed()
    return serialize_local_models_for_api()


@app.post("/api/models/search")
def post_model_search(payload: ModelSearchPayload) -> dict[str, Any]:
    if payload.limit <= 0 or payload.limit > 50:
        raise HTTPException(status_code=400, detail="limit must be between 1 and 50.")
    return {
        "results": search_hub_models(payload.query, limit=payload.limit),
        "query": payload.query,
    }


@app.post("/api/models/download")
def post_model_download(payload: ModelDownloadPayload) -> dict[str, Any]:
    token = resolve_hf_token(payload.token)
    if token:
        os.environ["HF_TOKEN"] = token
    try:
        snapshot = start_download(payload.repoId, payload.targetPath)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return snapshot


@app.get("/api/models/downloads")
def get_model_downloads() -> dict[str, Any]:
    cleanup_completed()
    return serialize_downloads_for_api()


@app.get("/api/models/downloads/{download_id}")
def get_model_download(download_id: str) -> dict[str, Any]:
    snapshot = get_download(download_id)
    if snapshot is None:
        raise HTTPException(status_code=404, detail="Unknown download id.")
    return snapshot


@app.delete("/api/models/downloads/{download_id}")
def delete_model_download(download_id: str) -> dict[str, Any]:
    snapshot = cancel_download(download_id)
    if snapshot is None:
        raise HTTPException(status_code=404, detail="Unknown download id.")
    return snapshot


@app.get("/api/models/files")
def get_model_files(model_id: str) -> dict[str, Any]:
    try:
        files = list_model_files(model_id)
        return {"files": files}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/models/files/content")
def get_model_file_content(model_id: str, file_path: str) -> dict[str, Any]:
    try:
        content = read_model_file(model_id, file_path)
        return {"content": content}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class ModelFileUpdatePayload(BaseModel):
    content: str


@app.post("/api/models/files/content")
def update_model_file_content(
    model_id: str,
    file_path: str,
    payload: ModelFileUpdatePayload,
) -> dict[str, Any]:
    try:
        write_model_file(model_id, file_path, payload.content)
        return {"status": "success"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/jobs")
def create_job(payload: TrainingJobPayload) -> JSONResponse:
    # Auto-unload playground model to free GPU VRAM
    inference_manager.unload_model()
    
    job_id = uuid.uuid4().hex
    config_path = persist_job_payload(job_id, payload)
    job = JobRuntime(job_id=job_id, payload=payload, config_path=config_path)

    with jobs_lock:
        jobs[job_id] = job

    thread = threading.Thread(target=run_job, args=(job,), daemon=True)
    thread.start()
    return JSONResponse({"jobId": job_id, "status": "queued"}, status_code=202)


@app.get("/api/jobs/active")
def get_active_job() -> dict[str, Any]:
    with jobs_lock:
        # Find any running or queued jobs first
        for job in jobs.values():
            if job.status in ("running", "queued"):
                return {"jobId": job.job_id, "status": job.status}
        # If none, return the latest job (the last in the dictionary)
        if jobs:
            latest_job = list(jobs.values())[-1]
            return {"jobId": latest_job.job_id, "status": latest_job.status}
        return {"jobId": None, "status": "idle"}


@app.get("/api/train/active")
def get_train_active() -> dict[str, Any]:
    with jobs_lock:
        # Find any running or queued jobs first
        for job in jobs.values():
            if job.status in ("running", "queued"):
                return {
                    "active": True,
                    "job": {
                        "id": job.job_id,
                        "status": "running",
                        "progress": job.percent,
                        "currentStep": job.step,
                        "totalSteps": job.total_steps,
                        "eta": "Calculating..."
                    }
                }
        # If none, return the latest job (the last in the dictionary)
        if jobs:
            latest_job = list(jobs.values())[-1]
            status_map = {
                "running": "running",
                "queued": "running",
                "completed": "completed",
                "failed": "failed",
                "cancelled": "idle"
            }
            return {
                "active": False,
                "job": {
                    "id": latest_job.job_id,
                    "status": status_map.get(latest_job.status, "idle"),
                    "progress": latest_job.percent,
                    "currentStep": latest_job.step,
                    "totalSteps": latest_job.total_steps,
                }
            }
        return {"active": False, "job": None}


@app.get("/api/train/stats")
def get_train_stats() -> dict[str, Any]:
    with jobs_lock:
        total = len(jobs)
        completed = sum(1 for j in jobs.values() if j.status == "completed")
        
        last_training = None
        if jobs:
            latest_job = list(jobs.values())[-1]
            try:
                mtime = latest_job.config_path.stat().st_mtime
                import datetime
                last_training = datetime.datetime.fromtimestamp(mtime, datetime.timezone.utc).isoformat()
            except Exception:
                pass
                
    from backend.export_service import list_exported_files
    try:
        exported_files = list_exported_files()
        exported_count = len(exported_files)
    except Exception:
        exported_count = 0

    return {
        "totalTrainings": total,
        "completedTrainings": completed,
        "exportedModels": exported_count,
        "lastTraining": last_training,
    }


@app.get("/api/jobs/{job_id}")
def get_job_snapshot(job_id: str) -> TrainingJobSnapshot:
    return get_job(job_id).snapshot()


@app.get("/api/jobs/{job_id}/events")
def get_job_events(job_id: str) -> StreamingResponse:
    job = get_job(job_id)
    return StreamingResponse(
        create_sse_stream(job),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


@app.delete("/api/jobs/{job_id}")
def cancel_job(job_id: str) -> JSONResponse:
    job = get_job(job_id)
    with job.lock:
        process = job.process
        if process is None or process.poll() is not None:
            raise HTTPException(status_code=400, detail="No running process for this job.")
        job.status = "cancelled"

    process.terminate()
    broadcast(job, "status", {"status": "cancelled", "jobId": job.job_id})
    return JSONResponse({"jobId": job.job_id, "status": "cancelled"})


# Export endpoints
import uuid


@app.post("/api/exports")
def create_export(payload: ExportPayload) -> JSONResponse:
    # Auto-unload playground model to free GPU VRAM
    inference_manager.unload_model()
    
    export_id = uuid.uuid4().hex
    exp = ExportRuntime(export_id=export_id, payload=payload)

    with exports_lock:
        exports[export_id] = exp

    thread = threading.Thread(target=run_export, args=(exp,), daemon=True)
    thread.start()
    return JSONResponse({"exportId": export_id, "status": "queued"}, status_code=202)


@app.get("/api/exports/{export_id}")
def get_export_snapshot(export_id: str) -> dict[str, Any]:
    exp = get_export(export_id)
    return {
        "exportId": exp.export_id,
        "status": exp.status,
        "logs": list(exp.logs),
        "payload": exp.payload.model_dump(),
    }


@app.get("/api/exports/{export_id}/events")
def get_export_events(export_id: str) -> StreamingResponse:
    exp = get_export(export_id)
    return StreamingResponse(
        create_export_sse_stream(exp),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


@app.delete("/api/exports/{export_id}")
def cancel_export(export_id: str) -> JSONResponse:
    exp = get_export(export_id)
    with exp.lock:
        process = exp.process
        if process is None or process.poll() is not None:
            raise HTTPException(status_code=400, detail="No running process for this export.")
        exp.status = "cancelled"

    process.terminate()
    return JSONResponse({"exportId": export_id, "status": "cancelled"})


@app.get("/api/exports/files")
def get_exported_files() -> dict[str, Any]:
    return {"files": list_exported_files()}


@app.get("/api/exports/files/download/{filename:path}")
def download_exported_file(filename: str):
    from fastapi.responses import FileResponse

    file_path = PROJECT_ROOT / filename
    if not file_path.is_file() or file_path.suffix.lower() != ".gguf":
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(
        path=file_path,
        filename=filename,
        media_type="application/octet-stream",
    )


# Multi-dataset management endpoints
class CreateDatasetPayload(BaseModel):
    name: str


@app.get("/api/datasets/list")
def list_all_datasets() -> dict[str, Any]:
    """List all datasets with their files."""
    return {"datasets": list_datasets()}


@app.post("/api/datasets/create")
async def create_new_dataset(payload: CreateDatasetPayload) -> dict[str, Any]:
    """Create a new dataset."""
    dataset = create_dataset(payload.name)
    return dataset


class DownloadDatasetPayload(BaseModel):
    repoId: str
    splitName: str = "train"
    token: str | None = None


@app.post("/api/datasets/download")
def download_dataset_endpoint(payload: DownloadDatasetPayload) -> dict[str, Any]:
    from backend.datasets_service import download_dataset_from_hub

    # Resolve token if any
    token = resolve_hf_token(payload.token)

    dataset = download_dataset_from_hub(
        repo_id=payload.repoId,
        split_name=payload.splitName,
        token=token,
    )
    return dataset


@app.delete("/api/datasets/{dataset_id}")
def delete_dataset_endpoint(dataset_id: str) -> dict[str, Any]:
    """Delete a dataset and all its files."""
    delete_dataset(dataset_id)
    return {"status": "deleted", "datasetId": dataset_id}


@app.post("/api/datasets/upload")
async def upload_dataset_file(
    datasetId: str = Form(...),
    file: UploadFile = File(...),
) -> dict[str, Any]:
    """Upload a file to a specific dataset."""
    file_info = await upload_file_to_dataset(datasetId, file)
    return file_info


@app.delete("/api/datasets/{dataset_id}/files/{file_id}")
def delete_dataset_file(dataset_id: str, file_id: str) -> dict[str, Any]:
    """Delete a file from a dataset."""
    delete_file_from_dataset(dataset_id, file_id)
    return {"status": "deleted", "datasetId": dataset_id, "fileId": file_id}


@app.get("/api/hardware")
def get_hardware_info() -> dict[str, Any]:
    from backend.hardware import build_hardware_report
    hw = build_hardware_report()
    return {"hardware": hw}


# Playground endpoints
class LoadModelPayload(BaseModel):
    modelPath: str

@app.post("/api/playground/load")
def load_playground_model(payload: LoadModelPayload) -> dict[str, Any]:
    inference_manager.load_model(payload.modelPath)
    return {"status": "loading", "modelPath": payload.modelPath}

@app.post("/api/playground/unload")
def unload_playground_model() -> dict[str, Any]:
    inference_manager.unload_model()
    return {"status": "unloaded"}

@app.get("/api/playground/status")
def get_playground_status() -> dict[str, Any]:
    return {
        "status": inference_manager.status,
        "modelPath": inference_manager.model_path,
        "error": inference_manager.error
    }

class ChatPayload(BaseModel):
    prompt: str
    temperature: float = 0.7
    top_p: float = 0.95
    max_tokens: int = 512

@app.post("/api/playground/chat")
def chat_playground_model(payload: ChatPayload) -> StreamingResponse:
    if inference_manager.status != "ready":
        raise HTTPException(status_code=400, detail="Model is not ready.")
    
    def event_stream():
        for chunk in inference_manager.generate_stream(
            prompt=payload.prompt,
            temperature=payload.temperature,
            top_p=payload.top_p,
            max_tokens=payload.max_tokens,
        ):
            yield f"data: {json.dumps({'text': chunk})}\n\n"
            
    return StreamingResponse(event_stream(), media_type="text/event-stream")


# Dataset preview and map endpoints
@app.get("/api/datasets/{dataset_id}/files/{file_id}/preview")
def preview_dataset_file(dataset_id: str, file_id: str, limit: int = 10) -> dict[str, Any]:
    return get_file_preview(dataset_id, file_id, limit)

class MapColumnsPayload(BaseModel):
    srcInstruction: str
    srcOutput: str
    srcCot: str | None = None

@app.post("/api/datasets/{dataset_id}/files/{file_id}/map")
def map_dataset_columns(dataset_id: str, file_id: str, payload: MapColumnsPayload) -> dict[str, Any]:
    return map_file_columns(
        dataset_id=dataset_id,
        file_id=file_id,
        src_instruction=payload.srcInstruction,
        src_output=payload.srcOutput,
        src_cot=payload.srcCot
    )


def tail_log_file(file_path: Path):
    if not file_path.exists():
        yield f"data: {json.dumps({'text': f'[SYSTEM] Log file {file_path.name} not found.'})}\n\n"
        return

    # Send the last 100 lines first if they exist
    try:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            lines = f.readlines()
            for line in lines[-100:]:
                yield f"data: {json.dumps({'text': line.rstrip()})}\n\n"
    except Exception as e:
        yield f"data: {json.dumps({'text': f'[SYSTEM] Error reading log file: {e}'})}\n\n"
        return

    # Stream new lines by periodically checking for size changes
    last_pos = file_path.stat().st_size
    try:
        while True:
            import time
            time.sleep(0.5)
            
            if not file_path.exists():
                continue
                
            curr_size = file_path.stat().st_size
            if curr_size < last_pos:
                last_pos = 0
                yield f"data: {json.dumps({'text': '[SYSTEM] Log file was cleared/truncated.'})}\n\n"
                
            if curr_size > last_pos:
                with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                    f.seek(last_pos)
                    new_content = f.read()
                    last_pos = f.tell()
                    
                # Split and yield all lines in new content
                for line in new_content.splitlines():
                    yield f"data: {json.dumps({'text': line.rstrip()})}\n\n"
    except Exception as e:
        yield f"data: {json.dumps({'text': f'[SYSTEM] Log stream interrupted: {e}'})}\n\n"


@app.get("/api/system/logs/{service}")
def stream_system_logs(service: str) -> StreamingResponse:
    if service not in ("backend", "frontend"):
        raise HTTPException(status_code=400, detail="Invalid service name.")

    file_path = PROJECT_ROOT / f"{service}.log"

    return StreamingResponse(
        tail_log_file(file_path),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


