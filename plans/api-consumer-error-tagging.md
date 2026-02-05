# API Consumer Error Tagging Plan

## Problem

When searching Sentry logs for errors related to a specific API consumer (e.g., SoupFinance), there's no way to filter because:
1. All API errors go to the same `soupmarkets` Sentry project
2. Errors are not tagged with which ApiConsumer triggered them
3. Cannot distinguish between errors from soupfinance-web, soupmarkets-web, mobile apps, or third-party integrations

## Current Architecture

The backend already has an `ApiConsumer` authentication system:
- `Api-Authorization: Basic base64(consumerId:consumerSecret)` header
- `ApiAuthenticatorInterceptor` validates the header and loads the `ApiConsumer`
- Each frontend has its own `ApiConsumer` record in the database

**The problem**: The ApiConsumer info is authenticated but NOT stored in session/MDC for error tagging.

## Solution

1. **Proxy injects `Api-Authorization`** header (keeps secret out of browser)
2. **Backend stores ApiConsumer in session** after authentication
3. **Sentry tags errors** with ApiConsumer id/name from session

---

## Implementation

### 1. Proxy Configuration (Vite Dev Server)

**soupfinance-web/vite.config.ts:**
```typescript
export default defineConfig({
  server: {
    proxy: {
      '/rest': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:9090',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            // Inject Api-Authorization header for ApiConsumer authentication
            const consumerId = process.env.VITE_API_CONSUMER_ID || 'soupfinance-web';
            const consumerSecret = process.env.VITE_API_CONSUMER_SECRET || '';
            if (consumerId && consumerSecret) {
              const credentials = Buffer.from(`${consumerId}:${consumerSecret}`).toString('base64');
              proxyReq.setHeader('Api-Authorization', `Basic ${credentials}`);
            }
          });
        },
      },
      '/account': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:9090',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            const consumerId = process.env.VITE_API_CONSUMER_ID || 'soupfinance-web';
            const consumerSecret = process.env.VITE_API_CONSUMER_SECRET || '';
            if (consumerId && consumerSecret) {
              const credentials = Buffer.from(`${consumerId}:${consumerSecret}`).toString('base64');
              proxyReq.setHeader('Api-Authorization', `Basic ${credentials}`);
            }
          });
        },
      },
    },
  },
});
```

### 2. Apache Production Proxy

**Apache VHost for app.soupfinance.com:**
```apache
<VirtualHost *:443>
    ServerName app.soupfinance.com

    # Inject Api-Authorization header for all proxied requests
    RequestHeader set Api-Authorization "Basic c291cGZpbmFuY2Utd2ViOnNlY3JldC1oZXJl"

    ProxyPass /rest https://tas.soupmarkets.com/rest
    ProxyPassReverse /rest https://tas.soupmarkets.com/rest

    ProxyPass /account https://tas.soupmarkets.com/account
    ProxyPassReverse /account https://tas.soupmarkets.com/account
</VirtualHost>
```

### 3. Backend: Store ApiConsumer in Session (ApiAuthenticatorInterceptor)

The `ApiAuthenticatorInterceptor` already authenticates the ApiConsumer. Update it to store the consumer info in session and MDC:

**grails-app/interceptors/soupbroker/ApiAuthenticatorInterceptor.groovy:**
```groovy
boolean before() {
    String authHeader = request.getHeader('Api-Authorization')

    if (authHeader?.startsWith('Basic ')) {
        String credentials = new String(authHeader.substring(6).decodeBase64())
        String[] parts = credentials.split(':')

        if (parts.length == 2) {
            String consumerId = parts[0]
            String consumerSecret = parts[1]

            ApiConsumer apiConsumer = ApiConsumer.findByConsumerIdAndSecret(consumerId, consumerSecret)

            if (apiConsumer) {
                // Store in request attributes for this request
                request.setAttribute('apiConsumer', apiConsumer)
                request.setAttribute('apiConsumerId', apiConsumer.consumerId)
                request.setAttribute('apiConsumerName', apiConsumer.name ?: apiConsumer.consumerId)

                // Store in session for persistence across requests
                session.setAttribute('apiConsumer', apiConsumer)
                session.setAttribute('apiConsumerId', apiConsumer.consumerId)
                session.setAttribute('apiConsumerName', apiConsumer.name ?: apiConsumer.consumerId)

                // Store in MDC for logging and Sentry
                org.slf4j.MDC.put('apiConsumerId', apiConsumer.consumerId)
                org.slf4j.MDC.put('apiConsumerName', apiConsumer.name ?: apiConsumer.consumerId)

                return true
            }
        }
    }

    // ... existing error handling ...
}

void afterView() {
    // Clean up MDC after request completes
    org.slf4j.MDC.remove('apiConsumerId')
    org.slf4j.MDC.remove('apiConsumerName')
}
```

