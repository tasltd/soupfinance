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
These endpoints use `/client/*` path and do NOT require authentication:

| Endpoint | Purpose |
|----------|---------|
| `POST /client/register.json` | Corporate registration (new company signup) |
| `POST /client/authenticate.json` | 2FA - request OTP code |
| `POST /client/verifyCode.json` | 2FA - verify OTP code |
| `GET /client/checkPhone.json` | Check if phone exists |
| `GET /client/checkEmail.json` | Check if email exists |

### Authenticated Endpoints
These endpoints require `X-Auth-Token` header:

| Endpoint | Purpose |
|----------|---------|
| `POST /rest/corporate/save.json` | Admin: Create corporate (requires ROLE_ADMIN) |
| `GET /rest/corporate/show/:id.json` | View corporate details |
| `PUT /rest/corporate/update/:id.json` | Update corporate |

## Registration Flow

1. **New Company Signup**: Use `/client/register.json` (public, no auth)
2. **2FA Verification**: Use `/client/authenticate.json` then `/client/verifyCode.json`
3. **After Login**: Admin endpoints use `/rest/*` with X-Auth-Token

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

### 403 on /rest/corporate/save.json
This endpoint requires authentication. For public registration, use `/client/register.json` instead.

### 302 Redirect to /login/auth
The request is unauthenticated. Either:
1. Use `/client/*` endpoints for public access
2. Include `X-Auth-Token` header for `/rest/*` endpoints

### ModSecurity Warnings
Warnings about "Host header is a numeric IP address" are expected when testing with IP instead of domain name. Use proper domain (`app.soupfinance.com`) for production.
