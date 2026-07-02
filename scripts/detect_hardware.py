import argparse
import json
import re
import subprocess
import sys
from typing import Any


def parse_version(version: str | None) -> tuple[int, ...]:
    if not version:
        return ()
    parts: list[int] = []
    for piece in version.split("."):
        digits = "".join(ch for ch in piece if ch.isdigit())
        if not digits:
            break
        parts.append(int(digits))
    return tuple(parts)


def choose_cuda_tag(cuda_version: str | None) -> str:
    parsed = parse_version(cuda_version)
    if parsed >= (13, 0):
        return "cu130"
    if parsed >= (12, 4):
        return "cu124"
    if parsed >= (12, 1):
        return "cu121"
    return "cpu"


def query_nvidia_smi() -> dict[str, Any]:
    info: dict[str, Any] = {
        "has_nvidia_gpu": False,
        "gpu_name": None,
        "vram_mb": None,
        "vram_gb": None,
        "driver_version": None,
        "max_cuda_version": None,
        "selected_cuda_tag": "cpu",
        "raw_summary": None,
    }

    try:
        gpu_query = subprocess.run(
            [
                "nvidia-smi",
                "--query-gpu=name,memory.total,driver_version",
                "--format=csv,noheader,nounits",
            ],
            capture_output=True,
            check=True,
            text=True,
        )
    except FileNotFoundError:
        info["raw_summary"] = "nvidia-smi not found"
        return info
    except subprocess.CalledProcessError as exc:
        info["raw_summary"] = exc.stderr.strip() or exc.stdout.strip() or "nvidia-smi failed"
        return info

    lines = [line.strip() for line in gpu_query.stdout.splitlines() if line.strip()]
    if not lines:
        info["raw_summary"] = "No GPU rows returned by nvidia-smi"
        return info

    first_row = [part.strip() for part in lines[0].split(",")]
    if len(first_row) >= 3:
        gpu_name, vram_mb_raw, driver_version = first_row[:3]
        try:
            vram_mb = int(float(vram_mb_raw))
        except ValueError:
            vram_mb = None
        info.update(
            {
                "has_nvidia_gpu": True,
                "gpu_name": gpu_name,
                "vram_mb": vram_mb,
                "vram_gb": round(vram_mb / 1024, 2) if vram_mb is not None else None,
                "driver_version": driver_version,
            }
        )

    try:
        summary = subprocess.run(
            ["nvidia-smi"],
            capture_output=True,
            check=True,
            text=True,
        )
        combined_output = "\n".join(filter(None, [summary.stdout, summary.stderr]))
    except subprocess.CalledProcessError as exc:
        combined_output = "\n".join(filter(None, [exc.stdout, exc.stderr]))

    cuda_match = re.search(r"CUDA(?:\s+UMD)?\s+Version:\s*([0-9.]+)", combined_output)
    if cuda_match:
        info["max_cuda_version"] = cuda_match.group(1)

    info["selected_cuda_tag"] = choose_cuda_tag(info["max_cuda_version"])
    info["raw_summary"] = combined_output.strip()[:5000]
    return info


def render_human_readable(info: dict[str, Any]) -> str:
    lines = [
        f"NVIDIA GPU detected: {'yes' if info['has_nvidia_gpu'] else 'no'}",
        f"GPU model: {info['gpu_name'] or 'unknown'}",
        f"VRAM: {info['vram_gb'] or 'unknown'} GB",
        f"Driver version: {info['driver_version'] or 'unknown'}",
        f"Max CUDA version: {info['max_cuda_version'] or 'unknown'}",
        f"Selected install target: {info['selected_cuda_tag']}",
    ]
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Detect local NVIDIA hardware and choose the CUDA wheel target.")
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON output.")
    args = parser.parse_args()

    info = query_nvidia_smi()
    if args.json:
        json.dump(info, sys.stdout, indent=2)
        sys.stdout.write("\n")
    else:
        print(render_human_readable(info))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
