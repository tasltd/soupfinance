# VirtualHost Inventory

**Part of**: [production-server-vhosts](../production-server-vhosts.md)
**Server**: 65.20.112.224

Single source of truth for which Apache config files are active on the origin server.

---

## Active Config Files (sites-enabled)

| Config File | Type | Domain(s) | Port 80 | Port 443 | Notes |
|-------------|------|-----------|:-------:|:--------:|-------|
| `001-soupfinance-landing.conf` | **Regular file** | www.soupfinance.com, soupfinance.com | Yes | Yes | **OLD** — should be removed (see [troubleshooting](./troubleshooting.md)) |
| `app-soupfinance-com.conf` | Symlink | app.soupfinance.com | Yes | Yes | React SPA + API proxy (see [app-vhost](./app-vhost.md)) |
| `www-soupfinance-com.conf` | Symlink | www.soupfinance.com, soupfinance.com | Yes (redirect) | Yes (redirect + serve) | **CURRENT** landing page config (see [landing-vhost](./landing-vhost.md)) |
| `app.soupmarkets.com.conf` | Symlink | app.soupmarkets.com | Yes (redirect) | Yes (proxy) | Soupmarkets demo app (see [colocated-vhosts](./colocated-vhosts.md)) |
| `soupmarkets.com.conf` | Symlink | soupmarkets.com | Yes (redirect) | Yes (proxy) | Soupmarkets marketing (see [colocated-vhosts](./colocated-vhosts.md)) |

## Backup Files (sites-enabled — should be cleaned up)

| File | Purpose |
|------|---------|
| `001-soupfinance-landing.conf.backup` | Backup of old landing page config |
| `001-soupfinance-landing.conf.bak` | Another backup |

## Backup Files (sites-available)

| File | Purpose |
|------|---------|
| `app-soupfinance-com.conf.backup.20260121` | Pre-SSL fix backup |
| `app-soupfinance-com.conf.backup.20260121-194640` | Second backup |
| `app-soupfinance-com.conf.bak` | Another backup |

Cleanup commands for all backup files: see [troubleshooting](./troubleshooting.md) (Known Issues 1-3).
