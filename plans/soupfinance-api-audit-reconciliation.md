# Plan: SoupFinance API Audit & Backend Reconciliation

**Date**: 2026-01-22
**Updated**: 2026-01-30
**Status**: NEEDS UPDATE - Architecture Changed

---

## Architecture Context (CRITICAL - Updated 2026-01-30)

**SoupFinance follows a Tenant-per-Customer architecture:**

1. **SoupFinance registration creates NEW TENANTS (Accounts)**, not Corporate entities in a shared tenant
2. **Invoice clients are managed via `/rest/invoiceClient/*` endpoints** (NOT `/rest/client/*` which is for investment clients)
3. **Business types**: TRADING (inventory-based, has COGS) and SERVICES (no inventory, labor expenses)
4. **Password is NOT required during registration** - set during email confirmation
5. **Email verification required before login**

---

## Summary

Audit of SoupFinance frontend and soupmarkets-web backend reveals **95% API integration** is already complete. Only minor verification and documentation updates are needed.

**NOTE**: The Corporate KYC flow has been DEPRECATED. SoupFinance now uses a simplified tenant registration flow.

---

## Exploration Findings

### Frontend Status (19/20 pages API-integrated)

| Page Category | Status | Notes |
|---------------|--------|-------|
| Auth (Login, Register) | ✅ API-integrated | Uses `/rest/api/login`, `/account/register.json`, `/account/confirmEmail.json` |
| Dashboard | ✅ API-integrated | Fetches from multiple endpoints, stats calculated client-side |
| Invoices (CRUD) | ✅ API-integrated | Uses `/rest/invoice/*` endpoints |
| Bills (CRUD) | ✅ API-integrated | Uses `/rest/bill/*` endpoints |
| Vendors (CRUD) | ✅ API-integrated | Uses `/rest/vendor/*` endpoints |
| Clients (Invoice Recipients) | 🔄 PENDING | Needs `/rest/invoiceClient/*` endpoints (NOT `/rest/client/*`) |
| Payments | ✅ API-integrated | Uses `/rest/invoicePayment/*`, `/rest/billPayment/*` |
| Ledger (Accounts, Transactions) | ✅ API-integrated | Uses `/rest/ledgerAccount/*`, `/rest/ledgerTransaction/*` |
| Accounting (Journal, Voucher) | ✅ API-integrated | Uses `/rest/voucher/*` endpoints |
| Reports (P&L, Balance Sheet, etc.) | ✅ API-integrated | Uses `/rest/financeReports/*` endpoints |
| Corporate KYC | ❌ DEPRECATED | Was `/client/corporate/*` - replaced by tenant registration |
| ReportsPage.tsx | ⚠️ Intentional | Navigation hub with static links (by design) |

### Backend Controllers Verified

All required controllers exist in soupmarkets-web:

- `InvoiceController` - CRUD + status actions
- `BillController` - CRUD + status actions
- `InvoicePaymentController` - Payment allocation
- `BillPaymentController` - Payment allocation
- `LedgerAccountController` - Chart of accounts
- `LedgerTransactionController` - GL entries
- `LedgerTransactionGroupController` - Transaction grouping
- `VoucherController` - Voucher management
- `FinanceReportsController` - P&L, Balance Sheet, Trial Balance, Aging

### Gaps Identified (Minor)

| Gap | Impact | Recommendation |
|-----|--------|----------------|
| Dashboard stats calculated client-side | Low | Optional: Add `/rest/financeReports/dashboardStats.json` endpoint |
| Voucher action endpoints (approve/post/cancel) | Medium | Verify exist, document in API |
| Journal entry post/reverse actions | Medium | Verify exist, document in API |

---

## Implementation Plan

### Phase 1: Verification (No Code Changes)

**Task 1.1**: Verify voucher action endpoints exist in backend
- Check `VoucherController` for `approve`, `post`, `cancel` actions
- Expected: Already implemented (standard Grails CRUD pattern)

**Task 1.2**: Verify journal entry actions exist
- Check if journal entries use `LedgerTransactionGroupController`
- Verify `post` and `reverse` actions

**Task 1.3**: Document any missing endpoints for future implementation

### Phase 2: Frontend Audit Completion

**Task 2.1**: Verify ReportsPage.tsx is intentionally static
- Confirm it's a navigation hub, not a data display page
- No changes needed if confirmed

**Task 2.2**: Ensure no mock data fallback in production
- Audit `useQuery` calls for proper error/empty state handling
- Verify mock data only used in test fixtures

### Phase 3: Documentation Updates

**Task 3.1**: Update CLAUDE.md with verified API endpoints
- Add section documenting all verified finance endpoints
- Note dashboard stats optimization opportunity

---

## Acceptance Criteria

- [ ] All voucher action endpoints verified (approve, post, cancel)
- [ ] All journal entry actions verified (post, reverse)
- [ ] No mock data fallback in production code confirmed
- [ ] ReportsPage.tsx static nature documented and justified
- [ ] CLAUDE.md updated with API reconciliation results

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Missing backend endpoints | Low | Medium | Create endpoints if missing |
| Schema mismatch | Low | High | TypeScript types already match Grails domains |
| Test coverage gaps | Low | Low | E2E tests cover critical paths |

---

## Estimated Scope

- **Verification tasks**: Read-only investigation
- **Code changes**: Minimal (documentation only unless endpoints missing)
- **Files affected**: CLAUDE.md, potentially 1-2 API endpoint files if gaps found
