# SoupFinance Deployment Rules (HARD RULES)

**Last updated**: 2026-02-08

This document contains critical deployment rules learned from production incidents.
Every rule here exists because violating it has previously broken the production app.

---

## Table of Contents

1. [The Canonical Apache Config File](#1-the-canonical-apache-config-file)
2. [ProxyPass Trailing Slash Rule](#2-proxypass-trailing-slash-rule)
3. [RewriteCond Trailing Slash Rule](#3-rewritecond-trailing-slash-rule)
4. [Deploy Script Architecture](#4-deploy-script-architecture)
5. [Post-Deploy Validation](#5-post-deploy-validation)
6. [SSH Key Configuration](#6-ssh-key-configuration)
7. [VHost Dual-Block Rule](#7-vhost-dual-block-rule)
8. [Api-Authorization Header Rule](#8-api-authorization-header-rule)
9. [Troubleshooting](#9-troubleshooting)
10. [Quick Reference](#10-quick-reference)

---

## 1. The Canonical Apache Config File

### HARD RULE: Only `deploy/apache-soupfinance.conf` Is Deployed

The deploy script (`deploy/deploy-to-production.sh`) uploads **exactly one file** to the
production server:

```
LOCAL:  soupfinance-web/deploy/apache-soupfinance.conf
SERVER: /etc/apache2/sites-available/app-soupfinance-com.conf
```

**There is NO other file that gets deployed.** Do NOT edit any of these files expecting
them to be deployed (they are stale copies that exist for historical reasons):

| File | Status | Do NOT Edit |
|------|--------|-------------|
| `deploy/apache-soupfinance.conf` | **CANONICAL** — this is deployed | Edit this one |
| `deploy/app-soupfinance-com.conf` | STALE COPY — never deployed | Do NOT edit |
| `deploy/apache-soupfinance-production.conf` | STALE COPY — never deployed | Do NOT edit |
| `deploy/apache-performance-optimized.conf` | STALE COPY — never deployed | Do NOT edit |

### Why This Rule Exists (Incident History)

On 2026-02-08, a deployment "killed the app" because:
1. The trailing-slash fix was applied to `app-soupfinance-com.conf` (wrong file)
2. The deploy script uploaded `apache-soupfinance.conf` (the canonical file)
3. The canonical file did NOT have the fix, so the broken config was deployed again
4. Every subsequent deployment overwrote the server's working config with the broken one

This happened TWICE before the root cause was identified. The deploy script line is:
```bash
scp $SSH_OPTS "$SCRIPT_DIR/apache-soupfinance.conf" ${SERVER_USER}@${SERVER}:${APACHE_CONF}
```

### What To Do When Editing Apache Config

1. **ALWAYS edit `deploy/apache-soupfinance.conf`** — the one the deploy script uses
2. After editing, run `./deploy/deploy-to-production.sh` to push changes
3. Do NOT manually scp configs to the server — always use the deploy script
4. The deploy script now validates SPA routes and auto-rollbacks on failure

---

## 2. ProxyPass Trailing Slash Rule

### HARD RULE: ALL ProxyPass Paths MUST Have Trailing Slashes

```apache
# CORRECT — trailing slash makes the match exact to /client/ prefix
ProxyPass /client/ https://tas.soupmarkets.com/client/
ProxyPass /account/ https://tas.soupmarkets.com/account/
ProxyPass /rest/ https://tas.soupmarkets.com/rest/
ProxyPass /application/ https://tas.soupmarkets.com/application/

# WRONG — no trailing slash means /client also matches /clients, /clientele, etc.
ProxyPass /client https://tas.soupmarkets.com/client
ProxyPass /account https://tas.soupmarkets.com/account
```

### Why This Rule Exists

Apache `ProxyPass` does **prefix matching**. Without a trailing slash:
- `ProxyPass /client` matches BOTH `/client/index.json` (API) AND `/clients/new` (SPA route)
- `ProxyPass /account` matches BOTH `/account/index.json` (API) AND `/accounts/settings` (SPA route)

When a SPA route like `/clients/new` gets proxied to the backend, the backend has no
controller for `/clients/new` and returns 404. The user sees a blank page or error.

### The Specific Bug (2026-02-08)

```
User navigates to: https://app.soupfinance.com/clients/new

Without trailing slash:
  1. Apache checks: does /clients/new match ProxyPass /client? YES (prefix match!)
  2. Apache proxies /clients/new to https://tas.soupmarkets.com/clients/new
  3. Backend has no /clients/new controller -> returns 404
  4. User sees broken page

With trailing slash:
  1. Apache checks: does /clients/new match ProxyPass /client/? NO (/clients/ != /client/)
  2. Apache checks RewriteCond — /clients/new is not a real file, not excluded -> falls through
  3. Apache serves index.html (React SPA handles /clients/new via client-side routing)
  4. User sees the New Client form
```

### The Same Rule Applies To ProxyPassReverse

Every `ProxyPassReverse` must also use trailing slashes, matching its `ProxyPass`:
```apache
ProxyPass /client/ https://tas.soupmarkets.com/client/
ProxyPassReverse /client/ https://tas.soupmarkets.com/client/
```

---

## 3. RewriteCond Trailing Slash Rule

### HARD RULE: ALL RewriteCond Exclusions MUST Have Trailing Slashes

```apache
# CORRECT
RewriteCond %{REQUEST_URI} !^/rest/
RewriteCond %{REQUEST_URI} !^/application/
RewriteCond %{REQUEST_URI} !^/client/
RewriteCond %{REQUEST_URI} !^/account/

# WRONG
RewriteCond %{REQUEST_URI} !^/rest
RewriteCond %{REQUEST_URI} !^/application
RewriteCond %{REQUEST_URI} !^/client
RewriteCond %{REQUEST_URI} !^/account
```

### Why This Rule Exists

The `RewriteCond` exclusions tell Apache "do NOT serve index.html for these paths —
let the proxy handle them instead." Without trailing slashes:

- `!^/client` excludes EVERYTHING starting with `/client`: `/client/...`, `/clients/...`, `/clientele/...`
- This means `/clients/new` is EXCLUDED from SPA routing and falls through to ProxyPass
- Since ProxyPass also matches (see rule #2), the SPA route gets proxied to the backend

Both rules must be fixed together. The RewriteCond exclusion and ProxyPass must use
matching trailing-slash patterns so that:
- `/client/index.json` is excluded from SPA routing AND proxied (correct — it's an API call)
- `/clients/new` is NOT excluded from SPA routing AND NOT proxied (correct — it's a SPA route)

### Current SPA Routes That Would Break Without Trailing Slashes

| SPA Route | Would Be Caught By (no slash) | Backend Response |
|-----------|-------------------------------|------------------|
| `/clients/new` | `ProxyPass /client` + `!^/client` | 404 |
| `/clients/:id/edit` | `ProxyPass /client` + `!^/client` | 404 |
| `/accounts/settings` | `ProxyPass /account` + `!^/account` | 404 |
| `/applications` (future) | `ProxyPass /application` + `!^/application` | 404 |
| `/restaurants` (future) | `ProxyPass /rest` + `!^/rest` | 404 |

---

## 4. Deploy Script Architecture

### What `deploy-to-production.sh` Does (6 Steps)

| Step | Action | Rollback? |
|------|--------|-----------|
| 1 | `npm run build` — TypeScript check + Vite production build | No (local only) |
| 2 | `mkdir -p /var/www/soupfinance` on server | No |
| 3 | `rsync --delete dist/` to server + maintenance page | No (but overwrites old files) |
| 4 | SCP `apache-soupfinance.conf` to server, `apache2ctl configtest`, `reload` | **YES** — rolls back on config test failure |
| 5 | HTTP/HTTPS status check + VHost block count | Warning only |
| 6 | SPA route validation + API proxy check + trailing slash check | **YES** — auto-rollback on SPA route failure |

### Key Safety Features

1. **Config test before reload**: `apache2ctl configtest` runs before `systemctl reload`.
   If config syntax is invalid, the old config is restored and reload is skipped.

2. **SPA route validation**: After deployment, the script curls 11 SPA routes
   (`/login`, `/dashboard`, `/invoices`, `/bills`, `/vendors`, `/clients/new`,
   `/settings`, `/settings/users`, `/settings/bank-accounts`, `/reports`, `/ledger`).
   If ANY route returns non-200, the deploy auto-rollbacks to the previous config.

3. **Trailing slash validation**: The script checks that all `ProxyPass` directives in the
   deployed config have trailing slashes. This catches the exact bug that killed the app.

4. **Api-Authorization check**: Verifies the auth header exists in both VHost blocks.

---

## 5. Post-Deploy Validation

### Always Verify After Deployment

Even though the deploy script runs automated checks, you should verify manually:

```bash
# Through Cloudflare (the actual user path):
curl -sI https://app.soupfinance.com/login
curl -sI https://app.soupfinance.com/clients/new
curl -sI https://app.soupfinance.com/dashboard

# All should return: HTTP/2 200 with content-type: text/html
```

### Critical Routes To Check

| Route | Expected | If Broken |
|-------|----------|-----------|
| `/login` | 200 + text/html | SPA routing broken |
| `/clients/new` | 200 + text/html | ProxyPass /client missing trailing slash |
| `/dashboard` | 200 + text/html | SPA routing broken |
| `/rest/vendor/index.json` | 401 or 403 | API proxy working (auth needed) |
| `/rest/vendor/index.json` | 404 | API proxy broken |

---

## 6. SSH Key Configuration

| Property | Value |
|----------|-------|
| **Server IP** | 65.20.112.224 |
| **SSH User** | root |
| **SSH Key** | `~/.ssh/crypttransact_rsa` (NOT `id_rsa`, NOT `daptordarattler_rsa`) |
| **Web Root** | `/var/www/soupfinance` |
| **Apache Config** | `/etc/apache2/sites-available/app-soupfinance-com.conf` |

---

## 7. VHost Dual-Block Rule

### HARD RULE: Both Port 80 AND Port 443 VHost Blocks Are Required

Cloudflare connects to origin on port 443 (HTTPS). If only port 80 exists, Cloudflare
requests fall through to the default VHost (the landing page), and the app appears to
be replaced by the landing page.

Both blocks must have **identical**:
- RewriteCond exclusions (with trailing slashes)
- ProxyPass/ProxyPassReverse directives (with trailing slashes)
- RequestHeader directives (Api-Authorization, X-Forwarded-Proto, X-Forwarded-Host)
- ErrorDocument directives

They differ ONLY in SSL directives (port 443 block has SSLEngine, SSLCertificate*).

---

## 8. Api-Authorization Header Rule

### HARD RULE: Must Be Present In BOTH VHost Blocks

The `Api-Authorization` header authenticates the SoupFinance web app with the backend's
`ApiAuthenticatorInterceptor`. Without it, ALL proxied API requests return 403.

```apache
RequestHeader set Api-Authorization "Basic U291cEZpbmFuY2UgV2ViIEFwcDpkMzc5YTFkN2I4MGExYzA3MmFjMzc0MDIwY2VmYmMwNQ=="
```

This header is injected by Apache. The browser NEVER sees or sends this header.
The base64 value is `SoupFinance Web App:{secret}`.

---

## 9. Troubleshooting

### App Broken After Deployment (SPA Routes Return 404)

**Most likely cause**: ProxyPass or RewriteCond paths missing trailing slashes.

**Diagnosis**:
```bash
# Check from server
ssh -i ~/.ssh/crypttransact_rsa root@65.20.112.224 \
  'curl -s -o /dev/null -w "%{http_code}" --resolve app.soupfinance.com:443:127.0.0.1 https://app.soupfinance.com/clients/new --insecure'
# Should return 200, if 404 then proxy paths are missing trailing slashes
```

**Fix**:
1. Edit `deploy/apache-soupfinance.conf` — add trailing slashes
2. Run `./deploy/deploy-to-production.sh`

### App Shows Landing Page Instead of React App

**Cause**: Missing port 443 VHost block for `app.soupfinance.com`.

**Fix**: Ensure both `<VirtualHost *:80>` and `<VirtualHost *:443>` blocks exist.

### API Calls Return 403

**Cause**: Missing `Api-Authorization` header in VHost block.

**Fix**: Verify the `RequestHeader set Api-Authorization` line exists in BOTH blocks.

---

## 10. Quick Reference

### Deploy Frontend

```bash
cd soupfinance-web
./deploy/deploy-to-production.sh
```

### Deploy Apache Config Only (Without Rebuilding Frontend)

```bash
scp -i ~/.ssh/crypttransact_rsa \
  soupfinance-web/deploy/apache-soupfinance.conf \
  root@65.20.112.224:/etc/apache2/sites-available/app-soupfinance-com.conf

ssh -i ~/.ssh/crypttransact_rsa root@65.20.112.224 \
  "apache2ctl configtest && systemctl reload apache2"
```

### Manual Server Access

```bash
ssh -i ~/.ssh/crypttransact_rsa root@65.20.112.224
```

### View Logs

```bash
ssh -i ~/.ssh/crypttransact_rsa root@65.20.112.224 \
  "tail -50 /var/log/apache2/app.soupfinance.com-ssl-error.log"
```
