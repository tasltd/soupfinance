# Enable Ledger & Accounting Modules for SoupFinance Tenants

**Issue:** SOUPFIN-9 — Ledger and Accounting modules entirely blocked — 403 Forbidden on all data lookups.
**Origin:** Frontend fix for the UX side shipped on the `feature/auto-fix-request-soupfin-9-issue-ledger-an` branch. This document describes the backend work that the soupmarkets-web team must complete to fully resolve the issue.

---

## Context

Production user `johndoe@souptest.com` (test tenant) cannot use any Ledger or Accounting page:

| Endpoint | Status | Notes |
|----------|--------|-------|
| `GET /rest/ledgerAccount/index.json` | 403 | Chart of Accounts |
| `GET /rest/ledgerTransaction/index.json` | 403 | Ledger Transactions |
| `GET /rest/ledgerTransactionGroup/index.json` | 403 | Transaction Register list + Export |
| `GET /rest/voucher/index.json` | 403 | Voucher list, Transaction Register, Export |
| `GET /rest/paymentMethod/index.json` | 403 | Voucher form payment-method dropdown |

The backend response body is the standard 403 — no actionable message — so frontend has historically displayed "Request failed with status code 403".

### Frontend Mitigation Already Shipped

`src/api/errors.ts` now recognises 403 on these endpoints and renders a "Ledger module is not available" / "Accounting module is not available" card with a "Contact your administrator" hint. The Export button shows a toast, the Journal Entry and Voucher forms show a `ModuleDisabledBanner`, and `useQuery` stops retrying 403/401 errors so it does not hammer the backend.

This is purely cosmetic — users **still cannot use the features**. The backend changes below are required to make them work.

---

## Required Backend Changes

### 1. Identify why the module gate returns 403

Find the interceptor / annotation that emits the 403 for this tenant. Likely candidates in `soupmarkets-web`:

- `grails-app/controllers/.../LedgerAccountController.groovy` and friends — check for `@Secured`, `@WithoutTenant`, or `@LicenseRequired`-style annotations.
- A request interceptor (look under `grails-app/controllers/.../*Interceptor.groovy`) that inspects `Account.licenseCategory` / `Account.modules` and short-circuits when the module is not enabled.
- `LicenseCategory` enum or `Account.allowedModules` collection — what value(s) enable `LEDGER` / `ACCOUNTING` for a SERVICES-license tenant?

Document the gate (file + line numbers) and the data shape (which column / association decides if a module is on).

### 2. Decide the policy for SoupFinance (SERVICES license)

SoupFinance positions itself as a corporate **accounting** product. Every SoupFinance tenant must have:

- Ledger module enabled (Chart of Accounts, Ledger Transactions, Journal Entries, Transaction Groups)
- Accounting module enabled (Vouchers — Payment / Receipt / Deposit, Payment Methods)

This means either:

- **(A) Update the SERVICES license category** to include LEDGER + ACCOUNTING modules by default. Preferred — every existing SoupFinance tenant gets the fix in one shot.
- **(B) Add a per-tenant data fix** for `johndoe@souptest.com` and any other affected tenants, plus update the registration flow (`/account/register.json`) to enable these modules on new SoupFinance Accounts.

Recommendation: do both — (A) for correctness and to cover future tenants, (B) as a Flyway data migration for tenants already in the DB.

### 3. Implement

#### 3a. License/module configuration

If modules are configured per `LicenseCategory`:

```groovy
// e.g. in BootStrap.groovy or a Flyway migration:
LicenseCategory.SERVICES.allowedModules += [Module.LEDGER, Module.ACCOUNTING]
LicenseCategory.SERVICES.save(flush: true)
```

If modules are stored on `Account.allowedModules`:

```sql
-- Flyway migration: enable Ledger + Accounting for all SoupFinance tenants
UPDATE account_allowed_modules
SET    enabled = 1
WHERE  account_id IN (SELECT id FROM account WHERE api_consumer = 'SoupFinance Web App')
  AND  module IN ('LEDGER', 'ACCOUNTING');
```

(Exact table/column names depend on the actual schema — verify before writing migration.)

#### 3b. Registration flow

Update `AccountController.register()` (or `AccountService.register()`) so newly created SoupFinance tenants have LEDGER + ACCOUNTING enabled by default. Verify with `e2e/integration/01-auth.integration.spec.ts` style test: register a new tenant → call `GET /rest/ledgerAccount/index.json` → expect 200.

#### 3c. Backward compatibility

Existing soupmarkets brokerage tenants must NOT gain SoupFinance-specific modules. Scope the change by `ApiConsumer.name = 'SoupFinance Web App'` so it only affects soupfinance-web traffic, OR by `LicenseCategory` if SERVICES is exclusively SoupFinance.

### 4. Fix the silent 302 on `/ledger/accounts/new` (UX issue #10)

Direct navigation to `/ledger/accounts/new` redirects silently to the Dashboard. This is the SPA history-fallback handling an unrecognised route. Two parts:

- **Backend:** confirm Apache vhost is letting `/ledger/accounts/new` reach `index.html` (it should — there is no `ProxyPass /ledger/`). If a redirect happens, capture the response chain via `curl -v` and inspect.
- **Frontend (separate ticket):** if the SPA's `<Routes>` does not declare `/ledger/accounts/new`, add it. Or, if it does, ensure the route loads even when the user lands cold (no auth bootstrap race).

This is a smaller follow-up — the bulk of the user pain is #1–#5 above.

---

## Acceptance Criteria

- [ ] A fresh tenant registered via `/account/register.json` can call `GET /rest/ledgerAccount/index.json` and receive 200 with `[]` (or seed data).
- [ ] `johndoe@souptest.com` (test tenant) can navigate to `/ledger/accounts` and see the Chart of Accounts page populated.
- [ ] `GET /rest/voucher/index.json` and `GET /rest/paymentMethod/index.json` return 200 for SoupFinance tenants.
- [ ] No regression — existing soupmarkets brokerage tenants do NOT see new accounting modules they should not have.
- [ ] An integration test (e.g., `e2e/integration/ledger.integration.spec.ts`) is added against the LXC backend that registers a tenant, logs in, and exercises `/rest/ledgerAccount/index.json`.

---

## Out of Scope (Frontend already handles)

- Error messaging for 403 ("Ledger module is not available") — shipped in `src/api/errors.ts` + `ApiErrorState` + `ModuleDisabledBanner`.
- Export-button toast feedback — shipped in `TransactionRegisterPage.handleExport`.
- Stopping retry storms on 403/401 — `useQuery({ retry: (...) => false })` shipped on ChartOfAccounts and LedgerTransactions queries.

---

## References

- Frontend PR: `feature/auto-fix-request-soupfin-9-issue-ledger-an` (this worktree)
- Affected pages: `src/features/ledger/ChartOfAccountsPage.tsx`, `src/features/ledger/LedgerTransactionsPage.tsx`, `src/features/accounting/TransactionRegisterPage.tsx`, `src/features/accounting/JournalEntryPage.tsx`, `src/features/accounting/VoucherFormPage.tsx`
- API endpoints touched: see `src/api/endpoints/ledger.ts`
