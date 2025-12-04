#!/bin/bash

# Rogue Captive Portal - Check Dependencies and Configuration
# This script verifies that all dependencies are installed and services are properly configured

# Variables
SSID="UNI-MAINZ"
INTERFACE="wlan0"
GATEWAY_IP="192.168.10.1"
FLASK_PORT=8080

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}This script must be run as root${NC}" 
   exit 1
fi

# Function to print status messages
print_status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

print_info() {
    echo -e "${BLUE}[i]${NC} $1"
}

# Track overall status
ERRORS=0
WARNINGS=0

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Check system packages
check_packages() {
    echo -e "\n${BLUE}=== Checking System Packages ===${NC}"
    
    local packages=("hostapd" "dnsmasq" "iptables" "python3")
    
    for package in "${packages[@]}"; do
        if command -v $package &> /dev/null || dpkg -l 2>/dev/null | grep -q "^ii  $package "; then
            print_status "$package is installed"
        else
            print_error "$package is NOT installed"
            ((ERRORS++))
        fi
    done
}

# Check Python virtual environment
check_venv() {
    echo -e "\n${BLUE}=== Checking Python Environment ===${NC}"
    
    print_info "Script directory: $SCRIPT_DIR"
    
    if [ -d "$SCRIPT_DIR/.venv" ]; then
        print_status "Virtual environment exists at $SCRIPT_DIR/.venv"
        
        # Find the actual python binary (handle different versions)
        PYTHON_BIN=""
        if [ -f "$SCRIPT_DIR/.venv/bin/python3" ]; then
            PYTHON_BIN="$SCRIPT_DIR/.venv/bin/python3"
        elif [ -f "$SCRIPT_DIR/.venv/bin/python" ]; then
            PYTHON_BIN="$SCRIPT_DIR/.venv/bin/python"
        fi
        
        if [ -n "$PYTHON_BIN" ] && [ -x "$PYTHON_BIN" ]; then
            print_status "Python binary found: $PYTHON_BIN"
            
            # Check Flask installation
            if "$PYTHON_BIN" -c "import flask" 2>/dev/null; then
                print_status "Flask is installed in venv"
                FLASK_VERSION=$("$PYTHON_BIN" -c "import flask; print(flask.__version__)" 2>/dev/null)
                print_info "Flask version: $FLASK_VERSION"
            else
                print_error "Flask is NOT installed in venv"
                print_info "Run: $SCRIPT_DIR/.venv/bin/pip install flask"
                ((ERRORS++))
            fi
        else
            print_error "Python binary NOT found or not executable in venv"
            print_info "Searched for: $SCRIPT_DIR/.venv/bin/python3"
            print_info "Try recreating venv: rm -rf $SCRIPT_DIR/.venv && python3 -m venv $SCRIPT_DIR/.venv"
            ((ERRORS++))
        fi
    else
        print_error "Virtual environment does NOT exist at $SCRIPT_DIR/.venv"
        print_info "Run: ./1_install_dependencies.sh"
        ((ERRORS++))
    fi
    
    if [ -f "$SCRIPT_DIR/app.py" ]; then
        print_status "app.py exists"
    else
        print_error "app.py NOT found in $SCRIPT_DIR"
        ((ERRORS++))
    fi
}

# Check configuration files
check_configs() {
    echo -e "\n${BLUE}=== Checking Configuration Files ===${NC}"
    
    # Check hostapd config
    if [ -f /etc/hostapd/hostapd.conf ]; then
        print_status "hostapd.conf exists"
        
        if grep -q "ssid=$SSID" /etc/hostapd/hostapd.conf; then
            print_status "SSID configured correctly: $SSID"
        else
            print_warning "SSID may not be configured correctly"
            ((WARNINGS++))
        fi
        
        if grep -q "interface=$INTERFACE" /etc/hostapd/hostapd.conf; then
            print_status "Interface configured correctly: $INTERFACE"
        else
            print_warning "Interface may not be configured correctly"
            ((WARNINGS++))
        fi
    else
        print_error "hostapd.conf does NOT exist"
        print_info "Run: ./2_configure_services.sh"
        ((ERRORS++))
    fi
    
    # Check dnsmasq config
    if [ -f /etc/dnsmasq.conf ]; then
        print_status "dnsmasq.conf exists"
        
        if grep -q "interface=$INTERFACE" /etc/dnsmasq.conf; then
            print_status "dnsmasq interface configured correctly"
        else
            print_warning "dnsmasq interface may not be configured correctly"
            ((WARNINGS++))
        fi
    else
        print_error "dnsmasq.conf does NOT exist"
        print_info "Run: ./2_configure_services.sh"
        ((ERRORS++))
    fi
}

