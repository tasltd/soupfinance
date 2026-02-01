# SoupFinance Domain Status Report
**Generated**: 2026-01-21 16:46 UTC  
**Production Server**: 65.20.112.224 (Soupmarkets Prod)

---

## Executive Summary

✅ **FULLY OPERATIONAL** - Both app.soupfinance.com and www.soupfinance.com are properly configured and serving content.

| Domain | Status | Type | Response |
|--------|--------|------|----------|
| **app.soupfinance.com** | ✅ ONLINE | React SPA | HTTP 200 (Proxied via Apache) |
| **www.soupfinance.com** | ✅ ONLINE | Landing Page | HTTP 200 (Cloudflare CDN) |
| **soupfinance.com** | ✅ ONLINE | Landing Page | HTTP 200 (Cloudflare CDN) |

---

## DNS Resolution

### app.soupfinance.com
```
65.20.112.224 (direct to origin server)
```
**Resolution**: Direct to production server (no CDN)

### www.soupfinance.com & soupfinance.com
```
172.67.197.27 (Cloudflare)
104.21.84.206 (Cloudflare)
65.20.112.224 (fallback)
```
**Resolution**: Cloudflare CDN with origin fallback

---

## HTTP/HTTPS Configuration

### app.soupfinance.com - React SPA

**HTTP → HTTPS Redirect**:
- Port 80: Redirects to HTTPS (HTTP 301)
- Port 443: Serves React application (HTTP 200)

**Response Headers**:
```
HTTP/2 200 
server: cloudflare
cf-cache-status: DYNAMIC
content-type: text/html
```

**Apache Configuration**:
- File: `/etc/apache2/sites-available/app-soupfinance-com.conf`
- Status: ✅ ENABLED (`sites-enabled/app-soupfinance-com.conf`)
- Document Root: `/var/www/soupfinance`

### www.soupfinance.com - Landing Page

**HTTP Only** (redirects to HTTPS via Cloudflare):
- Port 80: Serves landing page directly
- Port 443: Served via Cloudflare CDN

**Apache Configuration**:
- File: `/etc/apache2/sites-available/001-soupfinance-landing.conf`
- Status: ✅ ENABLED
- Document Root: `/var/www/soupfinance-landing`
- ServerName: `www.soupfinance.com`
- ServerAlias: `soupfinance.com`

---

## SSL Certificates

### app.soupfinance.com

**Certificate Details**:
```
Subject: CN = app.soupfinance.com
Not Before: Jan 21 12:34:15 2026 GMT
Not After:  Apr 21 12:34:14 2026 GMT
```
**Status**: ✅ Valid (Valid for ~3 months)  
**Issuer**: Let's Encrypt  
**Location**: `/etc/letsencrypt/live/app.soupfinance.com/`

### soupfinance.com

**Certificate Details**:
```
Subject: CN = soupfinance.com
```
**Status**: ✅ Valid  
**Issuer**: Let's Encrypt  
**Location**: `/etc/letsencrypt/live/soupfinance.com/`

---

## Deployed Assets

### React App (/var/www/soupfinance)

```
├── index.html (462 bytes)
├── vite.svg
└── assets/
    ├── index-CYUV-GSt.js (main JavaScript bundle)
    └── index-k-ETjK5r.css (styles)
```

**Status**: ✅ Built and deployed  
**Build Date**: 2026-01-21 13:57 UTC  
**Build Tool**: Vite

### Landing Page (/var/www/soupfinance-landing)

```
├── index.html (53 KB - complete landing page)
├── robots.txt
├── sitemap.xml
├── privacy-policy.html
├── terms-of-service.html
├── cookie-policy.html
├── acceptable-use-policy.html
├── Screenshots (marketing images)
│   ├── dashboard.png (614 KB)
│   ├── balance-sheet.png (280 KB)
│   ├── invoices.png (176 KB)
│   ├── payments.png (183 KB)
│   ├── pnl.png (492 KB)
│   ├── mobile.png (183 KB)
│   └── E2E test screenshots (multiple)
└── images/
```

