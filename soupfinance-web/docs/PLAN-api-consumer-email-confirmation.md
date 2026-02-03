# Implementation Plan: API Consumer-based Email Confirmation

> **Note**: This is a frontend summary. The full backend implementation plan is in:
> `soupmarkets-web/docs/PLAN-api-consumer-email-confirmation.md`

## Problem Statement

The current email confirmation flow for SoupFinance registration has a critical flaw:

1. **Configuration-based URL doesn't work on tas.soupmarkets.com**
   - Uses `grailsApplication.config.getProperty('soupfinance.url')` which doesn't exist on production
   - Falls back to hardcoded `https://app.soupfinance.com` which is inflexible

2. **Registration endpoints bypass API consumer authentication**
   - Endpoints are `@Secured("permitAll")` and `@WithoutTenant`
   - Backend has no way to identify which frontend app made the request

3. **No SoupFinance API Consumer in production database**
   - The `soupfinance-web` API consumer may not exist on `tas.soupmarkets.com`

## Solution: API Consumer with `applicationUrl` Field

Use the API Consumer ID from the request to determine the frontend URL for email confirmation links.

---

## Implementation Steps

### Step 1: Add `applicationUrl` Field to ApiConsumer Domain

**File**: `soupmarkets-web/grails-app/domain/soupbroker/api/ApiConsumer.groovy`

```groovy
// Add field
String applicationUrl  // Frontend app URL (e.g., "https://app.soupfinance.com")

// Add constraint
applicationUrl nullable: true, url: true
```

**Database Migration**:
```sql
ALTER TABLE api_consumer ADD COLUMN application_url VARCHAR(500) NULL;
```

---

### Step 2: Update AccountController to Capture API Consumer

**File**: `soupmarkets-web/grails-app/controllers/soupbroker/AccountController.groovy`

```groovy
@Secured("permitAll")
@WithoutTenant
def register() {
    def jsonData = request.JSON

    // Extract API consumer ID from header (injected by proxy)
    String apiConsumerId = extractApiConsumerId()

    // Fallback: capture Origin/Referer header
    String originUrl = request.getHeader('Origin') ?: request.getHeader('Referer')

    AccountRegistrationCommand cmd = new AccountRegistrationCommand(
        companyName: jsonData.companyName,
        businessType: jsonData.businessType,
        adminFirstName: jsonData.adminFirstName,
        adminLastName: jsonData.adminLastName,
        email: jsonData.email,
        currency: jsonData.currency
    )

    // Pass API consumer info to service
    def result = accountRegistrationService.register(cmd, apiConsumerId, originUrl)

    if (result.success) {
        response.status = 201
    } else {
        response.status = 400
    }

    render result as JSON
}

/**
 * Extract API Consumer ID from Api-Authorization header.
 * Header format: "Basic base64(consumerId:secret)"
 */
private String extractApiConsumerId() {
    def auth = request.getHeader("Api-Authorization") ?: request.getHeader("Authorization")
    if (auth?.startsWith("Basic ")) {
        try {
            String decoded = new String(auth.replace("Basic ", "").decodeBase64())
            return decoded.split(":")[0]
        } catch (Exception e) {
            log.warn("Failed to decode Api-Authorization header: ${e.message}")
        }
    }
    return null
}
```

Also update `confirmEmail()` and `resendConfirmation()` similarly to pass API consumer context.

---

### Step 3: Update AccountRegistrationService

**File**: `soupmarkets-web/grails-app/services/soupbroker/AccountRegistrationService.groovy`

