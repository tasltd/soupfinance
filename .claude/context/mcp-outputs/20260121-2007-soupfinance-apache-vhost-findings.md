# SoupFinance Apache VHost Configuration Report

## Executive Summary

**Status**: ⚠️ **INCOMPLETE CONFIGURATION**

The demo server (140.82.32.141) has:
- ✅ SSL certificate for `demo.soupfinance.com` (generated Jan 11, 2025)
- ✅ Redirect rule in demo.soupmarkets.com config pointing to demo.soupfinance.com
- ❌ **NO Apache vhost configuration for soupfinance domains**

---

## DNS Resolution

Both `app.soupfinance.com` and `demo.soupfinance.com` resolve to **Cloudflare CDN**:

```
app.soupfinance.com:
  172.67.197.27 (Cloudflare)
  104.21.84.206 (Cloudflare)
  2a06:98c1:3121::4 (Cloudflare IPv6)
  2a06:98c1:3120::4 (Cloudflare IPv6)

demo.soupfinance.com:
  172.67.197.27 (Cloudflare)
  104.21.84.206 (Cloudflare)
  2a06:98c1:3120::4 (Cloudflare IPv6)
  2a06:98c1:3121::4 (Cloudflare IPv6)
```

**Implication**: Cloudflare is the primary DNS provider and likely routes traffic through their CDN. Direct access to 140.82.32.141 via soupfinance domain names won't work without vhost configuration.

---

## SSL Certificates Status

### demo.soupfinance.com (EXISTS)
```
Location: /etc/letsencrypt/live/demo.soupfinance.com/
Created: Jan 11, 2025
Subject: CN = demo.soupfinance.com
Certificate Files:
  - fullchain.pem (certificate chain)
  - privkey.pem (private key)
  - cert.pem (certificate only)
  - chain.pem (intermediate certificate)
```

### app.soupfinance.com (MISSING)
Not found in `/etc/letsencrypt/live/`
- Will need to be generated or added to existing certificate

---

## Current Apache VHost Configuration

### File: `/etc/apache2/sites-available/demo.soupmarkets.com.conf`

```apache
<VirtualHost *:80>
    ServerName demo.soupmarkets.com
    ServerAdmin webmaster@localhost
    ErrorLog /var/log/apache2/error.log
    CustomLog /var/log/apache2/access.log combined
    # ❌ BROKEN REDIRECT - no vhost to catch this domain
    RedirectPermanent / https://demo.soupfinance.com/
    RedirectTemp / https://demo.soupfinance.com/
    RewriteEngine on
    RewriteCond %{SERVER_NAME} =demo.soupbroker.crypttransact.com
    RewriteRule ^ https://%{SERVER_NAME}%{REQUEST_URI} [END,NE,R=permanent]
</VirtualHost>

<VirtualHost *:443>
    ServerName demo.soupmarkets.com
    ServerAdmin webmaster@localhost
    ErrorLog /var/log/apache2/error.log
    CustomLog /var/log/apache2/access.log combined
    Include /etc/letsencrypt/options-ssl-apache.conf
    ProxyPass / http://localhost:6081/
    ProxyPassReverse / http://localhost:6081/
    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/demo.soupmarkets.com/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/demo.soupmarkets.com/privkey.pem
    [... mod_security and SSL cipher config ...]
</VirtualHost>
```

**Issue**: Redirects user to `https://demo.soupfinance.com/`, but Apache doesn't have a vhost to handle that hostname. User gets a "not found" or Cloudflare error page.

---

## Currently Enabled VHosts (Port 443)

| Domain | Target | Backend | Status |
|--------|--------|---------|--------|
| c26.ashfieldinvest.com | HTTP backend | ashfield-invest | ✅ |
| c26.soupmarkets.com | HTTP backend | soupmarkets | ✅ |
| cim.techatscale.io | HTTP backend | techatscale | ✅ |
| demo.soupmarkets.com | http://localhost:6081/ | Varnish/SPA | ✅ |
| edge.soupmarkets.com | http://localhost:8080/ | Edge Tomcat | ✅ |
| emneqinstitute.live | HTTP backend | education | ✅ |
| sas.soupmarkets.com | http://localhost:6081/ | Varnish/SPA | ✅ |
| tas.soupmarkets.com | http://localhost:6081/ | Varnish/SPA | ✅ |
| **demo.soupfinance.com** | **MISSING** | **N/A** | ❌ |
| **app.soupfinance.com** | **MISSING** | **N/A** | ❌ |

