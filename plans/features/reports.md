# Feature Plan: Reports

**Module**: Reports `699670e6-4756-49c2-a457-b25222437958`
**Reviewed**: 2026-10-06 against main

**Scope**:
- report pages;
- the report and report-schedule API modules;
- exports;
- how currency is *displayed* in reports;
- report date helpers.

The tenant currency store and the login/logout currency bugs (SOUPFIN-53, 58) belong to the Settings module.

## 1. Overview

| Route | Component | Endpoint |
|---|---|---|
| `/reports` | `ReportsPage.tsx` (hub, 6 static cards) | — |
| `/reports/pnl` | `ProfitLossPage.tsx` | `/rest/financeReports/incomeStatement.json?from&to[&f=]` |
| `/reports/balance-sheet` | `BalanceSheetPage.tsx` | `balanceSheet.json?to[&f=]` |
| `/reports/cash-flow` | `CashFlowPage.tsx` | Built in the browser from `accountTransactions.json`; there is no backend endpoint |
| `/reports/trial-balance` | `TrialBalancePage.tsx` | `trialBalance.json?from&to[&f=]` |
| `/reports/aging` | `AgingReportsPage.tsx` | `agedReceivables.json` / `agedPayables.json?to` |
| `/reports/scheduled` | `ScheduledReportsPage.tsx` | `/rest/reportSchedule/*` (index, show, save, update, toggleStatus, delete, history, allHistory) |

- **API modules:**
  - `src/api/endpoints/reports.ts`: `getCashFlowStatement`, `exportFinanceReport`, `normalizeTransactions`.
  - `src/api/endpoints/report-schedules.ts`.
- **Helpers:**
  - `utils/date.ts`: `formatDisplayDate`, `toLocalIsoDate`, `getTodayIsoDate`, `getCurrentMonthRange`.
  - `stores/accountStore.ts`: `useFormatCurrency`.
  - The browser-side PDF templates in `utils/pdf/templates.ts` are not used by any report page.
- **Unit tests** (11 files, 177 tests, all green):
  - `features/reports/__tests__/`:
    - `AgingReportsPage.acronym`, `.currency`, `.empty`;
    - `TrialBalancePage.emptyDates`;
    - `reportDefaultDateRange`;
    - `reportExtension`.
  - `api/endpoints/__tests__/reports.test.ts`
  - `utils/__tests__/date`, `date.localIso`
- **E2E:** `reports.spec.ts`, `soupfin-64-local-date-defaults`, and the soupfin-33 and soupfin-30 specs.
- **Designs:**
  - `trial-balance-report`, `income-statement-report`, `balance-sheet-report`, `cash-flow-statement-report`;
  - `ar-aging-report`, `ap-aging-report`, `report-pnl-*`;
  - `modal-export-options`, `form-date-range-picker`.

## 2. Current status

**Works on main:**
- All 6 report pages load.
- Date filters are controlled, and the default ranges use local dates (SOUPFIN-64).
- SOUPFIN-11:
  - The Cash Flow "t is not iterable" crash is fixed.
  - The Aging "Today" button works.
  - The date picker accepts years from 1900.
- Aging uses the tenant currency (SOUPFIN-33).
- The Trial Balance empty state formats its dates (SOUPFIN-33).
- Aging acronym casing is fixed (SOUPFIN-35).
- Backend PDF and CSV exports work for P&L, Balance Sheet, Trial Balance and Aging.

**Broken on main.** Several fix branches exist but have not been merged:

| Defect | Location on main | Fix branch |
|---|---|---|
| P&L, Balance Sheet and Trial Balance show USD | `ProfitLossPage:17`, `BalanceSheetPage:17`, `TrialBalancePage:38` | SOUPFIN-73 `1fdcb57` |
| Cash Flow shows USD | `CashFlowPage:20` | SOUPFIN-67 `472477e` |
| **Excel export returns 500 in production.** The app sends `f=xlsx`, but the backend only accepts `excel`. Files are named .xlsx but contain .xls data. | `reports.ts:194,683` | SOUPFIN-60 `fa12191` |
| Minus sign appears after the currency symbol | `accountStore:131` | SOUPFIN-59 `97165bb` |
| Date labels show a day early for users west of UTC | `new Date(dateStr)` in Cash Flow, Balance Sheet, P&L | SOUPFIN-72 `9d95102` |
| Schedule history dates show a day early | `ScheduledReportsPage:329` | none (SOUPFIN-74) |
| `reportSchedule` endpoints return 403 | backend | none (SOUPFIN-191) |
| Cash Flow classifies accounts by name, starts with zero cash, and has PDF/Excel export disabled | `reports.ts:600`, `CashFlowPage:233-246` | none (SOUPFIN-190) |
| Error states do not distinguish module disabled, forbidden and 500 | every report page | none (SOUPFIN-192) |
| report-schedules sends form-urlencoded data instead of JSON, and has no tests | `report-schedules.ts:141-165` | none (SOUPFIN-193) |
| i18n keys exist but are not used | every page | none (SOUPFIN-194) |

The SOUPFIN-67, 72 and 73 branches change the same files, so rebase them together.

