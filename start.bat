@echo off
setlocal

set "ROOT_DIR=%~dp0"
cd /d "%ROOT_DIR%"

echo ============================================
echo   m0x-tune - Fine-Tuning Platform
echo ============================================
echo.

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

echo Starting backend server (FastAPI)...
start "m0x-tune Backend" cmd /k ""%ROOT_DIR%.venv\Scripts\python.exe" -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload"

timeout /t 2 /nobreak >nul

echo Starting frontend server (Next.js)...
cd finetune-ui
start "m0x-tune Frontend" cmd /k "npm run start"
cd ..

echo.
echo ============================================
echo   Both servers are starting!
echo   Backend: http://localhost:8000
echo   Frontend: http://localhost:3000
echo ============================================
echo.
echo Press any key to exit (servers will continue running)...
pause >nul

endlocal
