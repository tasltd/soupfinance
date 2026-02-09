#!/bin/bash
# Deploy SoupFinance to Production server (65.20.112.224)
#
# IMPORTANT: Site is ONLY accessible via domain name (app.soupfinance.com)
# Direct IP access is NOT supported.
#
# Architecture:
#   Cloudflare (DNS/SSL) -> Apache (vhost) -> Static files + API proxy
#
# SSH Key Requirements:
#   Uses ~/.ssh/crypttransact_rsa key for authentication
#   Ensure SSH config has: Host soupfinance-prod with IdentityFile ~/.ssh/crypttransact_rsa
#
# CRITICAL: The canonical Apache config file is deploy/apache-soupfinance.conf.
# This script uploads THAT file to the server. Do NOT create or edit other .conf files
# expecting them to be deployed — only apache-soupfinance.conf is used.
#
# Usage: ./deploy/deploy-to-production.sh

set -e

# Configuration
SERVER="65.20.112.224"
SERVER_USER="root"
SSH_KEY="$HOME/.ssh/crypttransact_rsa"
SSH_OPTS="-o StrictHostKeyChecking=no -i $SSH_KEY"
DEPLOY_DIR="/var/www/soupfinance"
APACHE_CONF="/etc/apache2/sites-available/app-soupfinance-com.conf"
APACHE_BACKUP="/etc/apache2/sites-available/app-soupfinance-com.conf.bak"
DOMAIN="app.soupfinance.com"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Changed: Canonical source config file — ONLY this file is deployed
LOCAL_CONF="$SCRIPT_DIR/apache-soupfinance.conf"

# Verify SSH key exists
if [ ! -f "$SSH_KEY" ]; then
    echo "ERROR: SSH key not found: $SSH_KEY"
    echo "Please ensure ~/.ssh/crypttransact_rsa exists"
    exit 1
fi

# Fix: Verify the canonical config file exists before starting
if [ ! -f "$LOCAL_CONF" ]; then
    echo "ERROR: Apache config file not found: $LOCAL_CONF"
    echo "The canonical source is deploy/apache-soupfinance.conf"
    exit 1
fi

echo ""
echo "  SoupFinance Deployment to Production"
echo "  ======================================"
echo ""
echo "Server: $SERVER"
echo "Domain: $DOMAIN"
echo "Deploy directory: $DEPLOY_DIR"
echo "Apache config: $LOCAL_CONF"
echo ""

# Step 1: Build the application
echo "[1/6] Building production bundle..."
cd "$PROJECT_DIR"
npm run build
echo "Build complete!"
echo ""

# Step 2: Create deployment directory on server
echo "[2/6] Creating deployment directory..."
ssh $SSH_OPTS ${SERVER_USER}@${SERVER} "mkdir -p $DEPLOY_DIR"
echo ""

# Step 3: Deploy built files + maintenance page to server
echo "[3/6] Deploying files to server..."
rsync -avz --delete -e "ssh $SSH_OPTS" "$PROJECT_DIR/dist/" ${SERVER_USER}@${SERVER}:${DEPLOY_DIR}/
# Deploy maintenance page (lives in public/ but must be at webroot)
if [ -f "$PROJECT_DIR/public/maintenance.html" ]; then
    scp $SSH_OPTS "$PROJECT_DIR/public/maintenance.html" ${SERVER_USER}@${SERVER}:${DEPLOY_DIR}/maintenance.html
    echo "Maintenance page deployed!"
fi
echo "Files deployed!"
echo ""

# Step 4: Deploy Apache configuration with backup and rollback
echo "[4/6] Configuring Apache..."

# Backup existing config before overwriting
ssh $SSH_OPTS ${SERVER_USER}@${SERVER} "cp -f ${APACHE_CONF} ${APACHE_BACKUP} 2>/dev/null || true"

# Fix: Deploy the canonical config file (apache-soupfinance.conf)
scp $SSH_OPTS "$LOCAL_CONF" ${SERVER_USER}@${SERVER}:${APACHE_CONF}

