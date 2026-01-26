#!/bin/bash
# SoupMarkets Backend Control Script for soupfinance-backend LXC container
#
# PURPOSE: Start, stop, and manage the SoupMarkets backend in the LXC container
# USAGE: ./tomcat-control.sh [start|stop|restart|status|logs]

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
MARIADB_CONTAINER="soupmarkets-mariadb"
SERVICE_NAME="soupmarkets.service"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_header() {
    echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║         SoupFinance Backend Control                          ║${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

ensure_containers_running() {
    # Start MariaDB if needed
    if [ "$($LXC list $MARIADB_CONTAINER -c s --format csv 2>/dev/null)" != "RUNNING" ]; then
        echo -e "${YELLOW}Starting MariaDB container...${NC}"
        $LXC start $MARIADB_CONTAINER
        sleep 5
    fi

    # Start backend container if needed
    if [ "$($LXC list $CONTAINER_NAME -c s --format csv 2>/dev/null)" != "RUNNING" ]; then
        echo -e "${YELLOW}Starting backend container...${NC}"
        $LXC start $CONTAINER_NAME
        sleep 3
    fi
}

update_mariadb_ip() {
    # Update MariaDB IP in case it changed
    MARIADB_IP=$($LXC list $MARIADB_CONTAINER -c 4 --format csv | cut -d' ' -f1)

    # Update systemd service environment
    $LXC exec $CONTAINER_NAME -- sed -i "s/Environment=\"DBHOST=.*/Environment=\"DBHOST=$MARIADB_IP\"/" /etc/systemd/system/soupmarkets.service
    $LXC exec $CONTAINER_NAME -- systemctl daemon-reload
}

do_start() {
    print_header
    echo -e "${BLUE}Starting SoupMarkets Backend...${NC}"
    echo ""

    ensure_containers_running

    # Check if WAR is deployed
    if ! $LXC exec $CONTAINER_NAME -- test -f /opt/soupmarkets/war/ROOT.war 2>/dev/null; then
        echo -e "${RED}Error: No WAR deployed.${NC}"
        echo "Deploy the WAR first with: ./deploy-war.sh"
        exit 1
    fi

    # Check if service is already running
    if $LXC exec $CONTAINER_NAME -- systemctl is-active --quiet $SERVICE_NAME 2>/dev/null; then
        echo -e "${GREEN}✓ SoupMarkets is already running${NC}"
        do_status
        return 0
    fi

    update_mariadb_ip

    # Start service
    $LXC exec $CONTAINER_NAME -- systemctl start $SERVICE_NAME

    echo -e "${GREEN}✓ SoupMarkets started${NC}"
    echo ""
    echo "Waiting for startup (this may take 1-2 minutes)..."
    echo "Check logs with: ./tomcat-control.sh logs"
    echo ""

    # Wait a bit and show status
    sleep 10
    do_status
}

do_stop() {
    print_header
    echo -e "${BLUE}Stopping SoupMarkets Backend...${NC}"

    if [ "$($LXC list $CONTAINER_NAME -c s --format csv 2>/dev/null)" != "RUNNING" ]; then
        echo -e "${YELLOW}Container is not running${NC}"
        return 0
    fi

    $LXC exec $CONTAINER_NAME -- systemctl stop $SERVICE_NAME 2>/dev/null || true
    echo -e "${GREEN}✓ SoupMarkets stopped${NC}"
}

do_restart() {
    do_stop
    sleep 2
    do_start
}

do_status() {
    print_header
    echo -e "${BLUE}Backend Status${NC}"
    echo ""

    # Container status
    echo -e "${BLUE}Containers:${NC}"
    if [ "$($LXC list $MARIADB_CONTAINER -c s --format csv 2>/dev/null)" = "RUNNING" ]; then
        MARIADB_IP=$($LXC list $MARIADB_CONTAINER -c 4 --format csv | cut -d' ' -f1)
        echo -e "  MariaDB:  ${GREEN}RUNNING${NC} ($MARIADB_IP)"
    else
        echo -e "  MariaDB:  ${RED}STOPPED${NC}"
    fi

    if [ "$($LXC list $CONTAINER_NAME -c s --format csv 2>/dev/null)" = "RUNNING" ]; then
        CONTAINER_IP=$($LXC list $CONTAINER_NAME -c 4 --format csv | cut -d' ' -f1)
        echo -e "  Backend:  ${GREEN}RUNNING${NC} ($CONTAINER_IP)"
    else
        echo -e "  Backend:  ${RED}STOPPED${NC}"
        return 1
    fi
    echo ""

    # Service status
    echo -e "${BLUE}SoupMarkets Service:${NC}"
    if $LXC exec $CONTAINER_NAME -- systemctl is-active --quiet $SERVICE_NAME 2>/dev/null; then
        echo -e "  Status:   ${GREEN}RUNNING${NC}"

        # Check HTTP response
        HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://${CONTAINER_IP}:9090/application/status" 2>/dev/null || echo "000")
        if [ "$HTTP_STATUS" = "302" ] || [ "$HTTP_STATUS" = "200" ]; then
            echo -e "  HTTP:     ${GREEN}HEALTHY ($HTTP_STATUS)${NC}"
        elif [ "$HTTP_STATUS" = "000" ]; then
            echo -e "  HTTP:     ${YELLOW}NOT RESPONDING (starting?)${NC}"
        else
            echo -e "  HTTP:     ${YELLOW}$HTTP_STATUS${NC}"
        fi
    else
        echo -e "  Status:   ${RED}STOPPED${NC}"
    fi
    echo ""

    # WAR deployment info
    echo -e "${BLUE}Deployed WAR:${NC}"
    if $LXC exec $CONTAINER_NAME -- test -f /opt/soupmarkets/war/deployed-war-name 2>/dev/null; then
        WAR_NAME=$($LXC exec $CONTAINER_NAME -- cat /opt/soupmarkets/war/deployed-war-name)
        DEPLOYED_AT=$($LXC exec $CONTAINER_NAME -- cat /opt/soupmarkets/war/deployed-at 2>/dev/null || echo "unknown")
        echo "  Name: $WAR_NAME"
        echo "  Deployed: $DEPLOYED_AT"
    else
        echo -e "  ${YELLOW}No WAR deployed${NC}"
    fi
    echo ""

    # Access URLs
    if [ -n "$CONTAINER_IP" ]; then
        echo -e "${BLUE}Access URLs:${NC}"
        echo "  Backend: http://${CONTAINER_IP}:9090"
        echo "  Health:  http://${CONTAINER_IP}:9090/application/status"
        echo "  API:     http://${CONTAINER_IP}:9090/rest/..."
        echo ""
        echo -e "${BLUE}For SoupFinance vite.config.ts proxy:${NC}"
        echo "  target: 'http://${CONTAINER_IP}:9090'"
        echo ""
    fi
}

do_logs() {
    if [ "$($LXC list $CONTAINER_NAME -c s --format csv 2>/dev/null)" != "RUNNING" ]; then
        echo -e "${RED}Container is not running${NC}"
        exit 1
    fi

    echo -e "${BLUE}SoupMarkets logs (Ctrl+C to stop)...${NC}"
    echo ""
    $LXC exec $CONTAINER_NAME -- tail -f /opt/soupmarkets/logs/soupmarkets.log
}

do_shell() {
    if [ "$($LXC list $CONTAINER_NAME -c s --format csv 2>/dev/null)" != "RUNNING" ]; then
        echo -e "${RED}Container is not running${NC}"
        exit 1
    fi

    echo -e "${BLUE}Opening shell in $CONTAINER_NAME (type 'exit' to leave)...${NC}"
    $LXC exec $CONTAINER_NAME -- bash
}

# Main
case "${1:-status}" in
    start)    do_start ;;
    stop)     do_stop ;;
    restart)  do_restart ;;
    status)   do_status ;;
    logs)     do_logs ;;
    shell)    do_shell ;;
    *)
        print_header
        echo "Usage: $0 [command]"
        echo ""
        echo "Commands:"
        echo "  start     Start backend service"
        echo "  stop      Stop backend service"
        echo "  restart   Restart backend service"
        echo "  status    Show status (default)"
        echo "  logs      Tail application logs"
        echo "  shell     Open shell in container"
        ;;
esac
