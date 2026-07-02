"""Multi-dataset service for managing multiple user-uploaded datasets.

This service allows users to create, upload, and manage multiple datasets
of any type (JSONL, CSV, Parquet). Each dataset can contain multiple files.
"""

from __future__ import annotations

import csv
import json
import shutil
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

import aiofiles

from fastapi import HTTPException, UploadFile

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATASETS_DIR = PROJECT_ROOT / "datasets"
DATASETS_DIR.mkdir(exist_ok=True)

METADATA_FILE = DATASETS_DIR / ".metadata.json"


def _load_metadata() -> dict[str, Any]:
    """Load datasets metadata from disk."""
    if not METADATA_FILE.exists():
        return {"datasets": {}}
    try:
        with open(METADATA_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        # Migrate absolute paths to relative paths
        changed = False
        for ds in data.get("datasets", {}).values():
            for file_info in ds.get("files", []):
                path_str = file_info.get("path", "")
                if path_str:
                    try:
                        p = Path(path_str)
                        if p.is_absolute():
                            if "datasets" in p.parts:
                                idx = p.parts.index("datasets")
                                new_path = "/".join(p.parts[idx:])
                            else:
                                new_path = f"datasets/{p.name}"
                            file_info["path"] = new_path
                            changed = True
                    except Exception:
                        pass
        
        if changed:
            _save_metadata(data)
        return data
    except Exception:
        return {"datasets": {}}


def _save_metadata(metadata: dict[str, Any]) -> None:
    """Save datasets metadata to disk."""
    with open(METADATA_FILE, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)


def _sync_local_datasets() -> None:
    """Scan datasets/ folder and auto-register any files not in metadata."""
    metadata = _load_metadata()
    changed = False

    if not DATASETS_DIR.exists():
        return

    # 1. Scan files directly in the root of datasets/ directory
    for item in DATASETS_DIR.iterdir():
        if item.is_file():
            # Skip hidden files and metadata
            if item.name.startswith(".") or item.name == ".metadata.json":
                continue
            
            # Check if this file path is already registered under any dataset
            is_registered = False
            for ds in metadata.get("datasets", {}).values():
                for f in ds.get("files", []):
                    if Path(f["path"]).name == item.name:
                        is_registered = True
                        break
                if is_registered:
                    break
            
            if not is_registered:
                # Create a new dataset entry for this local file
                dataset_id = f"local_{item.stem.replace(' ', '_')}"
                # If ID exists, make it unique
                if dataset_id in metadata.get("datasets", {}):
                    dataset_id = f"{dataset_id}_{uuid.uuid4().hex[:6]}"
                
                format_type = _detect_format(item)
                if format_type == "jsonl" or format_type == "json":
                    columns, rows = _parse_jsonl(item)
                elif format_type == "csv":
                    columns, rows = _parse_csv(item)
                elif format_type == "parquet":
                    columns, rows = _parse_parquet(item)
                else:
                    columns, rows = [], 0

                try:
                    rel_path = item.relative_to(PROJECT_ROOT)
                    path_str = str(rel_path).replace("\\", "/")
                except ValueError:
                    path_str = str(item).replace("\\", "/")

                file_info = {
                    "id": uuid.uuid4().hex,
                    "name": item.name,
                    "path": path_str,
                    "size_bytes": item.stat().st_size,
                    "rows": rows,
                    "format": format_type,
                    "columns": columns,
                    "uploaded_at": int(item.stat().st_mtime),
                }

                metadata["datasets"][dataset_id] = {
                    "name": f"Local: {item.name}",
                    "files": [file_info],
                    "created_at": int(item.stat().st_ctime),
                }
                changed = True

    if changed:
        _save_metadata(metadata)


def list_datasets() -> list[dict[str, Any]]:
    """List all datasets with their files."""
    _sync_local_datasets()
    metadata = _load_metadata()
    datasets = []

    for dataset_id, dataset_info in metadata.get("datasets", {}).items():
        # Recalculate total rows
        total_rows = sum(f.get("rows", 0) for f in dataset_info.get("files", []))
        datasets.append(
            {
                "id": dataset_id,
                "name": dataset_info["name"],
                "files": dataset_info.get("files", []),
                "total_rows": total_rows,
                "created_at": dataset_info["created_at"],
                "status": dataset_info.get("status"),
                "error": dataset_info.get("error"),
            }
        )

    # Sort by creation time, newest first
    datasets.sort(key=lambda x: x["created_at"], reverse=True)
    return datasets


def create_dataset(name: str) -> dict[str, Any]:
    """Create a new dataset."""
    if not name or not name.strip():
        raise HTTPException(status_code=400, detail="Dataset name is required")

    name = name.strip()
    metadata = _load_metadata()

    # Check if dataset with this name already exists
    for ds in metadata.get("datasets", {}).values():
        if ds["name"] == name:
            raise HTTPException(
                status_code=400, detail=f"Dataset '{name}' already exists"
            )

    dataset_id = uuid.uuid4().hex
    dataset_dir = DATASETS_DIR / dataset_id
    dataset_dir.mkdir(exist_ok=True)

    metadata["datasets"][dataset_id] = {
        "name": name,
        "files": [],
        "created_at": int(datetime.now().timestamp()),
    }
    _save_metadata(metadata)

    return {
        "id": dataset_id,
        "name": name,
        "files": [],
        "total_rows": 0,
        "created_at": metadata["datasets"][dataset_id]["created_at"],
    }


def delete_dataset(dataset_id: str) -> None:
    """Delete a dataset and all its files."""
    metadata = _load_metadata()
    if dataset_id not in metadata.get("datasets", {}):
        raise HTTPException(status_code=404, detail="Dataset not found")

    # Remove dataset directory
    dataset_dir = DATASETS_DIR / dataset_id
    if dataset_dir.exists():
        shutil.rmtree(dataset_dir, ignore_errors=True)

    # Remove from metadata
    del metadata["datasets"][dataset_id]
    _save_metadata(metadata)


def _detect_format(file_path: Path) -> str:
    """Detect file format from extension."""
    ext = file_path.suffix.lower().lstrip(".")
    if ext in ("jsonl", "json"):
        return "jsonl" if ext == "jsonl" else "json"
    if ext == "csv":
        return "csv"
    if ext == "parquet":
        return "parquet"
    return "unknown"


def _parse_jsonl(file_path: Path) -> tuple[list[str], int]:
    """Parse JSONL file and return columns and row count."""
    columns: set[str] = set()
    rows = 0
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    record = json.loads(line)
                    if isinstance(record, dict):
                        columns.update(record.keys())
                        rows += 1
                except json.JSONDecodeError:
                    continue
    except Exception:
        pass
    return sorted(columns), rows


def _parse_csv(file_path: Path) -> tuple[list[str], int]:
    """Parse CSV file and return columns and row count."""
    columns: list[str] = []
    rows = 0
    try:
        with open(file_path, "r", encoding="utf-8", newline="") as f:
            reader = csv.DictReader(f)
            if reader.fieldnames:
                columns = list(reader.fieldnames)
            for _ in reader:
                rows += 1
    except Exception:
        pass
    return columns, rows


def _parse_parquet(file_path: Path) -> tuple[list[str], int]:
    """Parse Parquet file and return columns and row count."""
    try:
        import pyarrow.parquet as pq

        table = pq.read_table(file_path)
        return table.schema.names, table.num_rows
    except ImportError:
        return [], 0
    except Exception:
        return [], 0


async def upload_file_to_dataset(dataset_id: str, file: UploadFile) -> dict[str, Any]:
    """Upload a file to a specific dataset."""
    metadata = _load_metadata()
    if dataset_id not in metadata.get("datasets", {}):
        raise HTTPException(status_code=404, detail="Dataset not found")

    # Validate file
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    file_ext = Path(file.filename).suffix.lower()
    if file_ext not in (".jsonl", ".json", ".csv", ".parquet"):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format: {file_ext}. Supported: .jsonl, .json, .csv, .parquet",
        )

    # Create dataset directory if it doesn't exist
    dataset_dir = DATASETS_DIR / dataset_id
    dataset_dir.mkdir(exist_ok=True)

    # Generate unique file ID
    file_id = uuid.uuid4().hex
    safe_filename = f"{file_id}{file_ext}"
    file_path = dataset_dir / safe_filename

    # Save file
    try:
        async with aiofiles.open(file_path, "wb") as out_file:
            content = await file.read()
            await out_file.write(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {e}")

    # Parse file to get metadata
    format_type = _detect_format(file_path)
    if format_type == "jsonl" or format_type == "json":
        columns, rows = _parse_jsonl(file_path)
    elif format_type == "csv":
        columns, rows = _parse_csv(file_path)
    elif format_type == "parquet":
        columns, rows = _parse_parquet(file_path)
    else:
        columns, rows = [], 0

    # Update metadata
    file_info = {
        "id": file_id,
        "name": file.filename,
        "path": str(file_path),
        "size_bytes": file_path.stat().st_size,
        "rows": rows,
        "format": format_type,
        "columns": columns,
        "uploaded_at": int(datetime.now().timestamp()),
    }

    metadata["datasets"][dataset_id]["files"].append(file_info)
    _save_metadata(metadata)

    return file_info


def delete_file_from_dataset(dataset_id: str, file_id: str) -> None:
    """Delete a file from a dataset."""
    metadata = _load_metadata()
    if dataset_id not in metadata.get("datasets", {}):
        raise HTTPException(status_code=404, detail="Dataset not found")

    dataset = metadata["datasets"][dataset_id]
    file_to_delete = None
    for f in dataset.get("files", []):
        if f["id"] == file_id:
            file_to_delete = f
            break

    if not file_to_delete:
        raise HTTPException(status_code=404, detail="File not found")

    # Delete the file
    file_path = Path(file_to_delete["path"])
    if file_path.exists():
        try:
            file_path.unlink()
        except Exception:
            pass

    # Remove from metadata
    dataset["files"] = [f for f in dataset["files"] if f["id"] != file_id]
    _save_metadata(metadata)


import threading

def _run_dataset_download(dataset_id: str, repo_id: str, split_name: str, token: str | None = None) -> None:
    from datasets import load_dataset
    import os

    dataset_dir = DATASETS_DIR / dataset_id
    dataset_dir.mkdir(exist_ok=True)

    try:
        kwargs = {}
        if token:
            kwargs["token"] = token

        # Load the dataset
        ds = load_dataset(repo_id, **kwargs)

        # Determine the split to download
        if isinstance(ds, dict):
            # It's a DatasetDict
            split_to_use = split_name if split_name in ds else "train" if "train" in ds else list(ds.keys())[0]
            split_ds = ds[split_to_use]
        else:
            split_ds = ds
            split_to_use = "train"

        # Save to JSONL
        safe_name = repo_id.replace("/", "__")
        filename = f"{safe_name}_{split_to_use}.jsonl"
        file_path = dataset_dir / filename

        split_ds.to_json(str(file_path))

        # Parse file to get row count and columns
        format_type = _detect_format(file_path)
        columns, rows = _parse_jsonl(file_path)

        # Register file in metadata
        metadata = _load_metadata()
        if dataset_id in metadata.get("datasets", {}):
            file_info = {
                "id": uuid.uuid4().hex,
                "name": f"{repo_id} ({split_to_use})",
                "path": str(file_path),
                "size_bytes": file_path.stat().st_size,
                "rows": rows,
                "format": format_type,
                "columns": columns,
                "uploaded_at": int(datetime.now().timestamp()),
            }
            metadata["datasets"][dataset_id]["files"].append(file_info)
            # Remove any error and status if it previously failed
            if "error" in metadata["datasets"][dataset_id]:
                del metadata["datasets"][dataset_id]["error"]
            if "status" in metadata["datasets"][dataset_id]:
                del metadata["datasets"][dataset_id]["status"]
            _save_metadata(metadata)

    except Exception as e:
        print(f"[DATASET DOWNLOAD ERROR] Failed: {e}")
        metadata = _load_metadata()
        if dataset_id in metadata.get("datasets", {}):
            metadata["datasets"][dataset_id]["error"] = str(e)
            if "status" in metadata["datasets"][dataset_id]:
                del metadata["datasets"][dataset_id]["status"]
            _save_metadata(metadata)


def download_dataset_from_hub(repo_id: str, split_name: str = "train", token: str | None = None) -> dict[str, Any]:
    """Start a dataset download in a background thread."""
    if not repo_id or not repo_id.strip():
        raise HTTPException(status_code=400, detail="Repository ID is required")

    repo_id = repo_id.strip()
    dataset_name = repo_id.split("/")[-1]

    # Create dataset registry entry
    metadata = _load_metadata()

    # Check if dataset with this name already exists
    for ds in metadata.get("datasets", {}).values():
        if ds["name"] == dataset_name:
            raise HTTPException(
                status_code=400, detail=f"Dataset '{dataset_name}' already exists"
            )

    dataset_id = uuid.uuid4().hex

    metadata["datasets"][dataset_id] = {
        "name": dataset_name,
        "files": [],
        "status": "downloading",
        "created_at": int(datetime.now().timestamp()),
    }
    _save_metadata(metadata)

    # Start background thread
    thread = threading.Thread(
        target=_run_dataset_download,
        args=(dataset_id, repo_id, split_name, token),
        daemon=True,
    )
    thread.start()

    return {
        "id": dataset_id,
        "name": dataset_name,
        "files": [],
        "status": "downloading",
        "total_rows": 0,
        "created_at": metadata["datasets"][dataset_id]["created_at"],
    }


def get_file_preview(dataset_id: str, file_id: str, limit: int = 10) -> dict[str, Any]:
    """Retrieve first N rows of a dataset file for UI preview."""
    metadata = _load_metadata()
    if dataset_id not in metadata.get("datasets", {}):
        raise HTTPException(status_code=404, detail="Dataset not found")

    dataset = metadata["datasets"][dataset_id]
    target_file = None
    for f in dataset.get("files", []):
        if f["id"] == file_id:
            target_file = f
            break

    if not target_file:
        raise HTTPException(status_code=404, detail="File not found")

    file_path = Path(target_file["path"])
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Physical file not found on disk")

    fmt = target_file["format"]
    rows: list[dict[str, Any]] = []
    columns = target_file.get("columns", [])

    try:
        if fmt == "csv":
            with open(file_path, "r", encoding="utf-8", newline="") as f:
                reader = csv.DictReader(f)
                count = 0
                for row in reader:
                    if count >= limit:
                        break
                    rows.append(dict(row))
                    count += 1
        elif fmt in ("jsonl", "json"):
            with open(file_path, "r", encoding="utf-8") as f:
                count = 0
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        record = json.loads(line)
                        if isinstance(record, dict):
                            rows.append(record)
                            count += 1
                    except json.JSONDecodeError:
                        continue
                    if count >= limit:
                        break
        elif fmt == "parquet":
            import pandas as pd
            df = pd.read_parquet(file_path, engine="pyarrow")
            df_subset = df.head(limit)
            for _, r in df_subset.iterrows():
                rows.append({k: (v.tolist() if hasattr(v, "tolist") else str(v) if pd.isna(v) else v) for k, v in r.to_dict().items()})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read file preview: {e}")

    return {
        "columns": columns,
        "rows": rows,
        "format": fmt,
        "name": target_file["name"]
    }


def map_file_columns(dataset_id: str, file_id: str, src_instruction: str, src_output: str, src_cot: str | None = None) -> dict[str, Any]:
    """Reads a file, maps its custom columns to instruction, output, cot, and saves as a clean jsonl."""
    metadata = _load_metadata()
    if dataset_id not in metadata.get("datasets", {}):
        raise HTTPException(status_code=404, detail="Dataset not found")

    dataset = metadata["datasets"][dataset_id]
    target_file = None
    for f in dataset.get("files", []):
        if f["id"] == file_id:
            target_file = f
            break

    if not target_file:
        raise HTTPException(status_code=404, detail="File not found")

    file_path = Path(target_file["path"])
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Physical file not found on disk")

    fmt = target_file["format"]
    mapped_rows = []

    try:
        if fmt == "csv":
            with open(file_path, "r", encoding="utf-8", newline="") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    mapped_row = {
                        "instruction": row.get(src_instruction, ""),
                        "output": row.get(src_output, ""),
                    }
                    if src_cot and src_cot in row:
                        mapped_row["cot"] = row.get(src_cot, "")
                    mapped_rows.append(mapped_row)
        elif fmt in ("jsonl", "json"):
            with open(file_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        record = json.loads(line)
                        if isinstance(record, dict):
                            mapped_row = {
                                "instruction": record.get(src_instruction, ""),
                                "output": record.get(src_output, ""),
                            }
                            if src_cot and src_cot in record:
                                mapped_row["cot"] = record.get(src_cot, "")
                            mapped_rows.append(mapped_row)
                    except json.JSONDecodeError:
                        continue
        elif fmt == "parquet":
            import pandas as pd
            df = pd.read_parquet(file_path, engine="pyarrow")
            for _, r in df.iterrows():
                row = r.to_dict()
                mapped_row = {
                    "instruction": str(row.get(src_instruction, "")),
                    "output": str(row.get(src_output, "")),
                }
                if src_cot and src_cot in row:
                    mapped_row["cot"] = str(row.get(src_cot, ""))
                mapped_rows.append(mapped_row)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse source file for mapping: {e}")

    # Write mapped rows to JSONL
    new_file_id = uuid.uuid4().hex
    new_filename = f"mapped_{new_file_id}.jsonl"
    new_file_path = DATASETS_DIR / dataset_id / new_filename

    try:
        with open(new_file_path, "w", encoding="utf-8") as f:
            for row in mapped_rows:
                f.write(json.dumps(row, ensure_ascii=False) + "\n")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to write mapped dataset file: {e}")

    # Register the new file
    new_file_info = {
        "id": new_file_id,
        "name": f"mapped_{target_file['name']}",
        "path": str(new_file_path),
        "size_bytes": new_file_path.stat().st_size,
        "rows": len(mapped_rows),
        "format": "jsonl",
        "columns": ["instruction", "output"] + (["cot"] if src_cot else []),
        "uploaded_at": int(datetime.now().timestamp()),
    }

    metadata["datasets"][dataset_id]["files"].append(new_file_info)
    _save_metadata(metadata)

    return new_file_info

