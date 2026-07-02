from __future__ import annotations

import json
from pathlib import Path

from backend.train.engine import run_training_job
from backend.train.schemas import TrainingJobPayload


PROJECT_ROOT = Path(__file__).resolve().parent
CONFIG_PATH = PROJECT_ROOT / "finetune_config.json"


def load_training_payload() -> TrainingJobPayload:
    config_data = {}
    if CONFIG_PATH.exists():
        print(f"Loading dynamic config settings from {CONFIG_PATH}...")
        try:
            config_data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        except Exception as exc:
            print(f"Error loading {CONFIG_PATH}: {exc}")
    return TrainingJobPayload(**config_data)


def main() -> int:
    payload = load_training_payload()
    run_training_job(payload)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