```groovy
/**
 * Registers a new account (tenant) with an admin user.
 *
 * @param cmd Registration command
 * @param apiConsumerId API Consumer ID (from request header)
 * @param originUrl Origin/Referer URL (fallback)
 */
@WithoutTenant
def register(AccountRegistrationCommand cmd, String apiConsumerId = null, String originUrl = null) {
    // ... existing validation code ...

    try {
        // ... existing account/user creation code ...

        // Generate confirmation token
        String confirmationToken = generateConfirmationToken(agent.id)

        // Send confirmation email with API consumer context
        sendConfirmationEmail(agent, confirmationToken, apiConsumerId, originUrl)

        // ... rest of method ...
    }
}

/**
 * Sends confirmation email to the new user.
 * Determines frontend URL from API Consumer or request origin.
 */
private void sendConfirmationEmail(Agent agent, String token, String apiConsumerId, String originUrl) {
    // Determine frontend URL
    String frontendUrl = resolveFrontendUrl(apiConsumerId, originUrl)
    String confirmUrl = "${frontendUrl}/confirm-email?token=${token}"

    // Backend URL fallback
    String backendConfirmUrl = "${grailsApplication.config.getProperty('grails.serverURL', 'http://localhost:8080')}/account/confirm?token=${token}"

    try {
        emailSendingService?.sendEmail(
            agent.userAccess.email,
            "Confirm Your SoupFinance Account",
            [
                model: [
                    agent: agent,
                    confirmUrl: confirmUrl,
                    backendConfirmUrl: backendConfirmUrl
                ],
                view: "/accountRegistration/confirmationEmail",
                header: "",
                footer: "",
                marginTop: 10,
                marginBottom: 10
            ]
        )
    } catch (Exception e) {
        log.error("Error sending confirmation email: ${e.message}", e)
    }
}

/**
 * Resolves the frontend URL from API Consumer or request origin.
 * Priority: API Consumer applicationUrl > Origin header > Config > Default
 */
private String resolveFrontendUrl(String apiConsumerId, String originUrl) {
    // 1. Try API Consumer applicationUrl
    if (apiConsumerId) {
        try {
            def apiConsumer = Tenants.withoutId {
                ApiConsumer.findById(apiConsumerId)
            }
            if (apiConsumer?.applicationUrl) {
                log.info("Using API Consumer applicationUrl: ${apiConsumer.applicationUrl}")
                return apiConsumer.applicationUrl
            }
            // Fallback to callbackScopeUrl if applicationUrl not set
            if (apiConsumer?.callbackScopeUrl) {
                log.info("Using API Consumer callbackScopeUrl: ${apiConsumer.callbackScopeUrl}")
                return apiConsumer.callbackScopeUrl
            }
        } catch (Exception e) {
            log.warn("Failed to load API Consumer ${apiConsumerId}: ${e.message}")
        }
    }

    // 2. Try Origin/Referer header
    if (originUrl) {
        try {
            def url = new URL(originUrl)
            String resolved = "${url.protocol}://${url.host}"
            if (url.port != -1 && url.port != 80 && url.port != 443) {
                resolved += ":${url.port}"
            }
            log.info("Using request origin URL: ${resolved}")
            return resolved
        } catch (Exception e) {
            log.warn("Invalid origin URL: ${originUrl}")
        }
    }

    // 3. Config fallback
    String configUrl = grailsApplication.config.getProperty('soupfinance.url')
    if (configUrl) {
        log.info("Using config soupfinance.url: ${configUrl}")
        return configUrl
    }

    // 4. Default fallback
    log.warn("No frontend URL found, using default https://app.soupfinance.com")
    return 'https://app.soupfinance.com'
}
```

---

### Step 4: Configure Production Proxy

The production proxy (Apache/Nginx) needs to inject `Api-Authorization` header for `/account/*` endpoints.

**Apache Configuration** (`/etc/apache2/sites-available/app.soupfinance.com.conf`):

```apache
<VirtualHost *:443>
    ServerName app.soupfinance.com

    # ... SSL config ...

    # Proxy API requests to Grails backend
    ProxyPreserveHost On

    # API Consumer credentials for SoupFinance
    # Header: Basic base64(soupfinance-web:ce6a03f6165584a7c28eddb78b54a3ba)
    RequestHeader set Api-Authorization "Basic c291cGZpbmFuY2Utd2ViOmNlNmEwM2Y2MTY1NTg0YTdjMjhlZGRiNzhiNTRhM2Jh"

    # Proxy /rest/* to backend
    ProxyPass /rest http://localhost:9090/rest
    ProxyPassReverse /rest http://localhost:9090/rest

    # Proxy /account/* for registration endpoints
    ProxyPass /account http://localhost:9090/account
    ProxyPassReverse /account http://localhost:9090/account

    # ... static file serving for React app ...
</VirtualHost>
```

**Nginx Configuration** (`/etc/nginx/sites-available/app.soupfinance.com`):

```nginx
server {
    listen 443 ssl;
    server_name app.soupfinance.com;

    # ... SSL config ...

    # API Consumer credentials for SoupFinance
    # Header: Basic base64(soupfinance-web:ce6a03f6165584a7c28eddb78b54a3ba)
    set $api_auth "Basic c291cGZpbmFuY2Utd2ViOmNlNmEwM2Y2MTY1NTg0YTdjMjhlZGRiNzhiNTRhM2Jh";

    # Proxy /rest/* to backend
    location /rest {
        proxy_pass http://localhost:9090;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Api-Authorization $api_auth;
    }

    # Proxy /account/* for registration endpoints
    location /account {
        proxy_pass http://localhost:9090;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Api-Authorization $api_auth;
    }

    # ... static file serving for React app ...
}
```

