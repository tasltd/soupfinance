#!/bin/bash
# Deploy SoupMarkets WAR to soupfinance-backend LXC container
#
# PURPOSE: Copy WAR from soupmarkets-web build to Tomcat in soupfinance-backend container
# USAGE: ./deploy-war.sh [--restart] [--force]
#
# Options:
#   --restart    Restart Tomcat after deploy (default: false, uses hot deploy)
#   --force      Deploy even if WAR hasn't changed

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

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SOUPMARKETS_WEB_DIR="/home/ddr/Documents/code/soupmarkets/soupmarkets-web"
CONTAINER_NAME="soupfinance-backend"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

DO_RESTART=false
FORCE_DEPLOY=false

# Parse arguments
for arg in "$@"; do
    case $arg in
        --restart) DO_RESTART=true ;;
        --force) FORCE_DEPLOY=true ;;
    esac
done

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         SoupMarkets WAR Deployment                           ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Find latest WAR file
WAR_FILE=$(ls -t "$SOUPMARKETS_WEB_DIR/build/libs/soupmarkets-"*.war 2>/dev/null | grep -v plain | head -1)

if [ -z "$WAR_FILE" ]; then
    echo -e "${RED}Error: No WAR file found in $SOUPMARKETS_WEB_DIR/build/libs/${NC}"
    echo "Build the WAR first with:"
    echo "  cd $SOUPMARKETS_WEB_DIR && ./gradlew bootWar"
    exit 1
fi

WAR_NAME=$(basename "$WAR_FILE")
WAR_CHECKSUM=$(md5sum "$WAR_FILE" | cut -d' ' -f1)

echo "WAR file: $WAR_NAME"
echo "Checksum: $WAR_CHECKSUM"
echo ""

# Check container is running
if [ "$($LXC list $CONTAINER_NAME -c s --format csv 2>/dev/null)" != "RUNNING" ]; then
    echo -e "${RED}Error: Container '$CONTAINER_NAME' is not running${NC}"
    echo "Start it with: cd ../soupfinance-lxc && ./setup-backend.sh --start"
    exit 1
fi

# Check if deploy is needed (compare checksums)
DEPLOYED_CHECKSUM=$($LXC exec $CONTAINER_NAME -- cat /opt/soupmarkets/war/checksum 2>/dev/null || echo "none")
if [ "$WAR_CHECKSUM" = "$DEPLOYED_CHECKSUM" ] && [ "$FORCE_DEPLOY" = false ]; then
    echo -e "${GREEN}✓ WAR already deployed (same checksum)${NC}"
    echo "Use --force to redeploy anyway"
    exit 0
fi

# Deploy WAR
echo -e "${BLUE}Deploying WAR to container...${NC}"

# Copy WAR to container via mounted /app directory (fastest)
# The /app mount points to soupmarkets-web, so we can copy directly
$LXC exec $CONTAINER_NAME -- bash -c "
    mkdir -p /opt/soupmarkets/war /opt/soupmarkets/logs
    cp /app/build/libs/$WAR_NAME /opt/soupmarkets/war/ROOT.war
    echo '$WAR_CHECKSUM' > /opt/soupmarkets/war/checksum
    echo '$WAR_NAME' > /opt/soupmarkets/war/deployed-war-name
    echo '$(date -Iseconds)' > /opt/soupmarkets/war/deployed-at
"

echo -e "${GREEN}✓ WAR deployed as ROOT.war${NC}"

# Restart service if requested
if [ "$DO_RESTART" = true ]; then
    echo -e "${BLUE}Restarting SoupMarkets service...${NC}"
    $LXC exec $CONTAINER_NAME -- systemctl restart soupmarkets.service
    echo -e "${GREEN}✓ Service restarted${NC}"
else
    echo -e "${YELLOW}Note: Service not restarted. Use --restart to restart.${NC}"
fi

# Get container IP
CONTAINER_IP=$($LXC list $CONTAINER_NAME -c 4 --format csv | cut -d' ' -f1)

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║         Deployment Complete!                                 ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "WAR: $WAR_NAME"
echo "Deployed at: $(date)"
echo "Backend URL: http://${CONTAINER_IP}:9090"
echo ""
echo "Test endpoint:"
echo "  curl http://${CONTAINER_IP}:9090/application/status"
echo ""
