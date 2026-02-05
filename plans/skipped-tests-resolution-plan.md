# Skipped Tests Resolution Plan

> Generated: 2026-02-05
> Updated: 2026-02-05
> Status: **ALL 4 E2E skips FIXED** (350/350 pass, 0 skip), 7 integration skips require backend work

## Summary

| Category | Skipped | Fixed | Remaining | Owner |
|----------|---------|-------|-----------|-------|
| E2E (mock) tests | 4 | **4** | **0** | Frontend |
| Integration (LXC) tests | 7 | 0 | 7 | Backend |
| **Total** | **11** | **4** | **7** | |

---

## FIXED (Frontend)

### 1. Login button loading state test (`auth.spec.ts:106`)

**Was:** `test.skip('login button shows loading state while submitting')`
**Root cause:** `PublicRoute` checked `!isInitialized || isLoading`, which unmounted the entire login form (replacing it with a "Loading..." spinner) when `authStore.login()` set `isLoading: true`. The button's "Signing in..." text was never visible because the form was removed from the DOM.
**Fix:** Changed `PublicRoute` to only check `!isInitialized` (not `|| isLoading`). The `isInitialized` flag already covers token validation on page load since it stays `false` until `initialize()` completes. The login form now manages its own loading state without being unmounted.
**Files changed:** `src/App.tsx` (PublicRoute)

### 2. Logout redirect test (`auth.spec.ts:238`)

**Was:** `test.skip('logout redirects to login page')`
**Root cause:** The test used `addInitScript()` to inject auth state into localStorage, then clicked logout, then used `page.goto('/dashboard')` to verify the redirect. But `addInitScript` re-fires on every navigation (including the post-logout navigation), re-setting the auth data and making the user appear still authenticated.
**Fix:** Replaced `addInitScript` approach with actual UI login flow (fill form, click submit, verify dashboard, click logout, verify redirect). This tests the real logout path and avoids the `addInitScript` persistence issue.
**Files changed:** `e2e/auth.spec.ts` (logout test)

---

## FIXED: Frontend Feature Gaps (2 skips → both fixed)

### 3. Forgot password link (`auth.spec.ts:70`) ✅ FIXED

**Was:** `test.skip('login page shows forgot password link')`
**Root cause:** LoginPage had no "Forgot password?" link or password reset flow.
**Fix:** Full frontend implementation:
- Added "Forgot password?" link to `LoginPage.tsx` with `data-testid="login-forgot-password-link"`
- Created `ForgotPasswordPage.tsx` at `/forgot-password` (email input form with cooldown)
- Created `ResetPasswordPage.tsx` at `/reset-password` (new password form with token from URL)
- Added routes in `App.tsx` for both pages
- Added API functions `forgotPassword()` and `resetPassword()` in `registration.ts`
- Added i18n keys (`forgotPassword` + `resetPassword` sections) in all 4 locales (en, de, fr, nl)
**Files changed:** `LoginPage.tsx`, `ForgotPasswordPage.tsx` (new), `ResetPasswordPage.tsx` (new), `App.tsx`, `registration.ts`, `auth.json` (en/de/fr/nl)

**Backend work still needed:**
- Implement `POST /account/forgotPassword.json` endpoint (sends reset email with token)
- Implement `POST /account/resetPassword.json` endpoint (validates token, updates password)
- Email template for password reset link

### 4. Journal entry edit mode (`accounting.spec.ts:669`) ✅ FIXED

**Was:** `test.skip('loads existing entry data for editing')`
**Root cause:** `JournalEntryPage.tsx` ignored the `:id` URL param.
**Fix:** Added full edit mode support:
1. Added `useParams()` to read `:id` from URL
2. Added `useQuery` with `getTransactionGroup(id)` to fetch existing data
3. Added `useEffect` to populate `react-hook-form` via `reset()` when data loads
4. Added `updateJournalEntry()` API function in `ledger.ts` with CSRF token support
5. Submit handler switches between create/update based on mode
6. Posted/reversed entries show read-only view with lock banner
7. Dynamic heading: "Edit Journal Entry" vs "New Journal Entry"
**Files changed:** `JournalEntryPage.tsx`, `ledger.ts` (added `updateJournalEntry`), `accounting.spec.ts`

---

