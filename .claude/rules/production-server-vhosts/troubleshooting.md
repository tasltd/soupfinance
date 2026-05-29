# Troubleshooting, Known Issues, and Hard Rules

**Part of**: [production-server-vhosts](../production-server-vhosts.md)

Diagnostic playbook for production-server-vhosts issues, plus the global do/don't list.

---

## Hard Rules

### NEVER DO

| Rule | Consequence of Violation |
|------|--------------------------|
| NEVER `systemctl restart apache2` | Drops ALL connections, causes downtime for ALL sites on server |
| NEVER edit configs directly on server | Changes get overwritten on next deploy; no git history |
| NEVER skip `apache2ctl configtest` | Syntax error will take down ALL 5 sites on the server |
| NEVER commit Api-Authorization credentials to git | Security breach: exposes ApiConsumer secret |
| NEVER modify soupmarkets VHosts from soupfinance context | Those are managed by a different project |
| NEVER remove port 443 VHost | Cloudflare won't be able to reach the site |
| NEVER add login forms to the landing page | Domain separation rule: app.soupfinance.com handles auth |
| NEVER deploy to soupmarkets production servers | See [.claude/rules/deployment-restrictions.md](../deployment-restrictions.md) |

### ALWAYS DO

| Rule | Reason |
|------|--------|
| ALWAYS edit local copy first, then push | Git tracks all changes |
| ALWAYS `apache2ctl configtest` before reload | Prevents catastrophic config errors |
| ALWAYS use `systemctl reload` (not restart) | Zero-downtime config update |
| ALWAYS update BOTH port 80 and 443 blocks | They must stay in sync |
| ALWAYS add RewriteCond when adding ProxyPass | Prevents SPA from catching API routes |
| ALWAYS verify after deploy | Curl the site to confirm it works |
| ALWAYS use SSH key `~/.ssh/crypttransact_rsa` | Only key with server access |

---

## Known Issues and Cleanup

### ISSUE 1: Duplicate Landing Page Config (PRIORITY: MEDIUM)

**Problem**: Two landing page configs are active in `sites-enabled/`:

| File | Type | Status |
|------|------|--------|
| `001-soupfinance-landing.conf` | Regular file (NOT symlink) | **OLD — should be removed** |
| `www-soupfinance-com.conf` | Symlink → sites-available | **CURRENT — keep this** |

