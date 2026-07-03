#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

mkdir -p .tmp .pip_cache .uv_cache .hf_home/hub

export UV_CACHE_DIR="$ROOT_DIR/.uv_cache"
export PIP_CACHE_DIR="$ROOT_DIR/.pip_cache"
export TEMP="$ROOT_DIR/.tmp"
export TMP="$ROOT_DIR/.tmp"
export HF_HOME="$ROOT_DIR/.hf_home"
export HUGGINGFACE_HUB_CACHE="$ROOT_DIR/.hf_home/hub"

if [[ ! -x ".venv/Scripts/python.exe" && ! -x ".venv/bin/python" ]]; then
  echo "Creating local virtual environment..."
  python3 -m venv .venv
fi

if [[ -x ".venv/Scripts/python.exe" ]]; then
  PYTHON=".venv/Scripts/python.exe"
else
  PYTHON=".venv/bin/python"
fi

echo "Using virtual environment: $ROOT_DIR/.venv"
"$PYTHON" -m ensurepip --upgrade

echo "Detecting local hardware..."
"$PYTHON" scripts/detect_hardware.py

echo "Installing CUDA-aware dependencies..."
"$PYTHON" scripts/install_deps.py

echo "Checking for frontend dependencies (Node.js/npm)..."
if command -v node >/dev/null 2>&1; then
  if command -v npm >/dev/null 2>&1; then
    echo "Node.js and npm found. Installing frontend dependencies..."
    cd "$ROOT_DIR/finetune-ui"
    if npm install; then
      echo "Frontend dependencies successfully installed. Building frontend..."
      npm run build || echo "Warning: npm run build failed in finetune-ui."
    else
      echo "Warning: npm install failed in finetune-ui."
    fi
    cd "$ROOT_DIR"
  else
    echo "Warning: npm was not found. Please install npm to run the web interface."
  fi
else
  echo "Warning: Node.js was not found. Please install Node.js (v18+) to run the web interface."
fi

echo "Running smoke test..."
"$PYTHON" -c "import os, torch; print('torch', torch.__version__); print('cuda_available', torch.cuda.is_available()); print('device_count', torch.cuda.device_count()); print('hf_home', os.environ.get('HF_HOME'))"

echo "Setup complete."
