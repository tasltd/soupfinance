#!/bin/bash
# Get Backend URL for SoupFinance LXC Container
# PURPOSE: Output the HTTP URL for the soupfinance-backend container
# CONSTRAINTS: Requires soupfinance-backend container to be running
# Usage: ./get-backend-url.sh
#
# Returns: http://{container-ip}:9090
# Exit codes:
#   0 - Success, URL printed to stdout
#   1 - Container not running or no IP assigned

set -e

# Detect LXC/LXD binary (prefer native, fallback to snap)
if command -v lxc &>/dev/null; then
    LXC="lxc"
elif [ -x /snap/bin/lxc ]; then
    LXC="/snap/bin/lxc"
else
    echo "Error: lxc/lxd not found. Install with: sudo apt install lxd"
    exit 1
fi

CONTAINER_NAME="soupfinance-backend"

# Added: Colors for error output
RED='\033[0;31m'
NC='\033[0m'

# Added: Check if container exists and is running
if ! $LXC info "$CONTAINER_NAME" &>/dev/null; then
    echo -e "${RED}Error: Container '$CONTAINER_NAME' does not exist${NC}" >&2
    echo "Create it first with: $LXC launch ubuntu:22.04 $CONTAINER_NAME" >&2
    exit 1
fi

# Added: Get container status
CONTAINER_STATUS=$($LXC list "$CONTAINER_NAME" -c s --format csv)
if [ "$CONTAINER_STATUS" != "RUNNING" ]; then
    echo -e "${RED}Error: Container '$CONTAINER_NAME' is not running (status: $CONTAINER_STATUS)${NC}" >&2
    echo "Start it with: $LXC start $CONTAINER_NAME" >&2
    exit 1
fi

# Added: Get container IP address (IPv4 only)
CONTAINER_IP=$($LXC list "$CONTAINER_NAME" -c 4 --format csv | cut -d' ' -f1)

# Added: Validate IP was obtained
if [ -z "$CONTAINER_IP" ]; then
    echo -e "${RED}Error: No IP address assigned to container '$CONTAINER_NAME'${NC}" >&2
    echo "Container may still be starting. Wait a few seconds and try again." >&2
    exit 1
fi

# Added: Output the backend URL
echo "http://${CONTAINER_IP}:9090"
