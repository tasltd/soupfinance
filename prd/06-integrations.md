# Integration Points

[← Back to PRD Index](../PRD.md)

---

## External Services

| Service | Purpose | Status |
|---------|---------|--------|
| Email Service | Invoice delivery, confirmation emails, notifications | Active |
| File Storage | Document uploads (KYC docs, logos, favicons) | Active |
| Banking Integration | Bank account validation and reconciliation | Optional |

---

## Backend Integration

### API Server

| Aspect | Detail |
|--------|--------|
| **Backend** | soupmarkets-web (Grails/Spring Boot) |
| **Production API** | tas.soupmarkets.com |
| **Local Dev API** | localhost:9090 (LXC container) |

### Authentication

| Header | Value |
|--------|-------|
| **Auth Header** | `X-Auth-Token: {token}` |
| **NOT** | Bearer token (common misconception) |

### Content Types

| Method | Content-Type |
|--------|-------------|
| GET | N/A |
| POST | `application/x-www-form-urlencoded` |
| PUT | `application/x-www-form-urlencoded` |
| DELETE | N/A |

### Data Binding

Grails uses indexed notation for arrays:

```
items[0].description=Widget
items[0].quantity=5
items[0].unitPrice=10.00
items[1].description=Gadget
items[1].quantity=3
items[1].unitPrice=25.00
```

---

## Vite Proxy Configuration

Development server proxies API requests:

```typescript
// vite.config.ts
proxy: {
  '/rest': {
    target: process.env.VITE_API_URL || 'http://localhost:9090',
    changeOrigin: true,
  },
  '/client': {
    target: process.env.VITE_API_URL || 'http://localhost:9090',
    changeOrigin: true,
  },
  '/account': {
    target: process.env.VITE_API_URL || 'http://localhost:9090',
    changeOrigin: true,
  },
}
```

---

## Client-Side Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     React Components                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    TanStack Query                            │
│              (Server State / Caching)                        │
│           - 5 minute stale time                              │
│           - Automatic refetch on focus                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Axios Client                            │
│              (HTTP Requests / Interceptors)                  │
│           - Auth token injection                             │
│           - Error handling                                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Backend API                               │
│              (Grails / Spring Boot)                          │
└─────────────────────────────────────────────────────────────┘

                    ┌─────────────┐
                    │   Zustand   │
                    │   Stores    │
                    │ (Auth, UI)  │
                    └─────────────┘
                          │
                          ▼
                    ┌─────────────┐
                    │ localStorage│
                    │sessionStorage│
                    └─────────────┘
```

---

## API Client Structure

```
src/api/
├── client.ts              # Axios instance, interceptors, helpers
└── endpoints/
    ├── auth.ts            # Login, logout, token validation
    ├── registration.ts    # Tenant registration, email confirmation
    ├── invoices.ts        # Invoice CRUD
    ├── bills.ts           # Bill CRUD
    ├── vendors.ts         # Vendor CRUD
    ├── clients.ts         # InvoiceClient CRUD
    ├── ledger.ts          # Ledger accounts, transactions
    ├── reports.ts         # Financial reports
    └── settings.ts        # Account settings, users, bank accounts
```

---

## Helper Functions

### toFormData

Converts object to URLSearchParams for POST/PUT:

```typescript
function toFormData(data: Record<string, any>): URLSearchParams {
  const params = new URLSearchParams();
  // Handles nested objects, arrays with indexed notation
  return params;
}
```

### toQueryString

Converts object to query string for GET:

```typescript
function toQueryString(params: Record<string, any>): string {
  return new URLSearchParams(params).toString();
}
```

---

## Error Handling

```typescript
// Axios interceptor
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired, redirect to login
      authStore.logout();
    }
    return Promise.reject(error);
  }
);
```

---

## API Quirks

| Endpoint | Quirk |
|----------|-------|
| `/rest/sbUser/index.json` | Requires `?sort=id` (dateCreated sort not available) |
| `/rest/invoiceClient/*` | Use this, NOT `/rest/client/*` |
| POST/PUT | Must use `application/x-www-form-urlencoded` |
