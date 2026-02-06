# Production Server VirtualHost Configuration (HARD RULES)

**Last verified**: 2026-02-06 | **Server**: 65.20.112.224 | **Apache**: 2.4.52 (Ubuntu)

This document is the **single source of truth** for all Apache VirtualHost configuration on the SoupFinance production origin server. Every section is verified against the live server state.

---

## Table of Contents

1. [Server Infrastructure](#server-infrastructure)
2. [Network Architecture](#network-architecture)
3. [VirtualHost Inventory](#virtualhost-inventory)
4. [App VHost: app.soupfinance.com](#app-vhost-appsoupfinancecom)
5. [Landing VHost: www.soupfinance.com](#landing-vhost-wwwsoupfinancecom)
6. [Colocated Soupmarkets VHosts](#colocated-soupmarkets-vhosts)
7. [SSL Certificates](#ssl-certificates)
8. [Apache Modules](#apache-modules)
9. [Api-Authorization Header](#api-authorization-header)
10. [SPA Routing Rules](#spa-routing-rules)
11. [Proxy Configuration](#proxy-configuration)
12. [Caching and Compression](#caching-and-compression)
13. [Security Headers](#security-headers)
14. [Logging](#logging)
15. [Deployment Procedures](#deployment-procedures)
16. [Known Issues and Cleanup](#known-issues-and-cleanup)
17. [Troubleshooting Playbook](#troubleshooting-playbook)
18. [Hard Rules](#hard-rules)
19. [Verification Commands](#verification-commands)

---

## Server Infrastructure

| Property | Value |
|----------|-------|
| **Server IP** | `65.20.112.224` |
| **OS** | Ubuntu 22.04 LTS |
| **Apache Version** | 2.4.52 |
| **SSH Access** | `ssh -i ~/.ssh/crypttransact_rsa root@65.20.112.224` |
| **SSH Key** | `~/.ssh/crypttransact_rsa` (NOT `id_rsa` or `daptordarattler_rsa`) |
| **Config Dir** | `/etc/apache2/sites-available/` |
| **Enabled Dir** | `/etc/apache2/sites-enabled/` |
| **Log Dir** | `/var/log/apache2/` |
| **Certbot** | Let's Encrypt auto-renewal via systemd timer |
| **CDN** | Cloudflare (Full SSL mode — connects to origin on port 443) |

### Document Roots

| Domain | Document Root | Content Type | Deployed Via |
|--------|---------------|--------------|--------------|
| `app.soupfinance.com` | `/var/www/soupfinance` | React 19 SPA (Vite build) | `deploy/deploy-to-production.sh` |
| `www.soupfinance.com` | `/var/www/soupfinance-landing` | Static HTML landing page | `soupfinance-landing/deploy-landing.sh` |

---

## Network Architecture

### Request Flow

```
                          ┌─────────────────────────────────────────────────────────┐
                          │                   Origin Server                         │
                          │                  65.20.112.224                          │
                          │                                                         │
User ──HTTPS──> Cloudflare ──HTTPS:443──> Apache VHosts                            │
                 (DNS+SSL)  │                │                                      │
                            │    app.soupfinance.com:443                            │
                            │    ├── Static: /var/www/soupfinance (React SPA)       │
                            │    ├── /rest/*  ──proxy──> tas.soupmarkets.com/rest   │
                            │    ├── /account/* ──proxy──> tas.soupmarkets.com/account│
                            │    ├── /client/* ──proxy──> tas.soupmarkets.com/client │
                            │    └── /application/* ──proxy──> tas.soupmarkets.com  │
                            │                                                       │
                            │    www.soupfinance.com:443                            │
                            │    └── Static: /var/www/soupfinance-landing (HTML)    │
                            │                                                       │
                            │    soupfinance.com:443                                │
                            │    └── 301 redirect → www.soupfinance.com             │
                            │                                                       │
                            │    app.soupmarkets.com:443                            │
                            │    └── proxy → localhost:6081 (Varnish→Tomcat)        │
                            │                                                       │
                            │    soupmarkets.com:443                                │
                            │    └── proxy → localhost:6081 (Varnish→Tomcat)        │
                            └───────────────────────────────────────────────────────┘
```

### Why Port 443 VHosts Are CRITICAL

Cloudflare uses **Full (strict) SSL** mode. This means:

1. User connects to Cloudflare on HTTPS (port 443)
2. Cloudflare connects to **origin on HTTPS (port 443)**
3. Origin MUST have a valid SSL VHost on port 443 for the requested ServerName
4. If no matching VHost → falls through to **default** VHost → **wrong site served**

**This is why `app.soupfinance.com` was serving the landing page before 2026-02-06**: the app config only had a port 80 VHost. Cloudflare's HTTPS request fell through to the landing page's default port 443 VHost.

### VHost Resolution Order (Apache NameVirtualHost)

Apache matches incoming requests to VHosts by:
1. **Port** — Must match `*:80` or `*:443`
2. **ServerName** — Exact match against `Host` header
3. **ServerAlias** — Alias match if no ServerName match
4. **Default** — First VHost defined for that port (alphabetical by filename in sites-enabled)

**Default server for port 443**: `001-soupfinance-landing.conf` (because `001-` prefix sorts first alphabetically)

---

## VirtualHost Inventory

### Active Config Files (sites-enabled)

| Config File | Type | Domain(s) | Port 80 | Port 443 | Notes |
|-------------|------|-----------|:-------:|:--------:|-------|
| `001-soupfinance-landing.conf` | **Regular file** | www.soupfinance.com, soupfinance.com | Yes | Yes | **OLD** — should be removed (see Known Issues) |
| `app-soupfinance-com.conf` | Symlink | app.soupfinance.com | Yes | Yes | React SPA + API proxy |
| `www-soupfinance-com.conf` | Symlink | www.soupfinance.com, soupfinance.com | Yes (redirect) | Yes (redirect + serve) | **CURRENT** landing page config |
| `app.soupmarkets.com.conf` | Symlink | app.soupmarkets.com | Yes (redirect) | Yes (proxy) | Soupmarkets demo app |
| `soupmarkets.com.conf` | Symlink | soupmarkets.com | Yes (redirect) | Yes (proxy) | Soupmarkets marketing |

### Backup Files (sites-enabled — should be cleaned up)

| File | Purpose |
|------|---------|
| `001-soupfinance-landing.conf.backup` | Backup of old landing page config |
| `001-soupfinance-landing.conf.bak` | Another backup |

### Backup Files (sites-available)

| File | Purpose |
|------|---------|
| `app-soupfinance-com.conf.backup.20260121` | Pre-SSL fix backup |
| `app-soupfinance-com.conf.backup.20260121-194640` | Second backup |
| `app-soupfinance-com.conf.bak` | Another backup |

---

## App VHost: app.soupfinance.com

**Config file**: `/etc/apache2/sites-available/app-soupfinance-com.conf`
**Local copy**: `soupfinance-web/deploy/app-soupfinance-com.conf`
**Enabled via**: Symlink in `sites-enabled/`

### Purpose

Serves the SoupFinance React SPA and proxies API requests to the soupmarkets-web Grails backend at `tas.soupmarkets.com`.

### VHost Blocks

#### Port 80 (HTTP)

| Directive | Value | Purpose |
|-----------|-------|---------|
| `ServerName` | `app.soupfinance.com` | Match requests for this domain |
| `DocumentRoot` | `/var/www/soupfinance` | React SPA build output |
| `RewriteEngine` | On | SPA client-side routing |
| `SSLProxyEngine` | On | Forward proxy requests over HTTPS |
| `ProxyPreserveHost` | Off | Send backend hostname, not client hostname |
| `Api-Authorization` | `Basic {base64}` | Authenticate with backend ApiConsumer |

#### Port 443 (HTTPS) — CRITICAL for Cloudflare

Same as port 80 plus:

| Directive | Value | Purpose |
|-----------|-------|---------|
| `SSLEngine` | On | Enable SSL |
| `SSLCertificateFile` | `/etc/letsencrypt/live/app.soupfinance.com/fullchain.pem` | Let's Encrypt cert |
| `SSLCertificateKeyFile` | `/etc/letsencrypt/live/app.soupfinance.com/privkey.pem` | Let's Encrypt key |

### SPA Rewrite Rules

The React SPA uses client-side routing (React Router). Apache must serve `index.html` for all non-file, non-API paths:

```apache
RewriteEngine On
RewriteBase /
RewriteRule ^index\.html$ - [L]                    # index.html → serve directly
RewriteCond %{REQUEST_FILENAME} !-f                # NOT a real file
RewriteCond %{REQUEST_FILENAME} !-d                # NOT a real directory
RewriteCond %{REQUEST_URI} !^/rest                 # NOT API
RewriteCond %{REQUEST_URI} !^/application          # NOT health check
RewriteCond %{REQUEST_URI} !^/client               # NOT client API
RewriteCond %{REQUEST_URI} !^/account              # NOT registration API
RewriteRule . /index.html [L]                      # Serve SPA entry point
```

**RULE**: If you add a new proxy path (e.g., `/webhook`), you MUST also add a `RewriteCond %{REQUEST_URI} !^/webhook` exclusion in BOTH port 80 and port 443 blocks.

### Proxy Routes

| Path | Backend Target | Purpose |
|------|---------------|---------|
| `/rest/*` | `https://tas.soupmarkets.com/rest` | All REST API endpoints |
| `/application/*` | `https://tas.soupmarkets.com/application` | Health/status endpoints |
| `/client/*` | `https://tas.soupmarkets.com/client` | Public client API |
| `/account/*` | `https://tas.soupmarkets.com/account` | Tenant registration |

### Injected Headers

| Header | Value | Purpose |
|--------|-------|---------|
| `Api-Authorization` | `Basic {base64(name:secret)}` | Backend ApiConsumer authentication |
| `X-Forwarded-Proto` | `https` | Tell backend the original protocol |
| `X-Forwarded-Host` | `app.soupfinance.com` | Tell backend the original domain |
| `X-Real-IP` | `%{REMOTE_ADDR}s` | Client IP (port 80 only) |

### Full Config (Authoritative)

```apache
<VirtualHost *:80>
    ServerName app.soupfinance.com
    DocumentRoot /var/www/soupfinance

    <Directory /var/www/soupfinance>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted
        RewriteEngine On
        RewriteBase /
        RewriteRule ^index\.html$ - [L]
        RewriteCond %{REQUEST_FILENAME} !-f
        RewriteCond %{REQUEST_FILENAME} !-d
        RewriteCond %{REQUEST_URI} !^/rest
        RewriteCond %{REQUEST_URI} !^/application
        RewriteCond %{REQUEST_URI} !^/client
        RewriteCond %{REQUEST_URI} !^/account
        RewriteRule . /index.html [L]
    </Directory>

    SSLProxyEngine On
    ProxyPreserveHost Off
    ProxyRequests Off

    RequestHeader set Api-Authorization "Basic {BASE64_CREDENTIALS}"

    ProxyPass /rest https://tas.soupmarkets.com/rest
    ProxyPassReverse /rest https://tas.soupmarkets.com/rest
    ProxyPass /application https://tas.soupmarkets.com/application
    ProxyPassReverse /application https://tas.soupmarkets.com/application
    ProxyPass /client https://tas.soupmarkets.com/client
    ProxyPassReverse /client https://tas.soupmarkets.com/client
    ProxyPass /account https://tas.soupmarkets.com/account
    ProxyPassReverse /account https://tas.soupmarkets.com/account

    RequestHeader set X-Forwarded-Proto "https"
    RequestHeader set X-Forwarded-Host "app.soupfinance.com"
    RequestHeader set X-Real-IP "%{REMOTE_ADDR}s"

    ErrorLog ${APACHE_LOG_DIR}/app.soupfinance.com-error.log
    CustomLog ${APACHE_LOG_DIR}/app.soupfinance.com-access.log combined
</VirtualHost>

<VirtualHost *:443>
    ServerName app.soupfinance.com
    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/app.soupfinance.com/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/app.soupfinance.com/privkey.pem
    DocumentRoot /var/www/soupfinance

    <Directory /var/www/soupfinance>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted
        RewriteEngine On
        RewriteBase /
        RewriteRule ^index\.html$ - [L]
        RewriteCond %{REQUEST_FILENAME} !-f
        RewriteCond %{REQUEST_FILENAME} !-d
        RewriteCond %{REQUEST_URI} !^/rest
        RewriteCond %{REQUEST_URI} !^/application
        RewriteCond %{REQUEST_URI} !^/client
        RewriteCond %{REQUEST_URI} !^/account
        RewriteRule . /index.html [L]
    </Directory>

    SSLProxyEngine On
    ProxyPreserveHost Off
    ProxyRequests Off

    RequestHeader set Api-Authorization "Basic {BASE64_CREDENTIALS}"

    ProxyPass /rest https://tas.soupmarkets.com/rest
    ProxyPassReverse /rest https://tas.soupmarkets.com/rest
    ProxyPass /application https://tas.soupmarkets.com/application
    ProxyPassReverse /application https://tas.soupmarkets.com/application
    ProxyPass /client https://tas.soupmarkets.com/client
    ProxyPassReverse /client https://tas.soupmarkets.com/client
    ProxyPass /account https://tas.soupmarkets.com/account
    ProxyPassReverse /account https://tas.soupmarkets.com/account

    RequestHeader set X-Forwarded-Proto "https"
    RequestHeader set X-Forwarded-Host "app.soupfinance.com"

    ErrorLog ${APACHE_LOG_DIR}/app.soupfinance.com-ssl-error.log
    CustomLog ${APACHE_LOG_DIR}/app.soupfinance.com-ssl-access.log combined
</VirtualHost>
```

**NOTE**: `{BASE64_CREDENTIALS}` is a placeholder. The real base64-encoded `ApiConsumer name:secret` is in the actual config file. See [Api-Authorization Header](#api-authorization-header) section.

---

## Landing VHost: www.soupfinance.com

**Config file**: `/etc/apache2/sites-available/www-soupfinance-com.conf`
**Local copy**: `soupfinance-landing/deploy/www-soupfinance-com.conf`
**Enabled via**: Symlink in `sites-enabled/`

### Purpose

Serves the static HTML marketing landing page. No API proxy, no SPA routing. Performance-optimized for static file serving.

### Domain Routing

| Request | Action |
|---------|--------|
| `http://soupfinance.com/*` | 301 redirect → `https://www.soupfinance.com/*` |
| `http://www.soupfinance.com/*` | 301 redirect → `https://www.soupfinance.com/*` |
| `https://soupfinance.com/*` | 301 redirect → `https://www.soupfinance.com/*` |
| `https://www.soupfinance.com/*` | **Serve landing page** |

### VHost Blocks (3 total)

#### Block 1: Port 80 — HTTP redirect to HTTPS

```apache
<VirtualHost *:80>
    ServerName soupfinance.com
    ServerAlias www.soupfinance.com
    RewriteEngine On
    RewriteCond %{HTTPS} off
    RewriteRule ^ https://www.soupfinance.com%{REQUEST_URI} [L,R=301]
</VirtualHost>
```

#### Block 2: Port 443 — Bare domain redirect to www

```apache
<VirtualHost *:443>
    ServerName soupfinance.com
    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/soupfinance.com/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/soupfinance.com/privkey.pem
    Include /etc/letsencrypt/options-ssl-apache.conf
    RewriteEngine On
    RewriteRule ^ https://www.soupfinance.com%{REQUEST_URI} [L,R=301]
</VirtualHost>
```

#### Block 3: Port 443 — www.soupfinance.com (serves content)

```apache
<VirtualHost *:443>
    ServerName www.soupfinance.com
    DocumentRoot /var/www/soupfinance-landing

    <Directory /var/www/soupfinance-landing>
        Options -Indexes +FollowSymLinks
        AllowOverride None          # Performance: no .htaccess lookups
        Require all granted
    </Directory>

    EnableMMAP On                   # Kernel-level memory mapping
    EnableSendfile On               # Kernel-level file transfer

    # Compression, caching, security headers (see sections below)
    # ...

    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/soupfinance.com/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/soupfinance.com/privkey.pem
    Include /etc/letsencrypt/options-ssl-apache.conf
</VirtualHost>
```

### Performance Optimizations

| Optimization | Directive | Effect |
|-------------|-----------|--------|
| No .htaccess | `AllowOverride None` | Eliminates 4+ filesystem lookups per request |
| Kernel file transfer | `EnableSendfile On` | Bypasses userspace for file I/O |
| Memory mapping | `EnableMMAP On` | Maps files into memory for faster reads |
| Brotli compression | `BROTLI_COMPRESS` | 15-25% better compression than gzip |
| GZIP fallback | `DEFLATE` | For browsers without Brotli support |
| Immutable caching | `max-age=31536000, immutable` | Static assets cached 1 year |
| No HTML cache | `no-cache, no-store` | HTML always fresh from origin |

### Content Rules

| Content Type | Cache Control | Rationale |
|-------------|---------------|-----------|
| `*.html` | `no-cache, no-store, must-revalidate` | Always serve latest HTML |
| `*.css`, `*.js` | `public, max-age=31536000, immutable` | Hashed filenames, cache forever |
| `*.png`, `*.jpg`, `*.svg`, `*.ico` | `public, max-age=31536000, immutable` | Static images, cache forever |
| `*.woff2`, `*.ttf` | `public, max-age=31536000, immutable` | Fonts, cache forever |

### Landing Page Content Rules (HARD RULE)

The landing page MUST NOT contain:
- Login forms or password inputs
- React/SPA JavaScript
- Authentication logic
- API calls to backend

The landing page MUST only contain:
- Static HTML, CSS, images
- "Sign In" / "Register" **links** pointing to `https://app.soupfinance.com`
- Legal pages (privacy, terms, cookies, acceptable use)

---

## Colocated Soupmarkets VHosts

The same server hosts two Soupmarkets VHosts. These proxy to a local Varnish cache (port 6081) which fronts Tomcat.

### app.soupmarkets.com

| Property | Value |
|----------|-------|
| **Config** | `app.soupmarkets.com.conf` |
| **Port 80** | 301 redirect to HTTPS |
| **Port 443** | Proxy all to `http://localhost:6081/` |
| **Backend** | Varnish (6081) → Tomcat |
| **SSL Cert** | `/etc/letsencrypt/live/app.soupmarkets.com/` |
| **Special** | `LimitRequestLine 81900` (large query strings) |

### soupmarkets.com

| Property | Value |
|----------|-------|
| **Config** | `soupmarkets.com.conf` |
| **Port 80** | 301 redirect to HTTPS |
| **Port 443** | Proxy all to `http://localhost:6081/` |
| **Backend** | Varnish (6081) → Tomcat |
| **SSL Cert** | `/etc/letsencrypt/live/soupmarkets.com/` |
| **Special** | `LimitRequestLine 81900` |

**HARD RULE**: NEVER modify the Soupmarkets VHost configs from the SoupFinance project context. These are managed separately.

---

## SSL Certificates

All certificates are managed by Let's Encrypt certbot with auto-renewal.

| Certificate Name | Domains | Expiry | Path |
|------------------|---------|--------|------|
| `app.soupfinance.com` | app.soupfinance.com | 2026-04-21 (73 days) | `/etc/letsencrypt/live/app.soupfinance.com/` |
| `soupfinance.com` | soupfinance.com, www.soupfinance.com | 2026-04-21 (73 days) | `/etc/letsencrypt/live/soupfinance.com/` |
| `app.soupmarkets.com` | app.soupmarkets.com | 2026-04-23 (75 days) | `/etc/letsencrypt/live/app.soupmarkets.com/` |
| `soupmarkets.com` | soupmarkets.com | 2026-04-23 (75 days) | `/etc/letsencrypt/live/soupmarkets.com/` |

### Certificate Files

Each Let's Encrypt cert directory contains:

| File | Purpose |
|------|---------|
| `fullchain.pem` | Certificate + intermediate chain (used in `SSLCertificateFile`) |
| `privkey.pem` | Private key (used in `SSLCertificateKeyFile`) |
| `cert.pem` | Certificate only |
| `chain.pem` | Intermediate CA chain only |

### Shared SSL Options

File: `/etc/letsencrypt/options-ssl-apache.conf`

This file is `Include`d by the landing page and soupmarkets VHosts. It contains SSL protocol and cipher settings managed by certbot. The app VHost currently does NOT include this file (it only sets `SSLEngine on` + cert paths).

### Renewal

```bash
# Check all certificate expiry
ssh -i ~/.ssh/crypttransact_rsa root@65.20.112.224 "certbot certificates"

# Force renewal for a specific cert
ssh -i ~/.ssh/crypttransact_rsa root@65.20.112.224 "certbot renew --cert-name app.soupfinance.com"

# Renew all due certs
ssh -i ~/.ssh/crypttransact_rsa root@65.20.112.224 "certbot renew"

# Verify auto-renewal timer
ssh -i ~/.ssh/crypttransact_rsa root@65.20.112.224 "systemctl list-timers | grep certbot"
```

---

## Apache Modules

### Required Modules (all verified loaded)

| Module | Purpose | Used By |
|--------|---------|---------|
| `ssl_module` | HTTPS/TLS termination | All port 443 VHosts |
| `rewrite_module` | URL rewriting (SPA routing, redirects) | App VHost, Landing VHost |
| `proxy_module` | Reverse proxy base | App VHost |
| `proxy_http_module` | HTTP reverse proxy | App VHost |
| `headers_module` | Set/modify HTTP headers | All VHosts |
| `deflate_module` | GZIP compression | Landing VHost |
| `expires_module` | Cache expiry headers | Landing VHost |

### Optional but Loaded

| Module | Purpose |
|--------|---------|
| `proxy_http2_module` | HTTP/2 proxy support |
| `proxy_wstunnel_module` | WebSocket proxy |
| `proxy_balancer_module` | Load balancing |

### Enable Modules

```bash
ssh -i ~/.ssh/crypttransact_rsa root@65.20.112.224 \
    "a2enmod ssl proxy proxy_http headers rewrite expires deflate"
```

---

## Api-Authorization Header

### What It Does

The Apache proxy injects an `Api-Authorization` header on **all proxied requests** to `tas.soupmarkets.com`. This authenticates the SoupFinance web app as an `ApiConsumer` with the backend's `ApiAuthenticatorInterceptor`.

### How It Works

```
Browser (no Api-Authorization) → Apache → adds header → Backend receives header
                                                      → ApiAuthenticatorInterceptor validates
                                                      → Resolves ApiConsumer name
                                                      → Request proceeds
```

### Header Format

```
Api-Authorization: Basic base64(consumerId:secret)
```

Where:
- `consumerId` = The `name` field from the `api_consumer` table in production DB
- `secret` = The `secret` field from the `api_consumer` table
- Encoded as: `base64("SoupFinance Web App:d379a1d7b80a1c072ac374020cefbc05")`

### HARD RULES

1. **NEVER commit the actual base64 credentials to git** — The real value is only in the server config and this doc uses `{BASE64_CREDENTIALS}` placeholder
2. **NEVER expose the Api-Authorization header to the browser** — It is injected by Apache, never by client JavaScript
3. **The header MUST be present in BOTH port 80 and port 443 VHost blocks** — Requests can arrive on either port
4. **If the ApiConsumer secret rotates**, update the base64 value in both VHost blocks and reload Apache

### Retrieving Current Credentials

```bash
# Query production database for ApiConsumer record
ssh root@140.82.32.141 "mysql -u soupbroker -p'Dominus@soupbroker.2020' soupbroker \
    -e \"SELECT name, secret FROM api_consumer WHERE name LIKE '%SoupFinance%'\""

# Re-encode after secret rotation
echo -n 'SoupFinance Web App:NEW_SECRET_HERE' | base64
```

### Difference from Development

| Environment | Api-Authorization Source |
|-------------|------------------------|
| **Development (Vite)** | Vite proxy reads `VITE_API_CONSUMER_ID` + `VITE_API_CONSUMER_SECRET` from `.env.lxc.local` |
| **Production (Apache)** | Hardcoded in VHost config as `RequestHeader set Api-Authorization` |

---

## SPA Routing Rules

### Why SPA Routing Is Needed

React Router uses client-side URLs like `/invoices`, `/login`, `/settings/users`. These paths don't correspond to real files on disk. Without rewrite rules, Apache returns 404 for all non-root URLs.

### The Rewrite Logic

```
1. Is the request for index.html? → Serve it directly (stop)
2. Does the file exist on disk?    → Serve it (CSS, JS, images)
3. Does the directory exist?       → Serve it
4. Is it an API path?             → Let proxy handle it (stop)
5. Everything else                → Serve index.html (React Router handles routing)
```

### API Path Exclusions (MUST stay in sync with ProxyPass)

| Exclusion | Reason |
|-----------|--------|
| `!^/rest` | REST API endpoints |
| `!^/application` | Backend health/status |
| `!^/client` | Public client API |
| `!^/account` | Tenant registration |

### Adding a New Proxy Path (Checklist)

When adding a new proxy path (e.g., `/webhook`):

1. Add `RewriteCond %{REQUEST_URI} !^/webhook` to **port 80 Directory block**
2. Add `RewriteCond %{REQUEST_URI} !^/webhook` to **port 443 Directory block**
3. Add `ProxyPass /webhook https://tas.soupmarkets.com/webhook` to **port 80**
4. Add `ProxyPassReverse /webhook https://tas.soupmarkets.com/webhook` to **port 80**
5. Add `ProxyPass /webhook https://tas.soupmarkets.com/webhook` to **port 443**
6. Add `ProxyPassReverse /webhook https://tas.soupmarkets.com/webhook` to **port 443**
7. Test: `apache2ctl configtest && systemctl reload apache2`
8. Update local copy: `soupfinance-web/deploy/app-soupfinance-com.conf`
9. Commit the local copy change

**HARD RULE**: Both VHost blocks (80 and 443) MUST have identical rewrite exclusions and proxy routes. They diverge only in SSL directives.

---

## Proxy Configuration

### Proxy Directives Explained

| Directive | Value | Purpose |
|-----------|-------|---------|
| `SSLProxyEngine On` | — | Enable HTTPS when proxying to backend (backend uses HTTPS) |
| `ProxyPreserveHost Off` | — | Send `tas.soupmarkets.com` as Host header to backend (not `app.soupfinance.com`) |
| `ProxyRequests Off` | — | Disable forward proxy (security: prevent open proxy abuse) |

### Why ProxyPreserveHost is Off

The backend at `tas.soupmarkets.com` expects requests addressed to its own hostname. If we sent `Host: app.soupfinance.com`, the backend would not recognize the virtual host and might reject the request or route it incorrectly.

### Proxy Timeout Considerations

Some backend endpoints (finance reports) can take 30-60+ seconds. Apache's default proxy timeout (60s) should be sufficient, but if timeouts occur:

```apache
# Add to VHost if needed:
ProxyTimeout 120
```

---

## Caching and Compression

### Landing Page Caching Strategy

The landing page uses aggressive caching because:
- HTML files change on deploy (so: no-cache)
- Static assets (CSS, JS, images, fonts) rarely change (so: immutable, 1 year)
- Cloudflare respects `Cache-Control` and `CDN-Cache-Control` headers

#### CDN Cache Bypass for HTML

```apache
<FilesMatch "\\.html$">
    Header set Cache-Control "no-cache, no-store, must-revalidate"
    Header set Pragma "no-cache"
    Header set Expires "0"
    Header set Cloudflare-CDN-Cache-Control "no-store"
    Header set CDN-Cache-Control "no-store"
    Header set Surrogate-Control "no-store"
</FilesMatch>
```

The `Cloudflare-CDN-Cache-Control` and `CDN-Cache-Control` headers tell Cloudflare specifically to not cache HTML, even if other settings would allow it.

### App VHost Caching

The React SPA uses Vite's content-hashed filenames (e.g., `index-a1b2c3.js`). Caching is primarily handled by:
- **Cloudflare** — CDN caching based on response headers
- **Browser** — Standard `Cache-Control` headers from Apache's default behavior

The app VHost does NOT have explicit caching rules. If performance optimization is needed later, add rules similar to the landing page's static asset caching.

### Compression

| Algorithm | Landing Page | App VHost |
|-----------|:------------:|:---------:|
| Brotli | Yes (quality 6) | No (relies on Cloudflare) |
| GZIP/Deflate | Yes (level 6, fallback) | No (relies on Cloudflare) |

Cloudflare applies its own compression on the CDN edge, so the app VHost doesn't strictly need server-side compression. The landing page has it for direct-origin access scenarios.

---

## Security Headers

### Landing Page Security Headers

```apache
Header always set X-Content-Type-Options "nosniff"
Header always set X-Frame-Options "SAMEORIGIN"
Header always set X-XSS-Protection "1; mode=block"
Header always set Referrer-Policy "strict-origin-when-cross-origin"
Header append Vary Accept-Encoding
```

### App VHost Security Headers

Currently the app VHost does NOT set explicit security headers. Cloudflare adds some headers at the CDN level. If needed, add the same set as the landing page.

### Directory Security

Both VHosts use:
```apache
Options -Indexes +FollowSymLinks
```

- `-Indexes` prevents directory listing (returns 403 instead of listing files)
- `+FollowSymLinks` allows symbolic links (needed for some deployments)

---

## Logging

### Log Files

| VHost | Error Log | Access Log |
|-------|-----------|------------|
| App (HTTP) | `app.soupfinance.com-error.log` | `app.soupfinance.com-access.log` |
| App (HTTPS) | `app.soupfinance.com-ssl-error.log` | `app.soupfinance.com-ssl-access.log` |
| Landing (HTTP) | `www-soupfinance-error.log` | `www-soupfinance-access.log` |
| Landing (HTTPS) | `www-soupfinance-ssl-error.log` | `www-soupfinance-ssl-access.log` |

### Viewing Logs

```bash
SSH="ssh -i ~/.ssh/crypttransact_rsa root@65.20.112.224"

# App errors (SSL — most traffic comes through here via Cloudflare)
$SSH "tail -f /var/log/apache2/app.soupfinance.com-ssl-error.log"

# App access (SSL)
$SSH "tail -f /var/log/apache2/app.soupfinance.com-ssl-access.log"

# Landing page errors
$SSH "tail -f /var/log/apache2/www-soupfinance-ssl-error.log"

# All SoupFinance logs at once
$SSH "tail -f /var/log/apache2/*soupfinance*"

# Recent errors (last 50 lines)
$SSH "tail -50 /var/log/apache2/app.soupfinance.com-ssl-error.log"

# Search for specific error
$SSH "grep -i 'proxy' /var/log/apache2/app.soupfinance.com-ssl-error.log | tail -20"
```

---

## Deployment Procedures

### Deploy React App (app.soupfinance.com)

```bash
cd soupfinance-web
./deploy/deploy-to-production.sh
```

The script:
1. Runs `npm run build` (TypeScript check + Vite production build)
2. Rsync `dist/` contents to `/var/www/soupfinance/` on server
3. Uses SSH key `~/.ssh/crypttransact_rsa`

### Deploy Landing Page (www.soupfinance.com)

```bash
cd soupfinance-landing
./deploy-landing.sh
```

### Deploy VHost Config Change

```bash
# 1. Edit local copy
vim soupfinance-web/deploy/app-soupfinance-com.conf

# 2. Push to server
scp -i ~/.ssh/crypttransact_rsa \
    soupfinance-web/deploy/app-soupfinance-com.conf \
    root@65.20.112.224:/etc/apache2/sites-available/

# 3. Test and reload (NEVER restart — reload is zero-downtime)
ssh -i ~/.ssh/crypttransact_rsa root@65.20.112.224 \
    "apache2ctl configtest && systemctl reload apache2"

# 4. Verify
curl -sI https://app.soupfinance.com/login
# Expected: HTTP/2 200, content-type: text/html
```

### Deploy Landing Page VHost Config Change

```bash
# 1. Edit local copy
vim soupfinance-landing/deploy/www-soupfinance-com.conf

# 2. Push to server
scp -i ~/.ssh/crypttransact_rsa \
    soupfinance-landing/deploy/www-soupfinance-com.conf \
    root@65.20.112.224:/etc/apache2/sites-available/

# 3. Test and reload
ssh -i ~/.ssh/crypttransact_rsa root@65.20.112.224 \
    "apache2ctl configtest && systemctl reload apache2"

# 4. Verify
curl -sI https://www.soupfinance.com/
# Expected: HTTP/2 200, content-type: text/html
```

### HARD RULES for Deployment

1. **Always use `systemctl reload`**, NEVER `systemctl restart`** — Reload is zero-downtime; restart drops all active connections
2. **Always run `apache2ctl configtest` BEFORE reload** — A syntax error in config will take down ALL sites on the server
3. **Always update the local copy first**, then push to server — The local copy in the repo is the source of truth
4. **Never edit configs directly on the server** — Always edit locally, commit, then push

---

## Known Issues and Cleanup

### ISSUE 1: Duplicate Landing Page Config (PRIORITY: MEDIUM)

**Problem**: Two landing page configs are active in `sites-enabled/`:

| File | Type | Status |
|------|------|--------|
| `001-soupfinance-landing.conf` | Regular file (NOT symlink) | **OLD — should be removed** |
| `www-soupfinance-com.conf` | Symlink → sites-available | **CURRENT — keep this** |

The old `001-soupfinance-landing.conf` was the original config before the performance-optimized `www-soupfinance-com.conf` was created. Both serve the same domain but with different routing (old one doesn't redirect HTTP→HTTPS or bare→www).

Because `001-` sorts first alphabetically, it becomes the **default VHost** for port 80 and port 443. This means unmatched requests go to the old config, not the new one.

**Impact**: Currently low because all SoupFinance domains have matching VHosts. But it means the default fallback for unknown domains on port 443 goes to the old landing page config.

**Fix**:
```bash
ssh -i ~/.ssh/crypttransact_rsa root@65.20.112.224 \
    "rm /etc/apache2/sites-enabled/001-soupfinance-landing.conf \
     && rm /etc/apache2/sites-enabled/001-soupfinance-landing.conf.backup \
     && rm /etc/apache2/sites-enabled/001-soupfinance-landing.conf.bak \
     && apache2ctl configtest && systemctl reload apache2"
```

### ISSUE 2: Backup Files in sites-enabled (PRIORITY: LOW)

**Problem**: `001-soupfinance-landing.conf.backup` and `001-soupfinance-landing.conf.bak` are in `sites-enabled/`. Apache ignores files that don't end in `.conf`, but they clutter the directory.

**Fix**: Remove them during Issue 1 cleanup (see command above).

### ISSUE 3: Backup Files in sites-available (PRIORITY: LOW)

**Problem**: Multiple `.backup` and `.bak` files for `app-soupfinance-com.conf` in `sites-available/`.

**Fix**:
```bash
ssh -i ~/.ssh/crypttransact_rsa root@65.20.112.224 \
    "rm /etc/apache2/sites-available/app-soupfinance-com.conf.backup.* \
     && rm /etc/apache2/sites-available/app-soupfinance-com.conf.bak"
```

### ISSUE 4: App VHost Missing Certbot SSL Options (PRIORITY: LOW)

**Problem**: The landing page VHost includes `/etc/letsencrypt/options-ssl-apache.conf` for recommended SSL settings. The app VHost does not.

**Impact**: Minimal — Cloudflare handles TLS termination for most users. The SSL settings only affect direct-to-origin requests.

**Fix** (optional):
```apache
# Add to port 443 VHost after SSLCertificateKeyFile:
Include /etc/letsencrypt/options-ssl-apache.conf
```

---

## Troubleshooting Playbook

### Symptom: app.soupfinance.com shows landing page instead of React app

**Root cause**: Missing or broken port 443 SSL VHost for `app.soupfinance.com`.

**Diagnosis**:
```bash
# Check if SSL VHost exists
ssh -i ~/.ssh/crypttransact_rsa root@65.20.112.224 "apache2ctl -S | grep app.soupfinance"
# MUST show port 443 entry

# Test direct HTTPS to origin
curl -skI -H "Host: app.soupfinance.com" "https://65.20.112.224/"
# Should return HTML with <div id="root">

# Test through Cloudflare
curl -sI "https://app.soupfinance.com/login"
# Should return HTTP/2 200
```

**Fix**: Ensure `app-soupfinance-com.conf` has BOTH port 80 and port 443 VHost blocks. Push and reload.

### Symptom: API calls return 403 Forbidden

**Root cause**: Missing or incorrect `Api-Authorization` header.

**Diagnosis**:
```bash
# Test API through Apache
curl -s "https://app.soupfinance.com/rest/api/login" \
    -X POST -H "Content-Type: application/json" \
    -d '{"username":"test","password":"test"}'
# Should return JSON (even if "Invalid username or password")
# If returns HTML or 403 → Api-Authorization header is wrong

# Verify ApiConsumer exists in production DB
ssh root@140.82.32.141 "mysql -u soupbroker -p'Dominus@soupbroker.2020' soupbroker \
    -e \"SELECT id, name FROM api_consumer WHERE name LIKE '%SoupFinance%'\""
```

**Fix**: Verify the base64 encoding matches `name:secret` from the `api_consumer` table.

### Symptom: SPA routes return 404

**Root cause**: Missing RewriteEngine rules or missing rewrite exclusion for a new API path.

**Diagnosis**:
```bash
# Test a SPA route
curl -sI "https://app.soupfinance.com/invoices"
# Should return 200 (index.html)

# Test an API route
curl -sI "https://app.soupfinance.com/rest/api/login"
# Should NOT return index.html — should proxy to backend
```

**Fix**: Check that `RewriteEngine On` is present and all API paths have `RewriteCond` exclusions.

### Symptom: SSL certificate expired

**Diagnosis**:
```bash
ssh -i ~/.ssh/crypttransact_rsa root@65.20.112.224 "certbot certificates"
```

**Fix**:
```bash
ssh -i ~/.ssh/crypttransact_rsa root@65.20.112.224 \
    "certbot renew --cert-name app.soupfinance.com && systemctl reload apache2"
```

### Symptom: Apache won't start/reload after config change

**Diagnosis**:
```bash
ssh -i ~/.ssh/crypttransact_rsa root@65.20.112.224 "apache2ctl configtest"
# Will show specific syntax error and line number
```

**Fix**: Correct the syntax error in the config file. ALWAYS test before reload.

### Symptom: 421 Misdirected Request on direct IP access

**Explanation**: This is EXPECTED when accessing `https://65.20.112.224` with a `Host: app.soupfinance.com` header via curl. The SNI (Server Name Indication) doesn't match because curl's TLS handshake uses the IP, not the hostname.

**This is NOT a bug**. The site is designed to be accessed via domain name through Cloudflare, not via direct IP.

### Symptom: www.soupfinance.com shows React app instead of landing page

**Root cause**: DNS misconfiguration in Cloudflare, or wrong VHost serving content.

**Diagnosis**:
```bash
# Check what www returns
curl -s "https://www.soupfinance.com" | grep '<title>'
# Should be: "SoupFinance - Corporate Accounting" (landing page title)
# If it's: "soupfinance-web" → wrong VHost is serving

# Check VHost mapping
ssh -i ~/.ssh/crypttransact_rsa root@65.20.112.224 "apache2ctl -S | grep www"
```

---

## Hard Rules

### NEVER DO

| Rule | Consequence of Violation |
|------|--------------------------|
| NEVER `systemctl restart apache2` | Drops ALL connections, causes downtime for ALL sites on server |
| NEVER edit configs directly on server | Changes get overwritten on next deploy; no git history |
| NEVER skip `apache2ctl configtest` | Syntax error will take down ALL 5 sites on the server |
| NEVER commit Api-Authorization credentials to git | Security breach: exposes ApiConsumer secret |
| NEVER modify soupmarkets VHosts from soupfinance context | Those are managed by a different project |
| NEVER remove port 443 VHost | Cloudflare won't be able to reach the site |
| NEVER add login forms to the landing page | Domain separation rule: app.soupfinance.com handles auth |
| NEVER deploy to soupmarkets production servers | See `.claude/rules/deployment-restrictions.md` |

### ALWAYS DO

| Rule | Reason |
|------|--------|
| ALWAYS edit local copy first, then push | Git tracks all changes |
| ALWAYS `apache2ctl configtest` before reload | Prevents catastrophic config errors |
| ALWAYS use `systemctl reload` (not restart) | Zero-downtime config update |
| ALWAYS update BOTH port 80 and 443 blocks | They must stay in sync |
| ALWAYS add RewriteCond when adding ProxyPass | Prevents SPA from catching API routes |
| ALWAYS verify after deploy | Curl the site to confirm it works |
| ALWAYS use SSH key `~/.ssh/crypttransact_rsa` | Only key with server access |

---

## Verification Commands

### Quick Health Check (run after any change)

```bash
SSH="ssh -i ~/.ssh/crypttransact_rsa root@65.20.112.224"

# 1. Config syntax
$SSH "apache2ctl configtest"

# 2. VHost mapping
$SSH "apache2ctl -S 2>&1 | grep soupfinance"

# 3. App returns React SPA
curl -s "https://app.soupfinance.com/login" | grep 'id="root"'

# 4. Landing page returns HTML
curl -s "https://www.soupfinance.com/" | grep '<title>'

# 5. API proxy works
curl -s "https://app.soupfinance.com/rest/api/login" \
    -X POST -H "Content-Type: application/json" \
    -d '{"username":"test","password":"test"}' | grep -E 'error|token'

# 6. Bare domain redirects to www
curl -sI "https://soupfinance.com/" | grep location
# Expected: location: https://www.soupfinance.com/

# 7. SSL certificates valid
$SSH "certbot certificates 2>&1 | grep -E 'soupfinance|Expiry'"
```

### Full Audit

```bash
SSH="ssh -i ~/.ssh/crypttransact_rsa root@65.20.112.224"

echo "=== Enabled Sites ==="
$SSH "ls -la /etc/apache2/sites-enabled/"

echo "=== VHost Mapping ==="
$SSH "apache2ctl -S 2>&1"

echo "=== Loaded Modules ==="
$SSH "apache2ctl -M 2>&1 | grep -E 'ssl|proxy|rewrite|headers|deflate|expires'"

echo "=== SSL Certificates ==="
$SSH "certbot certificates 2>&1"

echo "=== Disk Usage ==="
$SSH "du -sh /var/www/soupfinance/ /var/www/soupfinance-landing/"

echo "=== Recent Errors ==="
$SSH "tail -5 /var/log/apache2/app.soupfinance.com-ssl-error.log"
$SSH "tail -5 /var/log/apache2/www-soupfinance-ssl-error.log"
```
