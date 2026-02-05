# Production Server VirtualHost Configuration

## Server Details

| Property | Value |
|----------|-------|
| **Server IP** | 65.20.112.224 |
| **SSH Access** | `ssh -i ~/.ssh/crypttransact_rsa root@65.20.112.224` |
| **Apache Config** | `/etc/apache2/sites-available/` |
| **Enabled Sites** | `/etc/apache2/sites-enabled/` |

## Enabled VirtualHosts

| Config File | Domain | Purpose |
|-------------|--------|---------|
| `app-soupfinance-com.conf` | app.soupfinance.com | React SPA (SoupFinance App) |
| `www-soupfinance-com.conf` | www.soupfinance.com | Landing Page (Static HTML) |
| `app.soupmarkets.com.conf` | app.soupmarkets.com | Soupmarkets Demo App |
| `soupmarkets.com.conf` | soupmarkets.com | Soupmarkets Marketing |

## SoupFinance VHost Configurations

### 1. app.soupfinance.com (React SPA)

**Config File:** `/etc/apache2/sites-available/app-soupfinance-com.conf`
**Local Copy:** `soupfinance-web/deploy/app-soupfinance-com.conf`

**Key Configuration:**
```apache
# Port 80 - HTTP (for direct access)
<VirtualHost *:80>
    ServerName app.soupfinance.com
    DocumentRoot /var/www/soupfinance

    # SPA Routing - serve index.html for all non-API routes
    RewriteEngine On
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteCond %{REQUEST_URI} !^/rest
    RewriteCond %{REQUEST_URI} !^/account
    RewriteRule . /index.html [L]

    # API Proxy to backend
    ProxyPass /rest https://tas.soupmarkets.com/rest
    ProxyPass /account https://tas.soupmarkets.com/account
</VirtualHost>

# Port 443 - HTTPS (REQUIRED for Cloudflare)
<VirtualHost *:443>
    ServerName app.soupfinance.com

    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/app.soupfinance.com/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/app.soupfinance.com/privkey.pem

    DocumentRoot /var/www/soupfinance

    # Same SPA routing and proxy rules as port 80
</VirtualHost>
```

**Proxy Endpoints:**
| Route | Backend |
|-------|---------|
| `/rest/*` | https://tas.soupmarkets.com/rest |
| `/account/*` | https://tas.soupmarkets.com/account |
| `/application/*` | https://tas.soupmarkets.com/application |
| `/client/*` | https://tas.soupmarkets.com/client |

### 2. www.soupfinance.com (Landing Page)

**Config File:** `/etc/apache2/sites-available/www-soupfinance-com.conf`
**Local Copy:** `soupfinance-landing/deploy/www-soupfinance-com.conf`

**Key Configuration:**
```apache
# Port 80 - HTTP
<VirtualHost *:80>
    ServerName www.soupfinance.com
    ServerAlias soupfinance.com
    DocumentRoot /var/www/soupfinance-landing
</VirtualHost>

# Port 443 - HTTPS (REQUIRED for Cloudflare)
<VirtualHost *:443>
    ServerName www.soupfinance.com
    ServerAlias soupfinance.com

    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/soupfinance.com/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/soupfinance.com/privkey.pem

    DocumentRoot /var/www/soupfinance-landing
</VirtualHost>
```

## Document Roots

| Domain | Document Root | Content |
|--------|---------------|---------|
| app.soupfinance.com | `/var/www/soupfinance` | React SPA build output |
| www.soupfinance.com | `/var/www/soupfinance-landing` | Static HTML landing page |

## SSL Certificates

Managed by Let's Encrypt certbot:

| Domain | Certificate Path |
|--------|------------------|
| app.soupfinance.com | `/etc/letsencrypt/live/app.soupfinance.com/` |
| soupfinance.com (www) | `/etc/letsencrypt/live/soupfinance.com/` |

## Apache Modules Required

```bash
a2enmod ssl proxy proxy_http headers rewrite expires deflate
```

## Deployment Commands

### Deploy React App
```bash
cd soupfinance-web
./deploy/deploy-to-production.sh
```

### Deploy Landing Page
```bash
SSH_KEY=~/.ssh/crypttransact_rsa
rsync -avz -e "ssh -i $SSH_KEY" \
    soupfinance-landing/*.html \
    soupfinance-landing/*.xml \
    soupfinance-landing/*.txt \
    soupfinance-landing/screenshots/ \
    root@65.20.112.224:/var/www/soupfinance-landing/
```

### Update VHost Config
```bash
# Copy new config
scp -i ~/.ssh/crypttransact_rsa \
    deploy/app-soupfinance-com.conf \
    root@65.20.112.224:/etc/apache2/sites-available/

# Test and reload
ssh -i ~/.ssh/crypttransact_rsa root@65.20.112.224 \
    "apache2ctl configtest && systemctl reload apache2"
```

## Troubleshooting

### SPA Routes Return 404
1. Check if SSL VirtualHost exists on port 443
2. Verify RewriteEngine is On
3. Check RewriteCond excludes API routes

### API Proxy Not Working
1. Verify SSLProxyEngine is On
2. Check ProxyPass URLs are correct
3. Test backend directly: `curl https://tas.soupmarkets.com/rest/application/health.json`

### SSL Certificate Issues
```bash
# Renew certificate
certbot renew --cert-name app.soupfinance.com

# Check certificate status
certbot certificates
```