### 4. Backend: Tag Sentry Errors with ApiConsumer

Update Sentry configuration to include ApiConsumer tags:

**grails-app/conf/application.groovy or Sentry init:**
```groovy
import io.sentry.Sentry
import io.sentry.SentryOptions

Sentry.init { SentryOptions options ->
    options.dsn = "your-dsn"

    options.beforeSend = { event, hint ->
        // Get ApiConsumer from MDC (set by ApiAuthenticatorInterceptor)
        String consumerId = org.slf4j.MDC.get('apiConsumerId') ?: 'unknown'
        String consumerName = org.slf4j.MDC.get('apiConsumerName') ?: 'unknown'

        // Add tags for filtering in Sentry
        event.setTag('api.consumer.id', consumerId)
        event.setTag('api.consumer.name', consumerName)

        // Also add tenant info if available
        String tenantId = org.slf4j.MDC.get('tenantId')
        if (tenantId) {
            event.setTag('tenant.id', tenantId)
        }

        event
    }
}
```

### 5. Logging Configuration

Update logback to include ApiConsumer in log format:

**grails-app/conf/logback.groovy:**
```groovy
appender('STDOUT', ConsoleAppender) {
    encoder(PatternLayoutEncoder) {
        pattern = "%d{HH:mm:ss.SSS} [%thread] [%X{apiConsumerId}] [%X{tenantId}] %-5level %logger{36} - %msg%n"
    }
}
```

---

## ApiConsumer Database Records

Ensure each frontend app has an `ApiConsumer` record:

| consumerId | name | secret | description |
|------------|------|--------|-------------|
| `soupfinance-web` | SoupFinance Web | `{secret}` | SoupFinance React frontend |
| `soupmarkets-web` | Soupmarkets Web | `{secret}` | Soupmarkets GSP frontend |
| `soupmarkets-mobile` | Soupmarkets Mobile | `{secret}` | Mobile app |
| `c5-ashfield` | C5 Ashfield | `{secret}` | C5 Ashfield integration |

---

## Sentry Search Queries

After implementation, filter errors by consumer:

```
# All SoupFinance errors
api.consumer.id:soupfinance-web

# SoupFinance errors in last 24h
api.consumer.id:soupfinance-web age:-24h

# All errors from unknown consumers (missing/invalid header)
api.consumer.id:unknown

# Errors by consumer name (if different from id)
api.consumer.name:"SoupFinance Web"

# Combine with tenant
api.consumer.id:soupfinance-web tenant.id:tas
```

---

## Testing

1. Verify Vite dev server injects `Api-Authorization` header
2. Check backend logs show `apiConsumerId` in log lines
3. Trigger an intentional error
4. Verify Sentry shows `api.consumer.id:soupfinance-web` tag
5. Search Sentry with filter and confirm results

---

## Files to Modify

### Backend (soupmarkets-web)
| File | Change |
|------|--------|
| `ApiAuthenticatorInterceptor.groovy` | Store ApiConsumer in session + MDC |
| `application.groovy` or Sentry config | Add beforeSend hook for tagging |
| `logback.groovy` | Add MDC pattern for consumer |

### Frontend (soupfinance-web)
| File | Change |
|------|--------|
| `vite.config.ts` | Inject Api-Authorization in proxy |
| `.env.lxc` | Add VITE_API_CONSUMER_ID and VITE_API_CONSUMER_SECRET |

### Production
| File | Change |
|------|--------|
| Apache VHost | Add RequestHeader for Api-Authorization |

---

## Environment Variables

**soupfinance-web/.env.lxc:**
```bash
VITE_API_CONSUMER_ID=soupfinance-web
VITE_API_CONSUMER_SECRET=your-secret-here
```

**soupfinance-web/.env.production:**
```bash
# Not needed - Apache injects the header in production
```

---

## Security Notes

1. **Never expose API consumer secret in browser** - The proxy injects it server-side
2. **Use HTTPS in production** - Header is sent in clear text over HTTP
3. **Rotate secrets periodically** - Update ApiConsumer record and proxy config together

---

## Priority

**HIGH** - Essential for debugging multi-tenant, multi-consumer API issues.

## Estimated Effort

- Backend (ApiAuthenticatorInterceptor + Sentry): 2 hours
- Frontend (Vite proxy config): 30 minutes
- Production (Apache config): 15 minutes
- Testing: 1 hour
