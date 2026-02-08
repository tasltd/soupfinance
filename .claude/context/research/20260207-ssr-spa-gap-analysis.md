# Research: SSR vs SPA Gap Analysis
**Date**: 2026-02-07
**Source**: 4 Explore agents analyzing backend GSP + SPA routes

## Query
Investigate all backend SSR pages (GSP templates + JS controllers) and compare with SPA implementation to identify gaps.

## Key Findings

### Missing Modules (6 new pages needed)
1. **Financial Year** - CRUD for accounting periods
2. **Service Description** - CRUD for invoice/bill services (API exists, no management UI)
3. **Tax Entry** - CRUD for tax rates (replaces hardcoded DEFAULT_TAX_RATES)
4. **Ledger Account Category** - CRUD for account categories
5. **Exchange Rate** - CRUD for currency exchange rates
6. **Budget** (+ Category + Entry) - Full budgeting system

### Missing Reports (4 new report pages)
1. Account Balances - `/rest/financeReports/accountBalances.json`
2. Account Transactions - `/rest/financeReports/accountTransactions.json`
3. Client Income - `/rest/financeReports/clientIncome.json`
4. Vendor Purchases - `/rest/financeReports/vendorPurchases.json`

### Cross-Cutting Gaps
- Multi-currency (currency + exchangeRate on Invoice, Bill, Voucher, LedgerTransaction)
- Multi-select TaxEntries (SSR allows multiple taxes per line item)
- Date range presets on all reports
- Print/Export on all reports
- Clients not in sidebar
- Soft-delete (archived) UI missing
- Field name mismatches (billDate vs issueDate, etc.)

## Relevant Files
- Full plan: `plans/ssr-spa-gap-analysis-plan.md`
- Backend sidebar: `soupmarkets-web/grails-app/views/layouts/sidebar/_financeVertical.gsp`
- Backend reports sidebar: `soupmarkets-web/grails-app/views/layouts/sidebar/_financeReportsVertical.gsp`

## Design Cross-Reference (Added)
- 114 design files in `/soupfinance-designs/` mapped to gap items
- Key patterns: Card-based forms, 2-col payment layout, report dashboard template (summary cards + charts + expandable table)
- Shared components identified: DateRangePicker, MultiSelect, ExportModal, SummaryCards, StatusBadge, FileUpload, SearchableSelect, ExpandableTable, ConfirmDialog
- Smart adaptations: Progressive disclosure (essential/advanced/excluded), combined Vendor+Client directory, multi-invoice payment allocation

## Recommendations
Execute in 4 design-aware phases: 1A Shared Components → 1B Field Gaps → 2 New P1 Modules → 3 P2 Modules → 4 Polish
