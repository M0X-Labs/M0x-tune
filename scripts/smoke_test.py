"""Post-install smoke test.

Runs at the end of setup.sh/setup.bat to catch broken/incompatible ML-stack
installs immediately, instead of "Setup complete." followed by a confusing
crash the first time a user actually clicks "Start fine-tuning". Historically
the smoke test only checked `torch.cuda.is_available()` -- it never imported
/trl/peft/transformers, so an incompatible combination (or a totally
failed install on one device) would sail through setup and only surface
minutes into a real training run, with a device-specific, hard-to-diagnose
traceback.

This script imports the actual training stack and prints resolved versions,
so version-drift or install failures ("different error on each device") are
caught here, loudly, with exact version info the user can paste into a bug
report.
"""

from __future__ import annotations

import os
import sys

# Match the same env vars set by engine.py/runner.py so this smoke test exercises
# 's import path the same way the real training run will.
os.environ.setdefault("_COMPILE_DISABLE", "1")
os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")


def main() -> int:
    failures: list[str] = []

    try:
        import torch

        print(f"torch {torch.__version__}")
        print(f"cuda_available {torch.cuda.is_available()}")
        print(f"device_count {torch.cuda.device_count()}")
        print(f"hf_home {os.environ.get('HF_HOME')}")
    except Exception as exc:
        failures.append(f"torch: {exc}")
        print(f"FAILED to import torch: {exc}")

    # Import order matters for  (must come before trl/transformers/peft to
    # apply its optimization patches), so mirror that here even though this smoke
    # test doesn't actually train anything.
    for package in ("", "trl", "peft", "transformers", "accelerate", "datasets"):
        try:
            module = __import__(package)
            version = getattr(module, "__version__", "unknown")
            print(f"{package} {version}")
        except Exception as exc:
            failures.append(f"{package}: {exc}")
            print(f"FAILED to import {package}: {exc}")

    if failures:
        print("\n" + "!" * 60)
        print("SMOKE TEST FAILED: one or more ML libraries could not be imported.")
        for failure in failures:
            print(f"  - {failure}")
        print(
            "\nThis means fine-tuning will crash immediately when started. Common causes:\n"
            "  - The install was interrupted or partially failed (re-run setup.sh/setup.bat).\n"
            "  - An incompatible torch/CUDA build was selected for your GPU/driver.\n"
            "  - A stale _compiled_cache/ directory from a previous, different install\n"
            "    (delete _compiled_cache/ and re-run to force a clean recompile).\n"
            "Please include the versions/errors printed above if reporting this issue."
        )
        print("!" * 60)
        return 1

    print("\nSmoke test passed: all ML libraries imported successfully.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
