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


def find_nvidia_smi() -> str:
    import shutil
    import os
    cmd = shutil.which("nvidia-smi")
    if cmd:
        return cmd
    if os.name == "nt":
        program_files = os.environ.get("ProgramFiles", r"C:\Program Files")
        system_root = os.environ.get("SystemRoot", r"C:\Windows")
        paths = [
            os.path.join(program_files, "NVIDIA Corporation", "NVSMI", "nvidia-smi.exe"),
            os.path.join(system_root, "System32", "nvidia-smi.exe"),
        ]
        for p in paths:
            if os.path.exists(p):
                return p
    return "nvidia-smi"


def query_wmi_gpus() -> list[str]:
    import os
    import subprocess
    if os.name != "nt":
        return []
    try:
        res = subprocess.run(
            ["wmic", "path", "win32_videocontroller", "get", "name"],
            capture_output=True,
            text=True,
            check=True
        )
        gpus = []
        for line in res.stdout.splitlines():
            line = line.strip()
            if line and line.lower() != "name":
                gpus.append(line)
        return gpus
    except Exception:
        try:
            res = subprocess.run(
                ["powershell", "-NoProfile", "-Command", "Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name"],
                capture_output=True,
                text=True,
                check=True
            )
            return [line.strip() for line in res.stdout.splitlines() if line.strip()]
        except Exception:
            return []


def infer_amd_gfx_arch(gpu_name: str) -> str | None:
    gpu_name = gpu_name.lower()
    name_arch_table = [
        (r"9070 xt|9080", "gfx1201"),
        (r"9070|9060", "gfx1200"),
        (r"8060s|8050s|8040s|strix halo|ryzen ai max|ai max", "gfx1151"),
        (r"890m|880m|860m|840m|strix point|krackan|hx 37[05]|ai 9 hx|ai 9 36[05]|ai 7 35[05]|ai 5 34[05]|ai 7 pro 35|ai 5 33", "gfx1150"),
        (r"rx 7900|rx 7800|rx 7700(?!s)|pro w7900|pro w7800|pro w7700", "gfx1100"),
        (r"rx 7600|rx 7700s|rx 7650|pro w7600|pro w7500|pro v710", "gfx1102"),
        (r"780m|760m|740m|phoenix|hawk point|z1 extreme|z2 extreme", "gfx1103"),
        (r"rx 6900|rx 6800|rx 6750|rx 6700|pro w6800|pro w6900", "gfx1030"),
        (r"rx 6650|rx 6600|pro w6600|pro w6650", "gfx1032"),
        (r"rx 6500|rx 6400|rx 6300|pro w6400|pro w6500", "gfx1034"),
    ]
    for pattern, arch in name_arch_table:
        if re.search(pattern, gpu_name):
            return arch
    return None


def find_amd_rocm() -> tuple[str | None, str | None]:
    import os
    import shutil
    import subprocess
    
    # Try hipconfig --version
    hipconfig = shutil.which("hipconfig")
    if not hipconfig:
        for env_var in ["HIP_PATH", "ROCM_PATH"]:
            val = os.environ.get(env_var)
            if val:
                candidate = os.path.join(val, "bin", "hipconfig.exe")
                if os.path.exists(candidate):
                    hipconfig = candidate
                    break
    
    rocm_version = None
    if hipconfig:
        try:
            res = subprocess.run([hipconfig, "--version"], capture_output=True, text=True, check=True)
            for line in res.stdout.splitlines():
                m = re.search(r"(\d+\.\d+)", line)
                if m:
                    rocm_version = m.group(1)
                    break
        except Exception:
            pass
            
    # Try hipinfo for gfx arch
    hipinfo = shutil.which("hipinfo")
    if not hipinfo:
        for env_var in ["HIP_PATH", "ROCM_PATH"]:
            val = os.environ.get(env_var)
            if val:
                candidate = os.path.join(val, "bin", "hipinfo.exe")
                if os.path.exists(candidate):
                    hipinfo = candidate
                    break
                    
    rocm_gfx_arch = None
    if hipinfo:
        try:
            res = subprocess.run([hipinfo], capture_output=True, text=True)
            for line in res.stdout.splitlines():
                if "gcnArchName" in line or "gcnArch" in line:
                    parts = line.split(":")
                    if len(parts) >= 2:
                        rocm_gfx_arch = parts[1].strip().split(":")[0].lower()
                        break
        except Exception:
            pass
            
    return rocm_version, rocm_gfx_arch


