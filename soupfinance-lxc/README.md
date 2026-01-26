# SoupFinance LXC Backend

LXC infrastructure for running soupmarkets-web Grails backend to test soupfinance-web E2E tests against real API endpoints.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Host Machine                        │
│  ┌─────────────────┐              ┌───────────────────────┐ │
│  │ soupfinance-web │              │    LXC (lxdbr0)   │ │
│  │ Vite :5173      │──── proxy ──►│                       │ │
│  │                 │   /rest/*    │ ┌───────────────────┐ │ │
│  │                 │   /client/*  │ │ soupfinance-      │ │ │
│  └─────────────────┘              │ │ backend :9090     │ │ │
│                                   │ │ (Grails bootRun)  │ │ │
│                                   │ └───────────────────┘ │ │
│                                   │ ┌───────────────────┐ │ │
│                                   │ │ soupmarkets-      │ │ │
│                                   │ │ mariadb :3306     │ │ │
│                                   │ │ (seeded data)     │ │ │
│                                   │ └───────────────────┘ │ │
│                                   └───────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Prerequisites

1. **LXC test infrastructure** from soupmarkets-web must exist:
   ```bash
   cd ../soupmarkets-web/lxc
   ./setup-lxc.sh              # Creates soupmarkets-test profile
   ./create-base-container.sh  # Creates soupmarkets-test-image
   ./setup-mariadb.sh          # Creates soupmarkets-mariadb container
   ```

2. **soupmarkets-web** project at `/home/ddr/Documents/code/soupmarkets/soupmarkets-web`

## Quick Start

### One-Time Setup

```bash
cd soupfinance-lxc

# Create the backend container
./setup-backend.sh --create

# Seed database with demo data (optional)
./seed-database.sh --seed
```

### Running E2E Tests

```bash
# From soupfinance-web directory
cd ../soupfinance-web

# Run E2E tests with LXC backend
./scripts/run-e2e-with-lxc.sh

# Or run specific tests
./scripts/run-e2e-with-lxc.sh auth

# Run with browser visible
./scripts/run-e2e-with-lxc.sh --headed
```

### Manual Start/Stop

```bash
# Start backend
./setup-backend.sh --start

# Check status
./setup-backend.sh --status

# View logs
./setup-backend.sh --logs

# Stop backend
./setup-backend.sh --stop
```

## Scripts

| Script | Purpose |
|--------|---------|
| `setup-backend.sh` | Main container management (create, start, stop, status, destroy) |
| `get-backend-url.sh` | Output backend URL for scripts |
| `seed-database.sh` | Create and seed database |

## setup-backend.sh Commands

| Command | Description |
|---------|-------------|
| `--create` | Create container from soupmarkets-test-image |
| `--start` | Start container and run Grails bootRun |
| `--stop` | Stop Grails and container |
| `--status` | Show container and Grails health status |
| `--destroy` | Remove container (prompts for confirmation) |
| `--ensure-running` | Idempotent start (creates if needed) |
| `--logs` | Tail Grails bootRun logs |
| `--shell` | Open interactive shell in container |

## seed-database.sh Options

| Option | Description |
|--------|-------------|
| `--seed` | Import demo data (from soupbroker_seed_source or seed-data.sql.gz) |
| `--force` | Force rebuild even if database exists |
| `--apply-migrations` | Apply schema migrations |

## Configuration

| Setting | Value |
|---------|-------|
| Container Name | `soupfinance-backend` |
| Base Image | `soupmarkets-test-image` |
| Grails Port | `9090` |
| Database | `soupbroker_soupfinance` |
| DB User | `soupbroker` |
| DB Password | `soupbroker` |

## Environment Variables (in container)

| Variable | Value |
|----------|-------|
| `JAVA_HOME` | `/usr/lib/jvm/java-17-openjdk-amd64` |
| `SERVER_PORT` | `9090` |
| `DISABLE_2FA` | `true` |
| `DBHOST` | MariaDB container IP |
| `DBPORT` | `3306` |
| `DBUSER` | `soupbroker` |
| `DBPASS` | `soupbroker` |
| `DB_NAME` | `soupbroker_soupfinance` |

## Troubleshooting

### Container won't start

```bash
# Check if base image exists
lxc image list | grep soupmarkets-test-image

# Check if profile exists
lxc profile list | grep soupmarkets-test

# Recreate container
./setup-backend.sh --destroy
./setup-backend.sh --create
```

### Grails won't start

```bash
# Check logs
./setup-backend.sh --logs

# Enter container and debug
./setup-backend.sh --shell
cd /app && ./gradlew bootRun
```

### Database connection issues

```bash
# Check MariaDB is running
lxc list soupmarkets-mariadb

# Start MariaDB if needed
lxc start soupmarkets-mariadb

# Check database exists
lxc exec soupmarkets-mariadb -- mysql -u root -e "SHOW DATABASES;"
```

### E2E tests timeout

1. Wait for Grails startup (~2-3 minutes)
2. Check backend health: `./setup-backend.sh --status`
3. Verify URL: `./get-backend-url.sh`
4. Test endpoint: `curl $(./get-backend-url.sh)/application/status`
