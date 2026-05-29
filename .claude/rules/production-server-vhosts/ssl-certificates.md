# SSL Certificates

**Part of**: [production-server-vhosts](../production-server-vhosts.md)

All certificates are managed by Let's Encrypt certbot with auto-renewal.

---

## Certificate Inventory

| Certificate Name | Domains | Expiry | Path |
|------------------|---------|--------|------|
| `app.soupfinance.com` | app.soupfinance.com | 2026-04-21 (73 days) | `/etc/letsencrypt/live/app.soupfinance.com/` |
| `soupfinance.com` | soupfinance.com, www.soupfinance.com | 2026-04-21 (73 days) | `/etc/letsencrypt/live/soupfinance.com/` |
| `app.soupmarkets.com` | app.soupmarkets.com | 2026-04-23 (75 days) | `/etc/letsencrypt/live/app.soupmarkets.com/` |
| `soupmarkets.com` | soupmarkets.com | 2026-04-23 (75 days) | `/etc/letsencrypt/live/soupmarkets.com/` |

---

## Certificate Files

Each Let's Encrypt cert directory contains:

| File | Purpose |
|------|---------|
| `fullchain.pem` | Certificate + intermediate chain (used in `SSLCertificateFile`) |
| `privkey.pem` | Private key (used in `SSLCertificateKeyFile`) |
| `cert.pem` | Certificate only |
| `chain.pem` | Intermediate CA chain only |

---

## Shared SSL Options

File: `/etc/letsencrypt/options-ssl-apache.conf`

This file is `Include`d by the landing page and soupmarkets VHosts. It contains SSL protocol and cipher settings managed by certbot. The app VHost currently does NOT include this file (it only sets `SSLEngine on` + cert paths). See [troubleshooting](./troubleshooting.md) Issue 4 for an optional fix.

---

## Renewal

```bash
# Check all certificate expiry
ssh -i ~/.ssh/crypttransact_rsa root@65.20.112.224 "certbot certificates"

# Force renewal for a specific cert
ssh -i ~/.ssh/crypttransact_rsa root@65.20.112.224 "certbot renew --cert-name app.soupfinance.com"

# Renew all due certs
ssh -i ~/.ssh/crypttransact_rsa root@65.20.112.224 "certbot renew"

# Verify auto-renewal timer
ssh -i ~/.ssh/crypttransact_rsa root@65.20.112.224 "systemctl list-timers | grep certbot"
```
