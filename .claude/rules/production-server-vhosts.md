# Production Server VirtualHost Configuration (HARD RULES)

**Last verified**: 2026-02-06 | **Server**: 65.20.112.224 | **Apache**: 2.4.52 (Ubuntu)

This document is the **single source of truth** for all Apache VirtualHost configuration on the SoupFinance production origin server. It is modularized into focused topic files under [`production-server-vhosts/`](./production-server-vhosts/) — load only the modules relevant to your task.

---

## Modules

| Module | Covers | Load When |
|--------|--------|-----------|
| [infrastructure](./production-server-vhosts/infrastructure.md) | Server, OS, Apache version, SSH key, document roots, network architecture, Apache modules | Onboarding, troubleshooting routing, enabling modules |
| [vhost-inventory](./production-server-vhosts/vhost-inventory.md) | Active config files in `sites-enabled/` + backup files | Auditing what's enabled, planning cleanup |
| [app-vhost](./production-server-vhosts/app-vhost.md) | `app.soupfinance.com` config, SPA rewrite rules, proxy routes, full authoritative config | Editing the React SPA VHost, adding a new proxy path |
| [landing-vhost](./production-server-vhosts/landing-vhost.md) | `www.soupfinance.com` config, redirects, caching, compression, security headers | Editing landing page VHost, tuning cache/compression |
| [colocated-vhosts](./production-server-vhosts/colocated-vhosts.md) | `app.soupmarkets.com` + `soupmarkets.com` (read-only reference) | Understanding what else runs on this server |
| [ssl-certificates](./production-server-vhosts/ssl-certificates.md) | Let's Encrypt cert inventory, file layout, renewal commands | Cert expiry checks, manual renewal |
| [api-authorization](./production-server-vhosts/api-authorization.md) | `Api-Authorization` header injection (ApiConsumer auth) | Debugging 403s, rotating ApiConsumer secret |
| [operations](./production-server-vhosts/operations.md) | Logging, deployment procedures, verification commands | Day-to-day deploys, health checks, post-deploy audits |
| [troubleshooting](./production-server-vhosts/troubleshooting.md) | Hard rules (do/don't), known issues + cleanup, symptom→fix playbook | Anything broken; quick-reference hard rules |

---

## Quick Reference

| Property | Value |
|----------|-------|
| **Server IP** | `65.20.112.224` |
| **SSH** | `ssh -i ~/.ssh/crypttransact_rsa root@65.20.112.224` |
| **App VHost config** | `/etc/apache2/sites-available/app-soupfinance-com.conf` |
| **App canonical local copy** | `soupfinance-web/deploy/apache-soupfinance.conf` (only file the deploy script uploads) |
| **Landing VHost config** | `/etc/apache2/sites-available/www-soupfinance-com.conf` |
| **App document root** | `/var/www/soupfinance` |
| **Landing document root** | `/var/www/soupfinance-landing` |
| **Reload Apache** | `apache2ctl configtest && systemctl reload apache2` (NEVER restart) |

---

## Common Tasks → Module Map

| Task | Modules to Read |
|------|----------------|
| "Why is app.soupfinance.com serving the landing page?" | [troubleshooting](./production-server-vhosts/troubleshooting.md) → [app-vhost](./production-server-vhosts/app-vhost.md) |
| "Add a new proxy path /webhook/" | [app-vhost](./production-server-vhosts/app-vhost.md) (Adding a New Proxy Path checklist) |
| "API returns 403" | [api-authorization](./production-server-vhosts/api-authorization.md) → [troubleshooting](./production-server-vhosts/troubleshooting.md) |
| "Deploy a config change" | [operations](./production-server-vhosts/operations.md) → [troubleshooting](./production-server-vhosts/troubleshooting.md) (hard rules) |
| "Renew SSL certificate" | [ssl-certificates](./production-server-vhosts/ssl-certificates.md) |
| "SPA route returns 404" | [troubleshooting](./production-server-vhosts/troubleshooting.md) → [app-vhost](./production-server-vhosts/app-vhost.md) |
| "Audit what's running on the server" | [vhost-inventory](./production-server-vhosts/vhost-inventory.md) → [infrastructure](./production-server-vhosts/infrastructure.md) |
| "Tune landing page performance" | [landing-vhost](./production-server-vhosts/landing-vhost.md) |

---

## Related Rules

- [cloudflare-ssl-configuration](./cloudflare-ssl-configuration.md) — Cloudflare Full SSL mode requirements
- [soupfinance-deployment](./soupfinance-deployment.md) — Deploy script canonical config rule, trailing-slash rule
- [deployment-restrictions](./deployment-restrictions.md) — Never deploy to Soupmarkets production servers
- [soupfinance-domain-architecture](./soupfinance-domain-architecture.md) — Domain separation (landing vs app)
