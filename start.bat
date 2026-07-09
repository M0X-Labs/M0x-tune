@echo off
setlocal

set "ROOT_DIR=%~dp0"
cd /d "%ROOT_DIR%"

echo ============================================
echo   m0x-tune - Fine-Tuning Platform
echo ============================================
echo.

REM Set default ports
set "PORT_BACKEND=8000"
set "PORT_FRONTEND=3000"

REM Parse command line options
:parse_args
if "%~1"=="" goto end_parse
if "%~1"=="--backend-port" (
    set "PORT_BACKEND=%~2"
    shift
    shift
    goto parse_args
)
if "%~1"=="--frontend-port" (
    set "PORT_FRONTEND=%~2"
    shift
    shift
    goto parse_args
)
shift
goto parse_args
:end_parse

REM Check if .venv exists
if not exist ".venv\Scripts\python.exe" (
    echo Virtual environment not found!
    echo Please run setup.bat first to set up the environment.
    pause
    exit /b 1
)

REM Set environment variables
if not exist ".tmp" mkdir ".tmp"
if not exist ".pip_cache" mkdir ".pip_cache"
if not exist ".uv_cache" mkdir ".uv_cache"
if not exist ".hf_home" mkdir ".hf_home"

set "UV_CACHE_DIR=%ROOT_DIR%.uv_cache"
set "PIP_CACHE_DIR=%ROOT_DIR%.pip_cache"
set "TEMP=%ROOT_DIR%.tmp"
set "TMP=%ROOT_DIR%.tmp"
set "HF_HOME=%ROOT_DIR%.hf_home"
set "HUGGINGFACE_HUB_CACHE=%ROOT_DIR%.hf_home\hub"
set "PYTHONUNBUFFERED=1"

REM Propagate ports to frontend Next.js server
set "BACKEND_API_URL=http://127.0.0.1:%PORT_BACKEND%"
set "PORT=%PORT_FRONTEND%"
set "HOSTNAME=0.0.0.0"

echo Starting backend server (FastAPI) on port %PORT_BACKEND%...
start "m0x-tune Backend" cmd /k ""%ROOT_DIR%.venv\Scripts\python.exe" -m uvicorn backend.main:app --host 0.0.0.0 --port %PORT_BACKEND%" > "%ROOT_DIR%backend.log" 2>&1

timeout /t 2 /nobreak >nul

echo Starting frontend server (Next.js) on port %PORT_FRONTEND%...
cd finetune-ui
where npm >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo Error: npm command not found! Please install Node.js and npm to run the web interface.
) else (
    if not exist "node_modules" (
        echo node_modules not found. Installing frontend dependencies - this may take a minute...
        cmd /c "npm install"
    )
    if not exist ".next" (
        echo Production build not found. Building frontend - this may take a minute...
        cmd /c "npm run build"
    )
    start "m0x-tune Frontend" cmd /k "npx next start -H 0.0.0.0 -p %PORT_FRONTEND%" > "%ROOT_DIR%frontend.log" 2>&1
)
cd ..

echo.
echo ============================================
echo   Both servers are starting!
echo   Backend: http://localhost:%PORT_BACKEND%
echo   Frontend: http://localhost:%PORT_FRONTEND%
echo ============================================
echo.
echo Press any key to exit (servers will continue running)...
pause >nul

endlocal
