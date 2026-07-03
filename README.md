# m0x-tune: Open-Source AI Fine-Tuning Platform

A full-featured, open-source fine-tuning platform inspired by , equipped with a responsive web-based UI. This platform allows you to auto-configure your environment, download Hugging Face models, upload datasets, and manage complex LoRA/QLoRA fine-tuning jobs completely through the browser.

## Website Overview

The m0x-tune platform features a modern, intuitive web interface built with Next.js that provides comprehensive control over the fine-tuning process. The website is organized into several key sections:

### Dashboard
- **Real-time Overview**: Live statistics showing total trainings, success rate, exported models, and last training time
- **Quick Actions**: One-click access to start new training, export models, and view live monitoring
- **System Telemetry**: GPU status, VRAM usage, and hardware health monitoring
- **Recent Activity**: Timeline of completed training jobs and export operations

### Model Hub
- **Hugging Face Integration**: Search and browse models directly from the Hugging Face Hub
- **Local Model Management**: View and manage downloaded models stored in the `base_model/` directory
- **Download Queue**: Monitor active downloads with progress bars, speed indicators, and cancellation options
- **Model Metadata**: Detailed information including download counts, likes, tags, and pipeline types

### Hyperparameter Dashboard
- **Interactive Configuration**: Adjust training parameters with real-time sliders and toggles
- **Hardware Validation**: Automatic validation against your GPU capabilities
- **Advanced Settings**: Configure LoRA parameters, quantization methods, RoPE scaling, and more
- **Pre-flight Checks**: Comprehensive error checking and warnings before training begins

### Live Monitor
- **Real-time Metrics**: Streaming telemetry including loss, learning rate, progress percentage, and ETA
- **Visual Charts**: Interactive loss curves and learning rate graphs with historical data
- **Console Output**: Live logging with error filtering and auto-scroll functionality
- **Job Control**: Start, pause, and terminate training sessions with full control

### Export Manager
- **Multi-Quantization**: Export models in various GGUF formats (q2_k to f32)
- **Background Processing**: Monitor export progress with real-time status updates
- **File Management**: Download completed GGUF files directly from the browser

## Website Features

### Responsive Design
- **Adaptive Layout**: Optimized for desktop and tablet devices
- **Dark Theme**: Professional dark interface with accent colors for better focus
- **Smooth Animations**: Subtle transitions and loading states for better user experience

### Real-time Updates
- **Server-Sent Events**: Live streaming of training metrics and logs
- **Auto-refresh**: Automatic polling for download status and job progress
- **Status Indicators**: Visual feedback for connection state and job status

### Advanced UI Components
- **Interactive Sliders**: Precise control over hyperparameters with visual feedback
- **Terminal Emulator**: Full-featured console with syntax highlighting
- **Data Visualization**: SVG-based charts for loss and learning rate curves
- **Progress Cards**: Animated progress indicators with ETA calculations

### Error Handling & Recovery
- **Comprehensive Validation**: Pre-flight checks for hardware compatibility
- **Error Filtering**: Focus on critical issues with log filtering options
- **Graceful Degradation**: Fallback states when services are unavailable
- **Recovery Options**: Clear logs and restart failed operations

## Features

- **Auto Environment Setup**: Automatic hardware detection and CUDA-aware dependency installation
- **Hugging Face Integration**: Search and download models directly from the UI
- **Dataset Management**: Upload and process custom datasets with column mapping
- **Hyperparameter Dashboard**: Intuitive UI for configuring training parameters
- **Real-Time Monitoring**: Live training metrics and log streaming
- **Multi-Quantization Export**: Export models in various GGUF formats (q2_k to f32)
- **One-Click Launch**: Simple startup scripts for both Windows and Linux
- **Identity and Reasoning Trace Embedding**: Specialized training pipeline for embedding identity and reasoning traces

## Quick Start

### Prerequisites

- Python 3.10+
- NVIDIA GPU with CUDA 12.1+ (recommended)
- Node.js 18+ (for frontend)
- npm or yarn

### Installation

You can install and configure the platform automatically with a single command:

#### Windows (PowerShell)
```powershell
irm https://tune.m0x.in/install.ps1 | iex
```

#### Linux/Mac (Bash)
```bash
curl -fsSL https://tune.m0x.in/install.sh | sh
```

#### Manual Installation

##### Windows
1. Clone or download this repository
2. Run the setup script:
   ```cmd
   setup.bat
   ```

