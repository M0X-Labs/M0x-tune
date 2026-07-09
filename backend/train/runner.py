from __future__ import annotations

import sys
# Linux / Colab CUDA library preloader to prevent bitsandbytes loading failures (e.g. libnvJitLink.so.13)
if sys.platform != "win32":
    import ctypes
    import site
    from pathlib import Path
    
    preload_libs = ["libnvJitLink.so.13", "libnvJitLink.so.12", "libnvJitLink.so"]
    loaded = False
    for lib_name in preload_libs:
        # 1. Search in /usr/local/cuda-*
        if Path("/usr/local").exists():
            for cuda_dir in Path("/usr/local").glob("cuda-*"):
                lib_path = cuda_dir / "lib64" / lib_name
                if lib_path.exists():
                    try:
                        ctypes.CDLL(str(lib_path), mode=ctypes.RTLD_GLOBAL)
                        print(f"[SYSTEM] Successfully preloaded CUDA library: {lib_path}")
                        loaded = True
                        break
                    except Exception:
                        pass
        if loaded:
            break

        # 2. Search in python site-packages / sys.path
        search_paths = []
        for p in sys.path:
            if p:
                search_paths.append(Path(p))
        try:
            for p in site.getsitepackages():
                if p:
                    search_paths.append(Path(p))
        except Exception:
            pass
        try:
            user_site = site.getusersitepackages()
            if user_site:
                search_paths.append(Path(user_site))
        except Exception:
            pass

        for p in search_paths:
            try:
                resolved = p.resolve()
                if resolved.exists():
                    nvidia_dir = resolved / "nvidia"
                    if nvidia_dir.exists():
                        for found_lib in nvidia_dir.glob(f"**/{lib_name}*"):
                            if found_lib.is_file():
                                try:
                                    ctypes.CDLL(str(found_lib), mode=ctypes.RTLD_GLOBAL)
                                    print(f"[SYSTEM] Successfully preloaded CUDA library from site-packages: {found_lib}")
                                    loaded = True
                                    break
                                except Exception:
                                    pass
            except Exception:
                pass
            if loaded:
                break
        if loaded:
            break

import os
os.environ["_ENABLE_FLEX_ATTENTION"] = "0"
os.environ["_COMPILE_DISABLE"] = "1"
os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"

# IMPORTANT: invalidate_stale_compiled_cache() must run BEFORE 'import unsloth' below --
# Unsloth's compiled-trainer cache (unsloth_compiled_cache/) is read/populated as a side
# effect of importing unsloth/trl, so checking for staleness has to happen first. This is
# why the check lives here (this module's true top-level, which every training subprocess
# actually starts from) rather than only inside engine.prepare_runtime_environment(),
# which runs too late -- by the time run_training_job() is called, engine.py's own
# module-level 'import unsloth' (a few lines below, via 'from backend.train.engine import
# run_training_job') has already happened. We import from `cache_guard` specifically
# (NOT `backend.train.engine`) because merely writing `from backend.train.engine import x`
# would execute engine.py's own top-level 'import unsloth' as a side effect of the import
# statement itself -- cache_guard.py is deliberately kept free of any unsloth-touching
# imports so it's safe to import first.
from backend.train.cache_guard import invalidate_stale_compiled_cache
invalidate_stale_compiled_cache()

import pyarrow  # Must be imported before torch to prevent Windows DLL conflicts/segfaults
import unsloth  # Must be imported before trl, transformers, peft to ensure optimizations are applied!
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
