#!/bin/bash
# Deploy SoupFinance to Demo server (140.82.32.141) for testing
# Note: Production deployment is at app.soupfinance.com (65.20.112.224)
# Usage: ./deploy/deploy-to-demo.sh

set -e

# Configuration
SERVER="140.82.32.141"
SERVER_USER="root"
DEPLOY_DIR="/var/www/soupfinance"
APACHE_CONF="/etc/apache2/sites-available/soupfinance-demo.conf"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== SoupFinance Deployment to Demo Server ==="
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

# Step 4: Deploy Apache configuration
echo "[4/4] Configuring Apache..."
scp "$SCRIPT_DIR/apache-soupfinance.conf" ${SERVER_USER}@${SERVER}:${APACHE_CONF}
ssh ${SERVER_USER}@${SERVER} "a2ensite soupfinance-demo.conf && apache2ctl configtest && systemctl reload apache2"
echo "Apache configured!"
echo ""

echo "=== Deployment Complete ==="
echo ""
echo "Demo site available at: http://$SERVER/soupfinance"
echo ""
echo "Note: For production deployment, use ./deploy/deploy-to-production.sh"