# Check network interface
check_network() {
    echo -e "\n${BLUE}=== Checking Network Interface ===${NC}"
    
    if ip link show $INTERFACE &> /dev/null; then
        print_status "Interface $INTERFACE exists"
        
        # Check if interface is up
        if ip link show $INTERFACE | grep -q "state UP"; then
            print_status "Interface $INTERFACE is UP"
        else
            print_warning "Interface $INTERFACE is DOWN (will be brought up when running)"
            ((WARNINGS++))
        fi
        
        # Check if IP is configured
        if ip addr show $INTERFACE 2>/dev/null | grep -q "$GATEWAY_IP"; then
            print_status "Interface has correct IP: $GATEWAY_IP"
        else
            print_warning "Interface does not have IP $GATEWAY_IP (will be configured when running)"
            ((WARNINGS++))
        fi
    else
        print_error "Interface $INTERFACE does NOT exist"
        print_info "Available interfaces:"
        ip link show | grep -E "^[0-9]+:" | awk '{print "  - " $2}' | sed 's/:$//'
        ((ERRORS++))
    fi
}

# Check iptables rules
check_iptables() {
    echo -e "\n${BLUE}=== Checking iptables ===${NC}"
    
    if command -v iptables &> /dev/null; then
        print_status "iptables command available"
        
        # Check if IP forwarding is enabled
        if [ "$(cat /proc/sys/net/ipv4/ip_forward)" = "1" ]; then
            print_status "IP forwarding is enabled"
        else
            print_warning "IP forwarding is disabled (will be enabled when running)"
            ((WARNINGS++))
        fi
        
        # Check if saved rules exist
        if [ -f /etc/iptables/rules.v4 ]; then
            print_status "iptables rules file exists"
        else
            print_warning "iptables rules file does not exist (will be created when running)"
            ((WARNINGS++))
        fi
    else
        print_error "iptables command NOT available"
        ((ERRORS++))
    fi
}

# Check service status
check_services() {
    echo -e "\n${BLUE}=== Checking Service Status ===${NC}"
    
    # Check if services are enabled
    if systemctl is-enabled hostapd &> /dev/null; then
        print_status "hostapd is enabled"
    else
        print_warning "hostapd is not enabled (will be started manually)"
        ((WARNINGS++))
    fi
    
    if systemctl is-enabled dnsmasq &> /dev/null; then
        print_status "dnsmasq is enabled"
    else
        print_warning "dnsmasq is not enabled (will be started manually)"
        ((WARNINGS++))
    fi
    
    # Check if services are currently running
    if systemctl is-active --quiet hostapd 2>/dev/null; then
        print_info "hostapd is currently RUNNING"
    else
        print_info "hostapd is currently STOPPED"
    fi
    
    if systemctl is-active --quiet dnsmasq 2>/dev/null; then
        print_info "dnsmasq is currently RUNNING"
    else
        print_info "dnsmasq is currently STOPPED"
    fi
    
    # Check Flask
    if pgrep -f "app.py" > /dev/null; then
        print_info "Flask application is currently RUNNING"
    else
        print_info "Flask application is currently STOPPED"
    fi
}

# Display summary
show_summary() {
    echo -e "\n${BLUE}╔═══════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║         Status Summary                ║${NC}"
    echo -e "${BLUE}╚═══════════════════════════════════════╝${NC}"
    
    if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
        echo -e "${GREEN}✓ All checks passed!${NC}"
        echo -e "${GREEN}✓ System is ready to run the rogue access point${NC}"
        echo ""
        echo -e "${GREEN}Next step: Run ${YELLOW}./4_run_rogue_ap.sh${GREEN} to start${NC}"
        return 0
    elif [ $ERRORS -eq 0 ]; then
        echo -e "${YELLOW}⚠ $WARNINGS warning(s) found${NC}"
        echo -e "${YELLOW}⚠ System should work, but review warnings above${NC}"
        echo ""
        echo -e "${GREEN}You can proceed: Run ${YELLOW}./4_run_rogue_ap.sh${GREEN} to start${NC}"
        return 0
    else
        echo -e "${RED}✗ $ERRORS error(s) found${NC}"
        if [ $WARNINGS -gt 0 ]; then
            echo -e "${YELLOW}⚠ $WARNINGS warning(s) found${NC}"
        fi
        echo -e "${RED}✗ Please fix errors before running${NC}"
        echo ""
        echo -e "${YELLOW}Suggested actions:${NC}"
        echo -e "  1. Run ${YELLOW}./1_install_dependencies.sh${NC} if packages are missing"
        echo -e "  2. Run ${YELLOW}./2_configure_services.sh${NC} if configs are missing"
        echo -e "  3. Check that you're in the correct directory: $SCRIPT_DIR"
        return 1
    fi
}

# Main function
main() {
    echo -e "${BLUE}"
    echo "╔═══════════════════════════════════════╗"
    echo "║   Checking System Status              ║"
    echo "║   Rogue Captive Portal                ║"
    echo "╚═══════════════════════════════════════╝"
    echo -e "${NC}"
    
    check_packages
    check_venv
    check_configs
    check_network
    check_iptables
    check_services
    show_summary
}

# Run main function
main
