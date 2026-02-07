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

# Verify SSH key exists
if [ ! -f "$SSH_KEY" ]; then
    echo "ERROR: SSH key not found: $SSH_KEY"
    echo "Please ensure ~/.ssh/crypttransact_rsa exists"
    exit 1
fi

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         SoupFinance Deployment to Production                 ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "Server: $SERVER"
echo "Domain: $DOMAIN"
echo "Deploy directory: $DEPLOY_DIR"
echo ""

# Step 1: Build the application
echo "[1/5] Building production bundle..."
cd "$PROJECT_DIR"
npm run build
echo "Build complete!"
echo ""

# Step 2: Create deployment directory on server
echo "[2/5] Creating deployment directory..."
ssh $SSH_OPTS ${SERVER_USER}@${SERVER} "mkdir -p $DEPLOY_DIR"
echo ""

# Step 3: Deploy built files + maintenance page to server
echo "[3/5] Deploying files to server..."
rsync -avz --delete -e "ssh $SSH_OPTS" "$PROJECT_DIR/dist/" ${SERVER_USER}@${SERVER}:${DEPLOY_DIR}/
# Deploy maintenance page (lives in public/ but must be at webroot)
if [ -f "$PROJECT_DIR/public/maintenance.html" ]; then
    scp $SSH_OPTS "$PROJECT_DIR/public/maintenance.html" ${SERVER_USER}@${SERVER}:${DEPLOY_DIR}/maintenance.html
    echo "Maintenance page deployed!"
fi
echo "Files deployed!"
echo ""

# Step 4: Deploy Apache configuration with backup and rollback
echo "[4/5] Configuring Apache..."

# Backup existing config before overwriting
ssh $SSH_OPTS ${SERVER_USER}@${SERVER} "cp -f ${APACHE_CONF} ${APACHE_BACKUP} 2>/dev/null || true"

# Deploy new config
scp $SSH_OPTS "$SCRIPT_DIR/apache-soupfinance.conf" ${SERVER_USER}@${SERVER}:${APACHE_CONF}

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

# Step 5: Post-deploy verification
echo "[5/5] Verifying deployment..."
VERIFY_FAILED=0

# Check HTTPS (Cloudflare Full SSL connects on 443)
HTTPS_STATUS=$(ssh $SSH_OPTS ${SERVER_USER}@${SERVER} "curl -s -o /dev/null -w '%{http_code}' --max-time 10 -H 'Host: ${DOMAIN}' https://127.0.0.1/ --insecure 2>/dev/null || echo '000'")
if [ "$HTTPS_STATUS" = "200" ]; then
    echo "  HTTPS (port 443): OK (status $HTTPS_STATUS)"
else
    echo "  HTTPS (port 443): FAILED (status $HTTPS_STATUS)"
    VERIFY_FAILED=1
fi

# Check HTTP
HTTP_STATUS=$(ssh $SSH_OPTS ${SERVER_USER}@${SERVER} "curl -s -o /dev/null -w '%{http_code}' --max-time 10 -H 'Host: ${DOMAIN}' http://127.0.0.1/ 2>/dev/null || echo '000'")
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

if [ "$VERIFY_FAILED" -eq 1 ]; then
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║  WARNING: Deployment completed but verification failed!      ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
    echo "The site may not be fully accessible. Check:"
    echo "  1. Apache error log: /var/log/apache2/app.soupfinance.com-ssl-error.log"
    echo "  2. SSL certificates: /etc/letsencrypt/live/$DOMAIN/"
    echo "  3. Apache config: $APACHE_CONF"
    echo ""
    exit 1
else
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║         Production Deployment Complete!                      ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
    echo "Site live at: https://$DOMAIN"
    echo ""
    echo "Verified: HTTP and HTTPS both responding correctly."
    echo ""
fi