## 3. Task review

| ID | State change | Evidence |
|---|---|---|
| 11 | In Review (unchanged) | Frontend merged (26d5406). Open items split into 190, 191 and 192. |
| 33 | Backlog → In Review | 974ac7f and cb03e2e fix all 6 items. Items #2 and #4 (reports) pass tests. The rest moved to child tasks 208–211. |
| 35 | In Progress → Done | 6e23b7e, plus the acronym test |
| 54 | → Cancelled | Duplicate of 67 + 73 |
| 56 | In Review → Done | fd37f86 + 115559a. The test passes in October. |
| 57, 61 | → Cancelled | Duplicates of 56 |
| 59 | Backlog → In Review | Branch 97165bb, not merged |
| 60 | Backlog → In Review | Retitled to the Excel 500 bug and set to high priority. Fix on branch fa12191, not merged. |
| 64 | Backlog → Done | b19c98b, plus 3 test files |
| 65 | → Cancelled | Duplicate of 64 |
| 67 | Backlog → In Review | Branch 472477e, not merged |
| 68 | In Review → Done | Fixed on main by the helper shared with 64 |
| 72, 73 | In Review (unchanged) | Branches 9d95102 and 1fdcb57, not merged |
| 74 | Backlog → Todo | Still broken at `ScheduledReportsPage.tsx:329` |

**New tasks:**
- **190**: Cash Flow backend endpoint, then enable PDF and Excel export.
- **191**: Scheduled Reports returns 403 from the backend.
- **192**: report pages use `ApiErrorState`.
- **193**: report-schedules sends JSON, with tests.
- **194**: Reports i18n.

**SOUPFIN-33 children**, all In Review until checked in production:
- **208**: date filters (Ledger & Accounting module).
- **209**: bank dropdown (Settings).
- **210**: Users page shows "No email on file" (Settings).
- **211**: form labels (Dashboard/Layout).

## 4. Remaining work plan

**Phase 1: merge the existing fix branches**
1. Merge SOUPFIN-60 first, because Excel export is broken in production.
2. Merge SOUPFIN-59.
3. Rebase and merge SOUPFIN-73, then 67, then 72. Run the report unit tests and the three report E2E specs.
4. Verify on a GHS tenant with `TZ=America/New_York`. Check that a downloaded Excel file opens.

**Phase 2: small frontend fixes**
5. Fix the schedule history dates (closes 74).
6. Send report-schedules requests as JSON and add tests (closes 193).
7. Use `ApiErrorState` on every report page (closes 192).

**Phase 3: backend-dependent work.** Write the backend plan first; the work is done in soupmarkets-web (per SOUPFIN-13).
8. Enable `reportSchedule` for the SoupFinance tenant (closes 191).
9. Build the Cash Flow endpoint, switch the page to it, and enable PDF and Excel export (closes 190). Closing 190, 191 and 192 closes 11.

**Phase 4: polish**
10. i18n with locale-aware dates (closes 194). Build it inside the SOUPFIN-103 report shell if that lands first.
11. Production checks for 208–211 (closes 33).

## 5. Backend dependencies

| Need | Plan | Task |
|---|---|---|
| `reportSchedule` blocked for the tenant | `plans/soupfinance-report-schedule-finance-module.md`, `plans/soupfinance-finance-module-tenant-enablement.md` | SOUPFIN-191 |
| Cash flow endpoint | `plans/soupfinance-cash-flow-endpoint.md` (to write) | SOUPFIN-190 |
| Bank seed data | `plans/soupfinance-bank-seed-data-quality.md` | SOUPFIN-34 |
| Export currency | None needed; verified 2026-09-22 | — |

`plans/soupfinance-report-schedule-finance-module.md` mentions an "upgrade prompt". SoupFinance has no pricing tiers until the end of 2027, so replace it with a plain "module not enabled — contact your administrator" message.

## 6. Related QBO-parity tasks (user-facing features)

- **103**: report framework. Shared shell, timezone-safe date ranges, tenant currency, export, hub search and favourites. Absorbs the gap-analysis items for date presets, the export modal and KPI cards. Land Phases 1–2 above first.
- **104**: core report pack: Account Balances, Account Transactions, Client Income, Vendor Purchases and more.
- **105**: A/R and A/P aging summary and detail, Open Invoices, Unpaid Bills.
- **106**: profitability reports.
- **107**: custom report builder.
- **108**: cash flow forecasting. Needs 190.
- **136**: Budget vs Actual.
- **140**: Excel/CSV import and export.

## 7. Definition of done

- All money in reports goes through `useFormatCurrency`, and negative amounts read `-GH₵`.
- Report dates are correct in the Paris and New York time zones, with tests that freeze the clock.
- PDF, Excel (.xls) and CSV exports work on every backend report.
- Cash Flow comes from the backend and has its exports enabled.
- Scheduled Reports CRUD and history work on LXC and in production, using JSON.
- Every page shows distinct states for module disabled, forbidden, 500 and empty.
- Reports are translated into en, de, fr and nl.
- Unit and E2E suites are green, with no assertions that depend on the calendar date.
- SOUPFIN-11 and 33 are closed.
