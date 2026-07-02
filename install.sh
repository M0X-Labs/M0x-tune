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
    echo "${C_ERR}Error: git is not installed or not in your PATH.${C_RST}"
    echo "Please install Git and try again."
    exit 1
fi

TARGET_DIR="m0x-tune"
if [ -d "$TARGET_DIR" ]; then
    echo "${C_WARN}Directory '$TARGET_DIR' already exists.${C_RST}"
    echo "Updating the existing repository..."
    cd "$TARGET_DIR"
    git pull origin main
else
    echo "${C_DIM}Cloning m0x-tune repository...${C_RST}"
    git clone https://github.com/M0X-Labs/M0x-tune.git "$TARGET_DIR"
    cd "$TARGET_DIR"
fi

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

# Ask the user if they want to start the platform immediately
if [ -t 0 ]; then
    printf "Do you want to start the m0x-tune platform now? [Y/n]: "
    read -r response
    case "$response" in
        [nN]*)
            echo ""
            echo "To start it manually later, run:"
            echo "  cd $TARGET_DIR && ./start.sh"
            ;;
        *)
            echo ""
            echo "Starting m0x-tune..."
            ./start.sh
            ;;
    esac
else
    echo "To start the platform, run:"
    echo "  cd $TARGET_DIR && ./start.sh"
fi
