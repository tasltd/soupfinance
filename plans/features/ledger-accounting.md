# Feature Plan: Ledger & Accounting

**Date**: 2026-10-06 | **TASCIM module**: Ledger & Accounting (`21d02a1b-8390-4fb0-8d6a-c899be74796d`)
**Sibling module**: COA Templates & Tenant Seeding (epic SOUPFIN-142, `plans/coa-template-seeding.md`). Empty-COA work lives there and is not repeated here.

---

## 1. Overview

Chart of Accounts, general-ledger transactions, journal entries, payment/receipt vouchers and the unified Transaction Register.

| Route | Component | Notes |
|-------|-----------|-------|
| `/ledger/accounts` | `src/features/ledger/ChartOfAccountsPage.tsx` | Read-only grouped tree (no CRUD) |
| `/ledger/transactions` | `src/features/ledger/LedgerTransactionsPage.tsx` | Account, date and status filters; no paging or export |
| `/accounting/transactions` | `src/features/accounting/TransactionRegisterPage.tsx` | JE + vouchers merged; row actions, batch post/delete, CSV export |
| `/accounting/journal-entry[/new\|/:id]` | `src/features/accounting/JournalEntryPage.tsx` | Create/edit; read-only when POSTED/REVERSED |
| `/accounting/voucher/{payment,receipt}`, `/accounting/vouchers[/new\|/:id]` | `src/features/accounting/VoucherFormPage.tsx` | Create only; `:id` ignored |

**API** (`src/api/endpoints/ledger.ts`)
- `ledgerAccount` index/show/save/update/delete/balance/trialBalance
- `ledgerTransaction` index/show/post/reverse/byAccount; `ledgerTransaction/saveMultiple.json` (JE create, CSRF in the query string)
- `ledgerTransactionGroup` index/show/update/post/reverse/delete
- `voucher` index/show/save/update/approve/post/cancel/delete

**Errors**
- `src/api/errors.ts` classifies a 403 on module-gated URLs as `module_disabled`.
- `components/feedback/ApiErrorState.tsx` is the full-page error; `ModuleDisabledBanner.tsx` sits on the form pages.

**Hooks**: `src/hooks/useLedgerAccounts.ts`, `src/hooks/useTransactions.ts` (fetches up to 500 groups + 500 vouchers), `usePaymentMethods`.

**i18n**: `src/i18n/locales/*/ledger.json` and `accounting.json` exist but are unused by every page.

**Tests**
- Unit: `src/api/__tests__/errors.test.ts`, `src/api/endpoints/__tests__/ledger.test.ts`, `src/features/accounting/__tests__/TransactionRegisterPage.{export,dateFilters}.test.tsx`
- Mock E2E: `e2e/ledger.spec.ts`, `e2e/accounting.spec.ts`
- Integration: `e2e/integration/{ledger,accounting}.integration.spec.ts`

## 2. Current status

**Works**
- Module-disabled 403s show a clear card or banner instead of raw axios text (SOUPFIN-9).
- Export gives feedback and the date filters reject 0/0/0 (SOUPFIN-20).
- JE balance validation works.
- The voucher form uses backend field names (`transactionDate`, `notes`, `currency`, `exchangeRate`, `paymentMethodId`), which closes the gap-analysis §8 name mismatches.

**Broken or missing**
- **Production blocker (backend)**: SERVICES-licence tenants get 403 on ledger/voucher/paymentMethod. Module enablement is SOUPFIN-144.
- **Routing**: Register View/Edit go to `/accounting/voucher/:id` and `/accounting/journal-entry/:id/edit`. These are not routed, so they redirect to `/dashboard`. `/accounting/vouchers[/:id]` renders a blank create form (`App.tsx:305-309`, `TransactionRegisterPage.tsx:247-265`).
- **JE lifecycle**: "Save Draft" and "Save & Post" are the same handler and nothing is posted (`JournalEntryPage.tsx:253-257`). The entry page has no Post/Reverse.
- **Vouchers**: no view/edit/approve/post/cancel UI. "Reverse" in the Register calls `cancelVoucher`. Types are still PAYMENT/RECEIPT/DEPOSIT; the CONTRA/JOURNAL plans are not started.
- **Scale**: the Register is capped at 500 + 500 records and paginates on the client. Ledger Transactions has no paging and no export. There is no account ledger with a running balance.
- **Missing features**: period-end (financial years, lock date, opening balances); audit trail.
- **No i18n** on any page; `window.confirm` is used instead of the designed modal.
- **No page-level unit tests** for JE, Voucher, COA or Ledger Transactions.

## 3. Task review