---

### Step 5: Create SoupFinance API Consumer on tas.soupmarkets.com

**SQL Script** (run on tas.soupmarkets.com database):

```sql
-- Check if API Consumer already exists
SELECT id, name, secret, application_url, disabled
FROM api_consumer
WHERE id = 'soupfinance-web';

-- Create SoupFinance API Consumer if not exists
-- Note: Adjust tenant_id to match the appropriate tenant on tas.soupmarkets.com
INSERT INTO api_consumer (
    id,
    version,
    archived,
    date_created,
    last_updated,
    name,
    secret,
    application_url,
    callback_scope_url,
    disabled,
    phone_number_required,
    pin_reset_required,
    pin_code_required,
    disable_client_registration,
    disable_account_services_creation,
    disabled_order_requests,
    allow_no_security_orders,
    enable_wallet_payments,
    enable_checkout_payments,
    disable_client_list_searching,
    disabled_sms_sending,
    tenant_id,
    request_channel_id,
    settlement_account_id
) VALUES (
    'soupfinance-web',                              -- id
    0,                                               -- version
    0,                                               -- archived
    NOW(),                                           -- date_created
    NOW(),                                           -- last_updated
    'SoupFinance Web Application',                   -- name
    'ce6a03f6165584a7c28eddb78b54a3ba',             -- secret (MD5 of 'soupfinance-2026-api-key')
    'https://app.soupfinance.com',                   -- application_url
    'https://app.soupfinance.com',                   -- callback_scope_url
    0,                                               -- disabled
    0,                                               -- phone_number_required
    0,                                               -- pin_reset_required
    0,                                               -- pin_code_required (not needed for web)
    0,                                               -- disable_client_registration
    0,                                               -- disable_account_services_creation
    0,                                               -- disabled_order_requests
    0,                                               -- allow_no_security_orders
    0,                                               -- enable_wallet_payments
    0,                                               -- enable_checkout_payments
    1,                                               -- disable_client_list_searching
    1,                                               -- disabled_sms_sending
    'YOUR_TENANT_ID',                                -- tenant_id (replace with actual)
    'YOUR_REQUEST_CHANNEL_ID',                       -- request_channel_id (replace or NULL)
    'YOUR_SETTLEMENT_ACCOUNT_ID'                     -- settlement_account_id (replace or NULL)
);

-- If updating existing:
UPDATE api_consumer
SET application_url = 'https://app.soupfinance.com',
    callback_scope_url = 'https://app.soupfinance.com'
WHERE id = 'soupfinance-web';
```

---

### Step 6: Update Frontend Registration API to use /account/* proxy

**File**: `soupfinance-web/src/api/endpoints/registration.ts`

Update the `accountApiClient` base URL to go through the proxy:

```typescript
// Use proxy path (proxy injects Api-Authorization)
const accountApiClient = axios.create({
  baseURL: '/account',  // Goes through proxy, not direct to backend
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});
```

---

### Step 7: Update Vite Dev Proxy

**File**: `soupfinance-web/vite.config.ts`

Add `/account` to proxy config (already done, but verify):

```typescript
proxy: {
  '/rest': proxyConfig,
  '/account': proxyConfig,  // Registration endpoints
},
```

---

## Testing Checklist

- [ ] API Consumer `soupfinance-web` exists in tas.soupmarkets.com database
- [ ] API Consumer has `application_url = 'https://app.soupfinance.com'`
- [ ] Production proxy injects `Api-Authorization` header for `/account/*`
- [ ] Registration creates account and sends email
- [ ] Email confirmation link points to `https://app.soupfinance.com/confirm-email?token=xxx`
- [ ] Clicking link opens SoupFinance frontend
- [ ] Password setting works and enables account

---

## Rollback Plan

If issues occur:

1. Revert `AccountRegistrationService` to use config-based URL
2. Add `soupfinance.url=https://app.soupfinance.com` to backend config
3. Remove API Consumer requirement from registration flow

---

## Security Considerations

1. **API Consumer secret in proxy config**: Keep proxy config files secure (600 permissions)
2. **Origin header validation**: Consider validating Origin header against allowed domains
3. **Rate limiting**: Ensure registration endpoints have rate limiting to prevent abuse
