# m0x-tune Platform Installer for Windows PowerShell
#
# Usage:  irm https://tune.m0x.in/install.ps1 | iex
#

$ErrorActionPreference = "Stop"

# Refresh environment path in the current session to detect newly installed tools (like Node.js/npm)
try {
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
} catch {
    # Fallback if registry query fails
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "       m0x-tune Platform Installer          " -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Check for git
$gitCheck = Get-Command git -ErrorAction SilentlyContinue
if (-not $gitCheck) {
    Write-Host "Git not found. Installing Git automatically..." -ForegroundColor Yellow
    $wingetCheck = Get-Command winget -ErrorAction SilentlyContinue
    if ($wingetCheck) {
        Write-Host "Using winget to install Git..." -ForegroundColor Gray
        try {
            Start-Process winget -ArgumentList "install Git.Git --silent --accept-package-agreements --accept-source-agreements" -Wait
        } catch {
            $wingetCheck = $false
        }
    }
    if (-not $wingetCheck) {
        Write-Host "Downloading Git installer..." -ForegroundColor Gray
        $exePath = "$env:TEMP\Git-2.43.0-64-bit.exe"
        try {
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
            Invoke-WebRequest -Uri "https://github.com/git-for-windows/git/releases/download/v2.43.0.windows.1/Git-2.43.0-64-bit.exe" -OutFile $exePath
            Write-Host "Installing Git silently..." -ForegroundColor Gray
            Start-Process $exePath -ArgumentList "/VERYSILENT /NORESTART /NOCANCEL /SP-" -Wait
        } catch {
            Write-Host "Failed to install Git automatically. Please install Git manually from https://git-scm.com" -ForegroundColor Red
            exit 1
        }
    }
    # Refresh PATH to detect Git
    try {
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    } catch {}
}

# Determine target directory
$TargetDir = "m0x-tune"
if (Test-Path $TargetDir) {
    Write-Host "Directory '$TargetDir' already exists. Updating existing repository..." -ForegroundColor Yellow
    Set-Location $TargetDir
    git pull origin main
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "Warning: git pull failed (likely due to local changes like edits)." -ForegroundColor Yellow
        $overwrite = "n"
        try {
            $overwrite = Read-Host "Would you like to overwrite your local changes and update? (y/N)"
        } catch {
            $overwrite = "n"
        }
        if ($overwrite -match "^[yY]") {
            Write-Host "Overwriting local changes and updating..." -ForegroundColor Gray
            git reset --hard HEAD
            git pull origin main
        } else {
            Write-Host "Skipping update of local files. Continuing with your existing files..." -ForegroundColor Gray
        }
    }
} else {
    Write-Host "Cloning m0x-tune repository..." -ForegroundColor Gray
    git clone https://github.com/M0X-Labs/M0x-tune.git $TargetDir
    Set-Location $TargetDir
}

# Check for Python (3.10 - 3.12 CPython)
function Find-CompatiblePython {
    $minors = @("3.11", "3.12", "3.10")
    $condaSkip = '(?i)(conda|miniconda|anaconda|miniforge|mambaforge)'
    foreach ($pyLauncher in @(Get-Command py -All -CommandType Application -ErrorAction SilentlyContinue)) {
        if ($pyLauncher.Source -match $condaSkip) { continue }
        foreach ($minor in $minors) {
            try {
                $out = & $pyLauncher.Source "-$minor" --version 2>&1 | Out-String
                if ($out -match "Python (3\.(10|11|12))\.\d+") {
                    $ver = $Matches[1]
                    $resolvedExe = (& $pyLauncher.Source "-$minor" -c "import sys; print(sys.executable)" 2>$null | Out-String).Trim()
                    if ($resolvedExe -and (Test-Path $resolvedExe) -and $resolvedExe -notmatch $condaSkip) {
                        return @{ Version = $ver; Path = $resolvedExe }
                    }
                }
            } catch {}
        }
    }
    foreach ($name in @("python", "python3")) {
        foreach ($cmd in @(Get-Command $name -All -ErrorAction SilentlyContinue)) {
            if (-not $cmd.Source) { continue }
            if ($cmd.Source -like "*\WindowsApps\*") { continue }
            if ($cmd.Source -match $condaSkip) { continue }
            try {
                $out = & $cmd.Source --version 2>&1 | Out-String
                if ($out -match "Python (3\.(10|11|12))\.\d+") {
                    return @{ Version = $Matches[1]; Path = $cmd.Source }
                }
            } catch {}
        }
    }
    return $null
}

