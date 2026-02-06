# SoupFinance Backend Issues

**Date:** February 5, 2026 (updated)
**Status:** Pending Backend Investigation
**Priority:** HIGH

## Context

SoupFinance is a React 19 SPA that calls soupmarkets-web backend REST endpoints via a Vite/Apache proxy. All requests use:
- `Content-Type: application/json` and `Accept: application/json` headers
- `X-Auth-Token` header for user authentication (NOT session cookies)
- `Api-Authorization: Basic base64(id:secret)` injected by the proxy (identifies the ApiConsumer)

The admin SPA (Angular, embedded in Grails) shares the Grails session directly and uses AJAX to call the same controllers successfully. These issues are specific to the API token + JSON path.

## CSRF Token Clarification

Per backend design:
- **Only POST/save operations** require CSRF tokens (from `create.json`)
- **PUT (update) and DELETE do NOT require CSRF tokens**
- CSRF tokens are passed as URL query params, not in the JSON body

---

## Issue 1: Bill Endpoints Return Error

**Endpoints:**
- `GET /rest/bill/index.json` — Fails (frontend shows "Failed to load bills" error state)
- `POST /rest/bill/save.json` — Suspected to also fail (not tested directly since list fails)

**Evidence:**
- Screenshot `test-results/screenshots/integration-04-bills-list-initial.png` shows the error state
- The React app calls `GET /rest/bill/index.json` with `X-Auth-Token` + `Accept: application/json`
- The response triggers the axios error handler (not empty data — it's an API error)

**What works:**
- The admin SPA (Angular) calls the same bill controller's `index.json` via AJAX and it works fine
- The vendor endpoint (`GET /rest/vendor/index.json`) works fine with the exact same auth pattern
- Invoice, ledger account, ledger transaction, voucher endpoints all work via the same API client

**Difference between admin SPA and SoupFinance:**
- Admin SPA: Same origin, Grails session (JSESSIONID cookie), no Api-Authorization header
- SoupFinance: Cross-origin via proxy, X-Auth-Token header, Api-Authorization header from proxy

**Impact:** 10 out of 23 bill integration tests skip because no bills can be listed. All bill CRUD is blocked.

**Test:** `e2e/integration/04-bills.integration.spec.ts` — tests 4-7, 13-14, 18-19, 22-23 all skip

---

## Issue 2: Vendor Update (PUT) Returns 200 but Does Not Persist

**Endpoint:** `PUT /rest/vendor/update/{id}.json`

**Observed behavior:**
- PUT returns HTTP 200 with the submitted data in the response body (shows updated values)
- Subsequent `GET /rest/vendor/show/{id}.json` returns the OLD data
- The update appears to succeed but changes are NOT committed to the database

**Note:** This is NOT a CSRF issue — updates do not require CSRF tokens per backend design.

**Evidence:**
```
PUT /rest/vendor/update/{id}.json → 200, name: "UpdatedName"
GET /rest/vendor/show/{id}.json → name: "OriginalName" (NOT updated)
```

**Test:** `e2e/integration/02-vendors.integration.spec.ts` — "edit vendor via form updates vendor data"

---

## Issue 3: Vendor Delete Returns 200 but Does Not Remove

**Endpoint:** `DELETE /rest/vendor/delete/{id}.json`

**Observed behavior:**
- DELETE returns HTTP 200 with response body
- `GET /rest/vendor/show/{id}.json` still returns the vendor (not 404)
- `GET /rest/vendor/index.json` still includes the vendor in results

**Note:** This is NOT a CSRF issue — deletes do not require CSRF tokens per backend design.

**Evidence:**
```
DELETE /rest/vendor/delete/{id}.json → 200 (success response)
GET /rest/vendor/show/{id}.json → 200 (vendor still exists)
```

**Test:** `e2e/integration/02-vendors.integration.spec.ts` — delete tests

---

## Issue 4: Account Balance Endpoint Returns 302

**Endpoint:** `GET /rest/ledgerAccount/balance/{id}.json`

**Current Behavior:** Returns 302 redirect to `/rest/show/balance`

**What works:** `GET /rest/ledgerAccount/index.json` and `GET /rest/ledgerAccount/show/{id}.json` work fine

---

## Issue 5: Finance Report Endpoints

**Endpoints with issues:**

| Endpoint | Behavior |
|----------|----------|
| `GET /rest/financeReports/trialBalance.json` | 302 redirect |
| `GET /rest/financeReports/agedReceivables.json` | 302 redirect to `/rest/show/agedReceivables` |
| `GET /rest/financeReports/agedPayables.json` | Timeout after 15 seconds |
| `GET /rest/financeReports/balanceSheet.json` | Works but slow (26+ seconds) |
| `GET /rest/financeReports/incomeStatement.json` | Works but may timeout under load |

---

## Issue 6: edit.json Endpoints Missing CSRF Tokens

**Endpoints affected:**
- `GET /rest/vendor/edit/{id}.json` — Does NOT include SYNCHRONIZER_TOKEN in response
- Potentially other domain edit endpoints

**Observed:** The `create.json` endpoints include SYNCHRONIZER_TOKEN/SYNCHRONIZER_URI, but `edit/{id}.json` does not. Since updates don't need CSRF per backend design, this may be intentional. Documenting for awareness.

---

## Summary of Test Impact

| Test File | Passed | Skipped | Root Cause |
|-----------|--------|---------|------------|
| 01-auth | 8 | 0 | All pass |
| 02-vendors | 19 | 0 | Update/delete don't persist (Issues #2, #3) |
| 03-invoices | 24 | 0 | All pass |
| 04-bills | 13 | 10 | Bill list API fails (Issue #1) |
| 05-payments | 20 | 0 | All pass |
| **Total** | **77** | **10** | |

---

*Updated from SoupFinance E2E integration testing against LXC backend*
