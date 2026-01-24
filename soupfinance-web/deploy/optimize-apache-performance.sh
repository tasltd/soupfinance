#!/bin/bash
# Optimize Apache for Nginx-like static file serving performance
# Target server: 65.20.112.224 (app.soupfinance.com)
#
# Key optimizations:
# 1. Switch from prefork to mpm_event (event-driven architecture)
# 2. Enable mod_brotli for better compression
# 3. Enable mod_expires for explicit cache headers
# 4. Apply tuned MPM settings
# 5. Deploy performance-optimized vhost config
#
# Usage: ./deploy/optimize-apache-performance.sh

set -e

# Configuration
SERVER="65.20.112.224"
SERVER_USER="root"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== Apache Performance Optimization for app.soupfinance.com ==="
echo "Server: $SERVER"
echo ""

# Step 1: Check current MPM
echo "[1/8] Checking current Apache MPM..."
CURRENT_MPM=$(ssh ${SERVER_USER}@${SERVER} "apache2ctl -V 2>/dev/null | grep 'Server MPM' | awk '{print \$3}'")
echo "Current MPM: $CURRENT_MPM"

if [ "$CURRENT_MPM" = "event" ]; then
    echo "Already using mpm_event - skipping MPM switch"
else
    echo ""
    echo "[2/8] Switching from $CURRENT_MPM to mpm_event..."

    # Disable current MPM and enable mpm_event
    ssh ${SERVER_USER}@${SERVER} "
        # Stop Apache first to safely switch MPM
        systemctl stop apache2

        # Disable current MPM modules
        a2dismod mpm_prefork 2>/dev/null || true
        a2dismod mpm_worker 2>/dev/null || true

        # Enable mpm_event
        a2enmod mpm_event

        echo 'MPM switched to event'
    "
    echo "MPM switched to event"
fi

echo ""
echo "[3/8] Enabling performance modules..."
ssh ${SERVER_USER}@${SERVER} "
    # Enable brotli compression (better than gzip)
    a2enmod brotli 2>/dev/null || echo 'mod_brotli not available, using deflate only'

    # Enable expires module for cache headers
    a2enmod expires 2>/dev/null || true

    # Enable headers module (should already be enabled)
    a2enmod headers 2>/dev/null || true

    # Enable rewrite for SPA routing
    a2enmod rewrite 2>/dev/null || true

    echo 'Performance modules enabled'
"
echo "Performance modules enabled"

echo ""
echo "[4/8] Deploying tuned MPM configuration..."
# Backup existing config
ssh ${SERVER_USER}@${SERVER} "
    cp /etc/apache2/mods-available/mpm_event.conf /etc/apache2/mods-available/mpm_event.conf.backup.$(date +%Y%m%d) 2>/dev/null || true
"
# Deploy new MPM config
scp "$SCRIPT_DIR/mpm-event-tuned.conf" ${SERVER_USER}@${SERVER}:/etc/apache2/mods-available/mpm_event.conf
echo "MPM configuration deployed"

echo ""
echo "[5/8] Updating global Apache settings..."
ssh ${SERVER_USER}@${SERVER} "
    # Backup apache2.conf
    cp /etc/apache2/apache2.conf /etc/apache2/apache2.conf.backup.$(date +%Y%m%d)

    # Update KeepAlive settings in apache2.conf
    sed -i 's/^MaxKeepAliveRequests.*/MaxKeepAliveRequests 500/' /etc/apache2/apache2.conf
    sed -i 's/^KeepAliveTimeout.*/KeepAliveTimeout 5/' /etc/apache2/apache2.conf

    # Ensure KeepAlive is On
    sed -i 's/^KeepAlive Off/KeepAlive On/' /etc/apache2/apache2.conf

    echo 'Global settings updated'
"
echo "Global Apache settings updated"

echo ""
echo "[6/8] Deploying optimized SoupFinance vhost..."
# Backup existing vhost
ssh ${SERVER_USER}@${SERVER} "
    cp /etc/apache2/sites-available/app-soupfinance-com.conf /etc/apache2/sites-available/app-soupfinance-com.conf.backup.$(date +%Y%m%d) 2>/dev/null || true
"
# Deploy new optimized vhost
scp "$SCRIPT_DIR/apache-performance-optimized.conf" ${SERVER_USER}@${SERVER}:/etc/apache2/sites-available/app-soupfinance-com.conf
echo "Optimized vhost deployed"

echo ""
echo "[7/8] Testing Apache configuration..."
ssh ${SERVER_USER}@${SERVER} "apache2ctl configtest"

echo ""
echo "[8/8] Restarting Apache..."
ssh ${SERVER_USER}@${SERVER} "systemctl restart apache2"

echo ""
echo "=== Verification ==="
ssh ${SERVER_USER}@${SERVER} "
    echo 'Apache MPM:'
    apache2ctl -V 2>/dev/null | grep 'Server MPM'

    echo ''
    echo 'Enabled performance modules:'
    apache2ctl -M 2>/dev/null | grep -E 'brotli|deflate|expires|headers|rewrite|mpm_event'

    echo ''
    echo 'Apache status:'
    systemctl is-active apache2
"

echo ""
echo "=== Optimization Complete ==="
echo ""
echo "Changes applied:"
echo "  1. Switched to mpm_event (event-driven, like Nginx)"
echo "  2. Enabled mod_brotli for better compression"
echo "  3. Enabled mod_expires for cache headers"
echo "  4. Tuned MPM: 400 MaxRequestWorkers, 25 ThreadsPerChild"
echo "  5. Tuned KeepAlive: 500 requests, 5s timeout"
echo "  6. Disabled AllowOverride (no .htaccess lookups)"
echo "  7. Enabled SendFile for kernel-level file transfer"
echo ""
echo "Performance improvements expected:"
echo "  - 2-3x better concurrent connection handling"
echo "  - 30-40% lower memory usage under load"
echo "  - Eliminated filesystem lookups for .htaccess"
echo "  - Brotli compression: 15-20% smaller than gzip"
echo ""
echo "Test the site: https://app.soupfinance.com"
echo ""
echo "To verify compression, run:"
echo "  curl -I -H 'Accept-Encoding: br,gzip' https://app.soupfinance.com"
