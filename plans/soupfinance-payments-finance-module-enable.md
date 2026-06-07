# SoupFinance — Enable Finance Module for Tenants (Backend Plan)

**Related issue:** SOUPFIN-8 (Payments module disabled — 403 errors on all data endpoints)
**Frontend fix:** Already shipped — pages now show a "Finance module not available" banner instead of broken empty dropdowns when `/rest/invoicePayment`, `/rest/billPayment`, `/rest/invoice`, `/rest/bill`, `/rest/ledgerAccount`, `/rest/paymentMethod` return 403.

## Context

When a user signs in to `app.soupfinance.com` and navigates to **Payments**, every read endpoint that the page depends on returns **HTTP 403**:

| Endpoint | Status | Used by |
|----------|--------|---------|
| `GET /rest/invoicePayment/index.json` | 403 | Payments list (incoming) |
| `GET /rest/billPayment/index.json` | 403 | Payments list (outgoing) |
| `GET /rest/invoice/index.json` | 403 | "Record Payment" invoice dropdown |
| `GET /rest/bill/index.json` | 403 | "Record Payment" bill dropdown |
| `GET /rest/ledgerAccount/index.json` | 403 | "Deposit To" / "Pay From" dropdown |
| `GET /rest/paymentMethod/index.json` | 403 | "Payment Method" dropdown |

This is the canonical signal that **the Finance module is not enabled for the tenant**.

The TAS production tenant (where SoupFinance currently resolves to) was set up for trading/brokerage and has the SERVICES license category, but the **Finance** sub-module appears to be disabled for it. SoupFinance is built specifically around the Finance module — without it, the app is non-functional.

## Required Backend Investigation

In the `soupmarkets-web` repo, locate where module access is gated:

1. **Find the access-control source of truth** for `InvoicePaymentController`, `BillPaymentController`, `InvoiceController`, `BillController`, `LedgerAccountController`, `PaymentMethodController`.
   - Likely candidates: a `LicenseCategory` enum, a `ModuleAccessService`, role-based `@Secured` annotations, or per-tenant feature flags in `Account` / `AccountSettings`.
   - Confirm whether 403 is coming from Spring Security (`@Secured`), an interceptor (`ModuleAccessInterceptor` or similar), or a Grails filter.

2. **Identify the toggle**. Determine whether enabling Finance requires:
   - A `license_category` change on `Account` from `TRADING` to a value that includes Finance, OR
   - Adding a `ROLE_FINANCE` / equivalent to the user's `SbUser.roles`, OR
   - Adding a row to a `tenant_module_access` (or equivalent) table.

3. **Document the answer** in `soupmarkets-web/docs/finance-module-enablement.md` and link from this plan.

## Required Backend Changes

Once the mechanism is understood:

1. **Enable Finance for the SoupFinance tenant in production** (`tenant_id = ff8081817217e9f3017217f19ccc0000` per project memory). This is a one-time data migration / admin action — NOT a code change.

2. **Improve the 403 response** so the frontend can distinguish "module disabled" from "permission denied". Recommended:
   - Add a structured JSON body: `{ "error": "MODULE_DISABLED", "module": "finance", "message": "..." }`
   - Or set a custom response header: `X-Module-Status: disabled`

   The frontend currently treats any 403 on these endpoints as module-disabled. A structured signal would let it differentiate from "user lacks role" (which should redirect to a different page or render a permission-denied banner).

3. **Add a `GET /rest/account/modules.json` endpoint** that returns the enabled-module set for the current tenant, e.g. `{ "modules": ["finance", "trading"] }`. This would let the frontend hide menu items, disable navigation, and avoid the dependent 403s entirely.

## Frontend Contract (Already Implemented)

For backwards compatibility, the frontend treats `HTTP 403` on the Payments source endpoints as "module disabled" and shows a fallback page. When the structured signal above is added, update the frontend to check the JSON body first, then fall back to the status-only heuristic.

## Acceptance Criteria

- [ ] SoupFinance production tenant returns 200 (with data, possibly empty arrays) on all six listed endpoints when an authenticated user with the appropriate role hits them.
- [ ] `GET /rest/account/modules.json` (or equivalent) returns the enabled module list for the current tenant.
- [ ] If the Finance module IS disabled, the backend returns 403 with a structured body identifying it as a module-disabled error (not a generic 403).
- [ ] The frontend's existing fallback UI continues to work (no regression).

## Not in Scope

- Adding new finance functionality.
- Changing the data model of `Invoice`, `Bill`, `InvoicePayment`, `BillPayment`.
- Migrating any existing tenants other than enabling Finance for the SoupFinance one.
