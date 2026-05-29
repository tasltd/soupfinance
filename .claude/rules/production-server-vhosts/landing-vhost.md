# Landing VHost: www.soupfinance.com

**Part of**: [production-server-vhosts](../production-server-vhosts.md)

**Config file**: `/etc/apache2/sites-available/www-soupfinance-com.conf`
**Local copy**: `soupfinance-landing/deploy/www-soupfinance-com.conf`
**Enabled via**: Symlink in `sites-enabled/`

---

## Purpose

Serves the static HTML marketing landing page. No API proxy, no SPA routing. Performance-optimized for static file serving.

## Domain Routing

| Request | Action |
|---------|--------|
| `http://soupfinance.com/*` | 301 redirect → `https://www.soupfinance.com/*` |
| `http://www.soupfinance.com/*` | 301 redirect → `https://www.soupfinance.com/*` |
| `https://soupfinance.com/*` | 301 redirect → `https://www.soupfinance.com/*` |
| `https://www.soupfinance.com/*` | **Serve landing page** |

---

## VHost Blocks (3 total)

### Block 1: Port 80 — HTTP redirect to HTTPS

```apache
<VirtualHost *:80>
    ServerName soupfinance.com
    ServerAlias www.soupfinance.com
    RewriteEngine On
    RewriteCond %{HTTPS} off
    RewriteRule ^ https://www.soupfinance.com%{REQUEST_URI} [L,R=301]
</VirtualHost>
```

### Block 2: Port 443 — Bare domain redirect to www

```apache
<VirtualHost *:443>
    ServerName soupfinance.com
    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/soupfinance.com/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/soupfinance.com/privkey.pem
    Include /etc/letsencrypt/options-ssl-apache.conf
    RewriteEngine On
    RewriteRule ^ https://www.soupfinance.com%{REQUEST_URI} [L,R=301]
</VirtualHost>
```

### Block 3: Port 443 — www.soupfinance.com (serves content)

```apache
<VirtualHost *:443>
    ServerName www.soupfinance.com
    DocumentRoot /var/www/soupfinance-landing

    <Directory /var/www/soupfinance-landing>
        Options -Indexes +FollowSymLinks
        AllowOverride None          # Performance: no .htaccess lookups
        Require all granted
    </Directory>

    EnableMMAP On                   # Kernel-level memory mapping
    EnableSendfile On               # Kernel-level file transfer

    # Compression, caching, security headers (see sections below)
    # ...

    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/soupfinance.com/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/soupfinance.com/privkey.pem
    Include /etc/letsencrypt/options-ssl-apache.conf
</VirtualHost>
```

---

## Performance Optimizations

| Optimization | Directive | Effect |
|-------------|-----------|--------|
| No .htaccess | `AllowOverride None` | Eliminates 4+ filesystem lookups per request |
| Kernel file transfer | `EnableSendfile On` | Bypasses userspace for file I/O |
| Memory mapping | `EnableMMAP On` | Maps files into memory for faster reads |
| Brotli compression | `BROTLI_COMPRESS` | 15-25% better compression than gzip |
| GZIP fallback | `DEFLATE` | For browsers without Brotli support |
| Immutable caching | `max-age=31536000, immutable` | Static assets cached 1 year |
| No HTML cache | `no-cache, no-store` | HTML always fresh from origin |

---

## Caching Strategy

The landing page uses aggressive caching because:
- HTML files change on deploy (so: no-cache)
- Static assets (CSS, JS, images, fonts) rarely change (so: immutable, 1 year)
- Cloudflare respects `Cache-Control` and `CDN-Cache-Control` headers

### Content Cache Rules

| Content Type | Cache Control | Rationale |
|-------------|---------------|-----------|
| `*.html` | `no-cache, no-store, must-revalidate` | Always serve latest HTML |
| `*.css`, `*.js` | `public, max-age=31536000, immutable` | Hashed filenames, cache forever |
| `*.png`, `*.jpg`, `*.svg`, `*.ico` | `public, max-age=31536000, immutable` | Static images, cache forever |
| `*.woff2`, `*.ttf` | `public, max-age=31536000, immutable` | Fonts, cache forever |

### CDN Cache Bypass for HTML

```apache
<FilesMatch "\\.html$">
    Header set Cache-Control "no-cache, no-store, must-revalidate"
    Header set Pragma "no-cache"
    Header set Expires "0"
    Header set Cloudflare-CDN-Cache-Control "no-store"
    Header set CDN-Cache-Control "no-store"
    Header set Surrogate-Control "no-store"
</FilesMatch>
```

The `Cloudflare-CDN-Cache-Control` and `CDN-Cache-Control` headers tell Cloudflare specifically to not cache HTML, even if other settings would allow it.

### App VHost Caching (contrast)

The React SPA uses Vite's content-hashed filenames (e.g., `index-a1b2c3.js`). Caching is primarily handled by:
- **Cloudflare** — CDN caching based on response headers
- **Browser** — Standard `Cache-Control` headers from Apache's default behavior

The app VHost does NOT have explicit caching rules. If performance optimization is needed later, add rules similar to the landing page's static asset caching.

---

## Compression

| Algorithm | Landing Page | App VHost |
|-----------|:------------:|:---------:|
| Brotli | Yes (quality 6) | No (relies on Cloudflare) |
| GZIP/Deflate | Yes (level 6, fallback) | No (relies on Cloudflare) |

Cloudflare applies its own compression on the CDN edge, so the app VHost doesn't strictly need server-side compression. The landing page has it for direct-origin access scenarios.

---

## Security Headers

### Landing Page Security Headers

```apache
Header always set X-Content-Type-Options "nosniff"
Header always set X-Frame-Options "SAMEORIGIN"
Header always set X-XSS-Protection "1; mode=block"
Header always set Referrer-Policy "strict-origin-when-cross-origin"
Header append Vary Accept-Encoding
```

### App VHost Security Headers

Currently the app VHost does NOT set explicit security headers. Cloudflare adds some headers at the CDN level. If needed, add the same set as the landing page.

### Directory Security

Both VHosts use:
```apache
Options -Indexes +FollowSymLinks
```

- `-Indexes` prevents directory listing (returns 403 instead of listing files)
- `+FollowSymLinks` allows symbolic links (needed for some deployments)

---

## Landing Page Content Rules (HARD RULE)

The landing page MUST NOT contain:
- Login forms or password inputs
- React/SPA JavaScript
- Authentication logic
- API calls to backend

The landing page MUST only contain:
- Static HTML, CSS, images
- "Sign In" / "Register" **links** pointing to `https://app.soupfinance.com`
- Legal pages (privacy, terms, cookies, acceptable use)
