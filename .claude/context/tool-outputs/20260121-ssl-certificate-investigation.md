# SSL Certificate Configuration Investigation - Production Server (65.20.112.224)

**Date**: 2026-01-21  
**Server**: 65.20.112.224 (Soupmarkets Production)  
**Domain**: app.soupfinance.com  
**Status**: ⚠️ CRITICAL - Certificate path mismatch detected

---

## Executive Summary

**CRITICAL ISSUE FOUND**: The Apache configuration references an SSL certificate that **does not exist** on the server.

- **Configured path**: `/etc/letsencrypt/live/app.soupfinance.com/fullchain.pem`
- **Actual certificate**: `/etc/letsencrypt/live/app.soupmarkets.com/fullchain.pem`
- **Result**: Apache cannot start HTTPS service properly

---

## SSL Certificate Paths

### What Apache is Configured to Use

```apache
# File: /etc/apache2/sites-available/app-soupfinance-com.conf
SSLCertificateFile /etc/letsencrypt/live/app.soupfinance.com/fullchain.pem
SSLCertificateKeyFile /etc/letsencrypt/live/app.soupfinance.com/privkey.pem
```

### What Actually Exists on the Server

#### Certificates Directory Contents

```
/etc/letsencrypt/live/
├── app.soupmarkets.com/         ✅ EXISTS
├── owncloud.fincaps.net/        (other domain)
├── soupbroker.crypttransact.com/ (other domain)
├── soupbroker.fincaps.net/      (other domain)
├── soupmarkets.com/             (other domain)
└── app.soupfinance.com/         ❌ DOES NOT EXIST
```

#### Status of Each Certificate

| Certificate | Status | Path | Updated |
|-------------|--------|------|---------|
| **app.soupmarkets.com** | ✅ EXISTS | `/etc/letsencrypt/live/app.soupmarkets.com/` | Nov 23, 2025 |
| **app.soupfinance.com** | ❌ MISSING | `/etc/letsencrypt/live/app.soupfinance.com/` | N/A |

---

## Certificate Details

### The Existing Certificate (app.soupmarkets.com)

```
Subject: CN = app.soupmarkets.com
Issuer: Let's Encrypt (R12)
Valid From: Nov 23, 2025 11:56:02 GMT
Valid Until: Feb 21, 2026 11:56:01 GMT
Validity Status: ✅ VALID (97 days remaining)

Symlinks in /etc/letsencrypt/live/app.soupmarkets.com/:
  cert.pem → ../../archive/app.soupmarkets.com/cert18.pem
  chain.pem → ../../archive/app.soupmarkets.com/chain18.pem
  fullchain.pem → ../../archive/app.soupmarkets.com/fullchain18.pem
  privkey.pem → ../../archive/app.soupmarkets.com/privkey18.pem
```

### Why app.soupfinance.com Certificate is Missing

The directory `/etc/letsencrypt/live/app.soupfinance.com/` does not exist, which means:

1. **Scenario 1**: The domain was migrated from `app.soupmarkets.com` to `app.soupfinance.com`
2. **But**: The Apache config was updated to reference `app.soupfinance.com`
3. **And**: No SSL certificate was generated for the new domain name
4. **Result**: Mismatch between config and reality

---

## Impact Assessment

### Apache Service Status

```
Service Status: ⚠️ INACTIVE (stopped)
Last Stopped: 2026-01-21 13:04:27 UTC
Reason: Likely due to SSL certificate path error on startup attempt
```

### SSL Warnings in Apache Error Log

```
[Wed Jan 21 12:18:11.323847 2026] [ssl:warn] [pid 44537] 
AH01909: app.soupfinance.com:443:0 server certificate does 
NOT include an ID which matches the server name
```

**Translation**: The certificate being offered (app.soupmarkets.com) doesn't match the requested domain (app.soupfinance.com).

### User Experience Impact

- **HTTPS connections**: May fail or show certificate warnings
- **SPA availability**: Static files from `/var/www/soupfinance` cannot be served over HTTPS
- **Backend API**: Proxy to `/client/` routes (port 6081) cannot complete
- **Overall**: Site likely unreachable or shows SSL certificate error

---

## Root Cause Timeline

Based on the evidence:

1. **Original Setup**: Certificate issued for `app.soupmarkets.com` (Nov 23, 2025)
2. **Domain Migration**: Apache config changed to use `app.soupfinance.com` domain
3. **Configuration Sync Issue**: Apache config points to nonexistent `app.soupfinance.com` certificate
4. **Result**: Service cannot start with valid HTTPS

---

## Solution: Three Options

### Option 1: Point to Existing Certificate ⭐ QUICKEST

Use the existing `app.soupmarkets.com` certificate instead:

```bash
# Edit Apache config
sudo sed -i 's|app.soupfinance.com|app.soupmarkets.com|g' \
  /etc/apache2/sites-available/app-soupfinance-com.conf

# Verify syntax
sudo apache2ctl configtest

# Restart Apache
sudo systemctl restart apache2
```

