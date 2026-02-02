# Cloudflare SSL Configuration for SoupFinance

## Critical: Apache MUST Have SSL VirtualHost on Port 443

**Problem:** Cloudflare uses "Full (strict)" SSL mode, which means it connects to the origin server on **port 443 (HTTPS)**, NOT port 80 (HTTP).

If Apache only has an HTTP VirtualHost (`<VirtualHost *:80>`), Cloudflare requests will:
- Return 404 for SPA routes like `/login`, `/register`, `/dashboard`
- Only `/` might work if there's a default SSL vhost

## Architecture

```
User Browser (HTTPS) -> Cloudflare -> Origin Server (HTTPS port 443)
                                   -> Apache SSL VirtualHost
                                   -> /var/www/soupfinance/index.html
```

## Required Apache Configuration

Both domains MUST have **two VirtualHosts**:

### 1. app.soupfinance.com (React SPA)

```apache
# HTTP VirtualHost (port 80) - for direct access/testing
<VirtualHost *:80>
    ServerName app.soupfinance.com
    DocumentRoot /var/www/soupfinance
    # ... SPA routing rules ...
</VirtualHost>

# HTTPS VirtualHost (port 443) - REQUIRED for Cloudflare
<VirtualHost *:443>
    ServerName app.soupfinance.com

    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/app.soupfinance.com/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/app.soupfinance.com/privkey.pem

    DocumentRoot /var/www/soupfinance

    <Directory /var/www/soupfinance>
        # SPA routing - serve index.html for all non-file/API routes
        RewriteEngine On
        RewriteBase /
        RewriteRule ^index\.html$ - [L]
        RewriteCond %{REQUEST_FILENAME} !-f
        RewriteCond %{REQUEST_FILENAME} !-d
        RewriteCond %{REQUEST_URI} !^/rest
        RewriteCond %{REQUEST_URI} !^/account
        RewriteCond %{REQUEST_URI} !^/client
        RewriteRule . /index.html [L]
    </Directory>

    # API Proxy
    SSLProxyEngine On
    ProxyPass /rest https://tas.soupmarkets.com/rest
    ProxyPassReverse /rest https://tas.soupmarkets.com/rest
    # ... other proxy rules ...
</VirtualHost>
```

### 2. www.soupfinance.com (Landing Page)

```apache
# HTTP VirtualHost (port 80)
<VirtualHost *:80>
    ServerName www.soupfinance.com
    ServerAlias soupfinance.com
    DocumentRoot /var/www/soupfinance-landing
</VirtualHost>

# HTTPS VirtualHost (port 443) - REQUIRED for Cloudflare
<VirtualHost *:443>
    ServerName www.soupfinance.com
    ServerAlias soupfinance.com

    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/soupfinance.com/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/soupfinance.com/privkey.pem

    DocumentRoot /var/www/soupfinance-landing
</VirtualHost>
```

## Debugging SSL Issues

### Symptoms of Missing SSL VirtualHost
- Root URL `/` returns 200, but `/login`, `/register`, `/dashboard` return 404
- Direct HTTP test (`curl http://IP/login`) works, but HTTPS through Cloudflare fails
- `cf-cache-status: DYNAMIC` in response but still 404

### Diagnostic Commands

```bash
# Test direct to origin on port 80 (should work if HTTP vhost exists)
curl -sI -H "Host: app.soupfinance.com" "http://65.20.112.224/login"

# Test direct to origin on port 443 (will fail if no SSL vhost)
curl -skI -H "Host: app.soupfinance.com" "https://65.20.112.224/login"

# Test through Cloudflare
curl -sI "https://app.soupfinance.com/login"

# Check Apache access logs for incoming requests
tail -f /var/log/apache2/app.soupfinance.com-ssl-access.log
```

### If 404 Through Cloudflare But 200 Direct:

1. Check if SSL vhost exists on port 443
2. Check if SSL certificate is valid
3. Verify Apache has `mod_ssl` enabled: `a2enmod ssl`
4. Reload Apache: `systemctl reload apache2`

## SSL Certificates

Managed by Let's Encrypt certbot. Certificates are at:
- `/etc/letsencrypt/live/app.soupfinance.com/`
- `/etc/letsencrypt/live/soupfinance.com/`

Renewal is automatic via certbot cron/timer.

## Server Details

- **Server IP**: 65.20.112.224
- **SSH Key**: `~/.ssh/crypttransact_rsa`
- **Apache Config Location**: `/etc/apache2/sites-available/`
- **App Document Root**: `/var/www/soupfinance`
- **Landing Document Root**: `/var/www/soupfinance-landing`