##### Linux/Mac
1. Clone or download this repository
2. Run the setup script:
   ```bash
   chmod +x setup.sh
   ./setup.sh
   ```

### Running the Platform

#### Windows

```cmd
start.bat
```

#### Linux/Mac

```bash
chmod +x start.sh
./start.sh
```

The platform will be available at:
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000

## Project Structure

```
m0x-tune/
├── backend/               # FastAPI backend
│   ├── train/             # Training engine
│   │   ├── engine.py       # Core training logic
│   │   ├── runner.py       # Job execution runner
│   │   └── schemas.py      # Data models and validation
│   ├── datasets_service.py # Multi-dataset management
│   ├── hardware.py         # Hardware detection and reporting
│   ├── model_service.py    # Hugging Face model discovery and downloads
│   ├── export_service.py   # GGUF export functionality
│   └── main.py             # Main FastAPI application
├── finetune-ui/           # Next.js frontend
│   ├── app/                # Application pages
│   ├── components/         # UI components
│   └── public/             # Static assets
├── scripts/               # Hardware detection and setup scripts
│   ├── detect_hardware.py # GPU and system detection
│   └── install_deps.py     # CUDA-aware dependency installation
├── base_model/            # Base model storage
├── datasets/              # Dataset storage
├── mllm-runner/           # Multi-modal LLM runner utilities
├── _compiled_cache/ #  compilation cache
├── setup.bat              # Windows setup script
├── setup.sh               # Linux/Mac setup script
├── start.bat              # Windows launcher
└── start.sh               # Linux/Mac launcher
```

## Backend Architecture

The backend is built with FastAPI and provides a comprehensive REST API for the fine-tuning platform:

### Key Components

1. **Model Service** (`backend/model_service.py`):
   - Hugging Face Hub integration for model discovery and downloads
   - Background download management with progress tracking
   - Local model registry and metadata

2. **Dataset Service** (`backend/datasets_service.py`):
   - Multi-dataset management with file upload support
   - Automatic format detection (JSONL, CSV, Parquet)
   - Metadata extraction and column analysis

3. **Training Engine** (`backend/train/engine.py`):
   - -based LoRA/QLoRA training pipeline
   - Specialized data mapping for identity and reasoning traces
   - Automatic GGUF export with error handling
   - Hardware-aware configuration validation

4. **Export Service** (`backend/export_service.py`):
   - Multi-quantization GGUF export support
   - Background export job management
   - Real-time progress streaming

5. **Hardware Detection** (`backend/hardware.py`):
   - NVIDIA GPU detection and VRAM reporting
   - CUDA version compatibility checking
   - Windows pagefile validation for GGUF export

### API Endpoints

- **Models**: `/api/models`, `/api/models/search`, `/api/models/download`
- **Datasets**: `/api/datasets/list`, `/api/datasets/create`, `/api/datasets/upload`
- **Training**: `/api/jobs`, `/api/jobs/{job_id}`, `/api/jobs/{job_id}/events`
- **Export**: `/api/exports`, `/api/exports/{export_id}`, `/api/exports/files`
- **Config**: `/api/config/validate`, `/api/config/quantizations`

## Training Pipeline

The platform implements a specialized training pipeline for embedding identity and reasoning traces:

1. **Data Preparation**:
   - Loads identity dataset for personality embedding
   - Loads coding/reasoning dataset for trace analysis
   - Filters and maps data to required format

2. **Model Configuration**:
   - Automatic 4-bit quantization detection
   - RoPE scaling support
   - Gradient checkpointing optimization

3. **Training Execution**:
   - LoRA adapter training with configurable rank (R) and alpha
   - Real-time metric streaming (loss, learning rate, epoch)
   - Progress tracking and logging

4. **Export**:
   - Automatic GGUF conversion with multiple quantization options
   - Error handling for memory constraints
   - Comprehensive troubleshooting guidance

## Usage Guide

### 1. Download a Model

1. Navigate to the Models page
2. Search for models on Hugging Face Hub
3. Click download to save locally

### 2. Prepare Your Dataset

1. Go to the Datasets page
2. Upload your dataset (JSONL, CSV, or Parquet format)
3. Map your columns to the required format (Instruction/Output or ChatML)

### 3. Configure Training

1. Open the Config page
2. Adjust hyperparameters as needed
3. The platform will validate against your hardware automatically

### 4. Start Training

1. Click "Start Fine-Tuning" on the Config page
2. Monitor progress on the Monitor page
3. View real-time metrics and logs

