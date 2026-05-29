# Production Server Infrastructure

**Part of**: [production-server-vhosts](../production-server-vhosts.md)
**Last verified**: 2026-02-06 | **Server**: 65.20.112.224 | **Apache**: 2.4.52 (Ubuntu)

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

**Default server for port 443**: `001-soupfinance-landing.conf` (because `001-` prefix sorts first alphabetically). See [troubleshooting](./troubleshooting.md) for the cleanup plan.

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
