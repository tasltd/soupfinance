# CLAUDE.md - SoupFinance Landing Page

## Project Overview

**Static marketing landing page** for SoupFinance. This is a pure HTML/CSS marketing site with **NO login functionality**.

| Property | Value |
|----------|-------|
| Type | Static HTML landing page |
| Domain | `www.soupfinance.com`, `soupfinance.com` |
| Server | 65.20.112.224 |
| Document Root | `/var/www/soupfinance-landing/` |
| Deploy Script | `./deploy-landing.sh` |

---

## CRITICAL: Domain Architecture (HARD RULE)

| Domain | Purpose | Login? | Content |
|--------|---------|--------|---------|
| `www.soupfinance.com` | Marketing landing page | **NO** | Static HTML marketing content |
| `soupfinance.com` | Marketing landing page | **NO** | Same as www |
| `app.soupfinance.com` | React application | **YES** | Full SPA with auth |

### Rules

1. **NO login forms** on the landing page - only links to `app.soupfinance.com`
2. **NO React/SPA code** in this project - pure static HTML
3. **Sign In links** MUST point to `https://app.soupfinance.com`
4. **Registration links** MUST point to `https://app.soupfinance.com/register`

---

## Quick Commands

```bash
# Deploy to production
./deploy-landing.sh

# Deploy (skip SSL setup)
./deploy-landing.sh --skip-ssl

# Preview locally
python3 -m http.server 8000

# Validate E2E
npx playwright test validate-landing.spec.js
```

---

## File Structure

```
soupfinance-landing/
├── index.html                 # Main landing page
├── privacy-policy.html        # Privacy policy
├── terms-of-service.html      # Terms of service
├── cookie-policy.html         # Cookie policy
├── acceptable-use-policy.html # AUP
├── deploy-landing.sh          # Deployment script
├── screenshots/               # Marketing screenshots
└── CLAUDE.md                  # This file
```

---

## Server Configuration

### Apache Virtual Host

Location: `/etc/apache2/sites-available/001-soupfinance-landing.conf`

```apache
<VirtualHost *:80>
    ServerName www.soupfinance.com
    ServerAlias soupfinance.com
    DocumentRoot /var/www/soupfinance-landing

    # NO-CACHE for HTML (prevent Cloudflare caching)
    <FilesMatch "\.html$">
        Header set Cache-Control "no-cache, no-store, must-revalidate"
        Header set Cloudflare-CDN-Cache-Control "no-store"
    </FilesMatch>
</VirtualHost>
```

### Cloudflare DNS (MUST be configured correctly)

| Record | Type | Value | Proxy |
|--------|------|-------|-------|
| `www` | A | 65.20.112.224 | Proxied |
| `@` | A | 65.20.112.224 | Proxied |
| `app` | A | 65.20.112.224 | Proxied |

**CRITICAL**: If `www.soupfinance.com` shows the React app instead of landing page, the Cloudflare DNS origin is misconfigured.

---

## Design System

Uses Tailwind CSS with SoupFinance design tokens:

| Token | Value |
|-------|-------|
| Primary | `#f24a0d` (orange) |
| Background | `#f8f6f5` |
| Font | Manrope (Google Fonts) |
| Icons | Material Symbols Outlined |

See `../soupfinance-designs/` for HTML mockups.

---

## Deployment Checklist

- [ ] All "Sign In" links point to `https://app.soupfinance.com`
- [ ] No login forms in HTML
- [ ] Run `./deploy-landing.sh`
- [ ] Verify with `curl https://www.soupfinance.com | grep '<title>'`
- [ ] Title should be "SoupFinance - Corporate Accounting..." NOT "soupfinance-web"

---

## Troubleshooting

### Wrong content served on www.soupfinance.com

If `www.soupfinance.com` shows the React login page instead of landing page:

1. **Check Cloudflare DNS**: Ensure `www` points to `65.20.112.224`
2. **Purge Cloudflare cache**: Dashboard → Caching → Purge Everything
3. **Verify origin**: `curl -sH "Host: www.soupfinance.com" http://65.20.112.224/ | grep '<title>'`

### Cache not clearing

Add cache-busting headers in Apache:
```apache
<FilesMatch "\.html$">
    Header set Cache-Control "no-cache, no-store, must-revalidate"
    Header set Cloudflare-CDN-Cache-Control "no-store"
</FilesMatch>
```
