from __future__ import annotations

import os
os.environ["_ENABLE_FLEX_ATTENTION"] = "0"
os.environ["_COMPILE_DISABLE"] = "1"
os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"

# IMPORTANT: invalidate_stale_compiled_cache() must run BEFORE any import below that
# transitively imports . `from backend.train.engine import run_training_job`
# executes engine.py's own module-level `import ` as a side effect of the import
# statement itself, so the cache-staleness check (and the env vars above) must happen
# first. This mirrors the same fix applied to backend/train/runner.py -- both are
# independent entry points into run_training_job() and need identical setup so training
# behaves consistently no matter which one launched it.
from backend.train.cache_guard import invalidate_stale_compiled_cache
invalidate_stale_compiled_cache()

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
