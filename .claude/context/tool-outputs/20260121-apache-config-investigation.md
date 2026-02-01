# SoupFinance Production Server Apache Configuration Investigation

**Date**: 2026-01-21
**Server**: 65.20.112.224 (Soupmarkets Production)
**Status**: Syntax OK

## Executive Summary

The SoupFinance production server (65.20.112.224) runs Apache 2.4.52 with the **prefork MPM** and has a well-configured vhost for `app.soupfinance.com`. The server is optimized for static file serving with proper caching headers, SSL/TLS, and compression enabled.

---

## 1. Apache Core Configuration

### Version & MPM Module
- **Apache Version**: 2.4.52 (Ubuntu)
- **Built**: 2025-08-11T12:10:10
- **MPM Module**: **prefork** (non-threaded, forked process model)
- **Architecture**: 64-bit

### Timeout Settings
```
Timeout: 300 seconds (5 minutes)
KeepAlive: On
MaxKeepAliveRequests: 100 requests per connection
KeepAliveTimeout: 5 seconds
```

**Analysis**:
- KeepAlive enabled optimizes for persistent connections
- 100 max requests per connection is moderate (could be higher)
- 5-second timeout is appropriate for static file serving
- 300-second overall timeout is standard and safe

### Global Performance Settings
```
HostnameLookups: Off (good - no DNS lookups)
Mutex: default (no custom configuration)
```

---

## 2. Enabled Modules (60 total)

### Core Modules (static, required)
- `core_module`
- `so_module`
- `http_module`
- `log_config_module`
- `unixd_module`

### Performance & Caching Modules
✅ **ENABLED**:
- `deflate_module` (GZIP compression) - **ACTIVE**
- `cache_module` (HTTP caching)
- `cache_socache_module` (shared object caching)
- `headers_module` (HTTP headers manipulation) - **ACTIVE**
- `filter_module` (request/response filtering)

❌ **NOT ENABLED**:
- `mod_expires` - **NOT LOADED** (no automatic Expires headers)

### Proxy & Load Balancing Modules
- `proxy_module`, `proxy_ajp_module`, `proxy_balancer_module`
- `proxy_http_module`, `proxy_http2_module`, `proxy_fcgi_module`
- `proxy_html_module`, `proxy_wstunnel_module`
- Plus 9 other proxy variants

**Usage**: Configured for proxying requests (likely to backend Grails/Tomcat)

### Security & Session Modules
- `ssl_module` (HTTPS/TLS)
- `auth_basic_module`, `authz_core_module`, `authz_host_module`
- `session_module`, `session_cookie_module`, `session_crypto_module`
- `remoteip_module` (X-Forwarded-For headers)

### URL Rewriting & Routing
- `rewrite_module` (mod_rewrite for URL rewriting)
- `vhost_alias_module` (dynamic vhost names)

### Monitoring & Diagnostics
- `status_module` (server-status page)
- `unique_id_module` (unique request IDs)
- `heartbeat_module`, `heartmonitor_module` (health monitoring)

### Other Modules
- `http2_module` (HTTP/2 support)
- `php8.1_module` (PHP scripting)
- `cgi_module` (CGI support)

---

## 3. Compression Configuration

### mod_deflate (GZIP)
**Status**: ✅ **ENABLED**

```apache
<IfModule mod_deflate.c>
    <IfModule mod_filter.c>
        AddOutputFilterByType DEFLATE text/html text/plain text/xml text/css text/javascript
        AddOutputFilterByType DEFLATE application/x-javascript application/javascript application/ecmascript
        AddOutputFilterByType DEFLATE application/rss+xml
        AddOutputFilterByType DEFLATE application/wasm
        AddOutputFilterByType DEFLATE application/xml
    </IfModule>
</IfModule>
```

**Compressed Types**: HTML, CSS, JavaScript, XML, RSS, WebAssembly
**Missing**: application/json (not explicitly listed)

---

## 4. SoupFinance Virtual Host Configuration

### File Location
`/etc/apache2/sites-available/app-soupfinance-com.conf`

### Domain(s)
- Primary: `app.soupfinance.com`
- Alias: `www.app.soupfinance.com`

### HTTP to HTTPS Redirect
✅ Configured - automatically redirects all HTTP to HTTPS

