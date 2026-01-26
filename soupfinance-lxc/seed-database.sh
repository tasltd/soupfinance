#!/bin/bash
# Seed Database for SoupFinance LXC Tests
# PURPOSE: Create and seed the soupfinance database in soupmarkets-mariadb container
# CONSTRAINTS: Requires soupmarkets-mariadb container to be running
# EXTERNAL: Uses seed data from soupmarkets-web/docker/seed-data.sql.gz
#
# Usage: ./seed-database.sh [OPTIONS]
#
# OPTIONS:
#   --seed          Seed with data from soupbroker_seed_source or import from seed-data.sql.gz
#   --force         Force rebuild even if database exists
#   --apply-migrations  Apply migration scripts from soupmarkets-web/lxc/migrations/
#
# Without --seed: Creates empty database (GORM creates schema from domain classes)
# With --seed: Clones from cached source or imports seed-data.sql.gz

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
# NOTE: soupmarkets-web is sibling to soupfinance in the soupmarkets directory
SOUPMARKETS_WEB_DIR="$(dirname "$SCRIPT_DIR")/../soupmarkets-web"
DOCKER_DIR="$SOUPMARKETS_WEB_DIR/docker"
MIGRATIONS_DIR="$SOUPMARKETS_WEB_DIR/lxc/migrations"

MARIADB_CONTAINER="soupmarkets-mariadb"
SEED_FILE="$DOCKER_DIR/seed-data.sql.gz"

# Database configuration
DB_NAME="soupbroker_soupfinance"
DB_USER="soupbroker"
DB_PASSWORD="soupbroker"

# Source database (used by soupmarkets-web seed-databases-optimized.sh)
SOURCE_DB="soupbroker_seed_source"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Parse arguments
SEED_DATA=false
FORCE_REBUILD=false
APPLY_MIGRATIONS=false

for arg in "$@"; do
    case $arg in
        --seed)
            SEED_DATA=true
            ;;
        --force)
            FORCE_REBUILD=true
            ;;
        --apply-migrations)
            APPLY_MIGRATIONS=true
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "OPTIONS:"
            echo "  --seed              Seed database with data"
            echo "  --force             Force rebuild even if database exists"
            echo "  --apply-migrations  Apply migration scripts after seeding"
            echo "  --help, -h          Show this help message"
            exit 0
            ;;
    esac
done

echo -e "${BLUE}======================================================${NC}"
echo -e "${BLUE}  SoupFinance Database Setup${NC}"
echo -e "${BLUE}======================================================${NC}"
echo ""

# Added: Verify MariaDB container is running
if ! $LXC info "$MARIADB_CONTAINER" &>/dev/null; then
    echo -e "${RED}Error: MariaDB container '$MARIADB_CONTAINER' does not exist${NC}"
    echo "Create it with: cd $SOUPMARKETS_WEB_DIR/$LXC && ./setup-mariadb.sh"
    exit 1
fi

CONTAINER_STATUS=$($LXC list "$MARIADB_CONTAINER" -c s --format csv)
if [ "$CONTAINER_STATUS" != "RUNNING" ]; then
    echo -e "${RED}Error: MariaDB container is not running (status: $CONTAINER_STATUS)${NC}"
    echo "Start it with: $LXC start $MARIADB_CONTAINER"
    exit 1
fi

# Added: Get MariaDB container IP for connection info
MARIADB_IP=$($LXC list "$MARIADB_CONTAINER" -c 4 --format csv | cut -d' ' -f1)
echo -e "${GREEN}MariaDB container IP: $MARIADB_IP${NC}"
echo ""

# Added: Check if database already exists
DB_EXISTS=$($LXC exec "$MARIADB_CONTAINER" -- mysql -u root -N -e \
    "SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name='$DB_NAME'" 2>/dev/null || echo "0")