| ID | Title | State | Evidence / notes |
|----|-------|-------|------------------|
| SOUPFIN-9 | Ledger/Accounting blocked by 403s | Done → Done | a3c6939/2eacd05, errors.test.ts. Backend items → SOUPFIN-144; `/ledger/accounts/new` → SOUPFIN-149 |
| SOUPFIN-10 | Accounting 403s + settings race | Done → Done | f86b622 (+ settings.test.ts, e2e/settings.spec.ts). Backend → SOUPFIN-144 |
| SOUPFIN-20 | Export feedback, 0/0/0 dates | Done → Done | a2d4abf + dateFilters/export tests; 93a7bfb (SOUPFIN-19) |
| SOUPFIN-154 (new) | Unrouted voucher/JE view & edit URLs | → Todo (high, bug) | `App.tsx:294-309,348`; `TransactionRegisterPage.tsx:247-265` |
| SOUPFIN-155 (new) | JE lifecycle: Save&Post doesn't post; Post/Reverse on page | → Todo (high, bug) | `JournalEntryPage.tsx:244,253-257` |
| SOUPFIN-156 (new) | Voucher view/edit + approve/post/cancel | → Todo (high) | `VoucherFormPage.tsx` create-only; `ledger.ts:303-410` unused |
| SOUPFIN-157 (new) | Voucher types PAYMENT/RECEIPT/CONTRA/JOURNAL | → Backlog (backend-required) | `types/index.ts:363`; voucher-type plans |
| SOUPFIN-163 (new) | Server paging, account ledger + running balance, export | → Todo | `useTransactions.ts:296-297`; `LedgerTransactionsPage.tsx:60-62` |
| SOUPFIN-158 (new) | Period-end: financial years, lock date, opening balances | → Backlog (backend-required) | gap analysis §12 |
| SOUPFIN-159 (new) | Audit trail for ledger/accounting | → Backlog (backend-required) | `audit-trail-log/` design not implemented |
| SOUPFIN-164 (new) | i18n + confirm modals | → Todo | no `useTranslation` in five pages |
| SOUPFIN-161 (new) | Page unit tests + LXC integration | → Todo | only Register/errors/ledger-endpoint tests exist |

## 4. Remaining work plan

1. **Unblock (backend)**: enable the Ledger and Accounting modules for SERVICES tenants and seed the COA at registration. Closes SOUPFIN-144, then SOUPFIN-143 and 146. Nothing else is testable on production until this lands.
2. **Navigation correctness**: one URL scheme for JE and voucher view/edit; voucher Cancel/save return to the Register. Closes SOUPFIN-154.
3. **Journal entry lifecycle**: split Save Draft from Save & Post; Post/Reverse/Delete on the entry page; confirm on LXC that `ledgerTransactionGroup/post|reverse` exist. Closes SOUPFIN-155.
4. **Voucher lifecycle**: load by id, read-only by status, approve/post/cancel actions, account balance hint. Closes SOUPFIN-156.
5. **COA management** (sibling epic): empty-state template picker, CRUD, render fallback, and telling role 403s from module 403s. Closes SOUPFIN-147, 148, 149 and 150.
6. **Ledger views at scale**: server-side paging and total count, `/ledger/accounts/:id` account ledger with a running balance, full-result CSV export. Closes SOUPFIN-163.
7. **Polish**: i18n for all five pages plus the feedback components; shared confirm modal. Closes SOUPFIN-164.
8. **Tests**: page unit tests and an LXC JE/voucher round trip with Trial Balance assertions. Closes SOUPFIN-161 (COA-template tests stay in SOUPFIN-152).
9. **Voucher type restructuring**: backend first, then the SPA. Closes SOUPFIN-157.
10. **Period-end and audit**: backend plans first. Closes SOUPFIN-158 and SOUPFIN-159.

## 5. Backend dependencies

| Need | Plan | Task |
|------|------|------|
| Enable Ledger/Accounting/Finance modules for SERVICES tenants | `plans/soupfinance-ledger-accounting-module-enablement.md`, `plans/soupfinance-finance-module-tenant-enablement.md`, `plans/soupfin-13-backend-consolidation-directive.md` | SOUPFIN-144 |
| COA templates, category seed, applyTemplate, backfill | `plans/coa-template-seeding.md` | SOUPFIN-143, 145, 146 |
| Voucher types CONTRA/JOURNAL; stop RECEIPT→DEPOSIT normalisation | `plans/soupmarkets-voucher-type-restructuring.md` | SOUPFIN-157 |
| Batch post endpoint (today: N parallel calls) | gap analysis §7/§12. Fold into the SOUPFIN-155 backend plan if needed | SOUPFIN-155 |
| Paging total count / server status filter | write a plan if missing | SOUPFIN-163 |
| FinancialYear endpoints, lock date, year-end close, opening balances | to be written in `plans/` | SOUPFIN-158 |
| Audit log read endpoint | to be written in `plans/` | SOUPFIN-159 |

## 6. Related QBO-parity / COA tasks

- **COA epic**: SOUPFIN-142 (143-153). Frontend items: 147 template picker, 148 blank-render fallback, 149 account CRUD, 150 role-vs-module 403, 152 tests.
- **User-facing extensions**:
  - SOUPFIN-110: Class and Location tags on JE/voucher lines
  - SOUPFIN-130: fixed asset register and depreciation (posts JEs)
  - SOUPFIN-131: bank feeds
  - SOUPFIN-132: bank reconciliation (needs the account ledger from SOUPFIN-163)
  - SOUPFIN-136: budgets and Budget vs Actual
  - SOUPFIN-140: CSV import/export
  - SOUPFIN-101: accountant role
  - SOUPFIN-138: collaboration and review

## 7. Definition of done

- A new SERVICES or TRADING tenant opens Chart of Accounts, Ledger Transactions and the Transaction Register with no 403, and the COA is seeded.
- Every Register row action opens the right record. No link falls through to `/dashboard`.
- JE: Save Draft leaves the entry PENDING; Save & Post posts it; a posted entry can be reversed from its own page. Vouchers can be viewed, edited (PENDING), approved, posted and cancelled.
- Lists page on the server, export covers all filtered rows, and an account ledger shows a running balance.
- All pages are translated (en/de/fr/nl), and destructive actions use the design's confirm modal.
- Unit tests exist for every page in this module. Mock E2E covers create→post→reverse. An LXC integration round trip passes, with screenshots.
- The financial-year close and lock date are enforced, opening balances can be entered, and the audit history is visible on JE and voucher records. These are backend-gated and may ship after the core items.
