# SoupFinance Domain Architecture Rules (HARD RULE)

## Domain Separation (MANDATORY)

SoupFinance uses a **strict domain separation** between marketing and application:

| Domain | Purpose | Content | Login? |
|--------|---------|---------|--------|
| `www.soupfinance.com` | Marketing | Static HTML landing page | **NO** |
| `soupfinance.com` | Marketing | Static HTML landing page | **NO** |
| `app.soupfinance.com` | Application | React SPA | **YES** |

---

## Rules

### 1. NO Login Forms on Landing Page (HARD RULE)

The landing page (`www.soupfinance.com`) MUST NOT contain:
- Login forms
- Password inputs
- Authentication logic
- React/SPA JavaScript that renders login screens

**ONLY** "Sign In" and "Register" **links** pointing to `app.soupfinance.com` are allowed.

### 2. All App Links Point to app.soupfinance.com

```html
<!-- CORRECT -->
<a href="https://app.soupfinance.com">Sign In</a>
<a href="https://app.soupfinance.com/register">Get Started</a>

<!-- WRONG -->
<a href="/login">Sign In</a>
<a href="https://www.soupfinance.com/login">Sign In</a>
```

### 3. Landing Page is Pure Static HTML

The landing page project (`soupfinance-landing/`) contains:
- ✅ Static HTML files
- ✅ Tailwind CSS
- ✅ Images and screenshots
- ✅ Legal pages (privacy, terms, etc.)

NOT:
- ❌ React/Vue/Angular code
- ❌ Authentication logic
- ❌ API calls
- ❌ Form submissions (except contact forms)

---

## Server Configuration

### Production Server (65.20.112.224)

| Virtual Host | Document Root | Domain |
|--------------|---------------|--------|
| 001-soupfinance-landing.conf | `/var/www/soupfinance-landing/` | www.soupfinance.com |
| app-soupfinance-com.conf | `/var/www/soupfinance/` | app.soupfinance.com |

### Cloudflare DNS Requirements

Both `www` and `app` subdomains MUST point to `65.20.112.224` with the correct origin routing:
- `www.soupfinance.com` → Landing page Apache vhost
- `app.soupfinance.com` → React app Apache vhost

---

## Validation Commands

```bash
# Verify landing page is served (NOT React app)
curl -sL https://www.soupfinance.com | grep '<title>'
# Expected: "SoupFinance - Corporate Accounting..."
# WRONG: "soupfinance-web"

# Verify direct origin
curl -sH "Host: www.soupfinance.com" http://65.20.112.224/ | grep '<title>'

# Verify app domain
curl -sL https://app.soupfinance.com | grep '<title>'
# Expected: "soupfinance-web" (React app)
```

---

## Common Issues

### Issue: www.soupfinance.com shows login page

**Cause**: Cloudflare DNS pointing to wrong origin or serving cached React app

**Fix**:
1. Check Cloudflare DNS configuration
2. Purge Cloudflare cache
3. Verify Apache vhost is correctly configured

### Issue: Links on landing page go to wrong domain

**Cause**: href attributes using relative paths or wrong domain

**Fix**: All app links must use absolute URLs to `https://app.soupfinance.com`

---

## How to Reference This Rule

```markdown
See **[.claude/rules/soupfinance-domain-architecture.md]** for SoupFinance domain separation rules.
```