if [ "$DB_EXISTS" -gt 0 ] && [ "$FORCE_REBUILD" = false ]; then
    TABLE_COUNT=$($LXC exec "$MARIADB_CONTAINER" -- mysql -u root -N -e \
        "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$DB_NAME'" 2>/dev/null || echo "0")
    echo -e "${YELLOW}Database '$DB_NAME' already exists with $TABLE_COUNT tables${NC}"
    echo "Use --force to rebuild"
    echo ""
    echo "Connection details:"
    echo "  Host: $MARIADB_IP"
    echo "  Port: 3306"
    echo "  Database: $DB_NAME"
    echo "  User: $DB_USER"
    echo "  Password: $DB_PASSWORD"
    exit 0
fi

# Added: Create database and grant privileges
echo -e "${BLUE}[1/4] Creating database '$DB_NAME'...${NC}"

$LXC exec "$MARIADB_CONTAINER" -- mysql -u root -e "
    DROP DATABASE IF EXISTS \`$DB_NAME\`;
    CREATE DATABASE \`$DB_NAME\`;
    GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'%';
    FLUSH PRIVILEGES;
" 2>/dev/null

echo -e "${GREEN}Database '$DB_NAME' created${NC}"

# Added: Handle seeding if requested
if [ "$SEED_DATA" = true ]; then
    echo -e "${BLUE}[2/4] Seeding database with data...${NC}"

    # Check if source database exists (cached from soupmarkets-web seeding)
    SOURCE_EXISTS=$($LXC exec "$MARIADB_CONTAINER" -- mysql -u root -N -e \
        "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$SOURCE_DB'" 2>/dev/null || echo "0")

    if [ "$SOURCE_EXISTS" -gt 300 ]; then
        # Clone from existing source database (FAST PATH)
        echo -e "${GREEN}Found cached source database '$SOURCE_DB' with $SOURCE_EXISTS tables${NC}"
        echo "  Cloning from source database..."

        # Added: Clone using mysqldump pipe with optimized flags
        # --ignore-table: Skip large tables not needed for testing (audit_log, flow, api_log)
        $LXC exec "$MARIADB_CONTAINER" -- bash -c "
            mysqldump -u $DB_USER -p$DB_PASSWORD --single-transaction --quick --routines --triggers --extended-insert --disable-keys \
                --ignore-table=$SOURCE_DB.audit_log \
                --ignore-table=$SOURCE_DB.flow \
                --ignore-table=$SOURCE_DB.api_log \
                $SOURCE_DB 2>/dev/null | mysql -u $DB_USER -p$DB_PASSWORD $DB_NAME 2>/dev/null
        "

        # Added: Copy schema only for excluded tables (GORM needs tables to exist)
        echo "  Copying schema for excluded tables..."
        $LXC exec "$MARIADB_CONTAINER" -- bash -c "
            mysqldump -u $DB_USER -p$DB_PASSWORD --no-data --single-transaction \
                $SOURCE_DB audit_log flow api_log 2>/dev/null | mysql -u $DB_USER -p$DB_PASSWORD $DB_NAME 2>/dev/null
        " 2>/dev/null || true

        echo -e "${GREEN}Database cloned from source${NC}"
    else
        # Import from seed file (SLOW PATH)
        echo -e "${YELLOW}Source database not found, importing from seed file...${NC}"

        if [ ! -f "$SEED_FILE" ]; then
            echo -e "${RED}Error: Seed file not found: $SEED_FILE${NC}"
            echo ""
            echo "Either:"
            echo "  1. Run soupmarkets-web seeding first: cd $SOUPMARKETS_WEB_DIR/$LXC && ./seed-databases-optimized.sh"
            echo "  2. Create seed file: mysqldump -u soupbroker -p soupbroker | gzip > $SEED_FILE"
            exit 1
        fi

        echo "  Seed file found: $(du -h "$SEED_FILE" | cut -f1)"

        # Added: Get host IP for file transfer via netcat
        HOST_IP=$(ip -4 addr show lxdbr0 | grep -oP '(?<=inet\s)\d+(\.\d+){3}')

        echo "  Transferring seed file to container..."
        nc -l -p 9999 < "$SEED_FILE" &
        NC_PID=$!
        sleep 1
        $LXC exec "$MARIADB_CONTAINER" -- bash -c "nc $HOST_IP 9999 > /tmp/seed-data.sql.gz" 2>/dev/null
        kill $NC_PID 2>/dev/null || true

        # Verify transfer
        SEED_SIZE=$($LXC exec "$MARIADB_CONTAINER" -- stat -c%s /tmp/seed-data.sql.gz 2>/dev/null || echo "0")
        if [ "$SEED_SIZE" -lt 1000000 ]; then
            echo -e "${RED}Error: Seed file transfer failed (size: $SEED_SIZE bytes)${NC}"
            exit 1
        fi
        echo "  Seed file transferred ($(($SEED_SIZE / 1024 / 1024))MB)"

        echo "  Importing seed data (this may take several minutes)..."
        $LXC exec "$MARIADB_CONTAINER" -- bash -c "zcat /tmp/seed-data.sql.gz | mysql -u $DB_USER -p$DB_PASSWORD $DB_NAME" 2>/dev/null

        # Cleanup
        $LXC exec "$MARIADB_CONTAINER" -- rm -f /tmp/seed-data.sql.gz

        echo -e "${GREEN}Seed data imported${NC}"
    fi

    # Added: Always enable migrations when seeding
    APPLY_MIGRATIONS=true
else
    echo -e "${BLUE}[2/4] Skipping seed (database will be empty, GORM creates schema)${NC}"
fi

# Added: Apply migrations if requested
if [ "$APPLY_MIGRATIONS" = true ]; then
    echo -e "${BLUE}[3/4] Applying schema migrations...${NC}"

    if [ -d "$MIGRATIONS_DIR" ] && [ "$(ls -A "$MIGRATIONS_DIR"/*.sql 2>/dev/null)" ]; then
        HOST_IP=$(ip -4 addr show lxdbr0 | grep -oP '(?<=inet\s)\d+(\.\d+){3}')

        # Transfer and apply each migration file
        for MIGRATION in "$MIGRATIONS_DIR"/*.sql; do
            MIGRATION_NAME=$(basename "$MIGRATION")
            echo "  Applying $MIGRATION_NAME..."

            # Transfer via netcat
            nc -l -p 9998 < "$MIGRATION" &
            NC_PID=$!
            sleep 1
            $LXC exec "$MARIADB_CONTAINER" -- bash -c "nc $HOST_IP 9998 > /tmp/$MIGRATION_NAME" 2>/dev/null
            kill $NC_PID 2>/dev/null || true

            # Apply migration
            $LXC exec "$MARIADB_CONTAINER" -- bash -c "mysql -u $DB_USER -p$DB_PASSWORD $DB_NAME < /tmp/$MIGRATION_NAME" 2>&1 | grep -v "Warning" || true

            # Cleanup
            $LXC exec "$MARIADB_CONTAINER" -- rm -f "/tmp/$MIGRATION_NAME"
        done

        echo -e "${GREEN}Migrations applied${NC}"
    else
        echo -e "${YELLOW}No migration files found in $MIGRATIONS_DIR${NC}"
    fi
else
    echo -e "${BLUE}[3/4] Skipping migrations${NC}"
fi

# Added: Verify final state
echo -e "${BLUE}[4/4] Verifying database...${NC}"
TABLE_COUNT=$($LXC exec "$MARIADB_CONTAINER" -- mysql -u $DB_USER -p$DB_PASSWORD -N -e \
    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$DB_NAME'" 2>/dev/null || echo "0")

echo ""
echo -e "${GREEN}======================================================${NC}"
echo -e "${GREEN}  SoupFinance Database Ready!${NC}"
echo -e "${GREEN}======================================================${NC}"
echo ""
echo "Database: $DB_NAME"
echo "Tables: $TABLE_COUNT"
echo ""
echo "Connection details:"
echo "  Host: $MARIADB_IP"
echo "  Port: 3306"
echo "  Database: $DB_NAME"
echo "  User: $DB_USER"
echo "  Password: $DB_PASSWORD"
echo ""
echo "To connect:"
echo "  mysql -h $MARIADB_IP -u $DB_USER -p$DB_PASSWORD $DB_NAME"
echo ""