**Status**: ✅ Fully deployed  
**Last Updated**: 2026-01-21 16:32 UTC  
**Total Size**: ~8.3 MB

---

## API Proxy Configuration

### Backend Integration

**Proxy Target**: tas.soupmarkets.com (TAS tenant)  
**DNS Resolution**: ✅ Resolves to Cloudflare  

**Proxy Routes** (in app-soupfinance-com.conf):
```
/rest/*  → https://tas.soupmarkets.com/rest/
/client/* → https://tas.soupmarkets.com/client/
```

**Connectivity Test**:
```
curl -sI https://tas.soupmarkets.com/client/login.json
Response: HTTP/2 302 (redirects to /login/auth)
Status: ✅ Operational
```

**Backend Response**:
- Server: Varnish Cache 6.6 (via Cloudflare)
- JSESSIONID: ✅ Session cookie set
- API Status: ✅ Responding properly

---

## Apache Configuration Status

### Enabled Virtual Hosts

```
✅ 001-soupfinance-landing.conf   → www.soupfinance.com + soupfinance.com
✅ app-soupfinance-com.conf        → app.soupfinance.com
```

### Configuration Validation

```
Apache Syntax Check: ✅ OK
Minor Warning: ServerName not set globally (non-critical)
```

---

## Performance Optimizations

### Landing Page Caching

```
HTML:         Cache-Control: no-cache, no-store, must-revalidate
CSS/JS:       Cache-Control: public, max-age=31536000, immutable
Images:       Cache-Control: public, max-age=31536000, immutable
Fonts:        Cache-Control: public, max-age=31536000, immutable
```

### Compression

- ✅ Brotli compression enabled (primary)
- ✅ GZIP fallback enabled
- ✅ MMAP and Sendfile kernel optimizations enabled

### Security Headers

```
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
```

---

## Summary of Findings

### ✅ What's Working

1. **DNS**: All three domains resolve correctly
2. **SSL/TLS**: Valid Let's Encrypt certificates for both app.soupfinance.com and soupfinance.com
3. **HTTP**: Proper redirects from HTTP to HTTPS
4. **React App**: Built and deployed at `/var/www/soupfinance`
5. **Landing Page**: Fully deployed with all assets at `/var/www/soupfinance-landing`
6. **API Proxy**: Correctly configured to proxy to tas.soupmarkets.com
7. **Backend**: tas.soupmarkets.com responding with proper session management
8. **Apache**: Configuration valid, virtual hosts enabled
9. **CDN**: Cloudflare protecting www.soupfinance.com and soupfinance.com
10. **Performance**: Caching, compression, and security headers all optimized

### ⚠️ Minor Notes

- **www.soupfinance.com** is served via Cloudflare CDN (different from app.soupfinance.com which is direct)
- SSL certificate for app.soupfinance.com expires in ~3 months (Apr 21, 2026) - renewal recommended ~1 month prior
- No separate certificate for www.soupfinance.com (uses soupfinance.com certificate)

### 🔧 Production Readiness

**Status**: ✅ **PRODUCTION READY**

- All infrastructure properly configured
- SSL certificates valid and installed
- Apache vhosts enabled and validated
- React app built and deployed
- Landing page fully deployed
- API connectivity verified
- Security headers and caching optimized

---

## Environment Details

- **Production Server**: 65.20.112.224
- **Web Server**: Apache 2.4.52 (Ubuntu)
- **DNS Provider**: Cloudflare (for www/soupfinance.com)
- **SSL Issuer**: Let's Encrypt
- **Proxy Backend**: tas.soupmarkets.com (TAS tenant)
- **Cache Layer**: Varnish 6.6 (backend)
- **CDN**: Cloudflare (landing page domains)