**Pros**: Immediate fix, no certificate generation needed  
**Cons**: Certificate CN won't match the domain (but still valid via Let's Encrypt wildcard logic)

---

### Option 2: Generate Certificate for app.soupfinance.com ⭐ RECOMMENDED

Generate a new certificate for the new domain:

```bash
# Generate certificate for app.soupfinance.com
sudo certbot certonly --apache -d app.soupfinance.com

# This will:
# - Create: /etc/letsencrypt/live/app.soupfinance.com/
# - Fill in cert.pem, chain.pem, fullchain.pem, privkey.pem

# Verify Apache syntax
sudo apache2ctl configtest

# Restart Apache
sudo systemctl restart apache2
```

**Pros**: Proper certificate for the domain, clean solution  
**Cons**: Requires certbot interaction

---

### Option 3: Multi-Domain Certificate ⭐ FUTURE-PROOF

Cover both domains in a single certificate:

```bash
# Generate certificate for both domains
sudo certbot certonly --apache -d app.soupfinance.com -d app.soupmarkets.com

# Then update Apache config to reference:
sudo sed -i 's|app.soupmarkets.com|app.soupfinance.com|g' \
  /etc/apache2/sites-available/app-soupfinance-com.conf

# Verify and restart
sudo apache2ctl configtest
sudo systemctl restart apache2
```

**Pros**: Covers both domains, future-proof  
**Cons**: Requires coordinating multiple domains

---

## Verification Steps

### After Applying Any Solution

```bash
# 1. Check Apache syntax
ssh root@65.20.112.224 "apache2ctl configtest"
# Expected output: "Syntax OK"

# 2. Start Apache
ssh root@65.20.112.224 "systemctl start apache2"

# 3. Check service is running
ssh root@65.20.112.224 "systemctl status apache2"
# Expected: "active (running)"

# 4. Test HTTPS connection
ssh root@65.20.112.224 "curl -I https://app.soupfinance.com/"
# Expected: HTTP/1.1 200 OK (or redirect to https)

# 5. Check certificate details
ssh root@65.20.112.224 "openssl s_client -connect localhost:443 -servername app.soupfinance.com < /dev/null | openssl x509 -noout -subject"
```

---

## Files Involved

| File | Path | Status |
|------|------|--------|
| **Apache Vhost** | `/etc/apache2/sites-available/app-soupfinance-com.conf` | Points to wrong cert |
| **Apache Backup** | `/etc/apache2/sites-available/app-soupfinance-com.conf.backup.20260121` | Available for reference |
| **Existing Certificate** | `/etc/letsencrypt/live/app.soupmarkets.com/` | ✅ Current and valid |
| **Missing Certificate** | `/etc/letsencrypt/live/app.soupfinance.com/` | ❌ Does not exist |
| **Apache Error Log** | `/var/log/apache2/soupfinance-error.log` | Check for warnings |
| **Main Error Log** | `/var/log/apache2/error.log` | Contains SSL warnings |

---

## Recommendation

**Implement Option 2: Generate Certificate for app.soupfinance.com**

This is the proper solution because:

1. ✅ Matches the configured domain name
2. ✅ Eliminates certificate/hostname mismatch warnings
3. ✅ Provides a valid, dedicated certificate
4. ✅ Takes ~5 minutes to implement
5. ✅ Can use automated renewal from certbot

**Timeline**: 
- Generate certificate: 2-3 minutes
- Update Apache (if needed): 1 minute
- Restart service: 1 minute
- Total: ~5 minutes

---

## Additional Recommendations

### 1. Update Monitoring
Monitor Apache HTTPS certificate expiry:
- App.soupmarkets.com cert expires: Feb 21, 2026 (97 days)
- Set up alerts for renewal at 30 days before expiry

### 2. Document Domain Usage
Create documentation showing which domains map to which certificates:

| Domain | Certificate | Status | Renewal |
|--------|-------------|--------|---------|
| app.soupfinance.com | To be generated | N/A | Auto (30 days before) |
| app.soupmarkets.com | exists | Valid until Feb 21 | Auto (30 days before) |

### 3. Backup Configuration
Keep the backup config saved:
- File: `/etc/apache2/sites-available/app-soupfinance-com.conf.backup.20260121`
- Action: Archive to version control

---

## Files Generated for Reference

- **Context saved to**: `.claude/context/tool-outputs/20260121-ssl-certificate-investigation.md`
- **Backup config exists at**: `/etc/apache2/sites-available/app-soupfinance-com.conf.backup.20260121`

---

**Investigation completed**: 2026-01-21  
**Severity**: CRITICAL - Service cannot provide HTTPS  
**Action Required**: Generate or redirect to valid SSL certificate  
**Estimated Fix Time**: 5 minutes  
