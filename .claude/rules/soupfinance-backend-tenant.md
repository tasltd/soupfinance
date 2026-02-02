# SoupFinance Backend Tenant Configuration

## CRITICAL: Backend Tenant

SoupFinance uses the **Tech At Scale (TAS)** tenant in soupmarkets-web.

| Property | Value |
|----------|-------|
| **Tenant Name** | Tech At Scale |
| **Backend URL** | https://tas.soupmarkets.com |
| **Tenant Code** | TAS |
| **Database** | soupbroker (TAS tenant schema) |

## API Endpoints

### Public Endpoints (Unauthenticated)

| Endpoint | Purpose |
|----------|---------|
| `POST /account/register.json` | Creates Account + Agent + SbUser (tenant-isolated) |
| `POST /account/confirmEmail.json` | Sets password and enables user after email verification |

### Authenticated Endpoints
These endpoints require `X-Auth-Token` header:

| Endpoint | Purpose |
|----------|---------|
| `POST /rest/corporate/save.json` | Admin: Create corporate (requires ROLE_ADMIN) |
| `GET /rest/corporate/show/:id.json` | View corporate details |
| `PUT /rest/corporate/update/:id.json` | Update corporate |

## Registration Flow (Tenant-per-Account)

1. **New Tenant Registration**: `POST /account/register.json` (creates Account + Agent + SbUser)
2. **Email Confirmation**: User clicks link in email, then `POST /account/confirmEmail.json` sets password
3. **Login**: Standard login with credentials
4. **After Login**: All endpoints use `/rest/*` with X-Auth-Token

**Note:** This creates a NEW tenant (Account) for each customer, NOT a Corporate entity in a shared tenant.

## API Consumer Credentials

For API integration testing:

| Environment | Credentials Location |
|-------------|---------------------|
| Development | `.env.test` in soupfinance-web |
| LXC Backend | `soupfinance-lxc/seed-database.sh` creates test users |
| Production | Managed in tas.soupmarkets.com admin panel |

## Production Server Logs

### Log Locations on 140.82.32.141

| Log | Path | Purpose |
|-----|------|---------|
| **SoupFinance Apache Access** | `/var/log/apache2/app.soupfinance.com-access.log` | Frontend requests |
| **SoupFinance Apache Error** | `/var/log/apache2/app.soupfinance.com-error.log` | Apache/proxy errors |
| **Tomcat Catalina** | `/root/tomcat9078/logs/catalina.out` | Application errors |
| **Tomcat Access** | `/root/tomcat9078/logs/localhost_access_log.*.txt` | API requests |

### Checking Logs

```bash
# SSH to server
ssh root@140.82.32.141

# Check Apache errors for soupfinance
tail -f /var/log/apache2/app.soupfinance.com-error.log

# Check Tomcat application errors
tail -f /root/tomcat9078/logs/catalina.out | grep -iE 'error|exception'

# Check API request access log
tail -f /root/tomcat9078/logs/localhost_access_log.$(date +%Y-%m-%d).txt

# Check for registration/corporate errors
grep -iE 'corporate|register|client' /root/tomcat9078/logs/catalina.out
```

### Systemd Services

| Service | Purpose |
|---------|---------|
| `soupbroker.service` | Main Tomcat (tas.soupmarkets.com, port 8080) |
| `soupmarkets-edge.service` | Edge Tomcat (edge.soupmarkets.com) |

```bash
# Check service status
systemctl status soupbroker.service

# Restart if needed
systemctl restart soupbroker.service
```

## Common Issues

### 403 on /rest/* endpoints
These endpoints require authentication. Include `X-Auth-Token` header.

### 302 Redirect to /login/auth
The request is unauthenticated. Include `X-Auth-Token` header for `/rest/*` endpoints.

### ModSecurity Warnings
Warnings about "Host header is a numeric IP address" are expected when testing with IP instead of domain name. Use proper domain (`app.soupfinance.com`) for production.