# Enable site and test config - rollback if test fails
ssh $SSH_OPTS ${SERVER_USER}@${SERVER} "
    a2ensite app-soupfinance-com.conf 2>/dev/null || true
    if apache2ctl configtest 2>&1; then
        systemctl reload apache2
        echo 'Apache config test passed and reloaded.'
    else
        echo 'ERROR: Apache config test FAILED! Rolling back...'
        if [ -f ${APACHE_BACKUP} ]; then
            cp -f ${APACHE_BACKUP} ${APACHE_CONF}
            systemctl reload apache2
            echo 'Rolled back to previous config.'
        fi
        exit 1
    fi
"
echo "Apache configured!"
echo ""

# Step 5: Post-deploy verification (basic HTTP checks)
echo "[5/6] Verifying deployment (HTTP checks)..."
VERIFY_FAILED=0

# Check HTTPS (Cloudflare Full SSL connects on 443)
HTTPS_STATUS=$(ssh $SSH_OPTS ${SERVER_USER}@${SERVER} "curl -s -o /dev/null -w '%{http_code}' --max-time 10 --resolve ${DOMAIN}:443:127.0.0.1 https://${DOMAIN}/ --insecure 2>/dev/null || echo '000'")
if [ "$HTTPS_STATUS" = "200" ]; then
    echo "  HTTPS (port 443): OK (status $HTTPS_STATUS)"
else
    echo "  HTTPS (port 443): FAILED (status $HTTPS_STATUS)"
    VERIFY_FAILED=1
fi

# Check HTTP
HTTP_STATUS=$(ssh $SSH_OPTS ${SERVER_USER}@${SERVER} "curl -s -o /dev/null -w '%{http_code}' --max-time 10 --resolve ${DOMAIN}:80:127.0.0.1 http://${DOMAIN}/ 2>/dev/null || echo '000'")
if [ "$HTTP_STATUS" = "200" ]; then
    echo "  HTTP  (port 80):  OK (status $HTTP_STATUS)"
else
    echo "  HTTP  (port 80):  FAILED (status $HTTP_STATUS)"
    VERIFY_FAILED=1
fi

# Check that VirtualHost blocks exist for both ports
VHOST_CHECK=$(ssh $SSH_OPTS ${SERVER_USER}@${SERVER} "grep -c 'VirtualHost' ${APACHE_CONF}")
if [ "$VHOST_CHECK" -ge 2 ]; then
    echo "  VirtualHost blocks: OK ($VHOST_CHECK found - HTTP + HTTPS)"
else
    echo "  VirtualHost blocks: WARNING (only $VHOST_CHECK found, expected 2)"
    VERIFY_FAILED=1
fi

echo ""

# Step 6: SPA Route + API Proxy validation
# Fix: Validates that SPA routes return index.html (200) and NOT 404
# This catches the ProxyPass prefix-matching bug where /clients/new was being
# proxied to the backend because ProxyPass /client matched /clients/new
echo "[6/6] Verifying SPA routes and API proxy..."
SPA_VERIFY_FAILED=0

# SPA routes that MUST return 200 (served by index.html, not proxied to backend)
# These are the routes most likely to break if ProxyPass lacks trailing slashes
SPA_ROUTES="/login /dashboard /invoices /bills /vendors /clients/new /settings /settings/users /settings/bank-accounts /reports /ledger"

for ROUTE in $SPA_ROUTES; do
    SPA_STATUS=$(ssh $SSH_OPTS ${SERVER_USER}@${SERVER} "curl -s -o /dev/null -w '%{http_code}' --max-time 10 --resolve ${DOMAIN}:443:127.0.0.1 https://${DOMAIN}${ROUTE} --insecure 2>/dev/null || echo '000'")
    if [ "$SPA_STATUS" = "200" ]; then
        echo "  SPA $ROUTE: OK"
    else
        echo "  SPA $ROUTE: FAILED (status $SPA_STATUS) - SPA routing broken!"
        SPA_VERIFY_FAILED=1
        VERIFY_FAILED=1
    fi
done

