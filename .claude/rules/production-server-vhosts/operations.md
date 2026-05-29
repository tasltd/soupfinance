# Operations: Logging, Deployment, Verification

**Part of**: [production-server-vhosts](../production-server-vhosts.md)

Day-to-day operational commands for the SoupFinance production server.

---

## Logging

### Log Files

| VHost | Error Log | Access Log |
|-------|-----------|------------|
| App (HTTP) | `app.soupfinance.com-error.log` | `app.soupfinance.com-access.log` |
| App (HTTPS) | `app.soupfinance.com-ssl-error.log` | `app.soupfinance.com-ssl-access.log` |
| Landing (HTTP) | `www-soupfinance-error.log` | `www-soupfinance-access.log` |
| Landing (HTTPS) | `www-soupfinance-ssl-error.log` | `www-soupfinance-ssl-access.log` |

### Viewing Logs

```bash
SSH="ssh -i ~/.ssh/crypttransact_rsa root@65.20.112.224"

# App errors (SSL — most traffic comes through here via Cloudflare)
$SSH "tail -f /var/log/apache2/app.soupfinance.com-ssl-error.log"

# App access (SSL)
$SSH "tail -f /var/log/apache2/app.soupfinance.com-ssl-access.log"

# Landing page errors
$SSH "tail -f /var/log/apache2/www-soupfinance-ssl-error.log"

# All SoupFinance logs at once
$SSH "tail -f /var/log/apache2/*soupfinance*"

# Recent errors (last 50 lines)
$SSH "tail -50 /var/log/apache2/app.soupfinance.com-ssl-error.log"

# Search for specific error
$SSH "grep -i 'proxy' /var/log/apache2/app.soupfinance.com-ssl-error.log | tail -20"
```

---

## Deployment Procedures

### Deploy React App (app.soupfinance.com)

```bash
cd soupfinance-web
./deploy/deploy-to-production.sh
```

The script:
1. Runs `npm run build` (TypeScript check + Vite production build)
2. Rsync `dist/` contents to `/var/www/soupfinance/` on server
3. Uses SSH key `~/.ssh/crypttransact_rsa`

### Deploy Landing Page (www.soupfinance.com)

```bash
cd soupfinance-landing
./deploy-landing.sh
```

### Deploy VHost Config Change

```bash
# 1. Edit canonical config (NOT app-soupfinance-com.conf which is stale)
vim soupfinance-web/deploy/apache-soupfinance.conf

# 2. Deploy using the deploy script (preferred — includes validation)
cd soupfinance-web && ./deploy/deploy-to-production.sh

# OR manual push:
scp -i ~/.ssh/crypttransact_rsa \
    soupfinance-web/deploy/apache-soupfinance.conf \
    root@65.20.112.224:/etc/apache2/sites-available/app-soupfinance-com.conf

# 3. Test and reload (NEVER restart — reload is zero-downtime)
ssh -i ~/.ssh/crypttransact_rsa root@65.20.112.224 \
    "apache2ctl configtest && systemctl reload apache2"

# 4. Verify
curl -sI https://app.soupfinance.com/login
# Expected: HTTP/2 200, content-type: text/html
```

### Deploy Landing Page VHost Config Change

```bash
# 1. Edit local copy
vim soupfinance-landing/deploy/www-soupfinance-com.conf

# 2. Push to server
scp -i ~/.ssh/crypttransact_rsa \
    soupfinance-landing/deploy/www-soupfinance-com.conf \
    root@65.20.112.224:/etc/apache2/sites-available/

# 3. Test and reload
ssh -i ~/.ssh/crypttransact_rsa root@65.20.112.224 \
    "apache2ctl configtest && systemctl reload apache2"

# 4. Verify
curl -sI https://www.soupfinance.com/
# Expected: HTTP/2 200, content-type: text/html
```

### HARD RULES for Deployment

1. **Always use `systemctl reload`**, NEVER `systemctl restart`** — Reload is zero-downtime; restart drops all active connections
2. **Always run `apache2ctl configtest` BEFORE reload** — A syntax error in config will take down ALL sites on the server
3. **Always update the local copy first**, then push to server — The local copy in the repo is the source of truth
4. **Never edit configs directly on the server** — Always edit locally, commit, then push

---

## Verification Commands

### Quick Health Check (run after any change)

```bash
SSH="ssh -i ~/.ssh/crypttransact_rsa root@65.20.112.224"

# 1. Config syntax
$SSH "apache2ctl configtest"

# 2. VHost mapping
$SSH "apache2ctl -S 2>&1 | grep soupfinance"

# 3. App returns React SPA
curl -s "https://app.soupfinance.com/login" | grep 'id="root"'

# 4. Landing page returns HTML
curl -s "https://www.soupfinance.com/" | grep '<title>'

# 5. API proxy works
curl -s "https://app.soupfinance.com/rest/api/login" \
    -X POST -H "Content-Type: application/json" \
    -d '{"username":"test","password":"test"}' | grep -E 'error|token'

# 6. Bare domain redirects to www
curl -sI "https://soupfinance.com/" | grep location
# Expected: location: https://www.soupfinance.com/

# 7. SSL certificates valid
$SSH "certbot certificates 2>&1 | grep -E 'soupfinance|Expiry'"
```

### Full Audit

```bash
SSH="ssh -i ~/.ssh/crypttransact_rsa root@65.20.112.224"

echo "=== Enabled Sites ==="
$SSH "ls -la /etc/apache2/sites-enabled/"

echo "=== VHost Mapping ==="
$SSH "apache2ctl -S 2>&1"

echo "=== Loaded Modules ==="
$SSH "apache2ctl -M 2>&1 | grep -E 'ssl|proxy|rewrite|headers|deflate|expires'"

echo "=== SSL Certificates ==="
$SSH "certbot certificates 2>&1"

echo "=== Disk Usage ==="
$SSH "du -sh /var/www/soupfinance/ /var/www/soupfinance-landing/"

echo "=== Recent Errors ==="
$SSH "tail -5 /var/log/apache2/app.soupfinance.com-ssl-error.log"
$SSH "tail -5 /var/log/apache2/www-soupfinance-ssl-error.log"
```
