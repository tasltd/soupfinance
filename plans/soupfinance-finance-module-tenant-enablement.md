# Finance Module Not Enabled for SoupFinance Tenants — Backend Plan

**Linked Issue:** SOUPFIN-10 — "BUG: Accounting module hard-blocked by backend 403s
and settings initialization race condition"

**Discovered:** 2026-05-25 in production at `app.soupfinance.com` for tenant
`johndoe@souptest.com` (ROLE_ADMIN).

**Frontend race-condition portion** (the secondary issue in SOUPFIN-10) is
already fixed in this branch — see `soupfinance-web/src/App.tsx`,
`soupfinance-web/src/api/endpoints/settings.ts`, and
`soupfinance-web/src/features/settings/AccountSettingsPage.tsx`.

This plan covers the **primary** issue that needs **backend (soupmarkets-web)**
changes — soupfinance does not modify the backend per
`.claude/rules/backend-changes-workflow.md`.

---

## Context

After registration through `/account/register.json`, the new tenant is created
but the **Finance module** flag on the `Account` (= tenant) is **not enabled**.
Every finance-related REST controller (LedgerAccount, LedgerTransactionGroup,
Voucher, Invoice, Bill, PaymentMethod) rejects requests with HTTP 403 and the
body:

```json
{"error": "Finance module is not enabled for this tenant"}
```

This makes SoupFinance — whose entire value proposition is finance/accounting —
unusable for any tenant created through the registration flow.

## Affected Endpoints (Production Repro)

All of these return 403 "Finance module is not enabled for this tenant" for the
SoupFinance tenant:

| Endpoint | Used by SPA route |
|----------|-------------------|
| `GET /rest/ledgerTransactionGroup/index.json?max=500` | `/accounting/transactions` |
| `GET /rest/voucher/index.json?max=500` | `/accounting/transactions` |
| `GET /rest/ledgerAccount/index.json` | `/ledger/accounts`, `/accounting/journal-entry`, vouchers |
| `GET /rest/invoice/index.json?max=1000` | `/invoices` |
| `GET /rest/bill/index.json?max=1000` | `/bills` |
| `GET /rest/paymentMethod/index.json?max=100` | `/accounting/voucher/payment`, `/accounting/voucher/receipt` |

Reports endpoints (`/rest/financeReports/*`) return 200 with empty lists, which
suggests the module gate is enforced inconsistently — reports bypass it but the
underlying CRUD doesn't.

## Likely Root Cause (to confirm in backend)

Hypotheses, ranked by likelihood:

1. **Account-level "modules" feature flag not seeded for SoupFinance tenants.**
   The Grails backend likely has a domain field similar to `account.enabledModules`,
   `account.businessLicenceCategory`, or a join through `License` /
   `LicenseCategoryModules` that gates the finance module per tenant. The
   `/account/register.json` controller is creating the Account without flipping
   this flag on.

