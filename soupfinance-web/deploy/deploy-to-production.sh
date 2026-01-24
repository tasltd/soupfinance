#!/bin/bash
# Deploy SoupFinance to app.soupfinance.com on Production server (65.20.112.224)
# Architecture: Cloudflare CDN -> Apache (SSL) -> Static files
# Usage: ./deploy/deploy-to-production.sh

set -e

# Configuration
SERVER="65.20.112.224"
SERVER_USER="root"
DEPLOY_DIR="/var/www/soupfinance"
APACHE_CONF="/etc/apache2/sites-available/app-soupfinance-com.conf"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== SoupFinance Deployment to app.soupfinance.com (Production) ==="
echo "Server: $SERVER"
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

# Step 4: Verify Apache configuration
echo "[4/4] Verifying Apache configuration..."
ssh ${SERVER_USER}@${SERVER} "apache2ctl configtest && systemctl reload apache2"
echo "Apache reloaded!"
echo ""

echo "=== Deployment Complete ==="
echo ""
echo "Site is live at: https://app.soupfinance.com"
echo ""
echo "Note: DNS is managed via Cloudflare. Origin server is $SERVER"
echo "Apache serves static files directly from $DEPLOY_DIR"
echo "API calls to /rest/* are proxied to Varnish (port 6081) -> Tomcat"
