#!/bin/bash
# SoupFinance Backend LXC Container Management Script
# Usage: ./setup-backend.sh [command]
#
# PURPOSE: Manage an LXC container running the Grails backend for SoupFinance development.
# CONSTRAINTS: Requires soupmarkets-test-image and soupmarkets-mariadb container to exist.
# EXTERNAL: Uses LXC commands, mounts soupmarkets-web project for Grails backend.
#
# Commands:
#   --create         Create container from soupmarkets-test-image, mount soupmarkets-web project
#   --start          Start container and run Grails bootRun on port 9090
#   --stop           Stop Grails and container
#   --status         Show container status and health check
#   --destroy        Remove container
#   --ensure-running Start if not running (idempotent)
#   --logs           Tail Grails bootRun logs
#   --shell          Open interactive shell in container
#
# Examples:
#   ./setup-backend.sh --create        # First time setup
#   ./setup-backend.sh --start         # Start Grails backend
#   ./setup-backend.sh --status        # Check health
#   ./setup-backend.sh --ensure-running # Idempotent start for CI/scripts

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

# Container configuration
CONTAINER_NAME="soupfinance-backend"
IMAGE_NAME="soupmarkets-test-image"
PROFILE_NAME="soupmarkets-test"
MARIADB_CONTAINER="soupmarkets-mariadb"

