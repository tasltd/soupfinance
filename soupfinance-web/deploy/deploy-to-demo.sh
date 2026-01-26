#!/bin/bash
# Deploy SoupFinance to Demo/Staging server (140.82.32.141)
#
# IMPORTANT: Site is ONLY accessible via domain name (app.soupfinance.com)
# Direct IP access is NOT supported.
#
# Architecture:
#   Cloudflare -> Apache (vhost) -> Static files + API proxy to tas.soupmarkets.com
#
# Usage: ./deploy/deploy-to-demo.sh

set -e

# Configuration
SERVER="140.82.32.141"
SERVER_USER="root"
DEPLOY_DIR="/var/www/soupfinance"
APACHE_CONF="/etc/apache2/sites-available/soupfinance-demo.conf"
DOMAIN="app.soupfinance.com"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         SoupFinance Deployment to Demo Server                ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "Server: $SERVER"
echo "Domain: $DOMAIN"
echo "Backend: tas.soupmarkets.com (API proxy)"
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
ssh ${SERVER_USER}@${SERVER} "mkdir -p $DEPLOY_DIR"
echo ""

# Step 3: Deploy built files to server
echo "[3/4] Deploying files to server..."
rsync -avz --delete "$PROJECT_DIR/dist/" ${SERVER_USER}@${SERVER}:${DEPLOY_DIR}/
echo "Files deployed!"
echo ""

# Step 4: Deploy Apache configuration
echo "[4/4] Configuring Apache..."
scp "$SCRIPT_DIR/apache-soupfinance.conf" ${SERVER_USER}@${SERVER}:${APACHE_CONF}
ssh ${SERVER_USER}@${SERVER} "a2enmod ssl proxy_ssl rewrite headers 2>/dev/null; a2ensite soupfinance-demo.conf 2>/dev/null || true; apache2ctl configtest && systemctl reload apache2"
echo "Apache configured!"
echo ""

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         Deployment Complete!                                 ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "Site available at: https://$DOMAIN"
echo ""
echo "IMPORTANT: Access via domain name only (NOT via IP)"
echo "  - Frontend: https://$DOMAIN"
echo "  - Backend:  tas.soupmarkets.com (proxied via /rest/*)"
echo ""
echo "To verify deployment:"
echo "  curl -I -H 'Host: $DOMAIN' http://$SERVER/"
echo ""
