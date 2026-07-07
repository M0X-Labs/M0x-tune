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
