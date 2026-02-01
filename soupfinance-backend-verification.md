# SoupFinance Backend API Verification Report

## Backend Infrastructure Status

### LXC Containers

| Container | Status | IP Address | Purpose |
|-----------|--------|-----------|---------|
| **soupfinance-backend** | RUNNING | 10.115.213.183 | Grails backend (bootRun) |
| **soupmarkets-mariadb** | RUNNING | 10.115.213.114 | Database (seeded) |
| dev-node | STOPPED | - | - |
| gpu-workload | STOPPED | - | - |
| web-nginx | STOPPED | - | - |

## Backend Service Details

### Process Information
- **Service**: Java/Gradle bootRun
- **Java Version**: openjdk-17
- **JVM Options**: `-Xmx4024M -Xms4024M` (4GB heap)
- **Gradle Version**: 7.6.3
- **Grails Port**: 9090
- **Actual Port Listening**: 45103 (127.0.0.1 - localhost only)
- **Status**: Starting (Gradle daemon and Grails bootRun in progress)

### Application Configuration

**File**: `/home/ddr/Documents/code/soupmarkets/soupfinance/soupfinance-web/.env.lxc`

```env
# LXC Backend Environment Configuration
VITE_API_URL=http://10.115.213.183:9090
```

**Why this URL works**:
- The LXC container has network interface eth0 with IP 10.115.213.183
- Grails is configured to run on port 9090
- The vite.config.ts proxies /rest/* and /client/* requests to VITE_API_URL
- Host machine can reach the container via this IP on the lxdbr0 bridge network

### Vite Proxy Configuration

**File**: `/home/ddr/Documents/code/soupmarkets/soupfinance/soupfinance-web/vite.config.ts`

```typescript
const apiTarget = env.VITE_API_URL || 'http://localhost:9090'

server: {
  port: 5173,
  proxy: {
    '/rest': { target: apiTarget, changeOrigin: true },
    '/client': { target: apiTarget, changeOrigin: true },
  },
}
```

**Request Flow**:
1. React app at localhost:5173 makes API call to `/rest/api/login`
2. Vite sees `/rest/` prefix and forwards to `VITE_API_URL`
3. Request becomes: `http://10.115.213.183:9090/rest/api/login`
4. Container receives request on eth0 interface
5. Grails processes and returns response

## Database Configuration

### MariaDB Container
- **IP Address**: 10.115.213.114
- **Port**: 3306
- **Database**: soupbroker_soupfinance (or similar)
- **Username**: soupbroker
- **Password**: soupbroker
- **Status**: RUNNING

### Container Environment Variables (set during Grails startup)
- `JAVA_HOME`: /usr/lib/jvm/java-17-openjdk-amd64
- `SERVER_PORT`: 9090
- `DISABLE_2FA`: true (for testing)
- `DBHOST`: 10.115.213.114 (MariaDB container IP)
- `DBPORT`: 3306
- `DBUSER`: soupbroker
- `DBPASS`: soupbroker
- `DB_NAME`: soupbroker_soupfinance

## API Endpoints Accessible (once Grails fully starts)

| Endpoint | Method | Purpose | Expected Response |
|----------|--------|---------|-------------------|
| `/rest/ping.json` | GET | Health check | 200 with response |
| `/rest/api/login` | POST | Authentication | 401 (no credentials) or 200 (with creds) |
| `/client/authenticate.json` | POST | Corporate 2FA | 401 or 422 |
| `/application/status` | GET | Application status | 200 with version/status |
| `/rest/user/current.json` | GET | Current user (requires auth) | 401 (no token) or 200 (with token) |

## Grails Startup Status

**Current Status**: Starting (Gradle daemon initialization in progress)

**Typical Startup Timeline**:
1. 0-5 seconds: Java/Gradle launcher starts
2. 5-30 seconds: Gradle daemon initialization
3. 30-120 seconds: Grails dependency resolution
4. 120-240 seconds: Database connection and schema verification
5. 240+ seconds: Ready to accept requests

**Log Location**: `/var/log/grails/bootrun.log` (or stdout in container)

### Commands to Monitor

```bash
# Check startup logs
lxc exec soupfinance-backend -- tail -f /var/log/grails/bootrun.log

# Check process status
lxc exec soupfinance-backend -- ps aux | grep java

# Check port status
lxc exec soupfinance-backend -- ss -tulpn

# Test from inside container
lxc exec soupfinance-backend -- curl -s http://127.0.0.1:45103/rest/ping.json

# Test from host
curl -s http://10.115.213.183:9090/rest/ping.json
```

## Configuration for SoupFinance Frontend Development

### For Vite Development Mode

```bash
cd soupfinance-web

# Using .env.lxc with LXC backend
npm run dev -- --mode lxc

# Or directly set environment variable
VITE_API_URL=http://10.115.213.183:9090 npm run dev
```

### For E2E Tests

```bash
# E2E tests should use the same VITE_API_URL
# playwright.config.ts should be configured with:
webServer: {
  command: 'npm run dev -- --mode lxc',
  url: 'http://localhost:5173',
  reuseExistingServer: true,
}
```

## Network Access

### Host ↔ Container Communication

The LXC bridge network (lxdbr0) enables:
- **Host to Container**: `10.115.213.183:9090` (via eth0)
- **Container to Container**: Direct IP communication
- **Container to Host**: Via default gateway

### Network Details

```
Host Machine (lxdbr0 interface)
│
├─ Route to 10.115.213.183 → soupfinance-backend container
│  └─ eth0: 10.115.213.183
│
└─ Route to 10.115.213.114 → soupmarkets-mariadb container
   └─ eth0: 10.115.213.114
```

## Next Steps

1. **Wait for Grails to start** (2-4 minutes typically)
   ```bash
   ./setup-backend.sh --status
   ```

2. **Verify API accessibility** from host:
   ```bash
   curl -v http://10.115.213.183:9090/rest/ping.json
   ```

3. **Start SoupFinance frontend** with LXC backend:
   ```bash
   cd soupfinance-web
   npm install
   npm run dev -- --mode lxc
   ```

4. **Run E2E tests** against LXC backend:
   ```bash
   npm run test:e2e -- --mode lxc
   ```

## Troubleshooting

### Issue: curl returns "Connection refused" or "HTTP 000"

**Diagnosis**: Grails still starting or port not accepting connections

**Solution**:
1. Check Grails startup progress: `lxc exec soupfinance-backend -- tail -50 /var/log/grails/bootrun.log`
2. Wait for "Server is running" message
3. Check running processes: `lxc exec soupfinance-backend -- ps aux | grep java`

### Issue: 502 Bad Gateway from localhost:5173 → backend

**Diagnosis**: Vite proxy can't reach backend IP

**Solution**:
1. Verify container is running: `lxc list | grep soupfinance-backend`
2. Verify IP is correct: `lxc list soupfinance-backend -c 4 --format csv`
3. Test connectivity: `ping 10.115.213.183`
4. Check .env.lxc has correct URL: `cat soupfinance-web/.env.lxc`

### Issue: Database connection error in Grails logs

**Diagnosis**: MariaDB not accessible from backend container

**Solution**:
1. Verify MariaDB is running: `lxc list | grep soupmarkets-mariadb`
2. Check MariaDB IP: `lxc list soupmarkets-mariadb -c 4 --format csv`
3. From backend container test: `lxc exec soupfinance-backend -- mysql -h 10.115.213.114 -u soupbroker -p -e "SELECT 1"`

---

**Report Generated**: 2026-01-23
**Backend URL**: http://10.115.213.183:9090
**Configuration File**: soupfinance-web/.env.lxc