# API proxy check: /rest/ should reach the backend (may return 401 without auth, that's OK)
# What matters is it's NOT 404 (which would mean proxy is broken)
API_STATUS=$(ssh $SSH_OPTS ${SERVER_USER}@${SERVER} "curl -s -o /dev/null -w '%{http_code}' --max-time 10 --resolve ${DOMAIN}:443:127.0.0.1 https://${DOMAIN}/rest/vendor/index.json --insecure 2>/dev/null || echo '000'")
if [ "$API_STATUS" != "000" ] && [ "$API_STATUS" != "404" ] && [ "$API_STATUS" != "502" ] && [ "$API_STATUS" != "503" ]; then
    echo "  API /rest/vendor/index.json: OK (status $API_STATUS)"
else
    echo "  API /rest/vendor/index.json: FAILED (status $API_STATUS) - API proxy broken!"
    VERIFY_FAILED=1
fi

# Check Api-Authorization header is present in deployed config
AUTH_CHECK=$(ssh $SSH_OPTS ${SERVER_USER}@${SERVER} "grep -c 'Api-Authorization' ${APACHE_CONF}")
if [ "$AUTH_CHECK" -ge 2 ]; then
    echo "  Api-Authorization: OK (found in $AUTH_CHECK VHost blocks)"
else
    echo "  Api-Authorization: WARNING (found in only $AUTH_CHECK blocks, expected 2)"
    VERIFY_FAILED=1
fi

# Fix: Check trailing slashes are present on all ProxyPass directives
# NOTE: grep -cv returns exit code 1 when 0 lines match (all have trailing slash = success)
# The || true prevents set -e from aborting on this expected "no match" case
TRAILING_SLASH_CHECK=$(ssh $SSH_OPTS ${SERVER_USER}@${SERVER} "grep 'ProxyPass ' ${APACHE_CONF} | grep -v '#' | grep -cv '/$' || true")
if [ "$TRAILING_SLASH_CHECK" = "0" ]; then
    echo "  ProxyPass trailing slashes: OK (all paths have trailing slashes)"
else
    echo "  ProxyPass trailing slashes: WARNING ($TRAILING_SLASH_CHECK paths missing trailing slash!)"
    VERIFY_FAILED=1
fi

echo ""

if [ "$SPA_VERIFY_FAILED" -eq 1 ]; then
    echo "  CRITICAL: SPA route validation FAILED!"
    echo "  ========================================="
    echo ""
    echo "  SPA routes are returning non-200 status codes."
    echo "  This usually means ProxyPass paths are missing trailing slashes,"
    echo "  causing Apache to proxy SPA routes to the backend."
    echo ""
    echo "  Check deploy/apache-soupfinance.conf and ensure:"
    echo "    ProxyPass /client/   (NOT /client)"
    echo "    ProxyPass /account/  (NOT /account)"
    echo "    RewriteCond !^/client/   (NOT !^/client)"
    echo "    RewriteCond !^/account/  (NOT !^/account)"
    echo ""
    echo "  Rolling back to previous config..."
    ssh $SSH_OPTS ${SERVER_USER}@${SERVER} "
        if [ -f ${APACHE_BACKUP} ]; then
            cp -f ${APACHE_BACKUP} ${APACHE_CONF}
            systemctl reload apache2
            echo 'Rolled back to previous config.'
        fi
    "
    exit 1
fi

if [ "$VERIFY_FAILED" -eq 1 ]; then
    echo "  WARNING: Deployment completed but verification failed!"
    echo "  ======================================================"
    echo ""
    echo "The site may not be fully accessible. Check:"
    echo "  1. Apache error log: /var/log/apache2/app.soupfinance.com-ssl-error.log"
    echo "  2. SSL certificates: /etc/letsencrypt/live/$DOMAIN/"
    echo "  3. Apache config: $APACHE_CONF"
    echo ""
    exit 1
else
    echo "  Production Deployment Complete!"
    echo "  ================================"
    echo ""
    echo "Site live at: https://$DOMAIN"
    echo ""
    echo "Verified:"
    echo "  - HTTP and HTTPS both responding correctly"
    echo "  - All SPA routes returning 200 (index.html)"
    echo "  - API proxy reaching backend"
    echo "  - Api-Authorization header present in both VHost blocks"
    echo "  - ProxyPass paths have trailing slashes"
    echo ""
fi
