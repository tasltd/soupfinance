# SoupFinance Backend API - Quick Start Guide

## TL;DR

The Grails backend is running in LXC container `soupfinance-backend` at `10.115.213.183:9090`

### Start Frontend with LXC Backend
```bash
cd soupfinance-web
npm run dev -- --mode lxc
```

This automatically uses the `.env.lxc` configuration which points to the LXC backend.

---

## Configuration Files

### .env.lxc (Created)
```
VITE_API_URL=http://10.115.213.183:9090
```

This file tells Vite to proxy API calls to the LXC backend container.

### vite.config.ts (Already Configured)
```typescript
const apiTarget = env.VITE_API_URL || 'http://localhost:9090'

proxy: {
  '/rest': { target: apiTarget, changeOrigin: true },
  '/client': { target: apiTarget, changeOrigin: true },
}
```

---

## Containers

| Container | IP | Port | Status |
|-----------|----|----|--------|
| soupfinance-backend | 10.115.213.183 | 9090 | RUNNING (Grails) |
| soupmarkets-mariadb | 10.115.213.114 | 3306 | RUNNING (Database) |

---

## Development Commands

### Frontend Development
```bash
cd soupfinance-web

# Option 1: Using .env.lxc (recommended)
npm run dev -- --mode lxc

# Option 2: Direct env var
VITE_API_URL=http://10.115.213.183:9090 npm run dev

# Starts on http://localhost:5173
```

### E2E Testing
```bash
npm run test:e2e -- --mode lxc
```

### Backend Status
```bash
cd soupfinance-lxc
./setup-backend.sh --status
./setup-backend.sh --logs
```

---

## Request Flow

```
Browser (localhost:5173)
    ↓ API call: /rest/api/login
    ↓
Vite Dev Server
    ↓ Proxy intercepts /rest/* prefix
    ↓
LXC Backend (10.115.213.183:9090)
    ↓ Grails processes request
    ↓
MariaDB (10.115.213.114:3306)
```

---

## Key Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/rest/ping.json` | GET | Health check |
| `/rest/api/login` | POST | User login |
| `/rest/user/current.json` | GET | Current user (requires auth) |
| `/client/authenticate.json` | POST | Corporate authentication |
| `/application/status` | GET | App status |

---

## Test from Host

```bash
# Wait for startup (first time ~3-5 minutes)
cd soupfinance-lxc
./setup-backend.sh --status

# Test connectivity
curl http://10.115.213.183:9090/rest/ping.json

# Test from inside container
lxc exec soupfinance-backend -- curl http://127.0.0.1:45103/rest/ping.json
```

---

## Common Issues

### Backend not responding
- Wait 3-5 minutes (first startup is slow)
- Check: `cd soupfinance-lxc && ./setup-backend.sh --logs`
- Container running: `lxc list soupfinance-backend`

### Frontend shows 502 Bad Gateway
- Verify container IP: `lxc list soupfinance-backend -c 4`
- Check .env.lxc has correct URL
- Test connectivity: `ping 10.115.213.183`

### Database connection error
- Check MariaDB running: `lxc list soupmarkets-mariadb`
- Verify IP: `lxc list soupmarkets-mariadb -c 4`

---

## Files

- **Configuration**: `soupfinance-web/.env.lxc`
- **Documentation**: `soupfinance-backend-verification.md`
- **Vite Config**: `soupfinance-web/vite.config.ts`
- **Backend Scripts**: `soupfinance-lxc/setup-backend.sh`

---

## Links

- Backend Container: `http://10.115.213.183:9090`
- Frontend Dev Server: `http://localhost:5173`
- MariaDB: `10.115.213.114:3306`