## REMAINING: Backend Issues (7 integration test skips)

### Category A: Missing Bill REST Controller (3 skips)

**Affected tests:**
- `api-health.integration.spec.ts:75` — `GET /rest/bill/index.json` (302 redirect)
- `bills.integration.spec.ts:87` — `GET /rest/bill/index.json` (302 redirect)
- `bills.integration.spec.ts:114` — Bill CRUD flow (save.json 302 redirect)
- `bills.integration.spec.ts:203` — Bill payment recording (cascading from above)

**Root cause:** The `BillController` either doesn't exist or lacks REST actions. All requests to `/rest/bill/*.json` return `302` redirect to `https://localhost:9090/rest/show/index` (the generic Grails catch-all), indicating no URL mapping matches the bill REST pattern.

**Evidence from integration test logs:**
```
Bill list status: 302
Bill endpoint not available in this backend (redirects to generic show)
Create bill status: 302
Bill save endpoint not available (redirects)
```

**Backend resolution:**

Option A — `@Resource` annotation (quickest):
```groovy
// In Bill.groovy domain class
import grails.rest.Resource

@Resource(uri='/rest/bill', formats=['json'])
class Bill {
    // existing fields...
}
```

Option B — Explicit controller (more control, recommended):
```groovy
// grails-app/controllers/soupbroker/finance/BillController.groovy
package soupbroker.finance

import grails.rest.RestfulController

class BillController extends RestfulController<Bill> {
    static responseFormats = ['json']

    BillController() {
        super(Bill)
    }

    // Override save() to always return JSON (not redirect)
    // See: https://github.com/apache/grails-core/issues/15172
    @Override
    def save() {
        def instance = createResource()
        instance.validate()
        if (instance.hasErrors()) {
            transactionStatus.setRollbackOnly()
            respond instance.errors, view: 'create'
            return
        }
        saveResource(instance)
        respond instance, [status: CREATED, view: 'show']
    }
}
```

URL mapping (if not using `@Resource`):
```groovy
// UrlMappings.groovy
"/rest/bill"(resources: "bill")
```

