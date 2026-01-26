# SoupFinance Deployment

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Production Architecture                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   User Browser                                                          │
│        │                                                                │
│        ▼                                                                │
│   ┌─────────────────┐                                                   │
│   │   Cloudflare    │  DNS + SSL termination                           │
│   │   (CDN/WAF)     │                                                   │
│   └────────┬────────┘                                                   │
│            │                                                            │
│            ▼                                                            │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │  Origin Server: 140.82.32.141                                    │  │
│   │  ┌─────────────────────────────────────────────────────────────┐│  │
│   │  │ Apache VirtualHost: app.soupfinance.com                     ││  │
│   │  │                                                             ││  │
│   │  │  Static Files (/var/www/soupfinance)                       ││  │
│   │  │  └── index.html, assets/*                                  ││  │
│   │  │                                                             ││  │
│   │  │  API Proxy (/rest/*, /application/*, /client/*)            ││  │
│   │  │  └──────────────────────────────────────────────────────┐  ││  │
│   │  └─────────────────────────────────────────────────────────│──┘│  │
│   │                                                            │    │  │
│   │  ┌─────────────────────────────────────────────────────────▼──┐│  │
│   │  │ Apache VirtualHost: tas.soupmarkets.com                    ││  │
│   │  │ └── Varnish (6081) -> Tomcat (8080) -> soupmarkets-web     ││  │
│   │  └────────────────────────────────────────────────────────────┘│  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Deployment Rules

### Domain-Only Access
- **NEVER** access via direct IP address
- Always use domain names: `app.soupfinance.com`, `www.soupfinance.com`
- Direct IP requests fall through to default vhost (not SoupFinance)

### API Backend
- SoupFinance uses `tas.soupmarkets.com` as the backend API
- API calls (`/rest/*`, `/application/*`, `/client/*`) are proxied to backend
- Backend is the TAS tenant of soupmarkets-web

### DNS/SSL
- DNS managed via Cloudflare
- SSL termination at Cloudflare (Flexible or Full mode)
- Origin server accepts HTTP from Cloudflare

## Files

| File | Purpose |
|------|---------|
| `deploy-to-demo.sh` | Deploy to demo server (140.82.32.141) |
| `deploy-to-production.sh` | Deploy to production (65.20.112.224) |
| `apache-soupfinance.conf` | Apache vhost configuration |
| `README.md` | This documentation |

## Deployment Commands

### Deploy to Demo/Production Server
```bash
# Demo deployment (140.82.32.141)
./deploy/deploy-to-demo.sh

# Production deployment (65.20.112.224)
./deploy/deploy-to-production.sh
```

### Manual Deployment Steps
```bash
# 1. Build frontend
npm run build

# 2. Deploy files to server
rsync -avz --delete dist/ root@140.82.32.141:/var/www/soupfinance/

# 3. Deploy Apache config (if changed)
scp deploy/apache-soupfinance.conf root@140.82.32.141:/etc/apache2/sites-available/soupfinance-demo.conf
ssh root@140.82.32.141 "a2ensite soupfinance-demo.conf && apache2ctl configtest && systemctl reload apache2"
```

### Verify Deployment
```bash
# Test with Host header (since direct IP won't work)
curl -I -H "Host: app.soupfinance.com" http://140.82.32.141/

# Test API proxy
curl -I -H "Host: app.soupfinance.com" http://140.82.32.141/rest/customer

# Or use the actual domain (requires DNS)
curl -I https://app.soupfinance.com/
```

## Server Configuration

### Apache Modules Required
```bash
a2enmod proxy proxy_http proxy_ssl headers rewrite ssl
```

### VirtualHost Configuration
The Apache vhost (`/etc/apache2/sites-available/soupfinance-demo.conf`):
- ServerName: `app.soupfinance.com`
- DocumentRoot: `/var/www/soupfinance`
- SPA routing: All non-file requests -> `index.html`
- API proxy: `/rest/*` -> `https://tas.soupmarkets.com/rest`

### Logging
- Error log: `/var/log/apache2/app.soupfinance.com-error.log`
- Access log: `/var/log/apache2/app.soupfinance.com-access.log`

## Troubleshooting

### Site not accessible via domain
1. Check Cloudflare DNS is configured correctly
2. Verify Apache vhost is enabled: `a2ensite soupfinance-demo.conf`
3. Check Apache config: `apache2ctl configtest`

### API calls failing
1. Check API proxy is configured in Apache vhost
2. Verify `tas.soupmarkets.com` is accessible from server
3. Check Apache error logs for proxy errors

### 403/404 errors
1. Check file permissions: `chown -R www-data:www-data /var/www/soupfinance`
2. Verify files are deployed: `ls -la /var/www/soupfinance`
3. Check Apache Directory permissions in vhost config

## Related Documentation
- [SoupFinance Web README](../README.md)
- [soupmarkets-web deployment](../../soupmarkets-web/docs/deployment.md)