# Server configuration
SERVER_PORT=9090
DB_NAME="soupbroker_soupfinance"
DB_USER="soupbroker"
DB_PASSWORD="soupbroker"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Added: Print header banner for visibility
print_header() {
    echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║         SoupFinance Backend LXC Management                 ║${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

# Added: Print usage information
print_usage() {
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  --create          Create container from soupmarkets-test-image"
    echo "  --start           Start container and run Grails bootRun"
    echo "  --stop            Stop Grails and container"
    echo "  --status          Show container status and health check"
    echo "  --destroy         Remove container"
    echo "  --ensure-running  Start if not running (idempotent)"
    echo "  --logs            Tail Grails bootRun logs"
    echo "  --shell           Open interactive shell in container"
    echo ""
}

# PURPOSE: Get MariaDB container IP address
# CONSTRAINTS: MariaDB container must be running
get_mariadb_ip() {
    local ip=$($LXC list "$MARIADB_CONTAINER" -c 4 --format csv | cut -d' ' -f1)
    if [ -z "$ip" ]; then
        echo -e "${RED}Error: Could not get MariaDB IP. Is $MARIADB_CONTAINER running?${NC}" >&2
        exit 1
    fi
    echo "$ip"
}

# PURPOSE: Check if container exists
container_exists() {
    $LXC info "$CONTAINER_NAME" &> /dev/null 2>&1
}

# PURPOSE: Check if container is running
container_running() {
    [ "$($LXC list "$CONTAINER_NAME" -c s --format csv 2>/dev/null)" = "RUNNING" ]
}

# PURPOSE: Check if Grails is running inside container
grails_running() {
    if ! container_running; then
        return 1
    fi
    # Check if Java process with Grails is running on port 9090
    $LXC exec "$CONTAINER_NAME" -- pgrep -f "grails.*$SERVER_PORT" &> /dev/null
}

# PURPOSE: Check if Grails server is responding to HTTP requests
grails_healthy() {
    local mariadb_ip=$(get_mariadb_ip)
    local container_ip=$($LXC list "$CONTAINER_NAME" -c 4 --format csv | cut -d' ' -f1)

    if [ -z "$container_ip" ]; then
        return 1
    fi

    # Try to reach Grails health endpoint
    curl -s -o /dev/null -w "%{http_code}" "http://${container_ip}:${SERVER_PORT}/application/status" 2>/dev/null | grep -q "200"
}

# PURPOSE: Wait for MariaDB to be ready
# CONSTRAINTS: Max 30 attempts with 2 second sleep
wait_for_mariadb() {
    echo -e "${BLUE}Waiting for MariaDB to be ready...${NC}"
    local mariadb_ip=$(get_mariadb_ip)
    local max_attempts=30
    local attempt=0

    while [ $attempt -lt $max_attempts ]; do
        if $LXC exec "$MARIADB_CONTAINER" -- mysql -u root -e "SELECT 1" &> /dev/null; then
            echo -e "${GREEN}✓ MariaDB is ready${NC}"
            return 0
        fi
        attempt=$((attempt + 1))
        echo "  Waiting... ($attempt/$max_attempts)"
        sleep 2
    done

    echo -e "${RED}Error: MariaDB did not become ready${NC}"
    return 1
}

# PURPOSE: Ensure database exists for SoupFinance
# CONSTRAINTS: Creates database if it doesn't exist
ensure_database() {
    echo -e "${BLUE}Ensuring database '$DB_NAME' exists...${NC}"

    $LXC exec "$MARIADB_CONTAINER" -- mysql -u root -e "
        CREATE DATABASE IF NOT EXISTS \`$DB_NAME\`;
        GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'%';
        FLUSH PRIVILEGES;
    " 2>/dev/null

    echo -e "${GREEN}✓ Database ready${NC}"
}

# PURPOSE: Create the container from base image
# CONSTRAINTS: Image and profile must exist
do_create() {
    print_header
    echo -e "${BLUE}Creating SoupFinance backend container...${NC}"
    echo ""

    # Check prerequisites
    echo -e "${BLUE}[1/5] Checking prerequisites...${NC}"

    # Check if image exists
    if ! $LXC image info "$IMAGE_NAME" &> /dev/null 2>&1; then
        echo -e "${RED}Error: Base image '$IMAGE_NAME' not found${NC}"
        echo "Run ./create-base-container.sh in soupmarkets-web/lxc/ first"
        exit 1
    fi
    echo -e "${GREEN}✓ Base image found${NC}"

    # Check if profile exists
    if ! $LXC profile show "$PROFILE_NAME" &> /dev/null 2>&1; then
        echo -e "${RED}Error: Profile '$PROFILE_NAME' not found${NC}"
        echo "Run ./setup-lxc.sh in soupmarkets-web/lxc/ first"
        exit 1
    fi
    echo -e "${GREEN}✓ Profile found${NC}"

    # Check if soupmarkets-web directory exists
    if [ ! -d "$SOUPMARKETS_WEB_DIR" ]; then
        echo -e "${RED}Error: soupmarkets-web directory not found at $SOUPMARKETS_WEB_DIR${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ soupmarkets-web directory found${NC}"

    # Check MariaDB container
    if ! $LXC info "$MARIADB_CONTAINER" &> /dev/null 2>&1; then
        echo -e "${RED}Error: MariaDB container '$MARIADB_CONTAINER' not found${NC}"
        echo "Run ./setup-mariadb.sh in soupmarkets-web/lxc/ first"
        exit 1
    fi
    echo -e "${GREEN}✓ MariaDB container exists${NC}"

    # Cleanup existing container if present
    echo -e "${BLUE}[2/5] Cleaning up existing container...${NC}"
    if container_exists; then
        echo -e "${YELLOW}Removing existing container '$CONTAINER_NAME'...${NC}"
        $LXC stop "$CONTAINER_NAME" --force 2>/dev/null || true
        $LXC delete "$CONTAINER_NAME" --force
    fi
    echo -e "${GREEN}✓ Cleanup complete${NC}"

    # Launch container
    echo -e "${BLUE}[3/5] Launching container from $IMAGE_NAME...${NC}"
    $LXC launch "$IMAGE_NAME" "$CONTAINER_NAME" --profile "$PROFILE_NAME"

    # Wait for container to be ready
    sleep 5
    echo -e "${GREEN}✓ Container launched${NC}"

    # Mount soupmarkets-web project directory
    echo -e "${BLUE}[4/5] Mounting soupmarkets-web project...${NC}"
    $LXC config device add "$CONTAINER_NAME" project disk source="$SOUPMARKETS_WEB_DIR" path=/app 2>/dev/null || {
        echo -e "${YELLOW}Note: Project directory may already be mounted${NC}"
    }

    # Wait for mount to be available
    sleep 3
    if $LXC exec "$CONTAINER_NAME" -- test -f /app/gradlew 2>/dev/null; then
        echo -e "${GREEN}✓ Project mounted at /app${NC}"
    else
        echo -e "${YELLOW}Warning: gradlew not found in /app, mount may not be complete${NC}"
    fi

    # Ensure MariaDB is running and database exists
    echo -e "${BLUE}[5/5] Setting up database...${NC}"
    if [ "$($LXC list "$MARIADB_CONTAINER" -c s --format csv)" != "RUNNING" ]; then
        echo -e "${YELLOW}Starting MariaDB container...${NC}"
        $LXC start "$MARIADB_CONTAINER" 2>/dev/null || true
        sleep 5
    fi

    wait_for_mariadb
    ensure_database

    echo ""
    echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║         Container Created Successfully!                      ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "Container: $CONTAINER_NAME"
    echo "Project mount: /app"
    echo "Database: $DB_NAME"
    echo ""
    echo "Next step: Run './setup-backend.sh --start' to start Grails"
    echo ""
}

# PURPOSE: Start Grails bootRun in the container
# CONSTRAINTS: Container must exist, MariaDB must be running
do_start() {
    print_header
    echo -e "${BLUE}Starting SoupFinance backend...${NC}"
    echo ""

    # Check container exists
    if ! container_exists; then
        echo -e "${RED}Error: Container '$CONTAINER_NAME' does not exist${NC}"
        echo "Run './setup-backend.sh --create' first"
        exit 1
    fi

    # Start container if not running
    if ! container_running; then
        echo -e "${YELLOW}Starting container...${NC}"
        $LXC start "$CONTAINER_NAME"
        sleep 5
    fi
    echo -e "${GREEN}✓ Container running${NC}"

    # Ensure MariaDB is running
    if [ "$($LXC list "$MARIADB_CONTAINER" -c s --format csv)" != "RUNNING" ]; then
        echo -e "${YELLOW}Starting MariaDB container...${NC}"
        $LXC start "$MARIADB_CONTAINER" 2>/dev/null || true
        sleep 5
    fi

    wait_for_mariadb
    ensure_database

    # Get MariaDB IP
    local mariadb_ip=$(get_mariadb_ip)
    echo "MariaDB IP: $mariadb_ip"

    # Check if Grails is already running
    if grails_running; then
        echo -e "${YELLOW}Grails is already running${NC}"
        do_status
        return 0
    fi

    # Start Grails bootRun in background
    echo -e "${BLUE}Starting Grails bootRun on port $SERVER_PORT...${NC}"
    echo "This may take a few minutes for initial startup..."
    echo ""

    # Create log directory
    $LXC exec "$CONTAINER_NAME" -- mkdir -p /var/log/grails

    # Start Grails with environment variables
    # NOTE: Using Java 17 for runtime (bootRun requires 17+)
    # Changed: Use separate GRADLE_USER_HOME to avoid permission issues with mounted project
    $LXC exec "$CONTAINER_NAME" -- bash -c "
        cd /app

        # Set environment variables
        export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
        export PATH=\$JAVA_HOME/bin:\$PATH
        export SERVER_PORT=$SERVER_PORT
        export DISABLE_2FA=true
        export DBHOST=$mariadb_ip
        export DBPORT=3306
        export DBUSER=$DB_USER
        export DBPASS=$DB_PASSWORD
        export DB_NAME=$DB_NAME

        # Changed: Use separate writable Gradle home to avoid permission issues
        export GRADLE_USER_HOME=/opt/gradle-home

        # Source additional environment variables if available
        [ -f env-variables.sh ] && source env-variables.sh

        # Override database settings for soupfinance
        export DBHOST=$mariadb_ip
        export DB_NAME=$DB_NAME

        # Start Grails in background with nohup
        # Added: --project-cache-dir for writable project cache
        nohup ./gradlew bootRun --console=plain \\
            --project-cache-dir=/opt/gradle-home/project-cache \\
            -Dserver.port=$SERVER_PORT \\
            > /var/log/grails/bootrun.log 2>&1 &

        echo \$! > /var/run/grails.pid
        echo \"Grails started with PID \$(cat /var/run/grails.pid)\"
    "

    echo ""
    echo -e "${GREEN}✓ Grails bootRun started${NC}"
    echo ""
    echo "Grails is starting in the background."
    echo "Logs: ./setup-backend.sh --logs"
    echo "Status: ./setup-backend.sh --status"
    echo ""
    echo "Wait ~2-3 minutes for full startup, then access:"
    echo "  http://localhost:$SERVER_PORT"
    echo ""

    # Get container IP for direct access
    local container_ip=$($LXC list "$CONTAINER_NAME" -c 4 --format csv | cut -d' ' -f1)
    echo "Container IP: $container_ip"
    echo "Direct access: http://${container_ip}:${SERVER_PORT}"
    echo ""
}

# PURPOSE: Stop Grails and container
do_stop() {
    print_header
    echo -e "${BLUE}Stopping SoupFinance backend...${NC}"
    echo ""

    if ! container_exists; then
        echo -e "${YELLOW}Container '$CONTAINER_NAME' does not exist${NC}"
        return 0
    fi

    if container_running; then
        # Kill Grails process first
        echo -e "${YELLOW}Stopping Grails process...${NC}"
        $LXC exec "$CONTAINER_NAME" -- bash -c "
            if [ -f /var/run/grails.pid ]; then
                PID=\$(cat /var/run/grails.pid)
                kill \$PID 2>/dev/null || true
                rm -f /var/run/grails.pid
            fi
            # Also kill any remaining Java/Gradle processes
            pkill -f 'gradlew.*bootRun' 2>/dev/null || true
            pkill -f 'grails' 2>/dev/null || true
        " 2>/dev/null || true

        echo -e "${YELLOW}Stopping container...${NC}"
        $LXC stop "$CONTAINER_NAME" --force
    fi

    echo -e "${GREEN}✓ Backend stopped${NC}"
}

# PURPOSE: Show container and Grails status
do_status() {
    print_header
    echo -e "${BLUE}SoupFinance Backend Status${NC}"
    echo ""

    # Container status
    echo -e "${BLUE}Container:${NC}"
    if container_exists; then
        if container_running; then
            echo -e "  Status: ${GREEN}RUNNING${NC}"
            local container_ip=$($LXC list "$CONTAINER_NAME" -c 4 --format csv | cut -d' ' -f1)
            echo "  IP: $container_ip"
        else
            echo -e "  Status: ${YELLOW}STOPPED${NC}"
        fi
    else
        echo -e "  Status: ${RED}NOT CREATED${NC}"
        echo ""
        echo "Run './setup-backend.sh --create' to create the container"
        return 1
    fi

    echo ""

    # MariaDB status
    echo -e "${BLUE}MariaDB:${NC}"
    if $LXC info "$MARIADB_CONTAINER" &> /dev/null 2>&1; then
        if [ "$($LXC list "$MARIADB_CONTAINER" -c s --format csv)" = "RUNNING" ]; then
            local mariadb_ip=$(get_mariadb_ip)
            echo -e "  Status: ${GREEN}RUNNING${NC}"
            echo "  IP: $mariadb_ip"

            # Check database exists
            local db_exists=$($LXC exec "$MARIADB_CONTAINER" -- mysql -u root -N -e \
                "SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name='$DB_NAME'" 2>/dev/null || echo "0")
            if [ "$db_exists" = "1" ]; then
                echo -e "  Database '$DB_NAME': ${GREEN}EXISTS${NC}"
            else
                echo -e "  Database '$DB_NAME': ${YELLOW}NOT FOUND${NC}"
            fi
        else
            echo -e "  Status: ${YELLOW}STOPPED${NC}"
        fi
    else
        echo -e "  Status: ${RED}NOT CREATED${NC}"
    fi

    echo ""

    # Grails status (only if container is running)
    echo -e "${BLUE}Grails:${NC}"
    if container_running; then
        if grails_running; then
            echo -e "  Process: ${GREEN}RUNNING${NC}"

            # Try health check
            if grails_healthy; then
                echo -e "  HTTP: ${GREEN}HEALTHY${NC}"
            else
                echo -e "  HTTP: ${YELLOW}NOT RESPONDING (may still be starting)${NC}"
            fi

            local container_ip=$($LXC list "$CONTAINER_NAME" -c 4 --format csv | cut -d' ' -f1)
            echo "  URL: http://${container_ip}:${SERVER_PORT}"

            # Show recent log lines
            echo ""
            echo -e "${BLUE}Recent logs:${NC}"
            $LXC exec "$CONTAINER_NAME" -- tail -5 /var/log/grails/bootrun.log 2>/dev/null || echo "  No logs available"
        else
            echo -e "  Process: ${YELLOW}NOT RUNNING${NC}"
        fi
    else
        echo -e "  Process: ${YELLOW}CONTAINER STOPPED${NC}"
    fi

    echo ""
}

# PURPOSE: Destroy container completely
do_destroy() {
    print_header
    echo -e "${YELLOW}Destroying SoupFinance backend container...${NC}"
    echo ""

    if ! container_exists; then
        echo -e "${YELLOW}Container '$CONTAINER_NAME' does not exist${NC}"
        return 0
    fi

    # Confirm destruction
    read -p "This will permanently delete the container. Continue? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted."
        exit 0
    fi

    # Stop if running
    if container_running; then
        echo -e "${YELLOW}Stopping container...${NC}"
        $LXC stop "$CONTAINER_NAME" --force 2>/dev/null || true
    fi

    # Delete container
    echo -e "${YELLOW}Deleting container...${NC}"
    $LXC delete "$CONTAINER_NAME" --force

    echo -e "${GREEN}✓ Container destroyed${NC}"
    echo ""
    echo "Note: Database '$DB_NAME' in MariaDB was NOT deleted."
    echo "To delete database manually:"
    echo "  $LXC exec $MARIADB_CONTAINER -- mysql -u root -e 'DROP DATABASE $DB_NAME;'"
}

# PURPOSE: Ensure container is running (idempotent)
do_ensure_running() {
    if ! container_exists; then
        echo -e "${YELLOW}Container does not exist. Creating...${NC}"
        do_create
    fi

    if ! container_running; then
        do_start
    elif ! grails_running; then
        echo -e "${YELLOW}Container running but Grails not started. Starting Grails...${NC}"
        do_start
    else
        echo -e "${GREEN}✓ Backend is already running${NC}"
        do_status
    fi
}

# PURPOSE: Tail Grails logs
do_logs() {
    if ! container_running; then
        echo -e "${RED}Error: Container is not running${NC}"
        exit 1
    fi

    echo -e "${BLUE}Tailing Grails logs (Ctrl+C to stop)...${NC}"
    echo ""
    $LXC exec "$CONTAINER_NAME" -- tail -f /var/log/grails/bootrun.log 2>/dev/null || {
        echo -e "${YELLOW}No logs available yet${NC}"
    }
}

# PURPOSE: Open shell in container
do_shell() {
    if ! container_running; then
        echo -e "${RED}Error: Container is not running${NC}"
        exit 1
    fi

    echo -e "${BLUE}Opening shell in $CONTAINER_NAME...${NC}"
    echo "Type 'exit' to leave"
    echo ""
    $LXC exec "$CONTAINER_NAME" -- bash
}

# Main command parsing
case "${1:-}" in
    --create)
        do_create
        ;;
    --start)
        do_start
        ;;
    --stop)
        do_stop
        ;;
    --status)
        do_status
        ;;
    --destroy)
        do_destroy
        ;;
    --ensure-running)
        do_ensure_running
        ;;
    --logs)
        do_logs
        ;;
    --shell)
        do_shell
        ;;
    --help|-h|"")
        print_header
        print_usage
        ;;
    *)
        echo -e "${RED}Unknown command: $1${NC}"
        print_usage
        exit 1
        ;;
esac