### SSL/TLS Configuration
**Provider**: Let's Encrypt (Certbot)
**Certificate Path**: `/etc/letsencrypt/live/app.soupmarkets.com/fullchain.pem`
**Key Path**: `/etc/letsencrypt/live/app.soupmarkets.com/privkey.pem`
**Options**: Uses standard SSL options from Let's Encrypt config

### Document Root
```
/var/www/soupfinance
```
(Serves static React app files)

### Directory Configuration
```apache
<Directory /var/www/soupfinance>
    Options Indexes FollowSymLinks
    AllowOverride All
    Require all granted
    
    # SPA routing: serve index.html for all non-file/non-directory requests
    RewriteEngine On
    RewriteBase /
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteRule ^ index.html [QSA,L]
</Directory>
```

**Analysis**:
- ✅ `AllowOverride All` - Allows `.htaccess` overrides
- ✅ `RewriteEngine` - Enables SPA routing (index.html fallback)
- ✅ Proper SPA routing for React frontend

### Cache Control Headers
```apache
# HTML files - no caching
<FilesMatch "\.html$">
    Header set Cache-Control "max-age=0, no-cache, no-store, must-revalidate"
</FilesMatch>

# Static assets - long-term caching
<FilesMatch "\.(js|css|png|jpg|jpeg|gif|svg|woff|woff2|ttf|eot)$">
    Header set Cache-Control "max-age=31536000, immutable"
</FilesMatch>
```

**Analysis**:
- ✅ **Excellent** - HTML files not cached (updates always fresh)
- ✅ **Excellent** - Static assets cached for 1 year (31536000 seconds)
- ✅ `immutable` flag prevents revalidation of static files
- ✅ Includes all modern font formats (woff, woff2, ttf, eot)

### Security Headers
```apache
Header set X-Frame-Options "SAMEORIGIN"           # Clickjacking protection
Header set X-Content-Type-Options "nosniff"       # MIME-sniffing protection
Header set X-XSS-Protection "1; mode=block"       # XSS attack protection
Header set Referrer-Policy "strict-origin-when-cross-origin"
```

**Analysis**:
- ✅ **Comprehensive** security headers configured
- ✅ Protects against clickjacking, MIME-sniffing, XSS
- ✅ Referrer-Policy balances privacy and functionality

### Compression
```apache
<IfModule mod_deflate.c>
    AddOutputFilterByType DEFLATE text/html text/plain text/xml text/css text/javascript application/javascript application/json
</IfModule>
```

**Analysis**:
- ✅ GZIP compression enabled for all common types
- ✅ **Includes JSON** (unlike global deflate.conf)

### Logging
```apache
ErrorLog ${APACHE_LOG_DIR}/soupfinance-error.log
CustomLog ${APACHE_LOG_DIR}/soupfinance-access.log combined
LogLevel warn
```

**Analysis**:
- ✅ Separate error log for debugging
- ✅ Combined access log with standard format
- ✅ LogLevel set to `warn` (appropriate for production)

---

## 5. Prefork MPM Configuration

```apache
<IfModule mpm_prefork_module>
    StartServers        5
    MinSpareServers     5
    MaxSpareServers     10
    MaxRequestWorkers   150
    MaxConnectionsPerChild   0
</IfModule>
```

**Analysis**:
- **StartServers**: 5 - Start with 5 processes (conservative)
- **MinSpareServers**: 5 - Keep minimum 5 idle processes
- **MaxSpareServers**: 10 - Allow up to 10 idle processes
- **MaxRequestWorkers**: 150 - Maximum 150 concurrent requests
- **MaxConnectionsPerChild**: 0 - Processes never recycled (unlimited requests)

**Implications**:
- ✅ Conservative settings suitable for low-to-medium traffic
- ✅ Memory usage: ~25-30MB base + ~5-10MB per process
- ⚠️ MaxConnectionsPerChild = 0: Processes never recycle (potential memory leaks if any)
- ⚠️ 150 workers may be insufficient for high-traffic spikes

---

## 6. Missing / Not Enabled Features

### mod_expires
- **Status**: ❌ **NOT ENABLED**
- **Impact**: Only Cache-Control headers work; Expires headers not set
- **Recommendation**: Minimal impact since Cache-Control is more modern

