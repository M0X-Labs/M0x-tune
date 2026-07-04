import argparse
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DETECT_SCRIPT = PROJECT_ROOT / "scripts" / "detect_hardware.py"

# Unlike our previous approach (pinning e.g. "torch==2.6.0+cu124"), we deliberately
# leave the torch version UNPINNED here and only pick the CUDA index. This mirrors
# what Unsloth's own official installer does (see Get-TorchIndexUrl / "install PyTorch
# first" in unsloth/install.ps1): pointing at the right https://download.pytorch.org/whl/cuXXX
# index and letting pip/uv resolve whatever version that index actually publishes a wheel
# for on the running Python. A hardcoded exact version can simply not exist for newer
# Python releases (e.g. no cp313 build of that exact torch+cuda combo) and hard-fails
# instead of silently picking a version that does exist.
TORCH_PROFILES: dict[str, dict[str, Any]] = {
    "cu130": {"index_url": "https://download.pytorch.org/whl/cu130", "packages": ["torch"]},
    "cu128": {"index_url": "https://download.pytorch.org/whl/cu128", "packages": ["torch"]},
    "cu126": {"index_url": "https://download.pytorch.org/whl/cu126", "packages": ["torch"]},
    "cu124": {"index_url": "https://download.pytorch.org/whl/cu124", "packages": ["torch"]},
    "cu121": {"index_url": "https://download.pytorch.org/whl/cu121", "packages": ["torch"]},
    "cu118": {"index_url": "https://download.pytorch.org/whl/cu118", "packages": ["torch"]},
    "cpu": {"index_url": "https://pypi.org/simple", "packages": ["torch"]},
}

COMMON_PACKAGES = [
    # bitsandbytes ships prebuilt wheels for every platform (no compiler needed), so it's
    # safe to pin directly. Version range matches what Unsloth's own pyproject.toml
    # requires (known-bad 0.46.0/0.48.0 releases excluded).
    "bitsandbytes>=0.45.5,!=0.46.0,!=0.48.0",
    "uvicorn[standard]",  # Required for running the FastAPI backend
    "fastapi",  # Required for the backend API
    "pydantic",  # Required for data validation
    "python-multipart",  # Required for file uploads
    "aiofiles",  # Required for async file operations
    "pyarrow",  # Required for parquet file support
    # IMPORTANT: use the `huggingface` extra, NOT `windows`/`cuXXX-torchYYY`.
    # `unsloth[windows]` (see unsloth/pyproject.toml) pins a *loose*,
    # wheel-unconstrained "xformers>=0.0.22.post7" on win32. When no prebuilt
    # xformers wheel matches the installed (python, torch, cuda) combo -- which
    # is exactly what happens on Python 3.13 with a plain `torch` install -- pip/uv
    # silently falls back to compiling xformers from source, which requires a fully
    # configured MSVC + Windows SDK toolchain and fails otherwise (this is the
    # "cannot open include file: 'stddef.h'" error from a previous install attempt).
    # `unsloth[huggingface]` pulls transformers/trl/peft/accelerate/datasets/etc.
    # (Unsloth's own tested-compatible version ranges) WITHOUT requiring xformers at
    # all -- Unsloth transparently falls back to PyTorch's built-in SDPA attention
    # when xformers isn't importable, so training still works correctly, just without
    # that one optional attention-kernel speedup.
    "unsloth[huggingface] @ git+https://github.com/unslothai/unsloth.git",
]


