import argparse
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DETECT_SCRIPT = PROJECT_ROOT / "scripts" / "detect_hardware.py"

TORCH_PROFILES: dict[str, dict[str, Any]] = {
    "cu130": {
        # CUDA 13.x falls back to cu124 since PyTorch doesn't have cu130 wheels yet
        # CUDA is backward compatible, so cu124 wheels work with CUDA 13.x drivers
        "index_url": "https://download.pytorch.org/whl/cu124",
        "packages": [
            "torch==2.6.0+cu124",
            # xformers omitted - let unsloth handle it or skip if no compatible wheel
        ],
    },
    "cu124": {
        "index_url": "https://download.pytorch.org/whl/cu124",
        "packages": [
            "torch==2.6.0+cu124",
            # xformers omitted - let unsloth handle it or skip if no compatible wheel
        ],
    },
    "cu121": {
        "index_url": "https://download.pytorch.org/whl/cu121",
        "packages": [
            "torch==2.4.0+cu121",
            # xformers omitted - let unsloth handle it or skip if no compatible wheel
        ],
    },
    "cpu": {
        "index_url": "https://pypi.org/simple",
        "packages": [
            "torch",
        ],
    },
}

COMMON_PACKAGES = [
    "trl",
    "peft",
    "accelerate",
    "bitsandbytes",
    "datasets",
    "huggingface_hub",
    "transformers",
    "uvicorn[standard]",  # Required for running the FastAPI backend
    "fastapi",  # Required for the backend API
    "pydantic",  # Required for data validation
    "python-multipart",  # Required for file uploads
    "aiofiles",  # Required for async file operations
    "pyarrow",  # Required for parquet file support
    "unsloth[windows] @ git+https://github.com/unslothai/unsloth.git",
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

    # Install setuptools first - required for building packages like xformers
    subprocess.run(
        [sys.executable, "-m", "pip", "install", "setuptools", "wheel"],
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
        subprocess.run(torch_command, cwd=PROJECT_ROOT, check=True)


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

    hardware = load_hardware_info()
    cuda_tag = hardware.get("selected_cuda_tag", "cpu")
    if cuda_tag not in TORCH_PROFILES:
        cuda_tag = "cpu"

    ensure_uv_installed()
    
    print(f"Resolved CUDA target: {cuda_tag}")
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
    subprocess.run(command, cwd=PROJECT_ROOT, check=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
