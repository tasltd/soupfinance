# SoupFinance Deployment Rules

## SSH Key Configuration

The SoupFinance production server (65.20.112.224) requires the `crypttransact_rsa` SSH key for authentication.

### Required SSH Key
- **Key File**: `~/.ssh/crypttransact_rsa`
- **Key Owner**: dfdnusenu account
- **NOT** the `daptordarattler_rsa` or `id_rsa` keys (these do not have access)

### SSH Config Entry (recommended)
Add to `~/.ssh/config`:
```
Host soupfinance-prod
    HostName 65.20.112.224
    User root
    IdentityFile ~/.ssh/crypttransact_rsa
    IdentitiesOnly yes
```

## Production Server Details

| Property | Value |
|----------|-------|
| IP Address | 65.20.112.224 |
| User | root |
| SSH Key | ~/.ssh/crypttransact_rsa |
| Web Root | /var/www/soupfinance |
| Domain | app.soupfinance.com |
| Apache Config | /etc/apache2/sites-available/app-soupfinance-com.conf |

## Deployment Scripts

### Frontend Deployment
```bash
cd soupfinance-web
./deploy/deploy-to-production.sh
```

The script:
1. Builds the production bundle (`npm run build`)
2. Creates deployment directory on server
3. Syncs dist/ to /var/www/soupfinance via rsync
4. Updates Apache configuration and reloads

### Manual SSH Access
```bash
ssh -i ~/.ssh/crypttransact_rsa root@65.20.112.224
```

Or using the SSH config alias:
```bash
ssh soupfinance-prod
```

## Architecture

```
Client -> Cloudflare (DNS/SSL) -> Apache (65.20.112.224) -> Static files + API proxy
                                                        -> Tomcat backend (port 8080)
```

## Important Notes

1. Site is ONLY accessible via domain name (app.soupfinance.com), not via direct IP
2. DNS is managed via Cloudflare
3. API requests (/rest/*) are proxied to Tomcat backend on port 8080
4. Always verify deployment by visiting https://app.soupfinance.com

## Troubleshooting

### App shows landing page instead of React app
**Cause**: Missing HTTPS (port 443) vhost for `app.soupfinance.com`. Cloudflare connects to origin via HTTPS.

**Fix**: Ensure `/etc/apache2/sites-available/app-soupfinance-com.conf` has BOTH port 80 and port 443 vhosts:
```apache
<VirtualHost *:80>
    ServerName app.soupfinance.com
    Redirect permanent / https://app.soupfinance.com/
</VirtualHost>

<VirtualHost *:443>
    ServerName app.soupfinance.com
    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/app.soupfinance.com/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/app.soupfinance.com/privkey.pem
    DocumentRoot /var/www/soupfinance
    # ... SPA routing and proxy config ...
</VirtualHost>
```

**Verify vhosts**: `apache2ctl -S | grep soupfinance`

### Landing page deploy removes logo files
**Cause**: The `deploy-landing.sh` script uses rsync `--delete` which removes files not in source.

**Fix**: After running deploy-landing.sh, manually upload logo assets:
```bash
scp -i ~/.ssh/crypttransact_rsa \
  soupfinance-landing/logo.png \
  soupfinance-landing/favicon.* \
  soupfinance-landing/apple-touch-icon.png \
  root@65.20.112.224:/var/www/soupfinance-landing/
```
