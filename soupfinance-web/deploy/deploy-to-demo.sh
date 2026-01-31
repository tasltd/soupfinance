#!/bin/bash
# Deploy SoupFinance to Demo/Production server (65.20.112.224)
#
# IMPORTANT: Site is ONLY accessible via domain name (app.soupfinance.com)
# Direct IP access is NOT supported.
#
# Architecture:
#   Cloudflare -> Apache (vhost) -> Static files + API proxy to tas.soupmarkets.com
#
# Apache vhost already configured at /etc/apache2/sites-available/app-soupfinance-com.conf
# with SSL (Let's Encrypt) and Api-Authorization header for tas.soupmarkets.com
#
# SSH Key Requirements:
#   Uses ~/.ssh/crypttransact_rsa key for authentication
#
# Usage: ./deploy/deploy-to-demo.sh

set -e

# Configuration
SERVER="65.20.112.224"
SERVER_USER="root"
SSH_KEY="$HOME/.ssh/crypttransact_rsa"
SSH_OPTS="-o StrictHostKeyChecking=no -i $SSH_KEY"
DEPLOY_DIR="/var/www/soupfinance"
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
echo "Backend: tas.soupmarkets.com (API proxy)"
echo "Deploy directory: $DEPLOY_DIR"
echo ""

# Step 1: Build the application
echo "[1/3] Building production bundle..."
cd "$PROJECT_DIR"
npm run build
echo "Build complete!"
echo ""

# Step 2: Create deployment directory on server
echo "[2/3] Creating deployment directory..."
ssh $SSH_OPTS ${SERVER_USER}@${SERVER} "mkdir -p $DEPLOY_DIR"
echo ""

# Step 3: Deploy built files to server
echo "[3/3] Deploying files to server..."
rsync -avz --delete -e "ssh $SSH_OPTS" "$PROJECT_DIR/dist/" ${SERVER_USER}@${SERVER}:${DEPLOY_DIR}/
echo "Files deployed!"
echo ""

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         Deployment Complete!                                 ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "Site available at: https://$DOMAIN"
echo ""
echo "  - Frontend: https://$DOMAIN"
echo "  - Backend:  tas.soupmarkets.com (proxied via /rest/*)"
echo ""
echo "To verify deployment:"
echo "  curl -s https://$DOMAIN | head -10"
echo ""