$pyInfo = Find-CompatiblePython
if (-not $pyInfo) {
    Write-Host "Python (3.10-3.12) not found. Installing Python 3.11 automatically..." -ForegroundColor Yellow
    $wingetCheck = Get-Command winget -ErrorAction SilentlyContinue
    $installed = $false
    if ($wingetCheck) {
        Write-Host "Using winget to install Python 3.11..." -ForegroundColor Gray
        try {
            Start-Process winget -ArgumentList "install Python.Python.3.11 --silent --accept-package-agreements --accept-source-agreements" -Wait
            try {
                $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
            } catch {}
            $pyInfo = Find-CompatiblePython
            if ($pyInfo) { $installed = $true }
        } catch {
            $wingetCheck = $false
        }
    }
    if (-not $installed) {
        Write-Host "Downloading Python 3.11 installer..." -ForegroundColor Gray
        $exePath = "$env:TEMP\python-3.11.9-amd64.exe"
        try {
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
            Invoke-WebRequest -Uri "https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe" -OutFile $exePath
            Write-Host "Installing Python 3.11 silently..." -ForegroundColor Gray
            Start-Process $exePath -ArgumentList "/quiet InstallAllUsers=0 PrependPath=1 Include_launcher=1 InstallLauncherAllUsers=0 Include_pip=1 AssociateFiles=0 Shortcuts=0" -Wait
            try {
                $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
            } catch {}
            $pyInfo = Find-CompatiblePython
            if ($pyInfo) { $installed = $true }
        } catch {
            Write-Host "Failed to install Python automatically. Please install Python 3.11 or 3.12 manually from https://python.org" -ForegroundColor Red
            exit 1
        } finally {
            if (Test-Path $exePath) { Remove-Item $exePath -Force -ErrorAction SilentlyContinue }
        }
    }
}

# Check for Node.js/npm and install if missing
$nodeCheck = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCheck) {
    Write-Host "Node.js not found. Installing Node.js automatically..." -ForegroundColor Yellow
    $wingetCheck = Get-Command winget -ErrorAction SilentlyContinue
    if ($wingetCheck) {
        Write-Host "Using winget to install Node.js..." -ForegroundColor Gray
        try {
            Start-Process winget -ArgumentList "install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements" -Wait
        } catch {
            $wingetCheck = $false
        }
    }
    if (-not $wingetCheck) {
        Write-Host "Downloading Node.js MSI installer..." -ForegroundColor Gray
        $msiPath = "$env:TEMP\node-v20.18.0-x64.msi"
        try {
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
            Invoke-WebRequest -Uri "https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi" -OutFile $msiPath
            Write-Host "Installing Node.js silently..." -ForegroundColor Gray
            Start-Process msiexec.exe -ArgumentList "/i `"$msiPath`" /qn /norestart" -Wait
        } catch {
            Write-Host "Failed to install Node.js automatically. Please install Node.js manually from https://nodejs.org" -ForegroundColor Red
        }
    }
    # Refresh PATH to pick up newly installed Node.js
    try {
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    } catch {}
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

Write-Host "Starting m0x-tune..." -ForegroundColor Green
Write-Host "To start it manually later, run:" -ForegroundColor Gray
Write-Host "  .\start.bat" -ForegroundColor Gray
Write-Host "" -ForegroundColor Gray
cmd.exe /c start.bat
