# SoupFinance Backend (LXC)

Local development backend for SoupFinance React app, running the Soupmarkets WAR in an LXC container.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Host Machine                                                 │
│  ┌──────────────────┐    ┌─────────────────────────────────┐ │
│  │ soupfinance-web  │    │ soupmarkets-web                 │ │
│  │ React + Vite     │    │ Grails (builds WAR)             │ │
│  │ Port 5173        │    │                                 │ │
│  └───────┬──────────┘    └─────────────┬───────────────────┘ │
│          │                              │                     │
│          │ Proxy                        │ ./gradlew bootWar   │
│          │ /rest/* → 9090               │                     │
│          │                              ▼                     │
│          │                 ┌───────────────────────┐         │
│          │                 │ build/libs/*.war      │         │
│          │                 └───────────┬───────────┘         │
│          │                              │                     │
│          │                              │ deploy-war.sh       │
│          ▼                              ▼                     │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ LXC: soupfinance-backend                              │ │
│  │ ┌─────────────────────────────────────────────────────┐ │ │
│  │ │ Java 21 (Temurin) + Spring Boot Embedded Tomcat     │ │ │
│  │ │ Port 9090 → ROOT.war                                │ │ │
│  │ │ systemd: soupmarkets.service                        │ │ │
│  │ └─────────────────────────────────────────────────────┘ │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                │                              │
│                                │ JDBC                         │
│                                ▼                              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ LXC: soupmarkets-mariadb                              │ │
│  │ Database: soupbroker_soupfinance                        │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Start the backend

```bash
cd soupfinance/backend
./tomcat-control.sh start
```

### 2. Check status

```bash
./tomcat-control.sh status
```

### 3. Run the React app against LXC backend

```bash
cd soupfinance-web
npm run dev -- --mode lxc
```

## Commands

### Backend Control (`./tomcat-control.sh`)

| Command | Description |
|---------|-------------|
| `start` | Start the backend service |
| `stop` | Stop the backend service |
| `restart` | Restart the backend service |
| `status` | Show backend status and IPs |
| `logs` | Tail application logs (Ctrl+C to stop) |
| `shell` | Open shell in the container |

### Deploy New WAR (`./deploy-war.sh`)

Copies the latest WAR from soupmarkets-web and deploys it:

```bash
# Deploy without restart (hot deploy)
./deploy-war.sh

# Deploy and restart service
./deploy-war.sh --restart

# Force redeploy even if checksum matches
./deploy-war.sh --force
```

### Build and Deploy from soupmarkets-web

```bash
cd ../soupmarkets-web

# Build WAR only
./gradlew bootWar

# Build and deploy to soupfinance LXC
./gradlew assembleDeployToSoupfinance
```

## Configuration

### Container IPs (Dynamic)

Container IPs are assigned by LXC and may change after restart. Run `./tomcat-control.sh status` to get current IPs.

### Environment Variables (.env.lxc)

Update `soupfinance-web/.env.lxc` with the current backend IP:

```bash
VITE_API_URL=http://<backend-ip>:9090
```

### Database

Uses MariaDB container `soupmarkets-mariadb` with database `soupbroker_soupfinance`. Connection settings are configured in the systemd service.

## Troubleshooting

### Backend not responding

```bash
# Check service status
./tomcat-control.sh status

# Check logs for errors
./tomcat-control.sh logs

# Restart if needed
./tomcat-control.sh restart
```

### Container IP changed

If the container IP changes after host reboot:

```bash
# Get new IP
./tomcat-control.sh status

# Update .env.lxc
vim ../soupfinance-web/.env.lxc
```

### Service won't start

```bash
# Check if containers are running
lxc list

# Start MariaDB first if needed
lxc start soupmarkets-mariadb

# Then start backend
./tomcat-control.sh start
```

### WAR deployment issues

```bash
# Check WAR exists
ls -la ../../soupmarkets-web/build/libs/*.war

# Rebuild WAR if needed
cd ../../soupmarkets-web
source env-variables.sh
./gradlew bootWar

# Force redeploy
cd ../soupfinance/backend
./deploy-war.sh --force --restart
```

## REST API Authentication

The backend uses token-based authentication via Spring Security REST plugin.

### Login

```bash
# POST /rest/api/login with JSON credentials
curl -X POST "http://<backend-ip>:9090/rest/api/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"soup.support","password":"secret"}'

# Response:
# {"username":"soup.support","roles":["ROLE_ADMIN","ROLE_USER"],"access_token":"<token>"}
```

### Authenticated Requests

Use the `X-Auth-Token` header for all authenticated requests:

```bash
curl -H "X-Auth-Token: <token>" -H "Accept: application/json" \
  "http://<backend-ip>:9090/rest/finance/invoice/index.json"
```

### API Endpoints

| Module | Endpoint Pattern | Example |
|--------|------------------|---------|
| Auth | `/rest/api/login` | Login to get token |
| Invoice | `/rest/finance/invoice/*` | Invoice CRUD |
| Bill | `/rest/finance/bill/*` | Bill CRUD |
| Vendor | `/rest/vendor/*` | Vendor CRUD |
| Ledger | `/rest/finance/ledgerAccount/*` | Chart of Accounts |
| Transactions | `/rest/finance/ledgerTransaction/*` | GL Entries |
| User | `/rest/sbUser/index.json?sort=id` | User list (use sort=id) |

**Note**: The `/rest/sbUser/index.json` endpoint requires `?sort=id` parameter because the default `dateCreated` sort is not available for the SbUser domain.

## Test Users

| Username | Password | Roles | Use Case |
|----------|----------|-------|----------|
| test.admin | secret | ROLE_ADMIN, ROLE_USER | Full admin access (integration tests) |
| test.user | secret | ROLE_USER | Minimal user (permission tests) |
| test.finance | secret | ROLE_USER + Finance roles* | Finance CRUD testing |
| soup.support | secret | ROLE_ADMIN, ROLE_USER | Legacy admin (seed data) |
| admin | secret | ROLE_ADMIN, ROLE_USER | Legacy admin (seed data) |

*Finance roles: ROLE_INVOICE, ROLE_BILL, ROLE_LEDGER_TRANSACTION, ROLE_VENDOR, ROLE_FINANCE_REPORTS, ROLE_LEDGER_ACCOUNT, ROLE_VOUCHER

## Database

### Connection Details

| Property | Value |
|----------|-------|
| Host | soupmarkets-mariadb container (10.115.213.114) |
| Database | soupbroker_soupfinance |
| User | soupbroker |
| Password | soupbroker123! |

### Seed Data

The database includes:
- Test tenant (id=1, name='SoupFinance')
- Test users (soup.support, admin)
- Roles (ROLE_ADMIN, ROLE_USER, etc.)
- Payment methods
- Ledger account categories

To reseed the database:
```bash
lxc file push /tmp/seed-soupfinance.sql soupmarkets-mariadb/tmp/
lxc exec soupmarkets-mariadb -- mysql -u root < /tmp/seed-soupfinance.sql
```

## Files

| File | Purpose |
|------|---------|
| `deploy-war.sh` | Deploy WAR from soupmarkets-web to LXC container |
| `tomcat-control.sh` | Start/stop/status/logs for the backend service |
| `README.md` | This documentation |
