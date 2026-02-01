# SSL Certificate Configuration Summary - Quick Reference

## CRITICAL ISSUE: Certificate Path Mismatch

| Aspect | Details | Status |
|--------|---------|--------|
| **Server** | 65.20.112.224 (Soupmarkets Production) | ⚠️ |
| **Domain** | app.soupfinance.com | ⚠️ |
| **Service Status** | Apache STOPPED | 🔴 |
| **Issue Type** | Certificate path mismatch | 🔴 |

---

## Certificate Configuration Matrix

### Apache Configuration (What Should Be Used)

```
SSLCertificateFile: /etc/letsencrypt/live/app.soupfinance.com/fullchain.pem
SSLCertificateKeyFile: /etc/letsencrypt/live/app.soupfinance.com/privkey.pem
```

### Available Certificates (What Exists)

| Certificate | Exists? | Location | Valid Until | CN |
|-------------|---------|----------|-------------|-----|
| app.soupfinance.com | ❌ NO | `/etc/letsencrypt/live/app.soupfinance.com/` | N/A | N/A |
| app.soupmarkets.com | ✅ YES | `/etc/letsencrypt/live/app.soupmarkets.com/` | Feb 21, 2026 | app.soupmarkets.com |
| soupmarkets.com | ✅ YES | `/etc/letsencrypt/live/soupmarkets.com/` | - | - |
| soupbroker.crypttransact.com | ✅ YES | (other domain) | - | - |
| soupbroker.fincaps.net | ✅ YES | (other domain) | - | - |
| owncloud.fincaps.net | ✅ YES | (other domain) | - | - |

---

## The Problem: Path Mismatch

```
┌─────────────────────────────────────────────────┐
│ Apache Config Says:                             │
│ Use certificate for "app.soupfinance.com"       │
└──────────────────┬──────────────────────────────┘
                   │
                   ❌ DOESN'T EXIST
                   │
┌──────────────────▼──────────────────────────────┐
│ Reality on Server:                              │
│ Only "app.soupmarkets.com" certificate exists   │
└─────────────────────────────────────────────────┘
```

---

## Impact: Apache Cannot Start HTTPS

### Errors in Log

```
[ssl:warn] AH01909: app.soupfinance.com:443:0 server 
certificate does NOT include an ID which matches the 
server name
```

### Result

- Apache service: **STOPPED**
- HTTPS: **UNAVAILABLE**
- React SPA: **UNREACHABLE**
- User experience: **SSL certificate error**

---

## Solution Comparison

### Option 1: Redirect to Existing Certificate (QUICKEST) ⚡

```bash
sed -i 's|app.soupfinance.com|app.soupmarkets.com|g' \
  /etc/apache2/sites-available/app-soupfinance-com.conf
systemctl restart apache2
```

| Aspect | Status |
|--------|--------|
| Time | ~1-2 minutes |
| Complexity | Very low |
| Requires new cert? | No |
| Domain match | ❌ Won't match |
| Production ready? | ✅ Yes (with warning) |

---

### Option 2: Generate New Certificate (RECOMMENDED) ⭐

```bash
certbot certonly --apache -d app.soupfinance.com
systemctl restart apache2
```

| Aspect | Status |
|--------|--------|
| Time | ~3-5 minutes |
| Complexity | Low |
| Requires new cert? | Yes (auto-generated) |
| Domain match | ✅ Perfect match |
| Production ready? | ✅ Yes (clean solution) |

---

### Option 3: Multi-Domain Certificate (FUTURE-PROOF) 🛡️

```bash
certbot certonly --apache -d app.soupfinance.com -d app.soupmarkets.com
systemctl restart apache2
```

| Aspect | Status |
|--------|--------|
| Time | ~3-5 minutes |
| Complexity | Low-Medium |
| Requires new cert? | Yes (covers both) |
| Domain match | ✅ Both domains |
| Production ready? | ✅ Yes (safest) |

---

## Recommended Action

**IMPLEMENT OPTION 2**: Generate certificate for app.soupfinance.com

**Why**:
1. Proper certificate for the configured domain
2. Clean solution without domain mismatch
3. Eliminates SSL warnings
4. Takes only 5 minutes
5. Auto-renews via certbot

**Estimated Timeline**:
- Generate cert: 2-3 min
- Restart Apache: 1-2 min
- Total: ~5 minutes

---

## Verification Checklist

After implementing the fix:

```bash
# 1. Apache syntax check
☐ apache2ctl configtest → "Syntax OK"

# 2. Service status
☐ systemctl status apache2 → "active (running)"

# 3. Certificate check
☐ openssl x509 -in /etc/letsencrypt/live/app.soupfinance.com/fullchain.pem \
    -noout -subject
  → "subject=CN = app.soupfinance.com" (if Option 2)
  → "subject=CN = app.soupmarkets.com" (if Option 1)

# 4. HTTPS connectivity
☐ curl -I https://app.soupfinance.com/ → "HTTP/1.1 200 OK"

# 5. No SSL warnings
☐ tail -20 /var/log/apache2/error.log | grep -i "ssl\|warn" → (should be empty or clean)
```

---

## Files Involved

| File | Location | Status |
|------|----------|--------|
| Apache vhost config | `/etc/apache2/sites-available/app-soupfinance-com.conf` | ⚠️ References wrong cert |
| Apache backup | `/etc/apache2/sites-available/app-soupfinance-com.conf.backup.20260121` | ✅ Safe to reference |
| Existing certificate | `/etc/letsencrypt/live/app.soupmarkets.com/` | ✅ Valid until Feb 21 |
| Missing certificate | `/etc/letsencrypt/live/app.soupfinance.com/` | ❌ Needs creation |
| Error log (app) | `/var/log/apache2/soupfinance-error.log` | 📋 Check for details |
| Error log (main) | `/var/log/apache2/error.log` | 📋 Contains SSL warnings |

---

## Certificate Renewal Monitoring

**Important**: Set calendar reminders for certificate renewal

| Certificate | Expires | Auto-Renew | Action |
|-------------|---------|-----------|--------|
| app.soupmarkets.com | Feb 21, 2026 | ✅ Yes | Monitor (97 days) |
| app.soupfinance.com | TBD (after gen) | ✅ Yes | Monitor (after creation) |

---

**Status**: CRITICAL - Immediate action required  
**Priority**: HIGH - Site HTTPS unavailable  
**Estimated fix time**: 5 minutes  
**Recommended approach**: Option 2 (generate new certificate)
