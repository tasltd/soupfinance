# API Connectivity Test Report
**Date**: 2026-01-21 14:45 UTC
**Test Scope**: Production (65.20.112.224) and Demo (140.82.32.141) servers

## Test Results Summary

### Test 1: Production Server (65.20.112.224) → Demo Server (140.82.32.141:8080/rest/)
**Status**: ⏱️ TIMEOUT (connection not established within 10 seconds)
- Command: `ssh root@65.20.112.224 "curl -s http://140.82.32.141:8080/rest/"`
- Result: Exit code 124 (timeout)
- Interpretation: Either the port 8080 is not accessible from production to demo, or firewall is blocking

### Test 2: HTTPS to app.soupfinance.com (Root)
**Status**: ✅ SUCCESS (HTTP 200)
- URL: https://app.soupfinance.com/
- Response: HTTP/1.1 200 OK
- Server: Apache/2.4.52 (Ubuntu)
- Content-Type: text/html
- Size: 462 bytes
- Notes: Static SPA files served directly by Apache

### Test 3: HTTPS to tas.soupmarkets.com (Root)
**Status**: ✅ REDIRECT (HTTP 302)
- URL: https://tas.soupmarkets.com/
- Response: HTTP/2 302 Found
- Location: https://tas.soupmarkets.com/dashboard/stats
- Server: cloudflare (via Varnish 6.6)
- Notes: Successfully redirecting to dashboard

### Test 4: HTTPS to app.soupfinance.com/rest/ (API Endpoint)
**Status**: ⏱️ TIMEOUT (hanging during request)
- URL: https://app.soupfinance.com/rest/
- Response: No response after 15 seconds
- TLS Handshake: ✅ Successful (TLSv1.3)
- Certificate: Valid for app.soupfinance.com
- Interpretation: 
  - HTTPS connection established successfully
  - Request reaches the web server but not responding (likely stuck at upstream proxy/backend)
  - Suggests issue with proxying to Grails backend (port 9090)

### Test 5: Local Grails Backend (localhost:9090)
**Status**: ✅ RUNNING (HTTP 404)
- URL: http://localhost:9090/rest/
- Response: HTTP/1.1 404 Not Found
- Notes: Grails backend is running and responding, returns 404 for missing endpoint (expected)

## Connectivity Analysis

### ✅ What's Working
1. Static SPA files served over HTTPS via app.soupfinance.com
2. TLS handshakes work for both domains
3. Redirects working on tas.soupmarkets.com
4. Local Grails backend running on port 9090
5. SSH connectivity from local machine to production server (65.20.112.224)

### ❌ What's NOT Working
1. REST API proxy from app.soupfinance.com/rest/ to backend (hangs indefinitely)
2. Network connectivity from production server (65.20.112.224) to demo server (140.82.32.141:8080)

## Diagnosis

### Issue 1: REST API Timeout (app.soupfinance.com/rest/)
**Root Cause**: Apache proxy/Varnish is likely unable to reach the Grails backend
- TLS handshake succeeds (certificate valid)
- Request hangs after TLS negotiation
- Suggests: Varnish cache (port 6081) or Tomcat (port 8080) unreachable from web server

**Impact**: 
- REST API calls from web app → backend fail
- Blocks: Authentication, data loading, form submissions
- Affects: app.soupfinance.com and soupfinance-web dev environment

### Issue 2: Production-to-Demo Network Connectivity
**Root Cause**: Network isolation or firewall rules between servers
- Production (65.20.112.224) cannot reach Demo (140.82.32.141) on port 8080
- Could be: Firewall rules, security groups, network segmentation

**Impact**:
- Cannot test cross-server communication
- May prevent backup/replication scenarios

## Recommended Actions

1. **Immediate**: Check if Tomcat is running on demo server
   ```bash
   ssh root@140.82.32.141 "systemctl status soupbroker.service"
   ssh root@140.82.32.141 "lsof -i :8080"
   ```

2. **Debug REST API**: Check Apache/Varnish logs on production
   ```bash
   ssh root@65.20.112.224 "tail -f /var/log/apache2/error.log"
   ssh root@65.20.112.224 "curl -v http://localhost:6081/rest/" (test Varnish)
   ```

3. **Verify Network**: Check firewall rules between servers
   ```bash
   ssh root@65.20.112.224 "iptables -L | grep 140.82"
   ssh root@140.82.32.141 "iptables -L | grep 65.20"
   ```

4. **Test Backend Directly**: From production, test Grails app directly
   ```bash
   ssh root@65.20.112.224 "curl -v http://localhost:9090/rest/"
   ```
