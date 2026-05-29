# App VHost: app.soupfinance.com

**Part of**: [production-server-vhosts](../production-server-vhosts.md)

**Config file**: `/etc/apache2/sites-available/app-soupfinance-com.conf`
**Local copy (canonical)**: `soupfinance-web/deploy/apache-soupfinance.conf` (deploy script uploads this file)
**NOTE**: `soupfinance-web/deploy/app-soupfinance-com.conf` is a STALE COPY — do NOT edit it
**Enabled via**: Symlink in `sites-enabled/`

---

## Purpose

Serves the SoupFinance React SPA and proxies API requests to the soupmarkets-web Grails backend at `tas.soupmarkets.com`.

---

## VHost Blocks

### Port 80 (HTTP)

| Directive | Value | Purpose |
|-----------|-------|---------|
| `ServerName` | `app.soupfinance.com` | Match requests for this domain |
| `DocumentRoot` | `/var/www/soupfinance` | React SPA build output |
| `RewriteEngine` | On | SPA client-side routing |
| `SSLProxyEngine` | On | Forward proxy requests over HTTPS |
| `ProxyPreserveHost` | Off | Send backend hostname, not client hostname |
| `Api-Authorization` | `Basic {base64}` | Authenticate with backend ApiConsumer (see [api-authorization](./api-authorization.md)) |

### Port 443 (HTTPS) — CRITICAL for Cloudflare

Same as port 80 plus:

| Directive | Value | Purpose |
|-----------|-------|---------|
| `SSLEngine` | On | Enable SSL |
| `SSLCertificateFile` | `/etc/letsencrypt/live/app.soupfinance.com/fullchain.pem` | Let's Encrypt cert |
| `SSLCertificateKeyFile` | `/etc/letsencrypt/live/app.soupfinance.com/privkey.pem` | Let's Encrypt key |

---

## SPA Rewrite Rules

The React SPA uses client-side routing (React Router). Apache must serve `index.html` for all non-file, non-API paths:

```apache
RewriteEngine On
RewriteBase /
RewriteRule ^index\.html$ - [L]                    # index.html → serve directly
RewriteCond %{REQUEST_FILENAME} !-f                # NOT a real file
RewriteCond %{REQUEST_FILENAME} !-d                # NOT a real directory
RewriteCond %{REQUEST_URI} !^/rest/                # NOT API (trailing slash required)
RewriteCond %{REQUEST_URI} !^/application/         # NOT health check
RewriteCond %{REQUEST_URI} !^/client/              # NOT client API (prevents /clients/new match)
RewriteCond %{REQUEST_URI} !^/account/             # NOT registration API (prevents /accounting match)
RewriteRule . /index.html [L]                      # Serve SPA entry point
```

**RULE**: If you add a new proxy path (e.g., `/webhook/`), you MUST also add a `RewriteCond %{REQUEST_URI} !^/webhook/` exclusion (with trailing slash) in BOTH port 80 and port 443 blocks.

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

When adding a new proxy path (e.g., `/webhook/`):

1. Add `RewriteCond %{REQUEST_URI} !^/webhook/` to **port 80 Directory block** (trailing slash!)
2. Add `RewriteCond %{REQUEST_URI} !^/webhook/` to **port 443 Directory block** (trailing slash!)
3. Add `ProxyPass /webhook/ https://tas.soupmarkets.com/webhook/` to **port 80** (trailing slash!)
4. Add `ProxyPassReverse /webhook/ https://tas.soupmarkets.com/webhook/` to **port 80**
5. Add `ProxyPass /webhook/ https://tas.soupmarkets.com/webhook/` to **port 443** (trailing slash!)
6. Add `ProxyPassReverse /webhook/ https://tas.soupmarkets.com/webhook/` to **port 443**
7. Test: `apache2ctl configtest && systemctl reload apache2`
8. Update canonical config: `soupfinance-web/deploy/apache-soupfinance.conf` (NOT `app-soupfinance-com.conf`)
9. Commit the local copy change

