@echo off
setlocal

set "ROOT_DIR=%~dp0"
cd /d "%ROOT_DIR%"

if not exist ".tmp" mkdir ".tmp"
if not exist ".pip_cache" mkdir ".pip_cache"
if not exist ".uv_cache" mkdir ".uv_cache"
if not exist ".hf_home" mkdir ".hf_home"
if not exist ".hf_home\hub" mkdir ".hf_home\hub"

set "UV_CACHE_DIR=%ROOT_DIR%.uv_cache"
set "PIP_CACHE_DIR=%ROOT_DIR%.pip_cache"
set "TEMP=%ROOT_DIR%.tmp"
set "TMP=%ROOT_DIR%.tmp"
set "HF_HOME=%ROOT_DIR%.hf_home"
set "HUGGINGFACE_HUB_CACHE=%ROOT_DIR%.hf_home\hub"

if not exist ".venv\Scripts\python.exe" (
    echo Creating local virtual environment...
    py -3 -m venv .venv
    if errorlevel 1 (
        python -m venv .venv
        if errorlevel 1 (
            echo Failed to create .venv
            exit /b 1
        )
    )
)

echo Using virtual environment: %ROOT_DIR%.venv
".venv\Scripts\python.exe" -m ensurepip --upgrade
if errorlevel 1 exit /b 1

echo Detecting local hardware...
".venv\Scripts\python.exe" "scripts\detect_hardware.py"
if errorlevel 1 exit /b 1

echo Installing CUDA-aware dependencies...
".venv\Scripts\python.exe" "scripts\install_deps.py"
if errorlevel 1 exit /b 1

echo Checking for frontend dependencies (Node.js/npm)...
where node >nul 2>nul
if %errorlevel% equ 0 (
    where npm >nul 2>nul
    if %errorlevel% equ 0 (
        echo Node.js and npm found. Installing frontend dependencies...
        cd /d "%ROOT_DIR%finetune-ui"
        call npm install
        if errorlevel 1 (
            echo Warning: npm install failed in finetune-ui.
        ) else (
            echo Frontend dependencies successfully installed.
        )
        cd /d "%ROOT_DIR%"
    ) else (
        echo Warning: npm was not found. Please install npm to run the web interface.
    )
) else (
    echo Warning: Node.js was not found. Please install Node.js (v18+) to run the web interface.
)

echo Running smoke test...
".venv\Scripts\python.exe" -c "import os, torch; print('torch', torch.__version__); print('cuda_available', torch.cuda.is_available()); print('device_count', torch.cuda.device_count()); print('hf_home', os.environ.get('HF_HOME'))"
if errorlevel 1 exit /b 1

echo Setup complete.
endlocal
