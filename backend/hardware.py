"""Hardware report helper exposed for the config validation API.

This thin wrapper mirrors the JSON output of ``scripts/detect_hardware.py``
without depending on the script being importable as a module. It returns
``None`` when no NVIDIA GPU is available so the caller can skip the
VRAM-aware pre-flight checks instead of raising.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
from typing import Any


CUDATagPattern = re.compile(r"CUDA(?:\s+UMD)?\s+Version:\s*([0-9.]+)", re.IGNORECASE)


def _safe_int(value: str) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _detect_cuda_tag(version: str | None) -> str | None:
    if not version:
        return None
    try:
        major, minor, *_ = version.split(".")
    except ValueError:
        return None
    try:
        major_n = int(major)
        minor_n = int(minor)
    except ValueError:
        return None
    if major_n == 12 and minor_n >= 4:
        return "cu124"
    if major_n == 12 and minor_n >= 1:
        return "cu121"
    if major_n >= 13:
        return "cu130"
    return "cpu"


def _check_windows_pagefile() -> dict[str, Any] | None:
    """Check Windows pagefile size and return info or None if not Windows."""
    if sys.platform != "win32":
        return None

    try:
        import ctypes

        # Use WMI via ctypes to get pagefile info
        import wmi

        c = wmi.WMI()
        pagefiles = c.Win32_PageFileUsage()

        total_pagefile_mb = 0
        for pf in pagefiles:
            total_pagefile_mb += pf.AllocatedBaseSize

        # Also check system pagefile settings
        pagefile_settings = c.Win32_PageFileSetting()
        is_system_managed = len(pagefile_settings) == 0 or any(
            pf.MaximumSize == 0 for pf in pagefile_settings
        )

        return {
            "total_pagefile_mb": total_pagefile_mb,
            "total_pagefile_gb": round(total_pagefile_mb / 1024.0, 2),
            "is_system_managed": is_system_managed,
        }
    except Exception:
        # Fallback: try to estimate from system info
        try:
            import psutil

            swap = psutil.swap_memory()
            return {
                "total_pagefile_mb": round(swap.total / (1024 * 1024)),
                "total_pagefile_gb": round(swap.total / (1024 * 1024 * 1024), 2),
                "is_system_managed": None,
            }
        except Exception:
            return None


def build_hardware_report() -> dict[str, Any] | None:
    """Return a small hardware summary or ``None`` when no GPU is present."""

    nvidia_smi = shutil.which("nvidia-smi")
    has_nvidia_gpu = nvidia_smi is not None
    gpu_name = None
    vram_mb = None
    driver = None
    max_cuda = None

    if has_nvidia_gpu:
        try:
            result = subprocess.run(
                [nvidia_smi, "--query-gpu=name,memory.total,driver_version", "--format=csv,noheader,nounits"],
                capture_output=True,
                text=True,
                timeout=8,
                check=False,
            )
        except (OSError, subprocess.SubprocessError):
            result = None

        if result and result.returncode == 0 and result.stdout.strip():
            first_line = result.stdout.strip().splitlines()[0]
            parts = [p.strip() for p in first_line.split(",")]
            gpu_name = parts[0] if parts else None
            vram_mb = _safe_int(parts[1]) if len(parts) > 1 else None
            driver = parts[2] if len(parts) > 2 else None

            try:
                version_result = subprocess.run(
                    [nvidia_smi],
                    capture_output=True,
                    text=True,
                    timeout=8,
                    check=False,
                )
            except (OSError, subprocess.SubprocessError):
                version_result = None

            if version_result and version_result.stdout:
                match = CUDATagPattern.search(version_result.stdout)
                if match:
                    max_cuda = match.group(1)

    pagefile_info = _check_windows_pagefile()

    return {
        "has_nvidia_gpu": has_nvidia_gpu,
        "gpu_name": gpu_name,
        "vram_mb": vram_mb,
        "vram_gb": round((vram_mb or 0) / 1024.0, 2) if vram_mb else None,
        "driver_version": driver,
        "max_cuda_version": max_cuda,
        "selected_cuda_tag": _detect_cuda_tag(max_cuda),
        "os": sys.platform,
        "pagefile": pagefile_info,
    }


__all__ = ("build_hardware_report",)
