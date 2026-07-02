# m0x-tune Platform Installer for Windows PowerShell
#
# Usage:  irm https://tune.m0x.in/install.ps1 | iex
#

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "       m0x-tune Platform Installer          " -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Check for git
$gitCheck = Get-Command git -ErrorAction SilentlyContinue
if (-not $gitCheck) {
    Write-Host "Error: git is not installed or not in your PATH." -ForegroundColor Red
    Write-Host "Please install Git (https://git-scm.com) and try again."
    exit 1
}

# Determine target directory
$TargetDir = "m0x-tune"
if (Test-Path $TargetDir) {
    Write-Host "Directory '$TargetDir' already exists. Updating existing repository..." -ForegroundColor Yellow
    Set-Location $TargetDir
    git pull origin main
} else {
    Write-Host "Cloning m0x-tune repository..." -ForegroundColor Gray
    git clone https://github.com/M0X-Labs/M0x-tune.git $TargetDir
    Set-Location $TargetDir
}

# Run the setup script
if (Test-Path "setup.bat") {
    Write-Host "Running setup.bat..." -ForegroundColor Gray
    cmd.exe /c setup.bat
} else {
    Write-Host "Error: setup.bat not found in the cloned repository." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Installation and Setup Completed!         " -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Once started, you can access the platform at:"
Write-Host "  Web Interface: http://localhost:3000"
Write-Host "  Backend API:   http://localhost:8000"
Write-Host "============================================"
Write-Host ""

$startNow = "y"
try {
    $startNow = Read-Host "Do you want to start the m0x-tune platform now? (Y/n)"
} catch {
    $startNow = "n"
}

if ($startNow -eq "" -or $startNow -match "^[yY]") {
    Write-Host "Starting m0x-tune..." -ForegroundColor Green
    cmd.exe /c start.bat
} else {
    Write-Host "To start it manually later, run:"
    Write-Host "  cd $TargetDir"
    Write-Host "  .\start.bat"
}
