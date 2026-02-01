# SSL Certificate Paths - Reference Document

## Production Server: 65.20.112.224

### CONFIGURED Paths (What Apache Expects)

| Setting | Value |
|---------|-------|
| **SSLCertificateFile** | `/etc/letsencrypt/live/app.soupfinance.com/fullchain.pem` |
| **SSLCertificateKeyFile** | `/etc/letsencrypt/live/app.soupfinance.com/privkey.pem` |
| **Config File** | `/etc/apache2/sites-available/app-soupfinance-com.conf` |

**Status**: ❌ PATHS DO NOT EXIST

---

### ACTUAL Paths (What's on the Server)

#### Primary Certificate (Exists)
```
Domain: app.soupmarkets.com
Path: /etc/letsencrypt/live/app.soupmarkets.com/

Contents:
  ├── cert.pem → ../../archive/app.soupmarkets.com/cert18.pem
  ├── chain.pem → ../../archive/app.soupmarkets.com/chain18.pem
  ├── fullchain.pem → ../../archive/app.soupmarkets.com/fullchain18.pem
  ├── privkey.pem → ../../archive/app.soupmarkets.com/privkey18.pem
  └── README

Expiry: Feb 21, 2026 (97 days remaining)
```

#### Other Certificates
```
/etc/letsencrypt/live/owncloud.fincaps.net/
/etc/letsencrypt/live/soupbroker.crypttransact.com/
/etc/letsencrypt/live/soupbroker.fincaps.net/
/etc/letsencrypt/live/soupmarkets.com/
```

#### Missing Certificate
```
Domain: app.soupfinance.com
Path: /etc/letsencrypt/live/app.soupfinance.com/
Status: ❌ DOES NOT EXIST
```

---

## The Mismatch

### Visual Comparison

```
CONFIGURED:
  /etc/letsencrypt/live/app.soupfinance.com/fullchain.pem
                         ▲
                         │
                         ❌ MISSING

ACTUAL:
  /etc/letsencrypt/live/app.soupmarkets.com/fullchain.pem
                         ▲
                         │
                         ✅ EXISTS & VALID
```

---

## Archive Structure

The Let's Encrypt archive contains versioned certificates:

```
/etc/letsencrypt/archive/app.soupmarkets.com/
  ├── cert18.pem (the most recent certificate)
  ├── cert17.pem (previous versions...)
  ├── chain18.pem
  ├── fullchain18.pem
  └── privkey18.pem

/etc/letsencrypt/live/app.soupmarkets.com/
  ├── cert.pem → ../../archive/app.soupmarkets.com/cert18.pem (symlink)
  ├── chain.pem → ../../archive/app.soupmarkets.com/chain18.pem (symlink)
  ├── fullchain.pem → ../../archive/app.soupmarkets.com/fullchain18.pem (symlink)
  └── privkey.pem → ../../archive/app.soupmarkets.com/privkey18.pem (symlink)
```

**Important**: The `/live/` directory contains symlinks that always point to the most recent version. Certbot auto-rotates these after renewals.

---

## Where to Find Certificates

### List All Let's Encrypt Domains
```bash
ls -d /etc/letsencrypt/live/*/
```

**Output**:
```
/etc/letsencrypt/live/app.soupmarkets.com/
/etc/letsencrypt/live/owncloud.fincaps.net/
/etc/letsencrypt/live/soupbroker.crypttransact.com/
/etc/letsencrypt/live/soupbroker.fincaps.net/
/etc/letsencrypt/live/soupmarkets.com/
```

### View Certificate Details
```bash
# Check expiry and subject
openssl x509 -in /etc/letsencrypt/live/app.soupmarkets.com/fullchain.pem \
  -noout -subject -dates

# Check CN matches
openssl x509 -in /etc/letsencrypt/live/app.soupmarkets.com/fullchain.pem \
  -noout -text | grep -A1 "Subject CN"
```

---

## Generating New Certificate Paths

### When You Run `certbot` to Create New Certificate

Command:
```bash
certbot certonly --apache -d app.soupfinance.com
```

Result:
```
Created: /etc/letsencrypt/live/app.soupfinance.com/

New paths will be:
  ├── cert.pem → ../../archive/app.soupfinance.com/cert1.pem
  ├── chain.pem → ../../archive/app.soupfinance.com/chain1.pem
  ├── fullchain.pem → ../../archive/app.soupfinance.com/fullchain1.pem (USE THIS)
  └── privkey.pem → ../../archive/app.soupfinance.com/privkey1.pem (USE THIS)
```

### Then Update Apache Config
```apache
SSLCertificateFile /etc/letsencrypt/live/app.soupfinance.com/fullchain.pem
SSLCertificateKeyFile /etc/letsencrypt/live/app.soupfinance.com/privkey.pem
```

---

## Certificate Files Explained

| File | Purpose | Used By |
|------|---------|---------|
| **fullchain.pem** | Full certificate chain (cert + intermediates) | Apache SSLCertificateFile |
| **privkey.pem** | Private key | Apache SSLCertificateKeyFile |
| **cert.pem** | Just the server certificate | Rarely used |
| **chain.pem** | Intermediate CA certificates | Rarely used directly |

**For Apache**: Always use `fullchain.pem` and `privkey.pem`

---

## Commands to Check Current Configuration

```bash
# 1. See what Apache is configured for
grep -i "SSLCertificate" /etc/apache2/sites-available/app-soupfinance-com.conf

# 2. Check if those paths exist
ls -la /etc/letsencrypt/live/app.soupfinance.com/

# 3. Check what certificates are available
ls -d /etc/letsencrypt/live/*/

# 4. See certificate details of existing cert
openssl x509 -in /etc/letsencrypt/live/app.soupmarkets.com/fullchain.pem -noout -text

# 5. Check Apache error log for SSL issues
grep "SSL\|certificate" /var/log/apache2/error.log | tail -10
```

---

## Current State Summary

| Item | Status | Path/Value |
|------|--------|-----------|
| **App configured domain** | ⚠️ Mismatch | app.soupfinance.com |
| **Configured cert path** | ❌ Missing | `/etc/letsencrypt/live/app.soupfinance.com/` |
| **Available cert domain** | ✅ Exists | app.soupmarkets.com |
| **Available cert path** | ✅ Valid | `/etc/letsencrypt/live/app.soupmarkets.com/` |
| **Certificate expiry** | ✅ Good | Feb 21, 2026 (97 days) |
| **Apache service** | 🔴 Stopped | Due to cert path mismatch |

---

## Next Steps

### To Fix Immediately (Option 1)
Update Apache to use existing certificate:
```bash
sed -i 's|app.soupfinance.com|app.soupmarkets.com|g' \
  /etc/apache2/sites-available/app-soupfinance-com.conf
```

### To Fix Properly (Option 2)
Generate new certificate for app.soupfinance.com:
```bash
certbot certonly --apache -d app.soupfinance.com
# This will create /etc/letsencrypt/live/app.soupfinance.com/
systemctl restart apache2
```

---

**Reference document**: SSL certificate paths on production server 65.20.112.224  
**Last updated**: 2026-01-21  
**Severity**: CRITICAL - Service HTTPS unavailable
