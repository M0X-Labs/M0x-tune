# Comprehensive Open-Source AI Fine-Tuning Platform Project Plan

## Overview

A full-featured, open-source fine-tuning platform inspired by Unsloth, equipped with a responsive web-based UI. This platform allows users to auto-configure their environment, download Hugging Face models, upload datasets, and manage complex LoRA/QLoRA fine-tuning jobs completely through the browser.

***

## Phase 1: Environment Auto-Configuration & Isolation (Weeks 1-2)

**Objective:** Build a bootstrap system that automatically detects hardware, creates an isolated environment, and installs the correct CUDA-compatible dependencies without user intervention.

- **Step 1: Virtual Environment Bootstrap**
  - Create a lightweight entry-point script (`setup.bat` / `setup.sh`) that initializes an isolated Python environment using `python -m venv .venv`.
  - Ensure all subsequent installations and training scripts strictly run within this `.venv`.
- **Step 2: Hardware Auto-Detection** `[completed]`
  - Write a native Python detection script (using standard libraries like `subprocess` to call `nvidia-smi` or `pynvml`).
  - Parse the output to determine the GPU Model, VRAM capacity, and maximum supported CUDA version by the current NVIDIA driver.
- **Step 3: Dynamic Dependency Resolution**
  - Map the detected CUDA version to the optimal PyTorch wheel (e.g., if CUDA >= 12.4, use `cu124`; if >= 12.1, use `cu121`).
  - Automatically generate the correct `uv pip install` command.
  - *Crucial Constraint:* Execute a single atomic installation using `--no-build-isolation` to install `torch`, `xformers`, and `unsloth` together, preventing package managers from overwriting GPU-enabled PyTorch with CPU-only versions.

***

## Phase 2: Core Platform & Backend API (Weeks 3-4)

**Objective:** Transition the current script-based execution into a robust API backend capable of handling UI requests.

- **Step 1: FastAPI Backend Integration** `[completed]`
  - Replace Next.js `child_process` spawns with a dedicated FastAPI backend to handle heavy ML tasks, process isolation, and cross-platform stability.
- **Step 2: Unsloth Engine Modularization** `[completed]`
  - Refactor `2_train_and_export.py` into parameterized modules.
  - Remove hardcoded paths. Allow the backend to accept dynamic JSON payloads containing model paths, dataset mappings, and hyperparameter values (LoRA rank, Alpha, epochs, etc.).
- **Step 3: Real-Time Event Streaming** `[completed]`
  - Implement Server-Sent Events (SSE) or WebSockets in the FastAPI backend to stream Python console logs, `tqdm` progress bars, loss metrics, and learning rates directly to the Next.js frontend.

***

## Phase 3: Web UI Development (Weeks 5-6)

**Objective:** Build out the Next.js interface for intuitive user control.

- **Step 1: Model Discovery & Management** `[implemented: backend + UI]`
  - Integrate the Hugging Face Hub API.
  - Build a UI to search open-source models, select them, and trigger background downloads with visual progress bars.
- **Step 2: Dataset Upload & Processing** `[completed]`
  - Create a drag-and-drop interface for `.jsonl`, `.csv`, and `.parquet` files.
  - Implement a data mapper UI (similar to `read_dataset_preview.py`) where users can map their custom columns to the required Instruction/Output or ChatML formats.
- **Step 3: Hyperparameter Dashboard** `[implemented: backend + UI]`
  - Build visual form controls (sliders, dropdowns) for configuration generation (`finetune_config.json`).
  - Include settings for Learning Rate, Batch Size, Max Sequence Length, and Quantization methods.
- **Step 4: Training Monitor** `[implemented: real-time UI]`
  - Integrate charting libraries (e.g., Recharts) to plot real-time Loss and Accuracy.
  - Add a live terminal component for viewing backend execution logs.

***

## Phase 4: Feature Expansion & Parity (Weeks 7-8)

**Objective:** Match advanced Unsloth features and simplify model deployment.

- **Step 1: Advanced Fine-Tuning Features**
  - Expose UI toggles for QLoRA, RoPE scaling (for context extension), and gradient checkpointing.
  - Add automated VRAM profiling: Warn users via UI if their selected sequence length/batch size exceeds their detected GPU VRAM before the process crashes.
- **Step 2: Model Export Hub**
  - Expand `export_gguf.py` capabilities to support multiple quantizations (q4\_k\_m, q8\_0, fp16).
  - Provide direct download links or local paths to the exported `.gguf` and `.safetensors` files from the UI.
- **Step 3: Local Inference Testing**
  - Integrate with `llama.cpp` (via the existing `mllm-runner` setup) to allow users to chat with their newly fine-tuned model directly inside the browser.

***

## Phase 5: Open-Source Launch & Community (Weeks 9-10)

**Objective:** Polish the platform for public release.

- **Step 1: Error Handling & Fallbacks**
  - Provide clear UI warnings for common issues (e.g., Windows Pagefile memory limits during GGUF conversion).
- **Step 2: Documentation**
  - Write a comprehensive `README.md` and `CONTRIBUTING.md`. Include details on custom dataset formatting and the automatic hardware setup process.
- **Step 3: Packaging**
  - Create an easy 1-click launcher (e.g., `start.bat` / `start.sh`) that automatically triggers Phase 1 setup and boots both the FastAPI backend and Next.js frontend concurrently.

***

## Technical Stack Summary

- **Frontend:** Next.js 16, React 19, TailwindCSS 4, Recharts.
- **Backend:** FastAPI (Python), Uvicorn, WebSockets/SSE.
- **AI/ML Engine:** PyTorch, Unsloth, Hugging Face Transformers/TRL, Llama.cpp.
- **Environment Manager:** `uv` inside isolated `venv`.