The old `001-soupfinance-landing.conf` was the original config before the performance-optimized `www-soupfinance-com.conf` was created. Both serve the same domain but with different routing (old one doesn't redirect HTTP→HTTPS or bare→www).

Because `001-` sorts first alphabetically, it becomes the **default VHost** for port 80 and port 443. This means unmatched requests go to the old config, not the new one.

**Impact**: Currently low because all SoupFinance domains have matching VHosts. But it means the default fallback for unknown domains on port 443 goes to the old landing page config.

**Fix**:
```bash
ssh -i ~/.ssh/crypttransact_rsa root@65.20.112.224 \
    "rm /etc/apache2/sites-enabled/001-soupfinance-landing.conf \
     && rm /etc/apache2/sites-enabled/001-soupfinance-landing.conf.backup \
     && rm /etc/apache2/sites-enabled/001-soupfinance-landing.conf.bak \
     && apache2ctl configtest && systemctl reload apache2"
```

### ISSUE 2: Backup Files in sites-enabled (PRIORITY: LOW)

**Problem**: `001-soupfinance-landing.conf.backup` and `001-soupfinance-landing.conf.bak` are in `sites-enabled/`. Apache ignores files that don't end in `.conf`, but they clutter the directory.

**Fix**: Remove them during Issue 1 cleanup (see command above).

### ISSUE 3: Backup Files in sites-available (PRIORITY: LOW)

**Problem**: Multiple `.backup` and `.bak` files for `app-soupfinance-com.conf` in `sites-available/`.

**Fix**:
```bash
ssh -i ~/.ssh/crypttransact_rsa root@65.20.112.224 \
    "rm /etc/apache2/sites-available/app-soupfinance-com.conf.backup.* \
     && rm /etc/apache2/sites-available/app-soupfinance-com.conf.bak"
```

### ISSUE 4: App VHost Missing Certbot SSL Options (PRIORITY: LOW)

**Problem**: The landing page VHost includes `/etc/letsencrypt/options-ssl-apache.conf` for recommended SSL settings. The app VHost does not.

**Impact**: Minimal — Cloudflare handles TLS termination for most users. The SSL settings only affect direct-to-origin requests.

**Fix** (optional):
```apache
# Add to port 443 VHost after SSLCertificateKeyFile:
Include /etc/letsencrypt/options-ssl-apache.conf
```

---

## Troubleshooting Playbook

### Symptom: app.soupfinance.com shows landing page instead of React app

**Root cause**: Missing or broken port 443 SSL VHost for `app.soupfinance.com`.

**Diagnosis**:
```bash
# Check if SSL VHost exists
ssh -i ~/.ssh/crypttransact_rsa root@65.20.112.224 "apache2ctl -S | grep app.soupfinance"
# MUST show port 443 entry

# Test direct HTTPS to origin
curl -skI -H "Host: app.soupfinance.com" "https://65.20.112.224/"
# Should return HTML with <div id="root">

# Test through Cloudflare
curl -sI "https://app.soupfinance.com/login"
# Should return HTTP/2 200
```

**Fix**: Ensure `app-soupfinance-com.conf` has BOTH port 80 and port 443 VHost blocks. Push and reload.

### Symptom: API calls return 403 Forbidden

**Root cause**: Missing or incorrect `Api-Authorization` header.

**Diagnosis**:
```bash
# Test API through Apache
curl -s "https://app.soupfinance.com/rest/api/login" \
    -X POST -H "Content-Type: application/json" \
    -d '{"username":"test","password":"test"}'
# Should return JSON (even if "Invalid username or password")
# If returns HTML or 403 → Api-Authorization header is wrong

# Verify ApiConsumer exists in production DB
ssh root@140.82.32.141 "mysql -u soupbroker -p'Dominus@soupbroker.2020' soupbroker \
    -e \"SELECT id, name FROM api_consumer WHERE name LIKE '%SoupFinance%'\""
```

**Fix**: Verify the base64 encoding matches `name:secret` from the `api_consumer` table. See [api-authorization](./api-authorization.md).

### Symptom: SPA routes return 404

**Root cause**: Missing RewriteEngine rules or missing rewrite exclusion for a new API path.

**Diagnosis**:
```bash
# Test a SPA route
curl -sI "https://app.soupfinance.com/invoices"
# Should return 200 (index.html)

# Test an API route
curl -sI "https://app.soupfinance.com/rest/api/login"
# Should NOT return index.html — should proxy to backend
```

**Fix**: Check that `RewriteEngine On` is present and all API paths have `RewriteCond` exclusions. See [app-vhost](./app-vhost.md) for the rewrite block.

### Symptom: SSL certificate expired

**Diagnosis**:
```bash
ssh -i ~/.ssh/crypttransact_rsa root@65.20.112.224 "certbot certificates"
```

**Fix**:
```bash
ssh -i ~/.ssh/crypttransact_rsa root@65.20.112.224 \
    "certbot renew --cert-name app.soupfinance.com && systemctl reload apache2"
```

See [ssl-certificates](./ssl-certificates.md) for full renewal procedures.

### Symptom: Apache won't start/reload after config change

**Diagnosis**:
```bash
ssh -i ~/.ssh/crypttransact_rsa root@65.20.112.224 "apache2ctl configtest"
# Will show specific syntax error and line number
```

**Fix**: Correct the syntax error in the config file. ALWAYS test before reload.

### Symptom: 421 Misdirected Request on direct IP access

**Explanation**: This is EXPECTED when accessing `https://65.20.112.224` with a `Host: app.soupfinance.com` header via curl. The SNI (Server Name Indication) doesn't match because curl's TLS handshake uses the IP, not the hostname.

**This is NOT a bug**. The site is designed to be accessed via domain name through Cloudflare, not via direct IP.

### Symptom: www.soupfinance.com shows React app instead of landing page

**Root cause**: DNS misconfiguration in Cloudflare, or wrong VHost serving content.

**Diagnosis**:
```bash
# Check what www returns
curl -s "https://www.soupfinance.com" | grep '<title>'
# Should be: "SoupFinance - Corporate Accounting" (landing page title)
# If it's: "soupfinance-web" → wrong VHost is serving

# Check VHost mapping
ssh -i ~/.ssh/crypttransact_rsa root@65.20.112.224 "apache2ctl -S | grep www"
```
