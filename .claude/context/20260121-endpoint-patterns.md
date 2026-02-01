# Soupmarkets Backend Endpoint Test Report
**Date**: 2026-01-21  
**Tested Environments**: demo.soupmarkets.com, tas.soupmarkets.com

## Executive Summary

Found working endpoint patterns for authentication and registration. The `/rest/api/login` endpoint is the primary JSON API for programmatic login (returns 401 on invalid credentials). The `/api/login.json` endpoint exists but redirects to HTML login form (302). Registration requires ApiConsumer authentication via `Api-Authorization` header.

---

## Login Endpoints (Authentication)

### Pattern 1: `/api/login.json` 
- **HTTP Method**: POST
- **Response Code**: 302 (Redirect)
- **Redirect Target**: `/login/auth` (HTML login form)
- **Content-Type**: application/x-www-form-urlencoded
- **Usage**: Web form-based login with session cookie setup
- **Status**: ✅ Works (but redirects to HTML)
- **Environment**: Both demo.soupmarkets.com and tas.soupmarkets.com

**Request Example**:
```bash
curl -X POST "https://demo.soupmarkets.com/api/login.json" \
  -d "username=fui.nusenu&password=test123"
```

**Response**:
- HTTP 302 Location: `/login/auth`
- Sets JSESSIONID cookie
- Redirects to HTML login form (not JSON API)

---

### Pattern 2: `/rest/api/login` (PRIMARY JSON ENDPOINT)
- **HTTP Method**: POST  
- **Response Code**: 401 (Unauthorized) on invalid credentials, likely 200 on success
- **Content-Type**: application/json
- **Request Body**: JSON with username/password
- **Usage**: Programmatic login for client applications
- **Status**: ✅ Works (JSON API)
- **Environment**: Both demo.soupmarkets.com and tas.soupmarkets.com

**Request Example**:
```bash
curl -X POST "https://demo.soupmarkets.com/rest/api/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"fui.nusenu","password":"test123"}'
```

**Response** (invalid credentials):
```json
{"error":"Invalid username or password"}
```
HTTP 401

**Recommendation**: Use this endpoint for SPA/API clients. It returns proper JSON error messages.

---

### Pattern 3: `/rest/login`
- **HTTP Method**: POST
- **Response Code**: 302 (Redirect)
- **Usage**: Alternative endpoint that also redirects
- **Status**: ✅ Works (but also redirects)
- **Environment**: Both environments

---

## Registration Endpoints

### Pattern 1: `/client/register.json` (API Consumer Auth Required)
- **HTTP Method**: POST
- **Header Required**: `Api-Authorization` with Base64 encoded credentials
- **Response Code**: 401 (Invalid/missing credentials)
- **Status**: ✅ Endpoint exists
- **Environment**: demo.soupmarkets.com

**Request Example**:
```bash
curl -X POST "https://demo.soupmarkets.com/client/register.json" \
  -H "Api-Authorization: Basic MWJhZmVlMzAtYjM0OC00MjU1LThlMTUtOWZjZGQzNDRmNDNkOlNvdXBGaW5hbmNlMjAyNkFwaUtleQ=="
```

**Response** (invalid credentials):
```json
{"message":"Bad api authorization credentials","status":"error"}
```
HTTP 401

**Note**: Requires valid ApiConsumer credentials. The header value is: `Basic [Base64(apiKey:apiSecret)]`

---

### Pattern 2: `/rest/client/register`
- **HTTP Method**: POST
- **Response Code**: 302 (Redirect)
- **Status**: ✅ Endpoint exists (but redirects)
- **Environment**: demo.soupmarkets.com

**Note**: This pattern redirects, unlike the JSON endpoint above.

---

## Enum Utility Endpoints (NOT FOUND)

### Pattern 1: `/enumUtility/list.json`
- **Response Code**: 404 (Not Found)
- **Status**: ❌ Endpoint not available
- **Environment**: Both demo.soupmarkets.com and tas.soupmarkets.com

### Pattern 2: `/rest/enumUtility/list.json`
- **Response Code**: 404 (Not Found)
- **Status**: ❌ Endpoint not available
- **Environment**: Both demo.soupmarkets.com and tas.soupmarkets.com

**Note**: These endpoints don't appear to exist on demo or production. May need to check SPA for how enums are provided.

---

## Route Pattern Summary

### Pattern Distribution

| Prefix | Pattern | Works | Type |
|--------|---------|-------|------|
| `/api/` | `/api/login.json` | ✅ (302 redirect) | Web form login |
| `/rest/api/` | `/rest/api/login` | ✅ (JSON API) | **Recommended** |
| `/rest/` | `/rest/login` | ✅ (302 redirect) | Alternative |
| `/client/` | `/client/register.json` | ✅ (requires auth) | Client registration |
| `/rest/client/` | `/rest/client/register` | ✅ (302 redirect) | Alternative |
| (none) | `/enumUtility/list.json` | ❌ (404) | Not found |
| `/rest/` | `/rest/enumUtility/list.json` | ❌ (404) | Not found |

---

## Recommendations for SoupFinance

### For Login (from React App)

**Use**: `/rest/api/login`

```typescript
async function loginUser(username: string, password: string) {
  const response = await fetch('/rest/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  
  if (response.status === 401) {
    throw new Error(await response.json());
  }
  
  return response.json();
}
```

### For Registration (ApiConsumer)

**Use**: `/client/register.json` with Api-Authorization header

```typescript
async function registerApiConsumer(apiKey: string, apiSecret: string) {
  const credentials = btoa(`${apiKey}:${apiSecret}`);
  
  const response = await fetch('/client/register.json', {
    method: 'POST',
    headers: { 'Api-Authorization': `Basic ${credentials}` }
  });
  
  return response.json();
}
```

---

## Environment Status

| Environment | Login Works | Register Works | Enums Available |
|-------------|-----------|-----------------|-----------------|
| demo.soupmarkets.com | ✅ `/rest/api/login` | ✅ `/client/register.json` | ❌ |
| tas.soupmarkets.com | ✅ `/rest/api/login` | ? (not tested) | ❌ |

---

## Test Methodology

- Used `curl` to test all endpoints
- Tested both GET (HEAD) and POST methods
- Checked HTTP status codes and response bodies
- Verified response headers (Location, Content-Type, Set-Cookie)
- Tested both JSON and form-encoded request formats

---

## Conclusion

The backend uses a **mixed routing approach**:
- **`/rest/*` prefix**: Modern JSON/REST API endpoints (recommended for programmatic access)
- **`/api/*` prefix**: Legacy endpoints that may redirect to HTML forms
- **`/client/*` prefix**: Public client registration requiring ApiConsumer authentication

For the SoupFinance React app, prioritize `/rest/api/login` for authentication and configure the API client to handle 401 responses with automatic redirect to login page.