def query_nvidia_smi() -> dict[str, Any]:
    info: dict[str, Any] = {
        "has_nvidia_gpu": False,
        "has_amd_gpu": False,
        "gpu_name": None,
        "vram_mb": None,
        "vram_gb": None,
        "driver_version": None,
        "max_cuda_version": None,
        "rocm_version": None,
        "rocm_gfx_arch": None,
        "selected_cuda_tag": "cpu",
        "raw_summary": None,
    }

    smi_path = find_nvidia_smi()
    try:
        gpu_query = subprocess.run(
            [
                smi_path,
                "--query-gpu=name,memory.total,driver_version",
                "--format=csv,noheader,nounits",
            ],
            capture_output=True,
            check=True,
            text=True,
        )
        lines = [line.strip() for line in gpu_query.stdout.splitlines() if line.strip()]
        if lines:
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
    except Exception as exc:
        pass

    if info["has_nvidia_gpu"]:
        try:
            summary = subprocess.run(
                [smi_path],
                capture_output=True,
                check=True,
                text=True,
            )
            combined_output = "\n".join(filter(None, [summary.stdout, summary.stderr]))
            cuda_match = re.search(r"CUDA(?:\s+UMD)?\s+Version:\s*([0-9.]+)", combined_output)
            if cuda_match:
                info["max_cuda_version"] = cuda_match.group(1)
            info["selected_cuda_tag"] = choose_cuda_tag(info["max_cuda_version"])
            info["raw_summary"] = combined_output.strip()[:5000]
        except Exception as exc:
            info["raw_summary"] = str(exc)
            info["selected_cuda_tag"] = choose_cuda_tag(None)
        return info

    # Try AMD / generic fallback
    rocm_version, rocm_gfx_arch = find_amd_rocm()
    gpus = query_wmi_gpus()
    amd_gpu_name = None
    for g in gpus:
        if "amd" in g.lower() or "radeon" in g.lower():
            info["has_amd_gpu"] = True
            amd_gpu_name = g
            break
            
    if info["has_amd_gpu"]:
        info["gpu_name"] = amd_gpu_name
        info["rocm_version"] = rocm_version
        if rocm_gfx_arch:
            info["rocm_gfx_arch"] = rocm_gfx_arch
        else:
            info["rocm_gfx_arch"] = infer_amd_gfx_arch(amd_gpu_name)
            
        if info["rocm_gfx_arch"]:
            info["selected_cuda_tag"] = "rocm"
        else:
            info["selected_cuda_tag"] = "cpu"
        info["raw_summary"] = f"AMD GPU detected: {amd_gpu_name}\nROCm GFX Arch: {info['rocm_gfx_arch']}\nROCm Version: {rocm_version}"
        return info

    # No discrete GPU found or unhandled
    info["raw_summary"] = "No supported NVIDIA or AMD GPU detected on this system."
    info["selected_cuda_tag"] = "cpu"
    return info


def render_human_readable(info: dict[str, Any]) -> str:
    lines = [
        f"NVIDIA GPU detected: {'yes' if info['has_nvidia_gpu'] else 'no'}",
        f"AMD GPU detected: {'yes' if info.get('has_amd_gpu', False) else 'no'}",
        f"GPU model: {info['gpu_name'] or 'unknown'}",
        f"VRAM: {info['vram_gb'] or 'unknown'} GB",
        f"Driver version: {info['driver_version'] or 'unknown'}",
    ]
    if info['has_nvidia_gpu']:
        lines.append(f"Max CUDA version: {info['max_cuda_version'] or 'unknown'}")
    elif info.get('has_amd_gpu', False):
        lines.append(f"ROCm version: {info.get('rocm_version') or 'unknown'}")
        lines.append(f"ROCm GFX arch: {info.get('rocm_gfx_arch') or 'unknown'}")
    lines.append(f"Selected install target: {info['selected_cuda_tag']}")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Detect local NVIDIA or AMD hardware and choose the install target.")
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