2. **License category mismatch.** SoupFinance tenants register with
   `businessLicenceCategory = SERVICES` (per
   `.claude/rules/grails-domain-source-of-truth.md` — "SoupFinance tenant uses a
   SERVICES-based license category"). The finance-module gate may be checking for
   `TRADING`, `BROKER`, or a hardcoded set that excludes `SERVICES`.

3. **Interceptor / filter on finance controllers** that consults a
   `ModuleAccessService` (or similar) which returns false unless the tenant has
   an explicit allow row.

## Investigation Steps (Backend)

1. **Grep for the literal error string** in `soupmarkets-web`:
   ```bash
   grep -RIn "Finance module is not enabled for this tenant" soupmarkets-web/grails-app/
   ```
   This will pinpoint the interceptor, controller, or service that throws it.

2. **Identify the gate's data source.** Once located, trace what backing data it
   reads (a field on `Account`, a join table, a static map keyed by
   `businessLicenceCategory`, etc.).

3. **Compare with a known-working SoupFinance tenant.** Query production
   `soupbroker` DB for an Account that currently CAN access finance endpoints
   (if any), and a SoupFinance Account that cannot. Diff the relevant flag/join
   rows to confirm the missing data.

4. **Check `AccountController.register()`** (`/account/register.json`). Verify
   whether it ever sets the finance-module flag. If not, this is the gap.

## Proposed Fix (Backend)

### Option A — Enable finance module by default during SoupFinance registration

Update the controller/service that handles `/account/register.json` so that when
the request originates from the SoupFinance app (identifiable via the
`Api-Authorization`-resolved `ApiConsumer.name = "SoupFinance Web App"`), the
new `Account` is created with the finance module already enabled.

Pseudocode in the registration service:

```groovy
def registerTenant(TenantRegistration reg) {
    Account account = new Account(...)
    // ... existing setup ...

    // SoupFinance is a finance/accounting product — every tenant needs finance enabled.
    if (currentApiConsumer()?.name == 'SoupFinance Web App') {
        account.enableModule(ModuleType.FINANCE)
        // Also any sub-modules required: vouchers, journals, invoices, bills.
    }

    account.save(flush: true, failOnError: true)
}
```

Pros: localized to registration; no schema change; backfills via a one-time SQL
migration for already-registered SoupFinance tenants.

### Option B — Make finance module enablement a property of license category

If the gate already reads from `businessLicenceCategory`, extend the mapping so
that `SERVICES` (and `TRADING`) include finance access by default. This is more
correct architecturally — it ties module access to the license category that
was chosen at registration.

### Option C — Backfill migration only

If we don't want to change registration logic, add a Flyway migration that
enables the finance module for every existing SoupFinance Account, then ensure
the next product-management decision covers all new tenants.

**Recommendation:** Option A + a Flyway migration to backfill existing
SoupFinance tenants (so production users like `johndoe@souptest.com` recover
immediately without re-registering).

## Backfill Migration Sketch

Once we know the exact table/column (per investigation step 1), write a Flyway
migration in `soupmarkets-web/grails-app/migrations/` like:

```sql
-- V202605260800__enable_finance_for_soupfinance_tenants.sql
-- Backfill finance module access for all SoupFinance tenants
UPDATE account
SET enabled_modules = CONCAT(COALESCE(enabled_modules, ''), ',FINANCE')
WHERE id IN (
    SELECT DISTINCT a.id
    FROM account a
    JOIN sb_user u ON u.tenant_id = a.id
    JOIN api_consumer ac ON ac.tenant_id = a.id
    WHERE ac.name = 'SoupFinance Web App'
) AND (enabled_modules IS NULL OR enabled_modules NOT LIKE '%FINANCE%');
```

(The exact column shape depends on what investigation step 1 finds.)

## Validation Plan

After backend changes deploy:

1. **Register a fresh tenant** via SoupFinance UI → confirm finance module
   enabled at creation time.
2. **Hit each previously-403 endpoint** with the new tenant's token — all
   should return 200.
3. **Hit each endpoint with the existing `johndoe@souptest.com` tenant** —
   confirm backfill migration enabled finance for it.
4. **E2E:** unskip / refresh any integration specs that previously assumed
   403s on finance endpoints; verify they pass.

## Out of Scope for This Plan

- The frontend race condition on `/settings/account` — already fixed on this
  branch (SOUPFIN-10 part 2).
- Improving UX of empty/error states on the accounting pages — separate ticket.
  (Today they show "Failed to load transactions"; once the backend fix lands,
  they'll show the real empty state which is fine.)
- "Export" button on Transaction Register doing nothing when list is empty —
  separate UX ticket.

## Owner

Backend team (soupmarkets-web). This plan must be picked up by a session with
soupmarkets-web context — soupfinance sessions never modify the backend.

## References

- Production error report: SOUPFIN-10
- Relevant rules: `.claude/rules/backend-changes-workflow.md`,
  `.claude/rules/grails-domain-source-of-truth.md`
- Related plan: `plans/soupfinance-tenant-architecture-refactor.md`
- Related plan: `plans/soupfinance-tenant-resolution-fix.md`
