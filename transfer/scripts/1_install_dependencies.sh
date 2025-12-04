#!/bin/bash

# Rogue Captive Portal - Install Dependencies
# This script installs all necessary packages for the rogue access point

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}This script must be run as root${NC}" 
   exit 1
fi

# Function to print status messages
print_status() {
    echo -e "${GREEN}[+]${NC} $1"
}

print_error() {
    echo -e "${RED}[-]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Main installation function
install_dependencies() {
    echo -e "${GREEN}"
    echo "╔═══════════════════════════════════════╗"
    echo "║   Installing Dependencies             ║"
    echo "║   Rogue Captive Portal                ║"
    echo "╚═══════════════════════════════════════╝"
    echo -e "${NC}"
    
    print_status "Script directory: $SCRIPT_DIR"
    
    print_status "Updating package lists..."
    apt-get update
    
    print_status "Installing system packages..."
    apt-get install -y hostapd dnsmasq iptables python3 python3-pip python3-venv iptables-persistent net-tools
    
    if [ $? -eq 0 ]; then
        print_status "System packages installed successfully"
    else
        print_error "Failed to install system packages"
        exit 1
    fi
    
    # Setup Flask virtual environment
    if [ ! -d "$SCRIPT_DIR/.venv" ]; then
        print_status "Creating Python virtual environment in $SCRIPT_DIR/.venv..."
        python3 -m venv "$SCRIPT_DIR/.venv"
        
        if [ $? -ne 0 ]; then
            print_error "Failed to create virtual environment"
            exit 1
        fi
        
        print_status "Installing Flask..."
        "$SCRIPT_DIR/.venv/bin/pip" install flask
        
        if [ $? -eq 0 ]; then
            print_status "Flask installed successfully"
        else
            print_error "Failed to install Flask"
            exit 1
        fi
    else
        print_warning "Virtual environment already exists at $SCRIPT_DIR/.venv"
        print_status "Verifying Flask installation..."
        
        # Try to upgrade/install Flask in existing venv
        "$SCRIPT_DIR/.venv/bin/pip" install --upgrade flask
        
        if [ $? -eq 0 ]; then
            print_status "Flask verified/updated successfully"
        else
            print_warning "Could not verify Flask installation"
        fi
    fi
    
    # Stop services (they'll be configured later)
    print_status "Stopping services for configuration..."
    systemctl stop hostapd 2>/dev/null || true
    systemctl stop dnsmasq 2>/dev/null || true
    systemctl stop NetworkManager 2>/dev/null || true
    
    echo ""
    print_status "All dependencies installed successfully!"
    print_status "Virtual environment location: $SCRIPT_DIR/.venv"
    echo -e "${GREEN}Next step: Run ${YELLOW}./2_configure_services.sh${NC}"
}

# Run installation
install_dependencies