### HTTP/2 with mod_http2
- **Status**: Conditionally disabled (HTTP/2 doesn't work with prefork MPM)
- **Reason**: HTTP/2 requires worker or event MPM
- **Impact**: All connections use HTTP/1.1 only

### mod_brotli
- **Status**: ❌ **NOT ENABLED**
- **Impact**: Only GZIP compression available
- **Recommendation**: Consider enabling for better compression of text assets

---

## 7. Performance Summary

### Strengths
✅ **Cache Headers**: HTML not cached, static assets cached for 1 year with immutable flag
✅ **GZIP Compression**: Enabled for all common content types
✅ **Security Headers**: X-Frame-Options, X-Content-Type-Options, X-XSS-Protection set
✅ **SSL/TLS**: HTTPS enforced, Let's Encrypt certificates
✅ **SPA Routing**: Proper React router support with index.html fallback
✅ **Logging**: Separate error and access logs

### Opportunities for Improvement
⚠️ **maxRequestWorkers**: 150 may be low for traffic spikes; consider increasing to 200-300
⚠️ **MaxKeepAliveRequests**: 100 is moderate; could increase to 200-500
⚠️ **MaxConnectionsPerChild**: Set to 0 (unlimited); consider setting to 10000 to prevent memory leaks
⚠️ **mod_expires**: Not enabled; could add Expires headers as backup to Cache-Control
⚠️ **HTTP/2**: Not available with prefork MPM; consider switching to event MPM if traffic allows
⚠️ **mod_brotli**: Not enabled; could provide better compression than GZIP

### Current Capacity (prefork MPM)
```
Base memory: ~25-30MB
Per process: ~5-10MB (for React static files)
Total at MaxRequestWorkers (150): ~750-1500MB
```

---

## 8. Recommendations

### Priority 1: Memory Management
```apache
# In /etc/apache2/mods-available/mpm_prefork.conf
MaxConnectionsPerChild   10000   # Recycle processes after 10k requests
```
**Reason**: Prevent potential memory leaks over time

### Priority 2: Capacity
```apache
# Increase for higher traffic loads
MaxRequestWorkers   250-300     # Increase from 150
MaxSpareServers     20          # Increase from 10
```

### Priority 3: HTTP/2 (Optional)
Switch to event or worker MPM if traffic analysis shows benefit:
```bash
a2dismod mpm_prefork
a2enmod mpm_event
systemctl restart apache2
```
**Benefit**: HTTP/2 multiplexing for faster static file serving
**Trade-off**: Less compatibility with legacy modules

### Priority 4: Additional Compression (Optional)
Enable Brotli for JavaScript/CSS:
```bash
apt-get install libbrotli1 mod-brotli
a2enmod brotli
# In vhost: AddOutputFilterByType BROTLI text/javascript text/css
systemctl restart apache2
```
**Benefit**: 15-20% better compression than GZIP

### Priority 5: Monitoring
```bash
# Enable mod_status for monitoring
a2enmod status
# Access at http://localhost/server-status
```

---

## 9. Configuration Files Location

| File | Purpose |
|------|---------|
| `/etc/apache2/apache2.conf` | Main configuration |
| `/etc/apache2/sites-available/app-soupfinance-com.conf` | SoupFinance vhost |
| `/etc/apache2/mods-enabled/deflate.conf` | GZIP compression settings |
| `/etc/apache2/mods-enabled/mpm_prefork.conf` | Prefork MPM settings |
| `/etc/apache2/ports.conf` | Listening ports |
| `/etc/apache2/envvars` | Apache runtime variables |

---

## 10. Quick Reference: Enabled Performance Modules

| Module | Purpose | Status |
|--------|---------|--------|
| deflate | GZIP compression | ✅ ENABLED |
| headers | HTTP headers | ✅ ENABLED |
| expires | Auto Expires headers | ❌ NOT ENABLED |
| cache | HTTP caching | ✅ ENABLED |
| http2 | HTTP/2 protocol | ⚠️ DISABLED (prefork incompatible) |
| brotli | Brotli compression | ❌ NOT ENABLED |

---

## Conclusion

The SoupFinance Apache configuration is **production-ready** with proper SSL/TLS, caching headers, compression, and security headers. The prefork MPM is stable but conservative. For continued production use, consider implementing the Priority 1 recommendation (MaxConnectionsPerChild) to prevent potential memory issues over long-term operation.

**Overall Grade**: A- (Very Good, minor optimization opportunities)