### 5. Export Your Model

1. After training completes, go to the Export page
2. Select quantization methods
3. Export and download your GGUF model(s)

## Hardware Requirements

- **Minimum**: NVIDIA GPU with 8GB VRAM
- **Recommended**: NVIDIA GPU with 16GB+ VRAM
- **Windows**: Ensure pagefile size is at least 32GB for GGUF export
- **Memory**: 24GB+ RAM recommended for GGUF conversion of large models

## Configuration Options

The platform supports extensive configuration through `finetune_config.json`:

- **Training Parameters**: learning rate, batch size, sequence length
- **LoRA Configuration**: rank (R), alpha, target modules
- **Quantization**: 4-bit quantization, gradient checkpointing
- **Data Processing**: dataset subset sizes, filtering options

## Advanced Features

### Identity and Reasoning Trace Embedding

The training engine includes specialized functions for:
- Identity dataset mapping with channel formatting
- Reasoning trace filtering and processing
- Tool use detection and formatting
- Context-aware output generation

### Error Handling and Recovery

- Automatic detection of memory constraints
- Comprehensive error messages with troubleshooting guidance
- Graceful degradation when dependencies are unavailable
- Background job management with cancellation support

## Use Cases

### 1. Research & Development

**Scenario**: AI researchers need to fine-tune large language models for specialized domains

**Solution**: 
- Use the Model Hub to search and download cutting-edge models from Hugging Face
- Upload domain-specific datasets through the Dataset Manager
- Configure hyperparameters using the interactive dashboard with real-time validation
- Monitor training progress with live metrics and loss curves
- Export optimized GGUF models for deployment

**Benefits**:
- Accelerated research cycles with intuitive UI
- Reproducible experiments with configuration management
- Real-time monitoring reduces debugging time
- Multi-quantization export for various deployment scenarios

### 2. Enterprise AI Deployment

**Scenario**: Companies need to customize LLMs for internal use cases

**Solution**:
- Fine-tune models with proprietary data while maintaining data privacy
- Use the hardware validation system to optimize for available GPU resources
- Leverage LoRA adapters for efficient training on limited hardware
- Export quantized models suitable for edge devices
- Monitor multiple training jobs simultaneously

**Benefits**:
- Cost-effective customization without full model retraining
- Hardware-aware optimization for existing infrastructure
- Streamlined deployment pipeline from training to GGUF export
- Comprehensive logging for compliance and auditing

### 3. Educational Institutions

**Scenario**: Universities and coding bootcamps want to teach AI fine-tuning

**Solution**:
- Students can use the intuitive web interface to learn fine-tuning concepts
- Pre-configured templates for common use cases
- Real-time visualization of training metrics helps understanding
- Error handling with detailed explanations aids learning
- Export functionality demonstrates production deployment

**Benefits**:
- Lower barrier to entry for AI/ML education
- Visual learning tools enhance comprehension
- Safe environment with validation and error recovery
- Practical experience with industry-standard tools

### 4. Startup & MVP Development

**Scenario**: Startups need to quickly prototype AI-powered features

**Solution**:
- Rapid iteration with one-click training and export
- Hardware auto-detection simplifies setup
- Pre-flight checks prevent common configuration errors
- Multi-quantization export for testing different deployment options
- Live monitoring for quick feedback on model performance

**Benefits**:
- Faster time-to-market for AI features
- Reduced DevOps overhead with automated setup
- Lower infrastructure costs through efficient fine-tuning
- Flexible export options for various deployment targets

### 5. AI Hobbyists & Enthusiasts

**Scenario**: Individuals want to experiment with custom AI models

**Solution**:
- User-friendly interface requires minimal technical knowledge
- Automatic environment setup handles complex dependencies
- Real-time monitoring provides immediate feedback
- Export to GGUF format for use with popular inference engines
- Community model sharing through Hugging Face integration

**Benefits**:
- Accessible to non-experts with guided workflows
- Reduced frustration with automated error handling
- Immediate gratification with live progress tracking
- Practical outputs usable with existing tools

## Contributing

Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to contribute to this project.

## License

MIT License

## Acknowledgments

- Built with [](https://github.com/ai/)
- Powered by [FastAPI](https://fastapi.tiangolo.com/) and [Next.js](https://nextjs.org/)
- Uses [PyTorch](https://pytorch.org/) and [Transformers](https://huggingface.co/docs/transformers/index)
- GGUF export powered by [llama.cpp](https://github.com/ggerganov/llama.cpp)
