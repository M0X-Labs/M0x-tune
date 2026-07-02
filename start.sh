#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo "============================================"
echo "  m0x-tune - Fine-Tuning Platform"
echo "============================================"
echo ""

# Default ports
PORT_BACKEND=${PORT_BACKEND:-8000}
PORT_FRONTEND=${PORT_FRONTEND:-3000}

# Parse command line options
while [ $# -gt 0 ]; do
  case "$1" in
    --backend-port)
      if [ -z "${2:-}" ]; then
        echo "Error: --backend-port requires an argument"
        exit 1
      fi
      PORT_BACKEND="$2"
      shift 2
      ;;
    --frontend-port)
      if [ -z "${2:-}" ]; then
        echo "Error: --frontend-port requires an argument"
        exit 1
      fi
      PORT_FRONTEND="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

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

# Propagate ports to frontend Next.js server
export BACKEND_API_URL="http://127.0.0.1:$PORT_BACKEND"
export PORT="$PORT_FRONTEND"
export HOSTNAME="0.0.0.0"

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

echo "Starting backend server (FastAPI) on port $PORT_BACKEND..."
"$PYTHON" -m uvicorn backend.main:app --host 0.0.0.0 --port "$PORT_BACKEND" > "$ROOT_DIR/backend.log" 2>&1 &
BACKEND_PID=$!

sleep 2

echo "Starting frontend server (Next.js) on port $PORT_FRONTEND..."
cd finetune-ui
npm run start -- -H 0.0.0.0 -p "$PORT_FRONTEND" > "$ROOT_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
cd ..

echo ""
echo "============================================"
echo "  Both servers are running!"
echo "  Backend: http://localhost:$PORT_BACKEND"
echo "  Frontend: http://localhost:$PORT_FRONTEND"
echo "============================================"
echo ""
echo "Press Ctrl+C to stop both servers..."

# Wait for processes
wait
