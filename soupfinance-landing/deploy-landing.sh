#!/bin/bash
# Deploy SoupFinance Landing Page to production server with SSL and optimizations
# Server: 65.20.112.224 (www.soupfinance.com)
#
# This script:
# 1. Deploys landing page files
# 2. Enables Apache performance modules (brotli, expires, headers)
# 3. Deploys optimized Apache configuration
# 4. Generates SSL certificate with certbot
# 5. Starts Apache with all optimizations
#
# Usage: ./deploy-landing.sh [--skip-ssl]

set -e

# Configuration
SERVER="65.20.112.224"
SERVER_USER="root"
DEPLOY_DIR="/var/www/soupfinance-landing"
APACHE_CONF_NAME="www-soupfinance-com.conf"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKIP_SSL=false

# Parse arguments
if [[ "$1" == "--skip-ssl" ]]; then
    SKIP_SSL=true
fi

echo "=== SoupFinance Landing Page Deployment (Performance Optimized) ==="
echo "Server: $SERVER"
echo "Deploy directory: $DEPLOY_DIR"
echo "Skip SSL: $SKIP_SSL"
echo ""

# Step 1: Create deployment directory on server
echo "[1/7] Creating deployment directory..."
ssh ${SERVER_USER}@${SERVER} "mkdir -p $DEPLOY_DIR/screenshots"
echo ""

# Step 2: Deploy landing page files
echo "[2/7] Deploying landing page files..."
rsync -avz --delete \
    "$SCRIPT_DIR/index.html" \
    "$SCRIPT_DIR/privacy-policy.html" \
    "$SCRIPT_DIR/terms-of-service.html" \
    "$SCRIPT_DIR/cookie-policy.html" \
    "$SCRIPT_DIR/acceptable-use-policy.html" \
    "$SCRIPT_DIR/sitemap.xml" \
    "$SCRIPT_DIR/robots.txt" \
    "$SCRIPT_DIR/screenshots/" \
    ${SERVER_USER}@${SERVER}:${DEPLOY_DIR}/

# Copy screenshots separately to ensure they're in the right place
rsync -avz "$SCRIPT_DIR/screenshots/" ${SERVER_USER}@${SERVER}:${DEPLOY_DIR}/screenshots/
echo "Files deployed!"
echo ""

# Step 3: Enable Apache performance modules
echo "[3/7] Enabling Apache performance modules..."
ssh ${SERVER_USER}@${SERVER} "
    # Enable brotli compression (better than gzip)
    a2enmod brotli 2>/dev/null || echo 'mod_brotli not available, using deflate only'

    # Enable expires module for cache headers
    a2enmod expires 2>/dev/null || true

    # Enable headers module
    a2enmod headers 2>/dev/null || true

    # Enable rewrite for redirects
    a2enmod rewrite 2>/dev/null || true

    # Enable deflate for gzip fallback
    a2enmod deflate 2>/dev/null || true

    # Enable SSL
    a2enmod ssl 2>/dev/null || true

    echo 'Performance modules enabled'
"
echo ""

# Step 4: Deploy Apache configuration
echo "[4/7] Deploying optimized Apache configuration..."
scp "$SCRIPT_DIR/apache-www-soupfinance.conf" ${SERVER_USER}@${SERVER}:/etc/apache2/sites-available/${APACHE_CONF_NAME}

# Enable the site
ssh ${SERVER_USER}@${SERVER} "
    a2ensite ${APACHE_CONF_NAME} 2>/dev/null || true
    echo 'Apache configuration deployed and enabled.'
"
echo ""

# Step 5: Generate SSL certificate (if not skipped)
if [[ "$SKIP_SSL" == "false" ]]; then
    echo "[5/7] Generating SSL certificate..."
    ssh ${SERVER_USER}@${SERVER} "
        # Check if certificate already exists
        if [[ -f /etc/letsencrypt/live/soupfinance.com/fullchain.pem ]]; then
            echo 'SSL certificate already exists. Skipping generation.'
        else
            echo 'Stopping Apache for certificate generation...'
            systemctl stop apache2 || true

            echo 'Generating certificate with certbot...'
            certbot certonly --standalone -d soupfinance.com -d www.soupfinance.com --non-interactive --agree-tos --email admin@soupfinance.com

            echo 'SSL certificate generated!'
        fi
    "
    echo ""
else
    echo "[5/7] Skipping SSL certificate generation (--skip-ssl flag)"
    echo ""
fi

# Step 6: Test Apache configuration
echo "[6/7] Testing Apache configuration..."
ssh ${SERVER_USER}@${SERVER} "
    if apache2ctl configtest 2>&1; then
        echo 'Apache configuration is valid.'
    else
        echo 'Apache configuration has errors!'
        exit 1
    fi
"
echo ""

# Step 7: Start/restart Apache
echo "[7/7] Starting Apache..."
ssh ${SERVER_USER}@${SERVER} "
    systemctl restart apache2
    echo ''
    echo 'Apache status:'
    systemctl is-active apache2
"
echo ""

# Verification
echo "=== Verification ==="
ssh ${SERVER_USER}@${SERVER} "
    echo 'Enabled performance modules:'
    apache2ctl -M 2>/dev/null | grep -E 'brotli|deflate|expires|headers|rewrite|ssl' || echo '(check manually)'

    echo ''
    echo 'Landing page files:'
    ls -la $DEPLOY_DIR/ | head -10

    echo ''
    echo 'Apache vhost enabled:'
    ls -la /etc/apache2/sites-enabled/ | grep soupfinance || echo 'Not found'
"

echo ""
echo "=== Deployment Complete ==="
echo ""
echo "Performance optimizations applied:"
echo "  - Brotli compression (15-20% smaller than gzip)"
echo "  - mod_expires for explicit cache headers"
echo "  - 1-year immutable caching for static assets"
echo "  - AllowOverride None (no .htaccess lookups)"
echo "  - EnableSendfile for kernel-level file transfer"
echo "  - Security headers (X-Content-Type-Options, etc.)"
echo ""
echo "Landing page live at: https://www.soupfinance.com"
echo ""
echo "To verify compression, run:"
echo "  curl -I -H 'Accept-Encoding: br,gzip' https://www.soupfinance.com"