---

## Backend Service Discovery

**Varnish on port 6081**: Serves demo/sas/tas soupmarkets tenants via multi-tenant SPA
- All redirect through Varnish cache
- Uses X-Forwarded-Host header to distinguish tenants
- Backend runs on port 9090 (Grails Tomcat)

**Soupfinance likely uses same architecture**: React SPA (port 5173 dev / 3000+ prod)

---

## Configuration Gap

### What's Missing

1. **Apache vhost for demo.soupfinance.com**
   ```apache
   # /etc/apache2/sites-available/demo.soupfinance.com.conf
   <VirtualHost *:80>
       ServerName demo.soupfinance.com
       RewriteEngine on
       RewriteCond %{SERVER_NAME} =demo.soupfinance.com
       RewriteRule ^ https://%{SERVER_NAME}%{REQUEST_URI} [END,NE,R=permanent]
   </VirtualHost>

   <VirtualHost *:443>
       ServerName demo.soupfinance.com
       ProxyPass / http://localhost:3000/         # or 5173/8000/etc
       ProxyPassReverse / http://localhost:3000/
       SSLEngine on
       SSLCertificateFile /etc/letsencrypt/live/demo.soupfinance.com/fullchain.pem
       SSLCertificateKeyFile /etc/letsencrypt/live/demo.soupfinance.com/privkey.pem
       Include /etc/letsencrypt/options-ssl-apache.conf
   </VirtualHost>
   ```

2. **Apache vhost for app.soupfinance.com** (similar config, or shared cert)

3. **Enable both vhosts**
   ```bash
   a2ensite demo.soupfinance.com.conf
   a2ensite app.soupfinance.com.conf
   systemctl reload apache2
   ```

4. **SSL certificate for app.soupfinance.com** (if separate)
   ```bash
   certbot certonly -d app.soupfinance.com --webroot
   ```

---

## Recommendations

### Immediate Actions

1. **Verify backend service**
   - What port is soupfinance-web running on? (currently in `/home/ddr/Documents/code/soupmarkets/soupfinance/`)
   - Dev: `npm run dev` (typically port 5173)
   - Production: May run on different port or behind Varnish

2. **Create demo.soupfinance.com vhost** pointing to correct backend port

3. **Add app.soupfinance.com to same cert** or create separate cert
   ```bash
   certbot certonly -d demo.soupfinance.com -d app.soupfinance.com
   ```

4. **Test configuration**
   ```bash
   curl -H 'Host: demo.soupfinance.com' https://localhost/ -k
   curl -H 'Host: app.soupfinance.com' https://localhost/ -k
   ```

### Long-term

- Determine if `demo.soupfinance.com` and `app.soupfinance.com` are the same app or different
- If different: separate vhost + backend configurations
- If same: use same vhost config with multiple ServerName entries
- Document Cloudflare DNS routing rules

---

## Appendix: Related Configurations

### tas.soupmarkets.com (Reference - Multi-tenant)
```apache
<VirtualHost *:443>
    ServerName tas.soupmarkets.com
    ProxyPreserveHost Off
    ProxyPass / http://localhost:6081/
    ProxyPassReverse / https://demo.soupmarkets.com/
    ProxyPassReverseCookieDomain demo.soupmarkets.com tas.soupmarkets.com
    
    # Pass tenant information
    RequestHeader unset X-Forwarded-Host
    RequestHeader set X-Forwarded-Host "tas.soupmarkets.com"
    RequestHeader set X-Forwarded-Proto "https"
    
    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/tas.soupmarkets.com/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/tas.soupmarkets.com/privkey.pem
</VirtualHost>
```

This pattern shows:
- Varnish on 6081 handles backend routing
- Multiple domains route through single Varnish instance
- X-Forwarded-Host header tells backend which tenant this is

**Soupfinance should follow similar pattern** if multi-tenant, or simpler pattern if single-tenant app.

