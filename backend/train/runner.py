from __future__ import annotations

import os
os.environ["_ENABLE_FLEX_ATTENTION"] = "0"
os.environ["_COMPILE_DISABLE"] = "1"
os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"

import pyarrow  # Must be imported before torch to prevent Windows DLL conflicts/segfaults
import   # Must be imported before trl, transformers, peft to ensure optimizations are applied!
import torch
torch._dynamo.config.disable = True  # Disable torch.compile globally to avoid cl.exe compiler crashes on Windows

import argparse
from pathlib import Path

from backend.train.engine import run_training_job
from backend.train.schemas import TrainingJobPayload


def main() -> int:
    parser = argparse.ArgumentParser(description="Run a single fine-tuning job from a JSON config file.")
    parser.add_argument("--job-config", required=True, help="Path to a JSON file containing the training payload.")
    args = parser.parse_args()

    config_path = Path(args.job_config)
    payload = TrainingJobPayload.model_validate_json(config_path.read_text(encoding="utf-8"))
    run_training_job(payload)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