def ensure_directory(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def load_hardware_info() -> dict[str, Any]:
    result = subprocess.run(
        [sys.executable, str(DETECT_SCRIPT), "--json"],
        capture_output=True,
        check=True,
        text=True,
        cwd=PROJECT_ROOT,
    )
    return json.loads(result.stdout)


def ensure_uv_installed() -> None:
    try:
        subprocess.run(
            [sys.executable, "-m", "ensurepip", "--upgrade"],
            cwd=PROJECT_ROOT,
            capture_output=True,
        )
    except Exception:
        # On some Linux distros (e.g. Debian/Ubuntu), ensurepip is disabled.
        # Since pip is usually pre-installed on Colab/Kaggle anyway, we can safe-ignore this.
        pass

    # Install and upgrade pip, setuptools, and wheel first - required for building modern packages
    subprocess.run(
        [sys.executable, "-m", "pip", "install", "--upgrade", "pip", "setuptools", "wheel"],
        cwd=PROJECT_ROOT,
        check=True,
    )
    try:
        import uv  # noqa: F401
    except ImportError:
        subprocess.run(
            [sys.executable, "-m", "pip", "install", "uv"],
            cwd=PROJECT_ROOT,
            check=True,
        )


def build_install_command(cuda_tag: str, python_executable: str) -> list[str]:
    profile = TORCH_PROFILES[cuda_tag]
    command = [
        sys.executable,
        "-m",
        "uv",
        "pip",
        "install",
        "--python",
        python_executable,
        "--index-strategy",
        "unsafe-best-match",
        "--index-url",
        profile["index_url"],
    ]

    if profile["index_url"] != "https://pypi.org/simple":
        command.extend(["--extra-index-url", "https://pypi.org/simple"])

    # We add --no-build-isolation because some packages (like xformers) need to find
    # the pre-installed torch from the virtual environment during their build process.
    command.extend(["--no-build-isolation"])

    command.extend(
        [
            *profile["packages"],
            *COMMON_PACKAGES,
        ]
    )
    return command


def install_torch_first(cuda_tag: str, python_executable: str) -> None:
    """Install torch first so xformers can build properly."""
    profile = TORCH_PROFILES[cuda_tag]
    
    # First install just torch using pip (not uv) to ensure it's in the environment
    torch_packages = [p for p in profile["packages"] if p.startswith("torch")]
    if torch_packages:
        print(f"Installing torch first: {torch_packages}")
        # Use pip directly for torch to ensure it's available for xformers build
        torch_command = [
            python_executable,
            "-m",
            "pip",
            "install",
            "--index-url",
            profile["index_url"],
        ]
        
        if profile["index_url"] != "https://pypi.org/simple":
            torch_command.extend(["--extra-index-url", "https://pypi.org/simple"])
        
        torch_command.extend(torch_packages)
        try:
            subprocess.run(torch_command, cwd=PROJECT_ROOT, check=True)
        except subprocess.CalledProcessError as e:
            print(f"Warning: Failed to install specific torch version(s) {torch_packages} (likely due to Python version mismatch). Error: {e}")
            print("Attempting to install generic 'torch' package from CUDA/PyPI indexes as a fallback...")
            
            fallback_command = [
                python_executable,
                "-m",
                "pip",
                "install",
                "--index-url",
                profile["index_url"],
            ]
            if profile["index_url"] != "https://pypi.org/simple":
                fallback_command.extend(["--extra-index-url", "https://pypi.org/simple"])
            fallback_command.append("torch")
            
            subprocess.run(fallback_command, cwd=PROJECT_ROOT, check=True)
            # Update the profile packages list so the subsequent uv pip install uses the unpinned generic package
            profile["packages"] = ["torch"]
            print("Successfully installed generic 'torch' and updated installation profile.")


def main() -> int:
    parser = argparse.ArgumentParser(description="Install the project ML stack atomically with uv.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the resolved install command without executing it.",
    )
    args = parser.parse_args()

    ensure_directory(PROJECT_ROOT / ".uv_cache")
    ensure_directory(PROJECT_ROOT / ".pip_cache")
    ensure_directory(PROJECT_ROOT / ".tmp")
    ensure_directory(PROJECT_ROOT / ".hf_home" / "hub")

    os.environ["UV_CACHE_DIR"] = str(PROJECT_ROOT / ".uv_cache")
    os.environ["PIP_CACHE_DIR"] = str(PROJECT_ROOT / ".pip_cache")
    os.environ["TEMP"] = str(PROJECT_ROOT / ".tmp")
    os.environ["TMP"] = str(PROJECT_ROOT / ".tmp")
    os.environ["HF_HOME"] = str(PROJECT_ROOT / ".hf_home")
    os.environ["HUGGINGFACE_HUB_CACHE"] = str(PROJECT_ROOT / ".hf_home" / "hub")
    os.environ["UV_HTTP_RETRIES"] = "10"

    hardware = load_hardware_info()
    cuda_tag = hardware.get("selected_cuda_tag", "cpu")
    
    if cuda_tag == "rocm":
        rocm_gfx_arch = hardware.get("rocm_gfx_arch")
        arch_family_map = {
            "gfx1201": "gfx120X-all",
            "gfx1200": "gfx120X-all",
            "gfx1151": "gfx1151",
            "gfx1150": "gfx1150",
            "gfx1103": "gfx110X-all",
            "gfx1102": "gfx110X-all",
            "gfx1101": "gfx110X-all",
            "gfx1100": "gfx110X-all",
            "gfx90a": "gfx90a",
            "gfx908": "gfx908",
        }
        arch_family = arch_family_map.get(rocm_gfx_arch) if rocm_gfx_arch else None
        if arch_family:
            TORCH_PROFILES["rocm"] = {
                "index_url": f"https://repo.amd.com/rocm/whl/{arch_family}",
                "packages": [
                    "torch",
                    "torchvision",
                    "torchaudio",
                ]
            }
        else:
            print(f"Warning: AMD GFX Arch '{rocm_gfx_arch}' is not supported by repo.amd.com. Falling back to CPU target.")
            cuda_tag = "cpu"

    if cuda_tag not in TORCH_PROFILES:
        cuda_tag = "cpu"

    ensure_uv_installed()
    
    print(f"Resolved target: {cuda_tag}")
    print(f"Detected GPU: {hardware.get('gpu_name') or 'none'}")

    if args.dry_run:
        command = build_install_command(cuda_tag, sys.executable)
        print("Dry run command:")
        print(" ".join(command))
        return 0

    # Install torch first so xformers can build properly
    install_torch_first(cuda_tag, sys.executable)
    
    # Now install everything else
    command = build_install_command(cuda_tag, sys.executable)
    
    max_retries = 3
    for attempt in range(1, max_retries + 1):
        try:
            print(f"Installing dependencies with uv (attempt {attempt}/{max_retries})...")
            subprocess.run(command, cwd=PROJECT_ROOT, check=True)
            break
        except subprocess.CalledProcessError as e:
            if attempt < max_retries:
                import time
                print(f"Warning: Installation failed: {e}. Retrying in 10 seconds...")
                time.sleep(10)
            else:
                raise e
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
