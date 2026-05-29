# Colocated Soupmarkets VHosts

**Part of**: [production-server-vhosts](../production-server-vhosts.md)

The same server (65.20.112.224) hosts two Soupmarkets VHosts. These proxy to a local Varnish cache (port 6081) which fronts Tomcat.

---

## app.soupmarkets.com

| Property | Value |
|----------|-------|
| **Config** | `app.soupmarkets.com.conf` |
| **Port 80** | 301 redirect to HTTPS |
| **Port 443** | Proxy all to `http://localhost:6081/` |
| **Backend** | Varnish (6081) → Tomcat |
| **SSL Cert** | `/etc/letsencrypt/live/app.soupmarkets.com/` |
| **Special** | `LimitRequestLine 81900` (large query strings) |

## soupmarkets.com

| Property | Value |
|----------|-------|
| **Config** | `soupmarkets.com.conf` |
| **Port 80** | 301 redirect to HTTPS |
| **Port 443** | Proxy all to `http://localhost:6081/` |
| **Backend** | Varnish (6081) → Tomcat |
| **SSL Cert** | `/etc/letsencrypt/live/soupmarkets.com/` |
| **Special** | `LimitRequestLine 81900` |

---

## HARD RULE

**NEVER modify the Soupmarkets VHost configs from the SoupFinance project context.** These are managed separately.

See also: [deployment-restrictions](../deployment-restrictions.md) — never deploy to Soupmarkets production servers.
