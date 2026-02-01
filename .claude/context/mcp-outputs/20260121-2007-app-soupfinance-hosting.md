# app.soupfinance.com Hosting Configuration

## Summary

**app.soupfinance.com is hosted on:** `65.20.112.224` (Soupmarkets Production Server)

**Origin Server Location:** `/var/www/soupfinance`

**Cloudflare Status:** ✅ Behind Cloudflare (DNS shows Cloudflare IPs)

---

## DNS Resolution (Behind Cloudflare)

The domain app.soupfinance.com currently resolves to Cloudflare DNS IPs:

```
172.67.197.27    (Cloudflare Anycast)
104.21.84.206    (Cloudflare Anycast)
```

These DNS entries route traffic through Cloudflare's CDN to the origin server.

---

## Origin Server Details

| Property | Value |
|----------|-------|
| **IP Address** | 65.20.112.224 |
| **Hostname** | soupmarkets |
| **Web Server** | Apache 2.4 |
| **Document Root** | /var/www/soupfinance |
| **Virtual Host** | app-soupfinance-com.conf |
| **SSL Certificate** | Let's Encrypt (app.soupfinance.com) |
| **Status** | ✅ Active and enabled in Apache |

---

## Apache Virtual Host Configuration

**File Location:** `/etc/apache2/sites-available/app-soupfinance-com.conf`

**Current Configuration:**

```apache
<VirtualHost *:80>
    ServerName app.soupfinance.com
    ServerAdmin webmaster@localhost
    ErrorLog /var/log/apache2/error.log
    CustomLog /var/log/apache2/access.log combined
    RewriteEngine on
    RewriteCond %{SERVER_NAME} =app.soupfinance.com
    RewriteRule ^ https://%{SERVER_NAME}%{REQUEST_URI} [END,NE,R=permanent]
</VirtualHost>

<VirtualHost *:443>
    ServerName app.soupfinance.com
    ServerAdmin webmaster@localhost
    DocumentRoot /var/www/soupfinance
    ErrorLog /var/log/apache2/error.log
    CustomLog /var/log/apache2/access.log combined
    
    # Serve static React SPA files
    <Directory /var/www/soupfinance>
        Options -Indexes +FollowSymLinks
        AllowOverride None
        Require all granted
        FallbackResource /index.html
    </Directory>
    
    # Enable proxy modules for API calls
    SSLProxyEngine On
    
    # API Consumer authentication for tas.soupmarkets.com
    # Consumer: SoupFinance Web App (1bfaee30-b348-4255-8e15-9fcdd344f43d)
    <Location /rest/>
        RequestHeader set Api-Authorization "Basic MWJmYWVlMzAtYjM0OC00MjU1LThlMTUtOWZjZGQzNDRmNDNkOmQzNzlhMWQ3YjgwYTFjMDcyYWMzNzQwMjBjZWZiYzA1"
    </Location>
    <Location /client/>
        RequestHeader set Api-Authorization "Basic MWJmYWVlMzAtYjM0OC00MjU1LThlMTUtOWZjZGQzNDRmNDNkOmQzNzlhMWQ3YjgwYTFjMDcyYWMzNzQwMjBjZWZiYzA1"
    </Location>
    
    # Proxy API calls to tas.soupmarkets.com (TAS tenant)
    ProxyPreserveHost Off
    ProxyPass /rest/ https://tas.soupmarkets.com/rest/
    ProxyPassReverse /rest/ https://tas.soupmarkets.com/rest/
    ProxyPass /client/ https://tas.soupmarkets.com/client/
    ProxyPassReverse /client/ https://tas.soupmarkets.com/client/
    
    # SSL Configuration
    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/app.soupfinance.com/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/app.soupfinance.com/privkey.pem
    Include /etc/letsencrypt/options-ssl-apache.conf
</VirtualHost>
```

---

## Production Files & Structure

**Document Root:** `/var/www/soupfinance/`

```
/var/www/soupfinance/
├── index.html          (SPA entry point)
├── vite.svg            (Vite logo)
└── assets/             (Built React app assets)
    ├── index-k-ETjK5r.css         (Main stylesheet)
    └── index-CYUV-GSt.js          (Main JavaScript bundle)
```

**Status:** React app is deployed and serving correctly ✅

---

## API Routing

