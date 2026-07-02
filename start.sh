#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo "============================================"
echo "  m0x-tune - Fine-Tuning Platform"
echo "============================================"
echo ""

# Check Python path
if [[ -x ".venv/Scripts/python.exe" ]]; then
  PYTHON=".venv/Scripts/python.exe"
elif [[ -x ".venv/bin/python" ]]; then
  PYTHON=".venv/bin/python"
else
  echo "Virtual environment not found!"
  echo "Please run setup.sh first to set up the environment."
  exit 1
fi

# Create directories if needed
mkdir -p .tmp .pip_cache .uv_cache .hf_home/hub

# Set environment variables
export UV_CACHE_DIR="$ROOT_DIR/.uv_cache"
export PIP_CACHE_DIR="$ROOT_DIR/.pip_cache"
export TEMP="$ROOT_DIR/.tmp"
export TMP="$ROOT_DIR/.tmp"
export HF_HOME="$ROOT_DIR/.hf_home"
export HUGGINGFACE_HUB_CACHE="$ROOT_DIR/.hf_home/hub"
export PYTHONUNBUFFERED=1

# Function to cleanup on exit
cleanup() {
  echo ""
  echo "Shutting down servers..."
  if [[ -n "${BACKEND_PID:-}" ]]; then
    kill "$BACKEND_PID" 2>/dev/null || true
  fi
  if [[ -n "${FRONTEND_PID:-}" ]]; then
    kill "$FRONTEND_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT

echo "Starting backend server (FastAPI)..."
"$PYTHON" -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload > "$ROOT_DIR/backend.log" 2>&1 &
BACKEND_PID=$!

sleep 2

echo "Starting frontend server (Next.js)..."
cd finetune-ui
npm run start > "$ROOT_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
cd ..

echo ""
echo "============================================"
echo "  Both servers are running!"
echo "  Backend: http://localhost:8000"
echo "  Frontend: http://localhost:3000"
echo "============================================"
echo ""
echo "Press Ctrl+C to stop both servers..."

# Wait for processes
wait
