#!/bin/sh
#
# m0x-tune Platform Installer
#
# Usage:  curl -fsSL https://tune.m0x.in/install.sh | sh
#

set -e

# Output styling
C_TITLE="\033[38;5;150m"
C_DIM="\033[38;5;245m"
C_OK="\033[38;5;108m"
C_WARN="\033[38;5;136m"
C_ERR="\033[91m"
C_RST="\033[0m"

echo "${C_TITLE}============================================${C_RST}"
echo "${C_TITLE}       m0x-tune Platform Installer          ${C_RST}"
echo "${C_TITLE}============================================${C_RST}"
echo ""

# Check for git
if ! command -v git >/dev/null 2>&1; then
    echo "${C_WARN}Git not found. Attempting to install Git automatically...${C_RST}"
    if command -v apt-get >/dev/null 2>&1; then
        sudo apt-get update && sudo apt-get install -y git
    elif command -v yum >/dev/null 2>&1; then
        sudo yum install -y git
    elif command -v brew >/dev/null 2>&1; then
        brew install git
    else
        echo "${C_ERR}Error: git is not installed or not in your PATH.${C_RST}"
        echo "Please install Git and try again."
        exit 1
    fi
fi

TARGET_DIR="m0x-tune"
if [ -d "$TARGET_DIR" ]; then
    echo "${C_WARN}Directory '$TARGET_DIR' already exists.${C_RST}"
    echo "Updating the existing repository..."
    cd "$TARGET_DIR"
    if ! git pull origin main; then
        echo ""
        echo "${C_WARN}Warning: git pull failed (likely due to local changes like executable permissions or edits).${C_RST}"
        if [ -t 0 ]; then
            printf "Would you like to overwrite your local changes and update? [y/N]: "
            read -r overwrite_response
            case "$overwrite_response" in
                [yY]*)
                    echo "Overwriting local changes and updating..."
                    git reset --hard HEAD
                    git pull origin main
                    ;;
                *)
                    echo "Skipping update of local files. Continuing with your existing files..."
                    ;;
            esac
        else
            echo "Non-interactive environment detected. Skipping update of local files."
        fi
    fi
else
    echo "${C_DIM}Cloning m0x-tune repository...${C_RST}"
    git clone https://github.com/M0X-Labs/M0x-tune.git "$TARGET_DIR"
    cd "$TARGET_DIR"
fi

# Check for Python (3.10 - 3.12 CPython) and install if missing
find_compatible_python() {
    for ver in python3.11 python3.12 python3.10 python3 python; do
        if command -v "$ver" >/dev/null 2>&1; then
            if "$ver" -c "import sys; sys.exit(0 if 3.10 <= sys.version_info.major + sys.version_info.minor/10 < 3.13 else 1)" >/dev/null 2>&1; then
                echo "$ver"
                return 0
            fi
        fi
    done
    return 1
}

COMPAT_PY=$(find_compatible_python || true)
if [ -z "$COMPAT_PY" ]; then
    echo "${C_WARN}Python (3.10-3.12) not found. Attempting to install Python 3.11 automatically...${C_RST}"
    if command -v apt-get >/dev/null 2>&1; then
        sudo apt-get update && sudo apt-get install -y python3.11 python3.11-venv python3.11-dev
    elif command -v yum >/dev/null 2>&1; then
        sudo yum install -y python3.11 python3.11-devel
    elif command -v brew >/dev/null 2>&1; then
        brew install python@3.11
    else
        echo "${C_WARN}Warning: Could not install Python 3.11 automatically. Please install Python 3.11 manually.${C_RST}"
    fi
fi

# Check for Node.js and npm and install if missing
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
    echo "${C_WARN}Node.js or npm not found. Installing Node.js automatically...${C_RST}"
    if command -v apt-get >/dev/null 2>&1; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs
    elif command -v yum >/dev/null 2>&1; then
        curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
        sudo yum install -y nodejs
    elif command -v brew >/dev/null 2>&1; then
        brew install node
    else
        echo "${C_WARN}Warning: Could not install Node.js automatically. Please install Node.js (v18+) manually.${C_RST}"
    fi
fi

# Refresh path in case they were just installed
[ -f ~/.profile ] && . ~/.profile
[ -f ~/.bashrc ] && . ~/.bashrc

# Run the setup script
if [ -f "setup.sh" ]; then
    echo "${C_DIM}Making setup.sh executable...${C_RST}"
    chmod +x setup.sh
    echo "${C_DIM}Running setup.sh...${C_RST}"
    ./setup.sh
else
    echo "${C_ERR}Error: setup.sh not found in the cloned repository.${C_RST}"
    exit 1
fi

echo ""
echo "${C_OK}============================================${C_RST}"
echo "${C_OK}  Installation and Setup Completed!         ${C_RST}"
echo "${C_OK}============================================${C_RST}"
echo ""
echo "Once started, you can access the platform at:"
echo "  Web Interface: http://localhost:3000"
echo "  Backend API:   http://localhost:8000"
echo "============================================="
echo ""

echo "Starting m0x-tune..."
echo "To start it manually later, run:"
echo "  ./start.sh"
echo ""
./start.sh
