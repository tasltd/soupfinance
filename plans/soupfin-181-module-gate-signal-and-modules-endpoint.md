# SOUPFIN-181: Machine-readable module gate and an enabled-modules endpoint

Items 2 and 3 of [soupfinance-payments-finance-module-enable.md](soupfinance-payments-finance-module-enable.md).
Item 1 (turning Finance on for the tenant) is SOUPFIN-15 #4 and SOUPFIN-144.

## Status

| Part | Where | State |
|---|---|---|
| Backend: structured 403 + headers | soupmarkets-web branch `fix/SOUPFIN-181-module-disabled-403` | Built, unit-tested, pushed. Not merged to master, not deployed |
| Backend: `GET /account/modules.json` | same branch | Built, unit-tested, pushed. Not merged, not deployed |
| Frontend: header/body first in `parseApiError` | this repo | Built, unit + E2E tested |
| Frontend: SideNav follows the module list | this repo | Built, unit + E2E tested |

Until the backend branch is deployed, the frontend behaves exactly as before: the modules
call returns 404, which the app reads as "unknown" and shows the whole menu, and 403s
fall back to the SOUPFIN-150 body text match and then the URL list.

## Problem

The backend answers 403 for two different reasons on the same URLs:

| Cause | Who answers |
|---|---|
| Tenant lacks the module | `Finance/Trading/Cis/SouplifyModuleInterceptor` |
| User lacks a role | Spring Security |

The frontend had to guess (SOUPFIN-150 matches the English sentence), and the menu sent
FINANCE-less tenants to Payments, Ledger and Accounting, where every request is a
guaranteed 403.

## Backend changes (soupmarkets-web)

### 1. One rule, one helper: `src/main/groovy/soupbroker/ModuleGate.groovy`

- `isEnabled(account, group)` and `enabledModules(account)` use the interceptors' exact
  rule: the tenant has an `AccountModule` row for the group. (Archived flags and
  start/end dates are ignored, as the interceptors have always ignored them. Changing that
  is a separate decision; it would change who gets 403s.)
- `disabledBody(group, message)` builds the 403 body.
- `markDisabled(response, group)` sets the headers.

### 2. Every module interceptor's 403

All four interceptors now answer:

```
HTTP/1.1 403
X-Module-Status: disabled
X-Module: FINANCE
Content-Type: application/json

{"error":"Finance module is not enabled for this tenant",
 "code":"MODULE_DISABLED",
 "module":"FINANCE",
 "message":"Finance module is not enabled for this tenant"}
```

The plain-text answer for non-JSON requests keeps its text and gets the same headers.

**Departure from the ticket's example body.** The ticket suggested
`"error": "MODULE_DISABLED"`. The Admin SPA and sparx show `error` (or `message`) to the
user, so putting the code there would display `MODULE_DISABLED` in those apps. The code
goes in `code`, the contract SOUPFIN-150 already defined and the frontend already reads.
The frontend also accepts `error: "MODULE_DISABLED"`, so either shape works. The ticket
allowed the header as an alternative; both are sent.

A role denial is unchanged: Spring's `{"timestamp","status":403,"error":"Forbidden","path"}`
with no `X-Module-*` headers. That absence is what keeps it distinguishable.

### 3. `GET /account/modules.json` (also `/rest/account/modules.json`)

`AccountController.modules()`, `@Secured(["ROLE_ADMIN", "ROLE_USER"])`, read-only:

```json
{ "tenantId": "ff8081817217e9f3017217f19ccc0000", "modules": ["CLIENT", "FINANCE"] }
```

- Names are `ModuleGroup` enum names, sorted and de-duplicated.
- 404 `{"error": "No tenant account found for this session"}` when `Account.current()`
  resolves nothing.
- The frontend calls `/account/modules.json` through `accountClient`, the same path family
  as `/account/show`, because `/rest/account/*` has returned 403 through the production proxy.

### Tests (soupmarkets-web, JDK 19, all passing: 98 tests, 0 failures)

| Spec | Covers |
|---|---|
| `ModuleGateSpec` (new) | null/empty lists, de-duplication, 8,000 shuffled rows, JSON escaping, `isEnabled` agrees with `enabledModules` |
| `Finance/Trading/Cis/SouplifyModuleInterceptorSpec` | 3 new cases each: JSON body fields + headers, plain-text headers, no headers when allowed |
| `AccountControllerSpec` | 4 new cases: list, empty list, 404, agreement with the Finance gate for 4 module sets |

Not run: a functional spec against a real database. It needs the LXC backend running this
branch, which needs a deploy this ticket did not ask for.

## Frontend changes (this repo)

| File | Change |
|---|---|
| `src/api/endpoints/modules.ts` | `modulesApi.list()`: 404 → `null` (unknown); bad shape or other errors throw |
| `src/stores/accountStore.ts` | `enabledModules` (null = unknown, not persisted, cleared on logout), `fetchEnabledModules()`, `isAnyModuleEnabled()` |
| `src/App.tsx` | Loads the modules alongside account settings after sign-in |
| `src/components/layout/navItems.ts` | Nav entries tagged with the module that gates them; `filterNavItems()` |
| `src/components/layout/SideNav.tsx` | Hides entries the tenant cannot open, and says why |
| `src/api/errors.ts` | `classifyForbiddenHeaders()`; headers decide first, then body, then URL |

Gated entries (from `FinanceModuleInterceptor`'s controller list): Invoices, Bills, Payments,
Ledger, Accounting, Reports › Scheduled Reports, Settings › Financial Years. Vendors needs
TRADING or FINANCE (`TradingModuleInterceptor.FINANCE_SHARED_CONTROLLERS`).

## Deploy order

1. Merge and deploy the soupmarkets-web branch (Demo/Edge, then TAS).
2. The frontend needs no second release: it already reads the new signals and falls back
   while they are absent.
