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
echo "[1/4] Building production bundle..."
cd "$PROJECT_DIR"
npm run build
echo "Build complete!"
echo ""

# Step 2: Create deployment directory on server
echo "[2/4] Creating deployment directory..."
ssh $SSH_OPTS ${SERVER_USER}@${SERVER} "mkdir -p $DEPLOY_DIR"
echo ""

# Step 3: Deploy built files to server
echo "[3/4] Deploying files to server..."
rsync -avz --delete -e "ssh $SSH_OPTS" "$PROJECT_DIR/dist/" ${SERVER_USER}@${SERVER}:${DEPLOY_DIR}/
echo "Files deployed!"
echo ""

# Step 4: Deploy Apache configuration
echo "[4/4] Configuring Apache..."
scp $SSH_OPTS "$SCRIPT_DIR/apache-soupfinance.conf" ${SERVER_USER}@${SERVER}:${APACHE_CONF}
ssh $SSH_OPTS ${SERVER_USER}@${SERVER} "a2ensite app-soupfinance-com.conf 2>/dev/null || true && apache2ctl configtest && systemctl reload apache2"
echo "Apache configured!"
echo ""

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         Production Deployment Complete!                      ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "Site live at: https://$DOMAIN"
echo ""
echo "IMPORTANT: Access via domain name only (not via IP)"
echo "- DNS managed via Cloudflare"
echo "- Origin server: $SERVER"
echo "- Apache vhost: $DOMAIN -> $DEPLOY_DIR"
echo "- API proxy: /rest/* -> Tomcat backend (port 8080)"
echo ""
