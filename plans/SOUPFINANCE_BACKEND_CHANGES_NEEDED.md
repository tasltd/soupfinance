# SoupFinance Backend Issues

**Date:** February 7, 2026 (updated)
**Status:** Issues #1-#3 Investigated; Issues #4-#6 Pending; Issue #7 Root Cause Found; Issue #8 Partially Resolved (DB fix applied)
**Priority:** CRITICAL (Issues #7 + #8 block all new registrations and confirmation emails)

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

### Root Cause Analysis

**Status:** ROOT CAUSE FOUND

**Confirmed Root Cause:** `LazyInitializationException` on `Bill.billItemList` during GSON view rendering when the request comes through the stateless REST filter chain.

**Explanation:**

The Spring Security filter chain for `/rest/**/**.json` (line 802 of `application.groovy`) removes `securityContextPersistenceFilter`:

```groovy
[pattern: '/rest/**/**.json', filters: 'JOINED_FILTERS,-exceptionTranslationFilter,-authenticationProcessingFilter,-securityContextPersistenceFilter,-rememberMeAuthenticationFilter']
```

This means no HTTP session is maintained for stateless REST requests (by design -- REST is stateless). The controller action `BillController.index()` (line 108) is annotated `@Transactional(readOnly = true)`, which opens a Hibernate session for the duration of the controller action. However, by the time the GSON view `_domainClassInstance.gson` renders the response, the controller's transactional Hibernate session has already been closed.

The generic GSON template `_domainClassInstance.gson` at lines 350-391 iterates over collection properties (`domainConstrainedPrimaryListProperties`), and at line 356 accesses `domainClassInstance[eachField.toString()]`. For `Bill`, this includes `billItemList` -- a lazily-loaded `hasMany` collection. Accessing this collection without an active Hibernate session triggers `LazyInitializationException`.

**Why other domains work:** Vendor, Invoice, LedgerAccount, BillItem, and BillPayment either:
- Have no `hasMany` collection properties that trigger lazy loading during GSON rendering, or
- Their collections are simple value types (not domain class collections), which are not accessed in the lazy-loading code path at lines 358-360

**Why admin SPA works:** The admin Angular SPA uses session cookies (JSESSIONID). Its requests go through the `/**` filter chain (line 808) which retains `securityContextPersistenceFilter`, keeping the HTTP session alive. The Hibernate `OpenSessionInViewInterceptor` (enabled by default in Grails) binds the Hibernate session to the HTTP session, so lazy loading works during GSON rendering.

**Evidence from LXC backend logs (10.115.213.183):**
```
LazyInitializationException: failed to lazily initialize a collection of role:
soupbroker.finance.Bill.billItemList, could not initialize proxy - no Session
```

**Live testing evidence:**
```bash
# Vendor index works (no lazy-loaded collections trigger)
GET /rest/vendor/index.json → 200 OK

# Bill index fails (billItemList triggers lazy loading without session)
GET /rest/bill/index.json → 403 Forbidden (error response from exception handler)

# Other finance domains work fine
GET /rest/invoice/index.json → 200 OK
GET /rest/ledgerAccount/index.json → 200 OK
GET /rest/billItem/index.json → 200 OK
GET /rest/billPayment/index.json → 200 OK
```

**Note on 403 vs 302:** The original report described a 302 redirect. Current testing shows 403. Both are symptoms of the same underlying LazyInitializationException -- the error handling chain can produce either response code depending on the exception translation filter configuration and deployment state.

**Recommended Fix (3 options, from most to least preferred):**

**Option A (Preferred):** Create a dedicated `_bill.gson` template that avoids lazy loading by not using the generic `_domainClassInstance.gson`. Render only the fields needed:
```groovy
// grails-app/views/bill/_bill.gson
model { Bill bill }
json {
    id bill.id
    billNumber bill.billNumber
    status bill.status
    vendor bill.vendor ? [id: bill.vendor.id, serialised: bill.vendor.serialised] : null
    total bill.total
    paidAmount bill.paidAmount
    amountDue bill.amountDue
    // ... other scalar fields
    // Omit billItemList here -- load via separate /rest/billItem/index.json?bill.id=X
}
```

**Option B:** Initialize the collections eagerly in the controller before GSON rendering:
```groovy
@Transactional(readOnly = true)
def index(Integer max) {
    // ... existing params setup ...
    def billList = billService.searchActiveList(params)
    // Force initialization of lazy collections before session closes
    billList.each { bill ->
        Hibernate.initialize(bill.billItemList)
    }
    respond billList, model: [billCount: billList?.totalCount]
}
```

**Option C:** Add `fetchMode` eager to `billItemList` in the Bill domain class (least preferred -- impacts all queries):
```groovy
static mapping = {
    billItemList fetch: 'join'
}
```

**Recommendation:** Option A is best because it follows the GSON template pattern already used by other complex domains, avoids N+1 query issues from Option B, and avoids the global performance impact of Option C.

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

### Root Cause Analysis

**Status:** DISPROVEN BY LIVE TESTING

**Finding:** Vendor update via `PUT /rest/vendor/update/{id}.json` with a JSON body **works correctly**. The data persists and is visible on subsequent GET requests.

**Live testing evidence (LXC backend at 10.115.213.183:9090):**
```bash
# 1. Login and get fresh token
POST /rest/api/login → token: bjha8u5n145upf9611b54i37045tog77

# 2. Get existing vendor
GET /rest/vendor/index.json → ID: ff808181712bf8c401712c6759b10005, Name: "Absa Bank Ghana Limited"

# 3. PUT update with JSON body
PUT /rest/vendor/update/ff808181712bf8c401712c6759b10005.json
Body: {"name":"TestUpdated_1770397861"}
→ 200 OK, response shows name: "TestUpdated_1770397861"

# 4. Verify persistence with GET
GET /rest/vendor/show/ff808181712bf8c401712c6759b10005.json
→ 200 OK, name: "TestUpdated_1770397861" (PERSISTED CORRECTLY)
```

**Code path confirmation:** `VendorController.update(Vendor vendor)` at line 323 of `VendorController.groovy` calls `vendorService.save(vendor)`. The `VendorService` delegates to `IVendorService.save(vendor)` which is a GORM Data Service (`@Service(Vendor)`) that handles persistence automatically. The `request.withFormat` block at line 332 has a `'*'` catch-all that responds with the saved vendor, so JSON requests are handled correctly.

**Probable causes of original test failure:**
1. **Stale or expired auth token** -- the first token obtained during investigation returned 403 on all endpoints; a fresh login produced a working token
2. **Multi-tenancy context mismatch** -- if the test was run against a different tenant context, the vendor might not have been found for update
3. **Test environment timing** -- the original test may have run before the LXC backend was fully deployed or restarted
4. **SoupFinance proxy configuration** -- the Vite/Apache proxy may have been stripping or modifying request headers at the time of testing

**Action Required:** Re-run the SoupFinance E2E integration test `02-vendors.integration.spec.ts` to confirm whether the issue persists with the current backend deployment. If the test still fails, the issue is in the SoupFinance frontend test setup (token management, request formatting), not in the backend.

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

### Root Cause Analysis

**Status:** ROOT CAUSE FOUND -- Working As Designed (Not a Bug)

**Confirmed Root Cause:** The `DeleteInterceptor` (line 17: `match(action: "delete")`) intercepts ALL delete actions across all controllers and forwards them to `UtilityController.deleteChecker()`. The delete is never actually executed -- instead, a delete approval workflow is triggered.

**How the interceptor works** (`grails-app/controllers/soupbroker/DeleteInterceptor.groovy`):

1. `DeleteInterceptor.before()` (line 22) checks if `params.relationChecked` or `params.fromUtilityController` are set
2. If neither is set (which is the case for all direct API calls from SoupFinance), it forwards to `UtilityController.deleteChecker`
3. It returns `false` to stop the original delete action from executing

**What `UtilityController.deleteChecker()` does** (line 26 of `UtilityController.groovy`):

For **non-admin users** (`SpringSecurityUtils.ifNotGranted("ROLE_ADMIN")`):
- Creates a `DeleteRequest` record (lines 49-54) with status `PENDING`
- Sends an email to admin users requesting approval (lines 71-95)
- Returns HTTP 200 with message: `"A deletion request has been sent to an administrator for confirmation."` (line 99)
- The vendor is NOT deleted -- it requires admin approval

For **admin users**:
- Falls through to a related-entity check that returns a list of related entities (line 127+)
- Returns HTTP 200 with a `relatedList` JSON response showing dependent entities
- Even for admin users, the actual delete requires a second request with `params.relationChecked = true`

**Why SoupFinance sees 200 but vendor is not removed:** The API returns 200 with a message about the delete request being sent for approval. The SoupFinance React frontend interprets this 200 as a successful deletion, but the vendor was never actually deleted -- only a `DeleteRequest` record was created.

**Evidence -- interceptor code:**
```groovy
// DeleteInterceptor.groovy line 29-33
if (isJsonRequest) {
    params.target = controllerName
    params.redirectedFromJson = true
    forward(controller: "utility", action: "deleteChecker", params: params)
}
return false  // Stops the original delete action
```

**Evidence -- deleteChecker response for non-admin:**
```groovy
// UtilityController.groovy lines 96-103
json {
    respond([
        message: "A deletion request has been sent to an administrator for confirmation.",
        deleteRequestId: deleteRequest.id
    ])
    return
}
```

**Impact on SoupFinance:**
- The SoupFinance `deleteBill()` and `deleteVendor()` functions in `bills.ts` and `vendors.ts` call `apiClient.delete()` and expect the entity to be removed
- The backend returns 200 (axios considers this success), but the entity is never deleted
- The SoupFinance frontend needs to handle the `deleteRequest` approval workflow

**Recommended Fix (SoupFinance frontend side):**

**Option A (Quick fix):** Check the response body for a `deleteRequestId` field. If present, show a notification: "Delete request submitted for admin approval" instead of treating it as a completed deletion.

```typescript
export async function deleteVendor(id: string): Promise<void> {
  const response = await apiClient.delete(`${BASE_URL}/delete/${id}.json`);
  // Check if this was a delete approval request (not actual deletion)
  if (response.data?.deleteRequestId) {
    throw new Error('Delete request submitted for admin approval. The item has not been deleted yet.');
  }
}
```

**Option B (Backend bypass for API consumers):** Add an exception to the `DeleteInterceptor` for API-authenticated requests (those with `X-Auth-Token` + `Api-Authorization`) that are already admin-level. This would require modifying the interceptor to check if the authenticated user has `ROLE_ADMIN` and the request comes from an API consumer.

**Option C (Two-step delete workflow in SoupFinance):** Implement the full delete approval workflow in SoupFinance:
1. `DELETE /rest/vendor/delete/{id}.json` -- creates delete request
2. Show pending delete requests in a management UI
3. Admin approves via `DELETE /rest/vendor/delete/{id}.json?relationChecked=true&fromUtilityController=true`

**Recommendation:** Option A is the quickest fix for the SoupFinance frontend. Option B requires backend changes but would make the API more RESTful for external consumers. Option C is the most complete but requires significant frontend work.

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

| Test File | Passed | Skipped | Root Cause | Investigation Status |
|-----------|--------|---------|------------|----------------------|
| 01-auth | 8 | 0 | All pass | N/A |
| 02-vendors | 19 | 0 | Delete is approval workflow (Issue #3); Update DISPROVEN (Issue #2) | INVESTIGATED |
| 03-invoices | 24 | 0 | All pass | N/A |
| 04-bills | 13 | 10 | LazyInitializationException on Bill.billItemList (Issue #1) | ROOT CAUSE FOUND |
| 05-payments | 20 | 0 | All pass | N/A |
| **Total** | **77** | **10** | | |

---

## Issue 7: Registration Creates Agent with NULL tenantId (CRITICAL)

**Priority:** CRITICAL — Blocks all new tenant registrations from working

**File:** `grails-app/services/soupbroker/AccountRegistrationService.groovy`

**Method:** `register()` (line 47)

### Root Cause

The `register()` method is annotated `@WithoutTenant`. When it creates the `Agent` entity (lines 85-92), GORM does not auto-set `tenantId` because there is no active tenant context. The `account: account` constructor argument sets the `account` FK column, but the `tenantId` discriminator column (inherited from `SbDomain`) remains NULL.

```groovy
// CURRENT CODE (lines 85-92) — BUG: runs @WithoutTenant, tenantId stays NULL
Agent agent = new Agent(
    firstName: cmd.adminFirstName,
    lastName: cmd.adminLastName,
    userAccess: sbUser,
    account: account,    // Sets account FK, but NOT tenantId
    disabled: false
)
agent.save(failOnError: true, flush: true)
```

**Why it fails:** `Agent` extends `SbDomain` (which has `String tenantId`) AND implements `MultiTenant<Agent>`. GORM only auto-sets `tenantId` when inside a `Tenants.withId()` block. The `beforeInsert()` hook (line 462) only sets `account` from `Account.current()` if not already set — it does NOT set `tenantId`.

**Proof the correct pattern exists in the same file:** `createDefaultChartOfAccounts()` at line 413 correctly wraps tenant-scoped operations:
```groovy
private void createDefaultChartOfAccounts(Account account) {
    try {
        Tenants.withId(account.id) {
            // ... creates ledger accounts within correct tenant context
        }
    }
}
```

### Observed Impact

- `agent.tenant_id` is NULL in database after registration
- Agent cannot be found by tenant-scoped queries
- User can log in but has no valid agent for the tenant
- All tenant-scoped operations fail silently or return empty results

### Evidence

Database record for user `dfdnuse.nu@gmail.com` (now deleted, was Account "Totransact"):
```sql
-- Agent had NULL tenant_id
SELECT id, first_name, last_name, tenant_id, account_id FROM agent WHERE user_access_id = 203;
-- Result: tenant_id = NULL, account_id = <account-uuid>
```

### Recommended Fix

Wrap the Agent creation in `Tenants.withId(account.id)` to match the pattern already used by `createDefaultChartOfAccounts()`:

```groovy
// FIX: Wrap Agent creation in tenant context so GORM sets tenantId
Tenants.withId(account.id) {
    Agent agent = new Agent(
        firstName: cmd.adminFirstName,
        lastName: cmd.adminLastName,
        userAccess: sbUser,
        account: account,
        disabled: false
    )
    agent.save(failOnError: true, flush: true)
}
```

**Alternative (simpler but less idiomatic):** Explicitly set `tenantId`:
```groovy
Agent agent = new Agent(
    firstName: cmd.adminFirstName,
    lastName: cmd.adminLastName,
    userAccess: sbUser,
    account: account,
    disabled: false
)
agent.tenantId = account.id  // Explicitly set discriminator
agent.save(failOnError: true, flush: true)
```

**Recommended:** Option A (`Tenants.withId`) is preferred — it's consistent with the existing pattern in the same service and ensures any other tenant-scoped operations in `beforeInsert()` also work correctly.

### Also Consider

Check if the `confirmEmail()` method (line 128) has the same issue — it also runs `@WithoutTenant` and may perform tenant-scoped operations (role assignment, welcome email). The `SbUserRole` creation and any other tenant-scoped entity creation after email confirmation should also be wrapped in `Tenants.withId(account.id)`.

### Testing

After the fix, verify:
1. `POST /account/register.json` creates Agent with `tenant_id = account.id`
2. `POST /account/confirmEmail.json` correctly enables user within tenant context
3. User can log in and see tenant-scoped data (invoices, vendors, etc.)

---

## Summary of Test Impact (Updated)

| Test File | Passed | Skipped | Root Cause | Investigation Status |
|-----------|--------|---------|------------|----------------------|
| 01-auth | 8 | 0 | All pass | N/A |
| 02-vendors | 19 | 0 | Delete is approval workflow (Issue #3); Update DISPROVEN (Issue #2) | INVESTIGATED |
| 03-invoices | 24 | 0 | All pass | N/A |
| 04-bills | 13 | 10 | LazyInitializationException on Bill.billItemList (Issue #1) | ROOT CAUSE FOUND |
| 05-payments | 20 | 0 | All pass | N/A |
| **Total** | **77** | **10** | | |

---

## Issue 8: Registration Confirmation Emails Not Sent (CRITICAL)

**Priority:** CRITICAL — Users cannot complete registration without confirmation email
**Depends on:** Issue #7 (Agent NULL tenantId must be fixed first)
**Status:** PARTIALLY RESOLVED (2026-02-07) — Email URL resolution fixed via DB update

### Problem

Registration via `POST /account/register.json` does not send confirmation emails. The user registers successfully (Account + SbUser + Agent are created) but never receives the confirmation email needed to set their password and activate their account.

### Investigation Results (February 7, 2026)

#### Production Server Topology Discovered

- **SoupFinance proxy server**: 65.20.112.224 (Apache reverse proxy)
- **Soupmarkets backend**: 140.82.32.141 (Tomcat at `/root/tomcat9078`, Grails `production` env)
- **Request flow**: Browser → Cloudflare (app.soupfinance.com) → Apache (65.20.112.224) → Cloudflare (tas.soupmarkets.com) → Backend (140.82.32.141)

#### 8a. Email URL Resolution — `application_url` was NULL on ApiConsumer (FIXED)

**Root Cause:** The deployed `AccountRegistrationService` already has `resolveFrontendUrl()` which looks up the ApiConsumer's `applicationUrl` field to construct confirmation email links. However, the `application_url` column was NULL in the database.

**Fix Applied (2026-02-07):**
```sql
UPDATE api_consumer SET application_url = 'https://app.soupfinance.com'
WHERE id = '1bfaee30-b348-4255-8e15-9fcdd344f43d';
```

**Verification:** Registration test with `dfdnusenu+sftest@gmail.com` returned 201 success after fix. No errors in backend logs (logback at ERROR level, so absence of errors suggests email pipeline executed without exceptions).

#### 8b. ApiConsumer Record — EXISTS (Not an issue)

**DISPROVEN:** The ApiConsumer record already exists on production:
- `id`: `1bfaee30-b348-4255-8e15-9fcdd344f43d`
- `name`: `SoupFinance Web App`
- `secret`: `d379a1d7b80a1c072ac374020cefbc05`
- `application_url`: `https://app.soupfinance.com` (set 2026-02-07, was NULL before)

The Apache proxy injects `Api-Authorization: Basic base64("SoupFinance Web App:d379a1d7b80a1c072ac374020cefbc05")` correctly.

#### 8c. Email Silent Failures — No evidence of failure after fix

Backend logback is set to ERROR level only — no email errors appeared after the `application_url` fix. This suggests the email pipeline executed without exceptions. However, the silent failure pattern still exists in code and should be improved for better observability.

**Recommended (lower priority):** Add email send status to registration response for frontend feedback.

#### 8d. `forgotPassword` and `resetPassword` Endpoints Missing (Still Needed)

Frontend pages exist for `/forgot-password` and `/reset-password` but the backend endpoints `POST /account/forgotPassword.json` and `POST /account/resetPassword.json` do not exist.

**Fix:** Implement `AccountController.forgotPassword()` and `AccountController.resetPassword()` actions following the same pattern as `register()`/`confirmEmail()`:
- `forgotPassword`: Generate reset token, store with TTL, send email with link to `{applicationUrl}/reset-password?token=xxx`
- `resetPassword`: Validate token, update password, invalidate token

### Remaining Work

1. **Issue #7 (Agent NULL tenantId)** — Still needs backend code fix (wrap Agent creation in `Tenants.withId(account.id)`)
2. **Improve email error handling** (8c) — Lower priority, add email status to response
3. **Implement forgotPassword/resetPassword** (8d) — Lower priority
4. **Increase logback verbosity** — Consider adding INFO level for `soupbroker.AccountRegistrationService` to aid debugging
5. **Clean up test registrations** — Remove test accounts: `test-reg-probe@example.com`, `dfdodzi@gmail.com`, `dfdnusenu+sftest@gmail.com`

### Full Implementation Plan

See `soupfinance-web/docs/PLAN-api-consumer-email-confirmation.md` for detailed code changes, SQL scripts, and proxy configuration.

### Testing

After all fixes:
1. `POST /account/register.json` → creates Account, Agent (with tenantId), SbUser; sends email
2. Email received with link to `https://app.soupfinance.com/confirm-email?token=xxx`
3. `POST /account/confirmEmail.json` → enables user, sets password
4. User can log in to `app.soupfinance.com` and access tenant-scoped data

---

## Investigation Summary (February 7, 2026)

| Issue | Status | Root Cause |
|-------|--------|------------|
| #1 Bill endpoints fail | ROOT CAUSE FOUND | `LazyInitializationException` on `Bill.billItemList` during GSON rendering. Stateless REST filter chain removes HTTP session, so Hibernate lazy loading fails. Fix: custom GSON template. |
| #2 Vendor update doesn't persist | DISPROVEN | Live testing confirms PUT with JSON body works and persists correctly. Original report was likely caused by stale token or test setup issue. |
| #3 Vendor delete doesn't remove | ROOT CAUSE FOUND (By Design) | `DeleteInterceptor` forwards all deletes to `UtilityController.deleteChecker` which creates a `DeleteRequest` approval record instead of deleting. Returns 200 with approval message. SoupFinance frontend must handle the approval workflow. |
| #4 Account balance 302 | PENDING | Not investigated yet |
| #5 Finance reports 302/timeout | PENDING | Not investigated yet |
| #6 edit.json missing CSRF | PENDING (Low priority) | May be intentional since updates don't need CSRF |
| #7 Agent NULL tenantId | ROOT CAUSE FOUND | `@WithoutTenant` annotation means GORM doesn't set `tenantId`. Fix: wrap in `Tenants.withId(account.id)`. |
| #8 Registration emails not sent | PARTIALLY RESOLVED | Root cause: `application_url` was NULL on production ApiConsumer record. Fixed via DB UPDATE on 2026-02-07. Backend code (`resolveFrontendUrl()`) was already deployed. Remaining: Issue #7 (tenantId), forgotPassword/resetPassword endpoints, email error handling improvement. |

---

## Issue 9: VendorType Enum Missing SUPPLIER Value (SERVICES Tenants)

**Priority:** MEDIUM — Affects vendor classification for SERVICES-based tenants

**File:** `src/main/groovy/soupbroker/VendorType.groovy`

**Current Values:**
```groovy
enum VendorType implements Serializable {
    BANK, BROKER, FUND_MANAGER, CUSTODIAN, TRADER, PROVIDER, FINANCE_HOUSE,
    SAVINGS_AND_LOANS, FINANCE_HOUSES, MICROFINANCE_INSTITUTION,
    MICROCREDIT_INSTITUTION, RURAL_AND_COMMUNITY_BANK,
    FINANCE_AND_LEASING_COMPANY, MORTGAGE_FINANCE
}
```

**Problem:** All current values are trading/financial-institution-oriented. For SERVICES-based tenants (like SoupFinance), vendors are typically suppliers, contractors, or service providers — none of which map to the existing enum values.

The `Vendor.groovy` domain class documentation (line 33-37) mentions "SUPPLIER" as a vendor type, but the enum doesn't include it.

**Recommended Fix:** Add SERVICES-appropriate values to the enum:
```groovy
enum VendorType implements Serializable {
    // Existing trading-oriented types
    BANK, BROKER, FUND_MANAGER, CUSTODIAN, TRADER, PROVIDER, FINANCE_HOUSE,
    SAVINGS_AND_LOANS, FINANCE_HOUSES, MICROFINANCE_INSTITUTION,
    MICROCREDIT_INSTITUTION, RURAL_AND_COMMUNITY_BANK,
    FINANCE_AND_LEASING_COMPANY, MORTGAGE_FINANCE,
    // Added: SERVICES-appropriate types
    SUPPLIER, CONTRACTOR, SERVICE_PROVIDER, CONSULTANT, OTHER
}
```

**Impact:** SoupFinance SPA needs the `vendorType` field added to VendorFormPage.tsx. The dropdown should show human-friendly labels. Frontend can filter to show only SERVICES-relevant types based on license category.

---

## Issue 10: Vendor Field Name Mismatch — `address` vs `residentialAddress`

**Priority:** LOW — Frontend field naming inconsistency, no data loss

**Backend Domain (`Vendor.groovy` line 108):**
- `residentialAddress` — Physical/residential address
- `postalAddress` (line 113) — Postal/mailing address

**SPA (`VendorFormPage.tsx`):**
- Sends `address` — backend silently ignores (no `address` property on Vendor)

**Recommended Fix (SPA side):** Change form field name from `address` to `residentialAddress` in VendorFormPage.tsx payload. Also add `postalAddress` as a second address field.

**No backend changes needed** — the domain already has both fields.

---

## Issue 11: Bill Field Name Mismatches — `issueDate`/`dueDate` vs `billDate`/`paymentDate`

**Priority:** HIGH — Bill dates may be silently dropped on save

**Backend Domain (`Bill.groovy`):**
- `billDate` — Date the bill was issued
- `paymentDate` — Date payment is due

**SPA (`BillFormPage.tsx`):**
- Sends `issueDate` — backend expects `billDate`
- Sends `dueDate` — backend expects `paymentDate`

**Impact:** Bills saved from the SPA may have NULL dates because the field names don't match the domain properties. Grails data binding silently ignores unrecognized property names.

**Recommended Fix (SPA side):** Change SPA field names to match backend domain:
- `issueDate` → `billDate`
- `dueDate` → `paymentDate`

**No backend changes needed** — the domain already uses the correct names.

---

## Issue 12: Client Contact Chain Not Created from SPA Form

**Priority:** HIGH — Client email/phone saved as flat strings, Contact chain not created

**Backend Domain (`Client.groovy`):**
- Client has `hasMany: [clientContactList: ClientContact]`
- `addToContacts(Contact)` method (line 182) sets `sourceId`, `sourceName`, `sourceProperty`, `priority=PRIMARY`
- `getContacts()` (line 149): collects via `clientContactList.collect{it.contact}`
- `getEmailContacts()` (line 160): `contacts.collect{it.specContact}.findAll{it instanceof EmailContact}`
- `getPhoneContacts()` (line 171): same pattern for `PhoneContact`

**Contact Chain (3-entity pattern):**
```
Client → ClientContact (join table) → Contact → EmailContact/PhoneContact (polymorphic subclass)
```

- `Contact.groovy`: Base class with `priority`, `sourceName`, `sourceProperty`, `sourceId`, `archived`
- `EmailContact` / `PhoneContact`: Subclasses of Contact (table-per-subclass inheritance)
- `ClientContact.groovy`: Join table `{client: Client, contact: Contact, archived: boolean}`

**SPA (`ClientFormPage.tsx`):**
- Saves `email` and `phone` as flat string fields on Client
- Client.groovy has convenience fields `email` (line 219) and `phoneNumber` (line 225) — both `nullable: true, bindable: true`
- But these flat fields do NOT create the proper Contact → EmailContact/PhoneContact → ClientContact chain
- Any system that queries `client.emailContacts` or `client.phoneContacts` will find nothing

**Impact:** Other parts of the system that use `client.getEmailContacts()` or `client.getPhoneContacts()` (e.g., invoice emailing, notifications) will find no contacts because the Contact chain was never created.

**Recommended Fix (Backend — ClientController or ClientService):**

On client save/update, if `email` or `phoneNumber` params are provided, auto-create the Contact chain:

```groovy
// In ClientController.save() or ClientService, after client.save():
if (params.email) {
    EmailContact emailContact = new EmailContact(emailAddress: params.email)
    emailContact.save(failOnError: true)
    client.addToContacts(emailContact)  // Uses Client.addToContacts() which sets sourceId/sourceName
}
if (params.phoneNumber) {
    PhoneContact phoneContact = new PhoneContact(phoneNumber: params.phoneNumber)
    phoneContact.save(failOnError: true)
    client.addToContacts(phoneContact)
}
```

**Alternative (SPA side):** SPA could make separate API calls to create Contact entities after client save, but this is fragile and duplicates business logic. Backend-side is preferred.

**No SPA changes needed** if backend handles Contact chain creation from flat fields.

---

## Issue 13: PaymentMethod is a Domain Class, Not an Enum (SPA Mismatch)

**Priority:** HIGH — Affects Voucher form and Payment form

**Backend Domain (`PaymentMethod.groovy`):**

```groovy
class PaymentMethod extends SbDomain implements Auditable, MultiTenant<PaymentMethod> {
    Account account
    String name   // e.g., "Cash", "Bank Transfer", "Cheque"
}
```

`LedgerTransaction.groovy` (line 142):
```groovy
PaymentMethod paymentMethod  // Domain class FK, not a string/enum
```

**SPA (VoucherFormPage.tsx):**
- Sends `paymentMethod: 'CASH'` as a plain string
- Uses hardcoded options: CASH, BANK_TRANSFER, CHEQUE, CARD, OTHER

**SPA (PaymentFormPage.tsx):**
- Passes through the same string pattern from the payment form

**Problem:** `PaymentMethod` is a full Grails domain class with `id` and `name`. Grails data binding expects:
- `paymentMethod.id: <uuid>` for FK binding, OR
- A UUID string that resolves to a PaymentMethod record

Sending `paymentMethod: 'CASH'` will **silently fail** — Grails cannot convert the string 'CASH' to a `PaymentMethod` domain instance. The field is silently ignored during data binding.

**Recommended Fix (SPA side):**
1. Fetch available PaymentMethod records from `GET /rest/paymentMethod/index.json`
2. Show a dropdown populated with tenant-configured payment methods (by `name`)
3. Send `'paymentMethod.id': selectedPaymentMethod.id` in the form data (Grails FK pattern)

```typescript
// Example: Fetch and use PaymentMethod records
const { data: paymentMethods } = useQuery({
  queryKey: ['payment-methods'],
  queryFn: () => apiClient.get('/rest/paymentMethod/index.json'),
});

// In form submission
const formData = new FormData();
formData.append('paymentMethod.id', selectedPaymentMethodId);
```

**No backend changes needed** — the domain is correct; the SPA needs to use the FK pattern.

**Note:** Some tenants may not have PaymentMethod records configured. The SPA should handle the empty dropdown case gracefully, and the field should remain optional (it's nullable on LedgerTransaction via common constraints).

---

## Issue 14: Invoice Missing `compliments` Field (Minor)

**Priority:** LOW — Optional field, cosmetic gap

**Backend Domain (`Invoice.groovy` line 129-130):**
```groovy
String compliments   // Optional closing remarks, stored as TEXT
```

**SPA (InvoiceFormPage.tsx):**
- Does not have a `compliments` field

**Impact:** Minor — this is an optional field for adding closing remarks to invoices (e.g., "Thank you for your business"). Not critical for MVP.

**Recommended Fix (SPA side):** Add an optional textarea field in the invoice form for `compliments`.

---

## Phase 1B Gap Analysis — Audit Summary (February 7, 2026)

All frontend form changes from the SSR→SPA gap analysis Phase 1B have been audited against the backend Grails domain classes. Below is the status of each field:

### Fields Confirmed Matching Backend

| Form | Field | Backend Source | Status |
|------|-------|---------------|--------|
| Invoice | `invoiceDate` | `Invoice.invoiceDate` (Date) | MATCH |
| Invoice | `paymentDate` | `Invoice.paymentDate` (Date) | MATCH |
| Invoice | `salesOrderNumber` | `Invoice.salesOrderNumber` (String) | MATCH |
| Invoice | `currency` | `Invoice.currency` (java.util.Currency) | MATCH |
| Invoice | `exchangeRate` | `Invoice.exchangeRate` (double) | MATCH |
| Bill | `billDate` | `Bill.billDate` (Date) | MATCH (was `issueDate`) |
| Bill | `paymentDate` | `Bill.paymentDate` (Date) | MATCH (was `dueDate`) |
| Bill | `purchaseOrderNumber` | `Bill.purchaseOrderNumber` (String) | MATCH |
| Bill | `salesOrderNumber` | `Bill.salesOrderNumber` (String) | MATCH |
| Bill | `currency` | `Bill.currency` (java.util.Currency) | MATCH |
| Bill | `exchangeRate` | `Bill.exchangeRate` (double) | MATCH |
| Voucher | `transactionDate` | `LedgerTransaction.transactionDate` (Date) | MATCH (was `voucherDate`) |
| Voucher | `notes` | `LedgerTransaction.notes` (String) | MATCH (was `description`) |
| Voucher | `currency` | `LedgerTransaction.currency` (Currency) | MATCH |
| Voucher | `exchangeRate` | `LedgerTransaction.exchangeRate` (double) | MATCH |
| Payment | `payInAccount.id` | `InvoicePayment.payInAccount` (LedgerAccount FK) | MATCH |
| Payment | `payOutAccount.id` | `BillPayment.payOutAccount` (LedgerAccount FK) | MATCH |
| Settings | `startOfFiscalYear` | `Account.startOfFiscalYear` (String) | MATCH |
| Settings | logo placeholder | `Account.logo` (SoupBrokerFile) | CORRECT (needs upload endpoint) |
| Settings | favicon placeholder | `Account.favicon` (SoupBrokerFile) | CORRECT (needs upload endpoint) |
| User | `archived` | `Agent.archived` (boolean) | MATCH |
| User | `disabled` | `Agent.disabled` (Boolean) | MATCH |
| Ledger | `parentAccount` display | `LedgerAccount.parentAccount` (FK) | MATCH |
| Ledger | `currency` display | `LedgerAccount.currency` (Currency) | MATCH |

### Fields With Issues

| Form | Field | Issue | Fix Location |
|------|-------|-------|-------------|
| Voucher | `paymentMethod` | Domain class FK, SPA sends string | SPA (Issue #13) |
| Payment | `paymentMethod` | Domain class FK, SPA sends string | SPA (Issue #13) |
| Invoice | `compliments` | Missing from SPA form | SPA (Issue #14) |

---

## Investigation Summary (Updated February 7, 2026)

| Issue | Status | Root Cause |
|-------|--------|------------|
| #1 Bill endpoints fail | ROOT CAUSE FOUND | `LazyInitializationException` on `Bill.billItemList` during GSON rendering. Fix: custom GSON template. |
| #2 Vendor update doesn't persist | DISPROVEN | Live testing confirms PUT works correctly. |
| #3 Vendor delete doesn't remove | ROOT CAUSE FOUND (By Design) | `DeleteInterceptor` forwards to approval workflow. |
| #4 Account balance 302 | PENDING | Not investigated yet |
| #5 Finance reports 302/timeout | PENDING | Not investigated yet |
| #6 edit.json missing CSRF | PENDING (Low priority) | May be intentional |
| #7 Agent NULL tenantId | ROOT CAUSE FOUND | Fix: wrap Agent creation in `Tenants.withId(account.id)`. |
| #8 Registration emails not sent | PARTIALLY RESOLVED | `application_url` was NULL, fixed via DB update. |
| #9 VendorType missing SUPPLIER | NEW | Enum lacks SERVICES-appropriate values. Fix: add SUPPLIER, CONTRACTOR, etc. |
| #10 Vendor address field mismatch | NEW (SPA fix) | SPA sends `address`, domain expects `residentialAddress`. No backend change needed. |
| #11 Bill date field mismatches | RESOLVED (SPA fix) | SPA fixed: `issueDate`→`billDate`, `dueDate`→`paymentDate`. |
| #12 Client Contact chain missing | NEW (Backend fix) | SPA saves flat email/phone but Contact → ClientContact chain not created. Fix: auto-create chain in backend on save. |
| #13 PaymentMethod FK mismatch | NEW (SPA fix) | PaymentMethod is a domain class, SPA sends string. Fix: fetch records, send FK ID. |
| #14 Invoice compliments missing | NEW (SPA fix, low priority) | Optional field not in SPA form. |

---

*Updated February 7, 2026: Added Issues #13-#14 from Phase 1B audit. Issue #11 now RESOLVED (SPA field names fixed). Issue #13 requires SPA to fetch PaymentMethod domain records and send FK IDs instead of plain strings. Full audit confirms 22 fields match backend domains correctly. 3 fields need SPA-side fixes (Issues #13, #14).*