**Important:** The default `RestfulController.save()` uses `request.withFormat { form multipartForm { redirect... } }` which returns 302 for `application/x-www-form-urlencoded` requests. The `save()` override is necessary to always return JSON. See [Grails issue #15172](https://github.com/apache/grails-core/issues/15172).

**Effort:** ~0.5 day backend

### Category B: LedgerAccount Save Redirect (1 skip)

**Affected test:**
- `ledger.integration.spec.ts:92` — Ledger account CRUD flow

**Root cause:** `POST /rest/ledgerAccount/save.json` returns `302` redirect to `create.json?name=TestAcct&...`. This is the Grails `withForm` CSRF protection redirect. When a `save` action receives form-encoded data WITHOUT the `SYNCHRONIZER_TOKEN`, the `withForm { }.invalidToken { }` block fires and redirects back to the create form.

**Evidence:**
```
Create ledger account status: 302
Redirect: https://localhost:9090/ledgerAccount/create.json?name=TestAcct&accountNumber=T001
```

**Backend resolution options:**

Option 1 — Frontend test fix (include CSRF token):
The integration test should first `GET /rest/ledgerAccount/create.json` to obtain the CSRF token, then include `SYNCHRONIZER_TOKEN` and `SYNCHRONIZER_URI` in the save request body. This matches the real application flow.

Option 2 — Backend: Add JSON-specific save path:
Override the `save` action to bypass `withForm` for JSON requests:
```groovy
def save() {
    if (request.format == 'json') {
        // JSON API path - no CSRF needed (token auth is sufficient)
        def instance = createResource(params)
        instance.validate()
        if (instance.hasErrors()) {
            respond instance.errors
            return
        }
        saveResource(instance)
        respond instance, [status: CREATED]
    } else {
        // Form path - standard withForm CSRF
        super.save()
    }
}
```

Option 3 — Backend: Disable CSRF for REST API:
In Spring Security configuration, exempt `/rest/**` from CSRF since these requests are authenticated via `X-Auth-Token` (stateless).

**Recommendation:** Option 1 (fix test to include CSRF) is most consistent with the existing app behavior. The frontend already does this via `getCsrfToken()`.

**Effort:** ~0.5 day (test fix) or ~1 day (backend change)

### Category C: Slow Report Queries (2 skips)

**Affected tests:**
- `api-health.integration.spec.ts:146` — `GET /rest/financeReports/trialBalance.json` (>60s timeout)
- `reports.integration.spec.ts:247` — `GET /rest/financeReports/accountBalances.json` (>60s timeout)

**Root cause:** Both report endpoints execute complex database queries that aggregate ledger transactions across all accounts and date ranges. With the test dataset size, these queries take >60 seconds, exceeding Playwright's test timeout.

**Evidence:**
```
// api-health test
Trial balance endpoint is extremely slow (>60s) - skip this test

// reports test
Account balances endpoint can be very slow (>60s) - skip this test
```

**Backend resolution (performance optimization):**

1. **Use SQL projections instead of full object materialization:**
   ```groovy
   // Instead of loading all LedgerTransaction objects:
   def results = LedgerTransaction.createCriteria().list {
       projections {
           groupProperty('ledgerAccount')
           sum('debitAmount')
           sum('creditAmount')
       }
       between('transactionDate', fromDate, toDate)
   }
   ```

2. **Mark report service methods as read-only:**
   ```groovy
   @Transactional(readOnly = true)
   def generateTrialBalance(Date from, Date to) { ... }
   ```
   This disables Hibernate dirty-checking overhead ([Grails performance guide](http://grails.github.io/grails-howtos/en/performanceTuning.html)).

3. **Add database indexes:**
   ```sql
   CREATE INDEX idx_ledger_txn_date ON ledger_transaction(transaction_date);
   CREATE INDEX idx_ledger_txn_account_date ON ledger_transaction(ledger_account_id, transaction_date);
   ```

4. **Consider native SQL for complex aggregations:**
   Use `groovy.sql.Sql` or HQL directly instead of GORM criteria for aggregate financial reports. See [GORM performance tuning](https://schneide.blog/2013/08/12/grails-gorm-performance-tuning-tips/).

5. **Add caching for reports:**
   Trial balance data doesn't change between requests for the same date range. Use Grails cache plugin or Spring `@Cacheable` with a short TTL.

6. **Enable SQL logging to diagnose:**
   ```yaml
   # application.yml
   dataSource:
       logSql: true
       formatSql: true
   ```
   Check for N+1 queries — common in GORM when loading collections via `hasMany` relationships. See [GORM Hibernate manual](https://gorm.grails.org/latest/hibernate/manual/index.html).

**Target:** Reduce query time from >60s to <5s so tests can run within normal timeouts.

**Effort:** ~2-3 days backend (profile, index, optimize queries)

---

## Resolution Priority (Remaining Backend Work)

| Priority | Item | Owner | Effort | Impact |
|----------|------|-------|--------|--------|
| **P1** | Bill REST controller | Backend | 0.5d | Unblocks 3 integration tests |
| ~~P1~~ | ~~LedgerAccount CSRF in test~~ | ~~Frontend~~ | ~~0.5d~~ | ✅ DONE |
| **P2** | Trial balance / account balances perf | Backend | 2-3d | Unblocks 2 integration tests + user-facing |
| ~~P2~~ | ~~Journal entry edit mode~~ | ~~Frontend~~ | ~~1d~~ | ✅ DONE |
| **P3** | Forgot password backend endpoints | Backend | 1d | Completes forgot password feature (frontend done) |

## Sources

- [Grails RestfulController redirect issue #15172](https://github.com/apache/grails-core/issues/15172)
- [Grails REST documentation (v6)](https://docs.grails.org/6.1.1/guide/REST.html)
- [Grails performance tuning guide](http://grails.github.io/grails-howtos/en/performanceTuning.html)
- [GORM performance tuning tips](https://schneide.blog/2013/08/12/grails-gorm-performance-tuning-tips/)
- [GORM Hibernate manual](https://gorm.grails.org/latest/hibernate/manual/index.html)
- [Playwright best practices](https://playwright.dev/docs/best-practices)
- [Avoiding flaky Playwright tests](https://betterstack.com/community/guides/testing/avoid-flaky-playwright-tests/)
- [Zustand persist middleware](https://zustand.docs.pmnd.rs/middlewares/persist)
- [Playwright authentication guide](https://playwright.dev/docs/auth)
