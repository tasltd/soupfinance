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
