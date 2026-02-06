# SoupFinance Backend Changes Required

**Date:** February 4, 2026
**Status:** Pending Backend Development
**Priority:** HIGH

## Overview

This document outlines backend endpoints that return incorrect responses (302 redirects or timeouts) when they should return JSON data. These issues were identified during E2E integration tests against the LXC backend.

---

## Critical Issues

### 1. Account Balance Endpoint

**Endpoint:** `GET /rest/ledgerAccount/balance/{id}.json`

**Current Behavior:** Returns 302 redirect to `/rest/show/balance`

**Expected Behavior:** Return JSON with account balance:
```json
{
  "accountId": "uuid",
  "accountName": "Cash",
  "balance": 15000.00,
  "debitTotal": 50000.00,
  "creditTotal": 35000.00,
  "currency": "GHS"
}
```

**Test:** `e2e/integration/accounting.integration.spec.ts` - "can get account balance"

---

### 2. Trial Balance Report

**Endpoint:** `GET /rest/financeReports/trialBalance.json`

**Current Behavior:** Returns 302 redirect

**Expected Behavior:** Return JSON with trial balance report data:
```json
{
  "accounts": [...],
  "totalDebits": 500000.00,
  "totalCredits": 500000.00,
  "periodStart": "2026-01-01",
  "periodEnd": "2026-02-04"
}
```

**Tests:**
- `e2e/integration/api-health.integration.spec.ts` - "GET /rest/financeReports/trialBalance.json"
- `e2e/integration/reports.integration.spec.ts` - "trial balance page loads with date filters"

---

### 3. Income Statement (Profit & Loss) Report

**Endpoint:** `GET /rest/financeReports/incomeStatement.json`

**Current Behavior:** Works but may timeout under load

**Expected Behavior:** Return JSON with P&L report

**Test:** `e2e/integration/reports.integration.spec.ts` - "GET /rest/financeReports/incomeStatement.json"

---

### 4. Balance Sheet Report

**Endpoint:** `GET /rest/financeReports/balanceSheet.json`

**Current Behavior:** Works but may timeout (takes 26+ seconds)

**Expected Behavior:** Return JSON within reasonable timeout (< 15s)

**Note:** Consider optimizing database queries for balance sheet generation

**Test:** `e2e/integration/reports.integration.spec.ts` - "balance sheet page loads"

---

### 5. Aged Receivables Report

**Endpoint:** `GET /rest/financeReports/agedReceivables.json`

**Current Behavior:** Returns 302 redirect to `/rest/show/agedReceivables`

**Expected Behavior:** Return JSON with aging buckets:
```json
{
  "asOfDate": "2026-02-04",
  "current": 10000.00,
  "days30": 5000.00,
  "days60": 2500.00,
  "days90": 1000.00,
  "over90": 500.00,
  "total": 19000.00,
  "customers": [...]
}
```

**Test:** `e2e/integration/reports.integration.spec.ts` - "GET /rest/financeReports/agedReceivables.json"

---

### 6. Aged Payables Report

**Endpoint:** `GET /rest/financeReports/agedPayables.json`

**Current Behavior:** Timeout after 15 seconds

**Expected Behavior:** Return JSON with aging buckets (similar to receivables)

**Test:** `e2e/integration/reports.integration.spec.ts` - "GET /rest/financeReports/agedPayables.json"

---

### 7. Bill Endpoints

**Endpoints:**
- `GET /rest/bill/index.json` - Returns 302 redirect
- `POST /rest/bill/save.json` - Returns 302 redirect

**Current Behavior:** Both endpoints return 302 redirect instead of JSON

**Expected Behavior:** Standard CRUD JSON responses

**Tests:**
- `e2e/integration/api-health.integration.spec.ts` - "GET /rest/bill/index.json - list bills"
- `e2e/integration/bills.integration.spec.ts` - Multiple tests

---

## Backend Caching / Persistence Issues

### 8. Vendor Update (PUT) Returns 200 but Does Not Persist Changes

**Endpoint:** `PUT /rest/vendor/update/{id}.json`

**Current Behavior:**
- PUT returns HTTP 200 with the submitted data in the response body (name shows updated value)
- However, a subsequent `GET /rest/vendor/show/{id}.json` returns the OLD data
- The update appears to succeed but the changes are NOT committed to the database
- This occurs consistently through the Vite proxy and intermittently with direct backend calls

