@echo off
setlocal

set "ROOT_DIR=%~dp0"
cd /d "%ROOT_DIR%"

REM Refresh environment PATH from registry to detect newly installed tools (Node.js/npm)
for /f "tokens=2*" %%a in ('reg query "HKLM\System\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "SYS_PATH=%%b"
for /f "tokens=2*" %%a in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "USER_PATH=%%b"
if defined SYS_PATH (
    if defined USER_PATH (
        set "PATH=%SYS_PATH%;%USER_PATH%"
    ) else (
        set "PATH=%SYS_PATH%"
    )
)

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

REM Verify Python availability and find compatible version
set "PY_CMD="

py -3.11 -c "import sys" >nul 2>&1
if %errorlevel% equ 0 (
    set "PY_CMD=py -3.11"
    goto found_py
)
py -3.12 -c "import sys" >nul 2>&1
if %errorlevel% equ 0 (
    set "PY_CMD=py -3.12"
    goto found_py
)
python -c "import sys; sys.exit(0 if 3.10 <= sys.version_info.major + sys.version_info.minor/10 < 3.13 else 1)" >nul 2>&1
if %errorlevel% equ 0 (
    set "PY_CMD=python"
    goto found_py
)

echo No compatible Python (3.10-3.12) detected on system.
echo Attempting to install Python 3.11 automatically using winget...
winget install Python.Python.3.11 --silent --accept-package-agreements --accept-source-agreements
if %errorlevel% equ 0 (
    REM Refresh path from registry
    for /f "tokens=2*" %%a in ('reg query "HKLM\System\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "SYS_PATH=%%b"
    for /f "tokens=2*" %%a in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "USER_PATH=%%b"
    if defined SYS_PATH (
        if defined USER_PATH (
            set "PATH=%SYS_PATH%;%USER_PATH%"
        ) else (
            set "PATH=%SYS_PATH%"
        )
    )
    py -3.11 -c "import sys" >nul 2>&1
    if %errorlevel% equ 0 (
        set "PY_CMD=py -3.11"
        goto found_py
    )
    python -c "import sys; sys.exit(0 if 3.10 <= sys.version_info.major + sys.version_info.minor/10 < 3.13 else 1)" >nul 2>&1
    if %errorlevel% equ 0 (
        set "PY_CMD=python"
        goto found_py
    )
)

echo Error: Failed to find or install a compatible Python (3.10-3.12) version.
echo Please install Python 3.11 or 3.12 manually from https://python.org
exit /b 1

:found_py
if exist ".venv\Scripts\python.exe" (
    ".venv\Scripts\python.exe" -c "import sys; sys.exit(0 if sys.version_info < (3, 13) else 1)" >nul 2>&1
    if errorlevel 1 (
        echo Existing virtual environment uses Python 3.13+, which is incompatible with prebuilt deep learning packages on Windows.
        echo Recreating virtual environment with Python 3.11 or 3.12...
        rmdir /s /q .venv
    )
)

if not exist ".venv\Scripts\python.exe" (
    echo Creating local virtual environment using: %PY_CMD%
    %PY_CMD% -m venv .venv
    if errorlevel 1 (
        echo Failed to create .venv
        exit /b 1
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

echo Checking for frontend dependencies - Node.js/npm...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo Node.js not found. Attempting to install Node.js automatically via winget...
    winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
    if %errorlevel% equ 0 (
        for /f "tokens=2*" %%a in ('reg query "HKLM\System\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "SYS_PATH=%%b"
        for /f "tokens=2*" %%a in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "USER_PATH=%%b"
        if defined SYS_PATH (
            if defined USER_PATH (
                set "PATH=%SYS_PATH%;%USER_PATH%"
            ) else (
                set "PATH=%SYS_PATH%"
            )
        )
    )
)

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
            echo Building frontend...
            call npm run build
            if errorlevel 1 (
                echo Warning: npm run build failed in finetune-ui.
            ) else (
                echo Frontend successfully built.
            )
        )
        cd /d "%ROOT_DIR%"
    ) else (
        echo Warning: npm was not found. Please install npm to run the web interface.
    )
) else (
    echo Warning: Node.js was not found. Please install Node.js v18 or higher to run the web interface.
)

echo Running smoke test (importing torch//trl/peft/transformers)...
".venv\Scripts\python.exe" "scripts\smoke_test.py"
if errorlevel 1 exit /b 1

echo Setup complete.
endlocal