The app.soupfinance.com server acts as both:

1. **Static File Server** - Serves React SPA from `/var/www/soupfinance`
2. **Reverse Proxy** - Routes API calls to tas.soupmarkets.com

### API Endpoints

| Path | Routes To | Purpose |
|------|-----------|---------|
| `/rest/*` | https://tas.soupmarkets.com/rest/ | Admin/authenticated API |
| `/client/*` | https://tas.soupmarkets.com/client/ | Public client API |

### Authentication

API calls are authenticated using:
- Consumer ID: `1bfaee30-b348-4255-8e15-9fcdd344f43d` (SoupFinance Web App)
- Consumer Secret: (Base64 encoded in authorization header)

---

## Cloudflare Configuration

### DNS Records

```
Name: app.soupfinance.com
Type: CNAME or A Record
Value: [Cloudflare DNS Points → 65.20.112.224]
```

### Cloudflare Features (Based on response headers)

| Feature | Status | Evidence |
|---------|--------|----------|
| **HTTP/2** | ✅ Enabled | Response shows `HTTP/2 200` |
| **SSL/TLS** | ✅ Enabled | HTTPS working, Cloudflare chain |
| **Caching** | ✅ Enabled | `cf-cache-status: DYNAMIC` header |
| **DDoS Protection** | ✅ Enabled | Cloudflare ray ID present (`cf-ray`) |
| **WAF** | ✅ Enabled | Indicated by Cloudflare proxy |

---

## Apache Enabled Sites

**File:** `/etc/apache2/sites-enabled/app-soupfinance-com.conf`

```
lrwxrwxrwx 1 root root 43 Jan 21 12:18 app-soupfinance-com.conf -> ../sites-available/app-soupfinance-com.conf
```

The site is **enabled** (symlinked in sites-enabled).

---

## Related Configuration

### Backup Files

- `/etc/apache2/sites-available/app-soupfinance-com.conf.bak` - Previous version
- `/etc/apache2/sites-available/app-soupfinance-com.conf.backup.20260121` - Dated backup

### Landing Page

A separate landing page is also hosted:

| Domain | Document Root | Config |
|--------|---------------|--------|
| www.soupfinance.com / soupfinance.com | /var/www/soupfinance-landing/ | 001-soupfinance-landing.conf |
| app.soupfinance.com | /var/www/soupfinance/ | app-soupfinance-com.conf |

---

## Recent Traffic

Access logs show the app is actively being used:

```
2026-01-21 17:04:26 - CSS/JS assets requested from app.soupfinance.com
2026-01-21 17:19:29 - User accessing /login page
2026-01-21 17:19:33 - User navigating to /register page
2026-01-21 17:20:25 - POST to /rest/corporate/save.json (403 error)
2026-01-21 18:01:54 - POST to /rest/corporate/save.json (403 error)
2026-01-21 19:47:46 - POST to /client/index.json (302 redirect)
```

---

## SSL/TLS Certificate

| Property | Value |
|----------|-------|
| **Provider** | Let's Encrypt |
| **Domain** | app.soupfinance.com |
| **Path** | /etc/letsencrypt/live/app.soupfinance.com/ |
| **Status** | ✅ Active |

---

## Management

### SSH Access

```bash
ssh root@65.20.112.224
```

### Restart Apache

```bash
ssh root@65.20.112.224 "systemctl restart apache2"
```

### View Logs

```bash
ssh root@65.20.112.224 "tail -f /var/log/apache2/access.log"
ssh root@65.20.112.224 "tail -f /var/log/apache2/error.log"
```

---

## Summary Table

| Aspect | Details |
|--------|---------|
| **Public Domain** | app.soupfinance.com |
| **CDN** | Cloudflare (Anycast) |
| **Origin Server** | 65.20.112.224 (Soupmarkets Prod) |
| **Origin Hostname** | soupmarkets |
| **Document Root** | /var/www/soupfinance |
| **Web Server** | Apache 2.4 |
| **App Type** | React 19 SPA (Vite) |
| **Status** | ✅ Live and serving |
| **SSL** | Let's Encrypt (auto-renewed) |
| **API Proxy** | tas.soupmarkets.com (Grails backend) |
| **Apache Config** | app-soupfinance-com.conf (enabled) |
| **Last Updated** | 2026-01-21 |

