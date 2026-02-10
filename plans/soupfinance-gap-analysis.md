# SoupFinance Gap Analysis — SSR vs SPA vs Designs

**Date**: 2026-02-09
**Status**: VALIDATED
**Methodology**: Cross-referenced SSR (Grails GSP), SPA (React 19), and 114 design screens along 12 user processes

---

## Summary

| Category | Total | Done | Partial | Missing | N/A |
|----------|-------|------|---------|---------|-----|
| Finance Modules | 22 | 0 | 13 | 6 | 3 |
| Finance Reports | 9 | 0 | 5 | 4 | 0 |
| Settings Modules | 7 | 0 | 5 | 0 | 2 |
| Shared Components | 13 | 0 | 0 | 13 | 0 |
| Design Screens | 114 | ~25 | ~18 | ~71 | 0 |

**Backend changes required:** 2 (Cash Flow endpoint, Batch Post endpoint)
**All other CRUD endpoints already exist** — gaps are frontend-only.

---

## Table of Contents

1. [User Process 1: Registration & First Login](#1-registration--first-login)
2. [User Process 2: Company Setup](#2-company-setup)
3. [User Process 3: Invoice Lifecycle](#3-invoice-lifecycle)
4. [User Process 4: Bill Lifecycle](#4-bill-lifecycle)
5. [User Process 5: Payment Processing](#5-payment-processing)
6. [User Process 6: Vendor & Client Management](#6-vendor--client-management)
7. [User Process 7: Chart of Accounts & Ledger](#7-chart-of-accounts--ledger)
8. [User Process 8: Journal Entries & Vouchers](#8-journal-entries--vouchers)
9. [User Process 9: Financial Reporting](#9-financial-reporting)
10. [User Process 10: Settings & Admin](#10-settings--admin)
11. [User Process 11: Day-to-Day Operations](#11-day-to-day-operations)
12. [User Process 12: Period-End Procedures](#12-period-end-procedures)
13. [Cross-Cutting Gaps](#13-cross-cutting-gaps)
14. [Design Screen Coverage Map](#14-design-screen-coverage-map)
15. [User Journeys Doc Corrections](#15-user-journeys-doc-corrections)
16. [Implementation Phases](#16-implementation-phases)
17. [Dependency Order](#17-dependency-order)

---

## 1. Registration & First Login

### Process Flow
```
Register → Confirm Email → Set Password → Login → Dashboard
```

### Three-Way Comparison

| Step | SSR (Grails GSP) | SPA (React) | Design |
|------|-------------------|-------------|--------|
| Registration page | `/account/register` GSP form | `/register` — RegistrationPage.tsx | `login-authentication/` (login only) |
| Fields: company name | Yes | Yes | Yes |
| Fields: email | Yes | Yes | Yes |
| Fields: phone | Yes | Yes | N/A |
| Fields: password | Not at registration (set via email) | At registration | N/A |
| OTP verification | Via SMS/email | `/verify` — VerifyPage.tsx | Missing |
| Email confirmation | `/account/confirmEmail` | `/confirm-email` | Missing |
| Resend confirmation | Yes | `/resend-confirmation` | Missing |
| Forgot password | Yes | `/forgot-password`, `/reset-password` | Missing |
| Login form | Username/password | Username/password + remember-me | Has HTML design |
| 2FA (OTP at login) | Optional | Not implemented | Not designed |

### Gaps

| Gap | Priority | Notes |
|-----|----------|-------|
| No design for registration flow | P2 | Only login screen is designed |
| User journeys doc describes OTP login but SPA uses password | P1-DOC | Doc needs correction (see §15) |
| Tenant_id NULL after registration | P0-BACKEND | Plan exists: `plans/soupfinance-tenant-resolution-fix.md` |

---

## 2. Company Setup

### Process Flow (New Tenant)
```
Dashboard → Settings → Account Settings → Financial Year → Chart of Accounts → Tax Entries → Service Descriptions → Bank Details → Add Users
```

### Three-Way Comparison

| Setup Step | SSR | SPA | Design | Status |
|------------|-----|-----|--------|--------|
| Account Settings (name, currency, address) | Full CRUD | `/settings/account` — partial fields | N/A | **PARTIAL** |
| Logo/Favicon upload | File upload | Placeholder only (no upload logic) | N/A | **MISSING** |
| Start of Fiscal Year | MM-DD string field | Not rendered | N/A | **MISSING** |
| Financial Year | Full CRUD | No page exists | N/A | **MISSING** |
| Chart of Accounts | Full CRUD with hierarchy | `/ledger/accounts` — read-only tree | `general-ledger-entries/` | **PARTIAL** |
| Account Categories | Full CRUD | No page exists | N/A | **MISSING** |
| Tax Entries | Full CRUD | No page exists (hardcoded `DEFAULT_TAX_RATES`) | `tax-liability-report/` (report only) | **MISSING** |
| Service Descriptions | Full CRUD | Referenced in invoice/bill forms but no management page | `services-selection-grid/`, `item-creation-modal/`, `item-services-catalog-browser/` | **MISSING** |
| Bank Details | Full CRUD | `/settings/bank-accounts` — full CRUD | N/A | **PARTIAL** |
| Users/Agents | Full CRUD with roles | `/settings/users` — full CRUD | N/A | **PARTIAL** |
| Exchange Rates | Full CRUD | No page exists | N/A | **MISSING** |

### Critical Gaps

| Gap | Priority | Impact |
|-----|----------|--------|
| Financial Year management | P1 | Required for accounting period close, report date ranges |
| Tax Entry management | P1 | Currently hardcoded — users can't define their tax rates |
| Service Description management | P1 | Users can't manage their service/product catalog |
| Account Settings: logo/favicon upload | P2 | Branding on invoices/reports |
| Account Settings: startOfFiscalYear | P2 | Affects report defaults |
| Account Category management | P2 | Auto-seeded but users can't customize |
| Exchange Rate management | P2 | Required for multi-currency support |

---

## 3. Invoice Lifecycle

### Process Flow
```
Create Invoice → Add Line Items → Save Draft → Send → Client Views → Partial Payment → Full Payment → Closed
```

### Three-Way Comparison

| Feature | SSR | SPA | Design | Status |
|---------|-----|-----|--------|--------|
| **Invoice List** | Table with filters | `/invoices` — table with sort/pagination | `invoice-management/` (full design) | **PARTIAL** |
| List: search/filter | Full search + status filter | Sort + pagination only | Has search + status filter + date range | **GAP** |
| List: bulk actions | Checkboxes + bulk delete | None | Has checkboxes | **MISSING** |
| **Invoice Form** | Full form | `/invoices/new` — multi-section form | `new-invoice-form/`, `invoice-line-items-table/` | **PARTIAL** |
| Field: client | Dropdown | Dropdown + inline "New Client" | Dropdown | OK |
| Field: invoiceDate | Date picker | Date picker | Date picker | OK |
| Field: paymentDate (due date) | Date picker | Date picker | Date picker | OK |
| Field: numberPrefix | Text input | Missing | N/A | **MISSING** |
| Field: number | Auto + editable | Missing (auto-only) | N/A | **MISSING** |
| Field: salesOrderNumber | Text input | `soNumber` field (present) | N/A | OK |
| Field: purchaseOrderNumber | Text input | `poNumber` field (present) | N/A | OK |
| Field: currency | Dropdown | Dropdown (in "Advanced" section) | N/A | OK |
| Field: exchangeRate | Conditional number | Conditional number | N/A | OK |
| Field: notes | Textarea | Textarea | Textarea | OK |
| Field: compliments | Textarea | Textarea (in "Advanced") | N/A | OK |
| **Line Items** | Editable table | Editable table | `invoice-line-items-table/` | **PARTIAL** |
| Item: service dropdown | Service description picker | Service description picker | `services-selection-grid/` (card grid) | OK |
| Item: description | Text | Text | Text | OK |
| Item: quantity | Number | Number | Number | OK |
| Item: unitPrice | Number | Number | Number | OK |
| Item: discount | Percentage | Percentage | Percentage | OK |
| Item: taxRate | **Multi-select** (multiple tax entries) | **Single dropdown** | N/A | **GAP** |
| Item: priority (sort order) | Number | Missing | N/A | **MISSING** |
| **Invoice Detail** | Show page | `/invoices/:id` — full detail | `invoice-draft-preview/`, `amount-due-summary/` | **PARTIAL** |
| Detail: PDF preview | Server-rendered PDF | Frontend-generated PDF | `invoice-draft-preview/` | OK |
| Detail: payment history | Table | Table | `amount-due-summary/` (timeline) | OK |
| Detail: send via email | Server email | Frontend email dialog | N/A | OK |
| **Actions** | Save/Send/Cancel/Delete | Save Draft/Save & Send/Cancel/Delete | N/A | **PARTIAL** |
| Action: edit (DRAFT only) | Yes | Yes | N/A | OK |
| Action: mark viewed | Yes | Missing | N/A | **MISSING** |
| Action: approval workflow | Not in SSR | Not in SPA | `invoice-approval-workflow/` (full design) | **DESIGN-ONLY** |
| Action: validation checker | Not in SSR | Not in SPA | `invoice-validation-checker/` (full design) | **DESIGN-ONLY** |
| **Invoice Status** | Full lifecycle | Full lifecycle | `invoice-status-summary/`, `invoice-status-update-log/` | **PARTIAL** |
| Status tracking widget | Not in SSR | Not in SPA | `invoice-status-summary/` (donut chart) | **DESIGN-ONLY** |
| Status update timeline | Not in SSR | Not in SPA | `invoice-status-update-log/` | **DESIGN-ONLY** |
| **Overdue Handling** | Not in SSR | Not in SPA | `overdue-reminder-generator/`, `amount-due-tracker/` | **DESIGN-ONLY** |
| **Closed/Archive** | Soft delete | Delete only | `closed-invoice-archive/` | **PARTIAL** |

### Critical Invoice Gaps

| Gap | Priority | Notes |
|-----|----------|-------|
| Multi-tax entries per line item | P1 | SSR supports multiple; SPA has single dropdown |
| Invoice list search/filter | P1 | Design has it; SPA only has sort |
| numberPrefix / number fields | P2 | SSR allows editing; SPA auto-generates |
| Archive view (soft delete) | P2 | No archive toggle in SPA |
| Invoice approval workflow | P3 | Design-only — not in SSR either |

---

## 4. Bill Lifecycle

### Process Flow
```
Create Bill → Add Line Items → Save → Make Payment → Full Payment → Closed
```

### Three-Way Comparison

| Feature | SSR | SPA | Design | Status |
|---------|-----|-----|--------|--------|
| Bill List | Table with filters | `/bills` — table with pagination | N/A (no specific bill design) | **PARTIAL** |
| Bill Form | Full form | `/bills/new` — similar to invoice | N/A | **PARTIAL** |
| Field: vendor | Dropdown | Dropdown | N/A | OK |
| Field: billDate | Date picker | Date picker (as `issueDate`) | N/A | **NAME MISMATCH** |
| Field: numberPrefix, number | Text + auto | Missing | N/A | **MISSING** |
| Field: purchaseOrderNumber | Text | `poNumber` (present) | N/A | OK |
| Field: currency, exchangeRate | Yes | Yes (in "Advanced") | N/A | OK |
| Line Items | Same as invoice | Same as invoice | N/A | **PARTIAL** (same multi-tax gap) |
| Bill Detail | Show page | `/bills/:id` — full detail | N/A | OK |
| Payment history | Table | Table | N/A | OK |

### Critical Bill Gaps

| Gap | Priority | Notes |
|-----|----------|-------|
| Field name: `billDate` vs `issueDate` | P1 | SPA uses `issueDate` but backend expects `billDate` |
| Multi-tax entries per line item | P1 | Same gap as invoices |
| numberPrefix / number | P2 | Same as invoice |

---

## 5. Payment Processing

### Process Flow
```
Select Invoice/Bill → Enter Amount → Choose Method → Record Payment → Ledger Entry Created
```

### Three-Way Comparison

| Feature | SSR | SPA | Design | Status |
|---------|-----|-----|--------|--------|
| Payment List | Combined table | `/payments` — Incoming/Outgoing tabs | `payment-history-report/` | OK |
| Payment Form | Modal + fields | `/payments/new` — full page form | `payment-entry-form/` (2-column layout) | **PARTIAL** |
| Field: payInAccount | Filtered ledger account dropdown | Missing | N/A | **MISSING** |
| Field: payOutAccount | Filtered ledger account dropdown | Missing | N/A | **MISSING** |
| Field: paymentReceipt | File upload (BillPayment) | Missing | `modal-file-upload-progress/` | **MISSING** |
| Multi-invoice allocation | Not in SSR | Not in SPA | `payment-allocation-screen/` (full design) | **DESIGN-ONLY** |
| Payment method | Domain-level names | Dropdown (from API) | Dropdown | OK |

### Critical Payment Gaps

| Gap | Priority | Notes |
|-----|----------|-------|
| payInAccount / payOutAccount | P1 | Required for correct ledger postings; SSR derives from AccountBankDetails |
| Payment receipt upload | P2 | BillPayment supports `paymentReceipt` file field |
| Multi-invoice allocation | P2 | No backend support — would need loop-create or new endpoint |

---

## 6. Vendor & Client Management

### Process Flow
```
Create Vendor/Client → Use in Invoices/Bills → View History → Archive
```

### Three-Way Comparison

| Feature | SSR | SPA | Design | Status |
|---------|-----|-----|--------|--------|
| Vendor List | Table | `/vendors` — table with search + delete | `vendor-client-management/` (combined directory) | **PARTIAL** |
| Client List | Table | `/clients` — table with search + type filter | `vendor-client-management/` (combined) | **PARTIAL** |
| Combined directory | Not in SSR | Separate pages | Single design with tabs/badges | **DESIGN DIVERGES** |
| **Vendor Form** | Full form | `/vendors/new` — partial fields | N/A | **PARTIAL** |
| Field: symbol | Text | Missing | N/A | **MISSING** |
| Field: vendorType | Dropdown | Missing | N/A | **MISSING** |
| Field: postalAddress | Text | Missing (single address only) | N/A | **MISSING** |
| Field: ledgerAccount | FK dropdown | Missing | N/A | **MISSING** |
| Field: archived | Toggle | Missing | N/A | **MISSING** |
| Field: emailContacts | Multi-contact list | Single email field | N/A | **MISSING** |
| Field: phoneContacts | Multi-contact list | Single phone field | N/A | **MISSING** |
| **Client Form** | Full form | `/clients/new` — Individual/Corporate toggle | N/A | OK |
| Client types | Individual/Corporate | Individual/Corporate | N/A | OK |
| Quick edit | Not in SSR | Not in SPA | `modal-quick-edit-client/` | **DESIGN-ONLY** |

### Critical Vendor Gaps

| Gap | Priority | Notes |
|-----|----------|-------|
| Vendor: ledgerAccount FK | P1 | Needed for automatic posting |
| Vendor: archived toggle | P2 | No soft-delete UI |
| Vendor: emailContacts/phoneContacts | P2 | SSR has multi-contact; SPA has single fields |
| Vendor: symbol, vendorType | P3 | Metadata fields |

---

## 7. Chart of Accounts & Ledger

### Process Flow
```
View Accounts → Create/Edit Account → View Transactions → Filter by Account/Date
```

### Three-Way Comparison

| Feature | SSR | SPA | Design | Status |
|---------|-----|-----|--------|--------|
| Account tree | Grouped by ledger group, expandable | `/ledger/accounts` — grouped, collapsible | `general-ledger-entries/` | **PARTIAL** |
| Account CRUD | Full create/edit/delete | Read-only display | Design has edit capability | **PARTIAL** |
| Field: parentAccount | FK dropdown (hierarchy) | Missing | N/A | **MISSING** |
| Field: currency | Dropdown | Displayed but not editable | N/A | **MISSING** |
| Field: cashFlow | Classification dropdown | Missing | N/A | **MISSING** |
| Field: hiddenAccount/editable/deletable | Toggles | Missing | N/A | **MISSING** |
| Transaction List | Table with filters | `/ledger/transactions` — table with filters | `gl-transactions-base-page/` | **PARTIAL** |
| Transaction filters | Account, date range, status | Account, date range, status | Has advanced filters | OK |
| Batch post | "Post Selected" button | Not in SPA (no backend support) | N/A | **MISSING-BACKEND** |

### Critical Ledger Gaps

| Gap | Priority | Notes |
|-----|----------|-------|
| Ledger account CRUD (create/edit) | P1 | SPA is read-only; needs full CRUD |
| parentAccount field | P1 | Required for account hierarchy |
| Batch post transactions | P2 | Requires backend endpoint |

---

## 8. Journal Entries & Vouchers

### Process Flow
```
Create Entry → Add Debit/Credit Lines → Validate Balance → Save Draft → Post to Ledger
```

### Three-Way Comparison

| Feature | SSR | SPA | Design | Status |
|---------|-----|-----|--------|--------|
| Journal Entry form | Full form | `/accounting/journal-entry` — full form | N/A | OK |
| Transaction lines | Account + Debit/Credit | Account + Debit/Credit + validation | N/A | OK |
| Balance validation | Server-side | Client-side + visual indicator | N/A | OK |
| Save & Post | Two-step | Two-step | N/A | OK |
| **Voucher form** | Full form | `/accounting/voucher/*` — Payment/Receipt types | N/A | **PARTIAL** |
| Voucher: currency | Dropdown | Missing | N/A | **MISSING** |
| Voucher: exchangeRate | Conditional | Missing | N/A | **MISSING** |
| Voucher: paymentMethod | Dropdown | Dropdown (present) | N/A | OK |
| Voucher: account balance display | Read-only balance shown | Missing | N/A | **MISSING** |
| Field name: transactionDate | `transactionDate` | `voucherDate` | N/A | **NAME MISMATCH** |
| Field name: notes | `notes` | `description` | N/A | **NAME MISMATCH** |
| Transaction Register | Combined list | `/accounting/transactions` — unified with batch actions | N/A | OK |

### Critical Voucher Gaps

| Gap | Priority | Notes |
|-----|----------|-------|
| Field name mismatches (transactionDate, notes) | P1 | Will cause binding failures |
| Currency/exchangeRate on vouchers | P2 | Multi-currency support |
| Account balance display | P3 | UX enhancement |

---

## 9. Financial Reporting

### Process Flow
```
Select Report → Set Date Range/Filters → View Report → Export PDF/Excel
```

### Three-Way Comparison

| Report | SSR | SPA Route | Design | Status |
|--------|-----|-----------|--------|--------|
| Trial Balance | Full with export | `/reports/trial-balance` | `trial-balance-report/` | **PARTIAL** |
| Income Statement (P&L) | Full with export | `/reports/pnl` | `income-statement-report/`, `profit-and-loss-summary-report/`, 6x PNL variations | **PARTIAL** |
| Balance Sheet | Full with export | `/reports/balance-sheet` | `balance-sheet-report/` | **PARTIAL** |
| Cash Flow | **Has backend method, NO endpoint** | `/reports/cash-flow` — page exists | `cash-flow-statement-report/` | **MISSING-BACKEND** |
| Aged Receivables | Full | `/reports/aging` (combined tab) | `ar-aging-report/` | **PARTIAL** |
| Aged Payables | Full | `/reports/aging` (combined tab) | `ap-aging-report/` | **PARTIAL** |
| Account Balances | Full | No page | N/A | **MISSING** |
| Account Transactions | Full | No page | N/A | **MISSING** |
| Client Income | Full | No page | N/A | **MISSING** |
| Vendor Purchases | Full | No page | `vendor-payment-analysis/` | **MISSING** |

### Report Feature Comparison

| Feature | SSR | SPA | Design | Status |
|---------|-----|-----|--------|--------|
| Date range presets | Dropdown (This Month, Last Quarter, etc.) | Raw date inputs only | `form-date-range-picker/` (designed) | **MISSING** |
| `verifiedTransaction` filter | Toggle on all reports | Missing | N/A | **MISSING** |
| `isParentChecked` filter | Toggle (parent-only vs with sub-accounts) | Missing | N/A | **MISSING** |
| Export to PDF | Yes | Partial (some reports) | `modal-export-options/` (designed) | **PARTIAL** |
| Export to Excel/CSV | Yes | Missing | `modal-export-options/` | **MISSING** |
| Print | Yes | Missing | N/A | **MISSING** |
| Summary cards (KPIs) | Not in SSR | Not in SPA | All report designs have 3-4 KPI cards | **DESIGN-ONLY** |
| Charts | Not in SSR | Not in SPA | Donut charts, bar charts in designs | **DESIGN-ONLY** |
| Expandable rows | Tree in SSR | Not in SPA | Design has expandable tree rows | **PARTIAL** |

### Critical Report Gaps

| Gap | Priority | Notes |
|-----|----------|-------|
| Account Balances report page | P1 | API endpoint exists (`/rest/financeReports/accountBalances.json`) |
| Account Transactions report page | P1 | API endpoint exists (`/rest/financeReports/accountTransactions.json`) |
| Cash Flow: backend endpoint | P1-BACKEND | Service method exists but no controller action |
| Date range presets | P1 | Design exists; compute dates client-side |
| Export modal (PDF/Excel/CSV) | P1 | Design exists: `modal-export-options/` |
| Report filters (verified, parent) | P2 | Backend accepts these params already |
| Summary cards + charts | P2 | All designs include them |
| Client Income report page | P2 | API endpoint exists |
| Vendor Purchases report page | P2 | API endpoint exists; design exists |

---

## 10. Settings & Admin

### Process Flow
```
Settings Hub → Users / Bank Accounts / Account Settings
```

### Three-Way Comparison

| Setting | SSR | SPA | Design | Status |
|---------|-----|-----|--------|--------|
| Users/Agents list | Full CRUD | `/settings/users` — full CRUD | N/A | **PARTIAL** |
| User form: profile field | Yes | Missing | N/A | **MISSING** |
| User form: archived/disabled | Yes | Missing | N/A | **MISSING** |
| User form: theme preference | Yes | Missing | N/A | **MISSING** |
| Bank Details list | Full CRUD | `/settings/bank-accounts` — full CRUD | N/A | OK |
| Bank Details form | Full form | Full form | N/A | OK |
| Account Settings | Full form | `/settings/account` — partial | N/A | **PARTIAL** |
| Account: emailContacts | Multi-contact widget | Missing | N/A | **MISSING** |
| Account: phoneContacts | Multi-contact widget | Missing | N/A | **MISSING** |

---

## 11. Day-to-Day Operations

### Process Flow
```
Login → Dashboard → Create Invoices/Bills → Record Payments → View Reports
```

### Three-Way Comparison

| Feature | SSR | SPA | Design | Status |
|---------|-----|-----|--------|--------|
| Dashboard KPIs | Revenue, Expenses, Outstanding, Overdue | Revenue, Outstanding, Expenses, Net Profit | `financial-overview-dashboard/` (full design) | **PARTIAL** |
| Recent invoices | Table | Table (5 most recent) | Design shows full dashboard | OK |
| Recent bills | Table | Not shown | Design shows bills widget | **MISSING** |
| Quick actions | Not in SSR | Not in SPA | Dashboard design has quick action buttons | **DESIGN-ONLY** |
| Dark mode | Not in SSR | Toggle in top nav | All designs support dark mode | OK |
| Audit trail | Not in SSR | Not in SPA | `audit-trail-log/` (full design) | **DESIGN-ONLY** |
| Notifications | Not in SSR | Not in SPA | `interactive-notification-dropdown/` | **DESIGN-ONLY** |

---

## 12. Period-End Procedures

### Process Flow
```
Post All Pending → Run Trial Balance → Run P&L → Run Balance Sheet → Close Financial Year
```

### Gaps

| Step | SSR | SPA | Status |
|------|-----|-----|--------|
| Post all pending transactions | Manual per-transaction | Batch select + post in Transaction Register | **PARTIAL** (no backend batch endpoint) |
| Run Trial Balance | Full report | Report page exists | OK |
| Run P&L | Full report | Report page exists | OK |
| Run Balance Sheet | Full report | Report page exists | OK |
| Close Financial Year | FinancialYear close action | No Financial Year page | **MISSING** |
| Budget vs Actual review | Full report | No page | `budget-vs-actual-variance-report/` (designed) | **MISSING** |

---

## 13. Cross-Cutting Gaps

### 13.1 Multi-Currency Support

Affects: Invoice, Bill, Voucher, LedgerTransaction

| Component | SSR | SPA | Status |
|-----------|-----|-----|--------|
| Currency selector | On all forms | Invoice/Bill forms only (in "Advanced") | **PARTIAL** |
| Exchange rate (conditional) | Auto-shows when currency != default | Invoice/Bill forms only | **PARTIAL** |
| Voucher currency | Yes | Missing | **MISSING** |
| LedgerTransaction currency | Yes | Missing | **MISSING** |
| Exchange Rate management CRUD | Full page | No page | **MISSING** |

### 13.2 Multi-Tax Entries

| Component | SSR | SPA | Status |
|-----------|-----|-----|--------|
| Tax rate per line item | Multi-select (multiple TaxEntry records) | Single dropdown (hardcoded rates) | **MAJOR GAP** |
| Tax Entry CRUD | Full page | No page (uses hardcoded `DEFAULT_TAX_RATES`) | **MISSING** |
| Tax calculation | Server-side, per-entry | Client-side, single rate | **DIFFERENT** |

### 13.3 Export & Print

| Feature | SSR | SPA | Design | Status |
|---------|-----|-----|--------|--------|
| Export PDF | All reports + invoices | Some reports | `modal-export-options/` | **PARTIAL** |
| Export Excel/CSV | All reports | None | `modal-export-options/` | **MISSING** |
| Print | All reports | None | N/A | **MISSING** |

### 13.4 Soft Delete / Archive

| Feature | SSR | SPA | Status |
|---------|-----|-----|--------|
| Archived items view | Toggle on all lists | No archive UI | **MISSING** |
| Archive action | Available on forms | Delete only (hard delete) | **MISSING** |
| Archived filter | Checkbox on list pages | Missing | **MISSING** |

### 13.5 Shared Components (from Design)

| Component | Design Screen | SPA Status | Priority |
|-----------|---------------|------------|----------|
| DateRangePicker | `form-date-range-picker/` | Missing | P1 |
| MultiSelect | `form-multiselect-component/` | Missing | P1 |
| ExportModal | `modal-export-options/` | Missing | P1 |
| ConfirmDialog | `modal-delete-confirmation/` | Basic implementation | P1 |
| SearchableSelect | `form-search-autocomplete/` | Missing | P1 |
| FileUpload | `modal-file-upload-progress/` | Missing | P2 |
| ToggleSwitch | `form-toggle-switch-component/` | Missing | P2 |
| Alert banners (4 types) | `alert-banner-*` | Missing | P2 |
| Toast notifications | `alert-toast-notification-stack/` | Missing | P2 |
| Empty states (6 types) | `empty-state-*` | Basic empty states | P2 |
| Error pages (5 types) | `error-*` | Missing | P2 |
| Loading skeletons (5 types) | `loading-*` | Basic loading spinners | P3 |
| Mobile layouts (12 screens) | `mobile-*` | Not implemented | P3 |

---

## 14. Design Screen Coverage Map

### Screens Fully or Mostly Implemented

| Design Screen | SPA Page | Coverage |
|---------------|----------|----------|
| `login-authentication/` | `/login` | ~90% (missing branded split layout) |
| `invoice-management/` | `/invoices` | ~70% (missing search/filter, bulk actions) |
| `new-invoice-form/` | `/invoices/new` | ~80% (missing numberPrefix, multi-tax) |
| `invoice-line-items-table/` | (inline in invoice form) | ~80% |
| `payment-entry-form/` | `/payments/new` | ~60% (missing payInAccount, 2-column layout) |
| `general-ledger-entries/` | `/ledger/transactions` | ~65% (missing advanced filters, badges) |
| `reporting-and-analytics/` | `/reports` | ~80% (report hub cards) |
| `trial-balance-report/` | `/reports/trial-balance` | ~60% (missing presets, export) |
| `balance-sheet-report/` | `/reports/balance-sheet` | ~50% (missing cards, charts, expandable) |
| `income-statement-report/` | `/reports/pnl` | ~50% (missing cards, charts) |
| `ar-aging-report/` | `/reports/aging` (AR tab) | ~60% (missing chart, design layout) |
| `ap-aging-report/` | `/reports/aging` (AP tab) | ~60% |

### Screens Partially Implemented

| Design Screen | SPA Equivalent | What's Missing |
|---------------|---------------|----------------|
| `financial-overview-dashboard/` | `/dashboard` | Recent bills widget, quick actions, charts |
| `vendor-client-management/` | `/vendors` + `/clients` (separate) | Combined view, type badges |
| `invoice-draft-preview/` | `/invoices/:id` | PDF-like preview layout |
| `amount-due-summary/` | `/invoices/:id` (payment section) | Progress bar, timeline |

### Screens NOT Implemented (43 screens)

| Design Screen | Category | Priority |
|---------------|----------|----------|
| `services-selection-grid/` | Service catalog | P1 |
| `item-creation-modal/` | Service/Item CRUD | P1 |
| `item-services-catalog-browser/` | Service catalog | P1 |
| `cash-flow-statement-report/` | Report | P1 |
| `budget-vs-actual-variance-report/` | Report | P2 |
| `tax-liability-report/` | Report | P2 |
| `vendor-payment-analysis/` | Report | P2 |
| `payment-allocation-screen/` | Payment | P2 |
| `payment-history-report/` | Report | P2 |
| `invoice-approval-workflow/` | Workflow | P3 |
| `invoice-validation-checker/` | Utility | P3 |
| `invoice-status-summary/` | Dashboard widget | P3 |
| `invoice-status-update-log/` | Timeline | P3 |
| `closed-invoice-archive/` | Archive | P3 |
| `amount-due-tracker/` | Dashboard widget | P3 |
| `overdue-reminder-generator/` | Email tool | P3 |
| `advanced-invoice-metadata/` | Form enhancement | P3 |
| `gl-integration-mapping/` | Configuration | P3 |
| `gl-reconciliation-report/` | Report | P3 |
| `audit-trail-log/` | Admin | P3 |
| `tax-and-discount-calculator/` | Utility | P3 |
| `expense-category-breakdown/` | Report widget | P3 |
| `customer-credit-limit-report/` | Report | P3 |
| `inventory-valuation-report/` | Report | P3 |
| `retained-earnings-statement/` | Report | P3 |
| `statement-of-changes-in-equity/` | Report | P3 |
| `profit-and-loss-summary-report/` | Report variation | P3 |
| All `alert-banner-*` (4) | Component | P2 |
| All `empty-state-*` (6) | Component | P2 |
| All `error-*` (5) | Component | P2 |
| All `loading-*` (5) | Component | P3 |
| All `modal-*` (7) | Component | P1-P3 |
| All `interactive-*` (9) | Component | P3 |
| All `form-*` (13) | Component | P1-P2 |
| All `mobile-*` (12) | Component | P3 |

---

## 15. User Journeys Doc Corrections

The `docs/USER-JOURNEYS.md` has several inaccuracies vs actual implementation:

| Section | Doc Says | Actually Is | Fix |
|---------|----------|-------------|-----|
| §1.1 Auth | OTP-based 2FA login (`/rest/otp/request.json`) | Password login (`/rest/api/login`) | Rewrite auth section |
| §1.1 Auth | Token stored as `auth_token` in localStorage | Token stored as `access_token` in dual-storage | Fix storage key + strategy |
| §1.1 Auth | Uses Zustand `authStore` | Uses `localStorage`/`sessionStorage` directly | Remove Zustand reference |
| §2 Registration | Creates Corporate via `/rest/corporate/save.json` | Creates Account via `/account/register` | Already marked DEPRECATED but not replaced |
| §4.2 Invoice | Client from `/rest/client/index.json` | Invoice client via `/rest/client/index.json` (correct) | N/A — doc is correct here |
| §4.2 Invoice | Field names `issueDate`, `dueDate` | Actual: `invoiceDate`, `paymentDate` | Fix field names |
| §4.2 Invoice | `invoiceNumber` field | Actual: `number` field | Fix field name |
| §4.3 Invoice | PDF from `/rest/invoice/pdf/{id}.json` | Frontend-generated PDF | Fix — no server PDF endpoint |
| §5.2 Bill | Field name `issueDate` | Actual backend field: `billDate` | Fix field name |
| §5.2 Bill | `billNumber` field | Actual: `number` field | Fix field name |
| Route Summary | Lists `/onboarding/*` routes | These are deprecated | Remove deprecated routes |
| Appendix A | Lists `/rest/otp/*` endpoints | Not used in current auth flow | Remove or mark deprecated |
| Appendix A | Lists `/rest/corporate/*` endpoints | Deprecated — uses `/account/*` | Remove or mark deprecated |

---

## 16. Implementation Phases

### Phase 1: Foundation — Shared Components + Critical Field Fixes (~3 weeks)

**1A. Shared Components** (P1, ~1.5 weeks):
- DateRangePicker (all reports use this)
- MultiSelect (tax entries)
- ExportModal (all reports)
- SearchableSelect (all dropdowns)
- ConfirmDialog (improve existing)
- FileUpload (payments, account settings)

**1B. Field Fixes** (P1, ~1.5 weeks):
- Invoice/Bill: fix field name mismatches (`billDate`, `transactionDate`, `notes`)
- Invoice/Bill: add `numberPrefix`, `number` fields
- Invoice/Bill: multi-tax entries per line item (requires MultiSelect)
- Voucher: fix field name mismatches, add currency/exchangeRate
- Payment: add `payInAccount`/`payOutAccount`
- Ledger Account: enable create/edit/delete (currently read-only)
- All reports: add DateRangePicker with presets
- All reports: add ExportModal

### Phase 2: Missing P1 Modules + Reports (~3.5 weeks)

- Tax Entry CRUD (`/settings/tax-entries/*`)
- Service Description CRUD (`/settings/services/*`)
- Financial Year CRUD (`/settings/financial-years/*`)
- Account Balances report (`/reports/account-balances`)
- Account Transactions report (`/reports/account-transactions`)
- Ledger Account hierarchy (parentAccount field)
- Invoice list: search, filter, bulk actions
- Sidebar entries for new modules

### Phase 3: P2 Modules + Enhancements (~4 weeks)

- Account Category CRUD (`/ledger/categories/*`)
- Exchange Rate CRUD (`/settings/exchange-rates/*`)
- Budget Management (3 entities: Budget, BudgetCategory, BudgetEntry)
- Client Income report
- Vendor Purchases report
- Payment receipt file upload
- Vendor: add missing fields (ledgerAccount, emailContacts, phoneContacts, archived)
- Account Settings: logo/favicon upload, startOfFiscalYear, contacts
- Alert banners (4 types) + toast notifications
- Empty states (6 types) + error pages (5 types)
- Archive/soft-delete UI across all list pages

### Phase 4: Design Polish + SPA Enhancements (~3 weeks)

- Summary cards + charts on all report pages
- Expandable rows (Balance Sheet, Income Statement, Trial Balance)
- Dashboard: recent bills widget, quick action buttons
- Loading skeletons (table, dashboard, full-page)
- User settings: profile, archived/disabled, theme
- Payment allocation screen (multi-invoice)
- Combined vendor-client directory view
- Mobile responsive improvements

### Phase 5: Advanced Features (~2.5 weeks, lower priority)

- Invoice approval workflow
- Invoice validation checker
- Invoice status timeline + summary widget
- Overdue reminder generator
- Audit trail log
- GL reconciliation report
- GL integration mapping
- Tax & discount calculator

**Total estimated effort: ~16 weeks**

### Backend Changes Required

| Change | Priority | Notes |
|--------|----------|-------|
| Cash Flow Statement endpoint | P1 | Service method exists; needs controller action in FinanceReportsController |
| Batch Post Transactions | P2 | POST endpoint to post multiple LedgerTransaction IDs at once |
| Tenant registration: set tenant_id | P0 | Plan exists: `plans/soupfinance-tenant-resolution-fix.md` |

---

## 17. Dependency Order

Modules must be implemented in this sequence (each depends on predecessors):

```
1. Shared Components (DateRangePicker, MultiSelect, ExportModal, SearchableSelect)
   ↓
2. Fix existing field mismatches (invoice, bill, voucher field names)
   ↓
3. Tax Entry CRUD (replaces hardcoded DEFAULT_TAX_RATES)
   ↓
4. Multi-tax entries on Invoice/Bill line items (requires Tax Entry + MultiSelect)
   ↓
5. Service Description CRUD (referenced by invoice/bill forms)
   ↓
6. Financial Year CRUD (required for period close + report defaults)
   ↓
7. Ledger Account full CRUD (create/edit — currently read-only)
   ↓
8. Account Category CRUD (depends on Ledger Account hierarchy)
   ↓
9. Exchange Rate CRUD (required for multi-currency)
   ↓
10. Missing Report Pages (Account Balances, Account Transactions)
    ↓
11. Report Enhancements (presets, exports, summary cards)
    ↓
12. Budget Management (requires Financial Year + Account Categories)
    ↓
13. Payment Enhancements (payInAccount, file upload)
    ↓
14. Archive/soft-delete UI (applies to all list pages)
    ↓
15. Design polish (loading states, empty states, error pages)
```