**HARD RULE**: Both VHost blocks (80 and 443) MUST have identical rewrite exclusions and proxy routes. They diverge only in SSL directives.

---

## Proxy Routes

| Path | Backend Target | Purpose |
|------|---------------|---------|
| `/rest/*` | `https://tas.soupmarkets.com/rest` | All REST API endpoints |
| `/application/*` | `https://tas.soupmarkets.com/application` | Health/status endpoints |
| `/client/*` | `https://tas.soupmarkets.com/client` | Public client API |
| `/account/*` | `https://tas.soupmarkets.com/account` | Tenant registration |

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

## Injected Headers

| Header | Value | Purpose |
|--------|-------|---------|
| `Api-Authorization` | `Basic {base64(name:secret)}` | Backend ApiConsumer authentication |
| `X-Forwarded-Proto` | `https` | Tell backend the original protocol |
| `X-Forwarded-Host` | `app.soupfinance.com` | Tell backend the original domain |
| `X-Real-IP` | `%{REMOTE_ADDR}s` | Client IP (port 80 only) |

---

## Full Config (Authoritative — mirrors `deploy/apache-soupfinance.conf`)

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
        RewriteCond %{REQUEST_URI} !^/rest/
        RewriteCond %{REQUEST_URI} !^/application/
        RewriteCond %{REQUEST_URI} !^/client/
        RewriteCond %{REQUEST_URI} !^/account/
        RewriteRule . /index.html [L]
    </Directory>

    SSLProxyEngine On
    ProxyPreserveHost Off
    ProxyRequests Off

    RequestHeader set Api-Authorization "Basic {BASE64_CREDENTIALS}"

    ProxyPass /rest/ https://tas.soupmarkets.com/rest/
    ProxyPassReverse /rest/ https://tas.soupmarkets.com/rest/
    ProxyPass /application/ https://tas.soupmarkets.com/application/
    ProxyPassReverse /application/ https://tas.soupmarkets.com/application/
    ProxyPass /client/ https://tas.soupmarkets.com/client/
    ProxyPassReverse /client/ https://tas.soupmarkets.com/client/
    ProxyPass /account/ https://tas.soupmarkets.com/account/
    ProxyPassReverse /account/ https://tas.soupmarkets.com/account/

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
        RewriteCond %{REQUEST_URI} !^/rest/
        RewriteCond %{REQUEST_URI} !^/application/
        RewriteCond %{REQUEST_URI} !^/client/
        RewriteCond %{REQUEST_URI} !^/account/
        RewriteRule . /index.html [L]
    </Directory>

    SSLProxyEngine On
    ProxyPreserveHost Off
    ProxyRequests Off

    RequestHeader set Api-Authorization "Basic {BASE64_CREDENTIALS}"

    ProxyPass /rest/ https://tas.soupmarkets.com/rest/
    ProxyPassReverse /rest/ https://tas.soupmarkets.com/rest/
    ProxyPass /application/ https://tas.soupmarkets.com/application/
    ProxyPassReverse /application/ https://tas.soupmarkets.com/application/
    ProxyPass /client/ https://tas.soupmarkets.com/client/
    ProxyPassReverse /client/ https://tas.soupmarkets.com/client/
    ProxyPass /account/ https://tas.soupmarkets.com/account/
    ProxyPassReverse /account/ https://tas.soupmarkets.com/account/

    RequestHeader set X-Forwarded-Proto "https"
    RequestHeader set X-Forwarded-Host "app.soupfinance.com"

    ErrorLog ${APACHE_LOG_DIR}/app.soupfinance.com-ssl-error.log
    CustomLog ${APACHE_LOG_DIR}/app.soupfinance.com-ssl-access.log combined
</VirtualHost>
```

**NOTE**: `{BASE64_CREDENTIALS}` is a placeholder. The real base64-encoded `ApiConsumer name:secret` is in the actual config file. See [api-authorization](./api-authorization.md).