**CSRF Token Context:**
- The `vendor/edit/{id}.json` endpoint does NOT return SYNCHRONIZER_TOKEN/SYNCHRONIZER_URI
- Using `vendor/create.json` CSRF tokens for update operations (backend accepts them)
- Tokens are passed as URL query parameters (confirmed working for create operations)
- The backend's `withForm` validation may be silently failing and entering the `invalidToken` closure,
  which returns the submitted data without actually saving

**Suspected Root Cause:**
- Grails `withForm {}` CSRF validation may be session-bound in a way that breaks through HTTP proxies
- The `invalidToken {}` closure likely responds with the submitted data (HTTP 200) without persisting
- Alternatively, Hibernate second-level cache may be serving stale data for GET after PUT

**Evidence:**
```
PUT /rest/vendor/update/{id}.json?SYNCHRONIZER_TOKEN=xxx → 200, name: "UpdatedName"
GET /rest/vendor/show/{id}.json → name: "OriginalName" (NOT updated)
```

**Impact:** Vendor edits through the SoupFinance web app do not save. This affects:
- `e2e/integration/02-vendors.integration.spec.ts` - "edit vendor via form updates vendor data"
- Any production vendor update operations

**Recommended Fix:**
1. Investigate the VendorController `update` action's `withForm` / `invalidToken` logic
2. Ensure `edit/{id}.json` returns SYNCHRONIZER_TOKEN for proper CSRF flow
3. Check Hibernate cache invalidation after save operations
4. Consider adding cache-busting headers or disabling entity caching for mutable endpoints

---

### 9. General: edit.json Endpoints Missing CSRF Tokens

**Endpoints affected:**
- `GET /rest/vendor/edit/{id}.json` — Does NOT include SYNCHRONIZER_TOKEN in response
- Potentially other domain edit endpoints (invoice, bill, ledger, voucher)

**Current Behavior:** The `edit/{id}.json` endpoints return entity data but do NOT include
SYNCHRONIZER_TOKEN and SYNCHRONIZER_URI fields. The `create.json` endpoints DO include them.

**Expected Behavior:** Both `create.json` and `edit/{id}.json` should include CSRF tokens,
as the TokenWithFormInterceptor should add them to both.

**Impact:** Frontend must use `create.json` CSRF tokens for update operations as a workaround,
which may contribute to the update persistence issue (#8 above).

---

### 10. Vendor Delete Returns 200 but Does Not Remove Vendor

**Endpoint:** `DELETE /rest/vendor/delete/{id}.json`

**Current Behavior:**
- DELETE returns HTTP 200 with `{"targetDomainClassEntity": {...}, "targetControllerName": "vendor"}`
- But `GET /rest/vendor/show/{id}.json` still returns the vendor (not 404)
- `GET /rest/vendor/index.json` still includes the vendor in list results

**Expected Behavior:** After DELETE, the vendor should either:
- Be completely removed (GET returns 404)
- Be soft-deleted and excluded from index queries

**Evidence:**
```
DELETE /rest/vendor/delete/{id}.json → 200 (success response)
GET /rest/vendor/show/{id}.json → 200 (vendor still exists, no 'deleted' flag)
```

**Impact:** Vendor deletion appears to succeed in the UI but the vendor persists.
- `e2e/integration/02-vendors.integration.spec.ts` - Delete tests

---

## Summary of Failed/Skipped Tests Due to Backend

| Test File | Failed | Skipped | Cause |
|-----------|--------|---------|-------|
| accounting.integration.spec.ts | 1 | 0 | Account balance 302 redirect |
| reports.integration.spec.ts | 8 | 0 | Various reports 302/timeout |
| bills.integration.spec.ts | 0 | 4 | Bill endpoints 302 redirect |
| api-health.integration.spec.ts | 0 | 3 | Missing endpoints |

## Recommended Actions

1. **Audit REST Controller URL mappings** - Ensure all `.json` endpoints return JSON responses
2. **Add missing report endpoints** - Implement JSON response handlers for finance reports
3. **Optimize slow queries** - Balance sheet taking 26+ seconds needs optimization
4. **Implement bill CRUD** - Bill domain appears to lack REST API endpoints

---

*Document generated by SoupFinance frontend testing suite*
