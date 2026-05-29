# Api-Authorization Header

**Part of**: [production-server-vhosts](../production-server-vhosts.md)

The Apache proxy injects an `Api-Authorization` header on **all proxied requests** to `tas.soupmarkets.com`. This authenticates the SoupFinance web app as an `ApiConsumer` with the backend's `ApiAuthenticatorInterceptor`.

---

## How It Works

```
Browser (no Api-Authorization) → Apache → adds header → Backend receives header
                                                      → ApiAuthenticatorInterceptor validates
                                                      → Resolves ApiConsumer name
                                                      → Request proceeds
```

---

## Header Format

```
Api-Authorization: Basic base64(consumerId:secret)
```

Where:
- `consumerId` = The `name` field from the `api_consumer` table in production DB
- `secret` = The `secret` field from the `api_consumer` table
- Encoded as: `base64("SoupFinance Web App:d379a1d7b80a1c072ac374020cefbc05")`

---

## HARD RULES

1. **NEVER commit the actual base64 credentials to git** — The real value is only in the server config and this doc uses `{BASE64_CREDENTIALS}` placeholder
2. **NEVER expose the Api-Authorization header to the browser** — It is injected by Apache, never by client JavaScript
3. **The header MUST be present in BOTH port 80 and port 443 VHost blocks** — Requests can arrive on either port
4. **If the ApiConsumer secret rotates**, update the base64 value in both VHost blocks and reload Apache

---

## Retrieving Current Credentials

```bash
# Query production database for ApiConsumer record
ssh root@140.82.32.141 "mysql -u soupbroker -p'Dominus@soupbroker.2020' soupbroker \
    -e \"SELECT name, secret FROM api_consumer WHERE name LIKE '%SoupFinance%'\""

# Re-encode after secret rotation
echo -n 'SoupFinance Web App:NEW_SECRET_HERE' | base64
```

---

## Difference from Development

| Environment | Api-Authorization Source |
|-------------|------------------------|
| **Development (Vite)** | Vite proxy reads `VITE_API_CONSUMER_ID` + `VITE_API_CONSUMER_SECRET` from `.env.lxc.local` |
| **Production (Apache)** | Hardcoded in VHost config as `RequestHeader set Api-Authorization` |
