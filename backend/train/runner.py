from __future__ import annotations

import pyarrow  # Must be imported before torch to prevent Windows DLL conflicts/segfaults
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
