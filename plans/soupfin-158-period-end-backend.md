# SOUPFIN-158 Period-end Backend Plan: financial years, lock date, year-end close, opening balances

**For:** a soupmarkets-web session. Per `.claude/rules/backend-changes-workflow.md`, the soupfinance session does not edit the backend.
**Frontend:** done on the SOUPFIN-158 branch. It calls the endpoints below and shows a visible error until they exist.
**HTML version with screens and the plan index:** `plans/soupfin-158-period-end.html`.

## Context

Gap analysis §12 lists "Close Financial Year" as missing. Before this ticket the SPA had only a "Start of Fiscal Year" field on Account Settings.

What the backend has today (read 2026-10-12, soupmarkets-web):

| Piece | State |
|---|---|
| `soupbroker.finance.FinancialYear` | Domain exists: `account`, `name`, `fromDate`, `toDate`, `notes`, `archived`. No status. |
| `FinancialYearController` | Scaffold CRUD only: `index`, `archived`, `show`, `create`, `save` (withForm), `edit`, `update`, `delete`. |
| `FinanceModuleInterceptor` | Already matches `financialYear`, so the new actions are gated with the rest of Finance. |
| `LedgerJournal` | Javadoc promises "period locking", but nothing enforces it. Grep finds no check on any save path. |
| `FinanceService.getStartOfFinancialYear` | **Bug:** queries `startDate` / `endDate`, which do not exist on `FinancialYear` (`fromDate` / `toDate`). It throws as soon as a tenant has a year row. Filed separately; fix it in the same change. |
| Retained Earnings / Opening Balance Equity accounts | Seeded by SOUPFIN-143 templates as `3100 Retained Earnings` and `3200 Opening Balance Equity`. `LedgerAccount.accountType` (SOUPFIN-143 P3) is not on the backend yet. |

## 1. Domain changes

### 1.1 `FinancialYear`

Add:

```groovy
String status = 'OPEN'                // OPEN | CLOSED. Not null, default OPEN.
Date closedAt                         // nullable
String closedBy                       // nullable, username
LedgerTransactionGroup closingTransactionGroup   // nullable; the year-end entry
```

Constraints: `status inList: ['OPEN','CLOSED']`, `toDate validator: { val, obj -> val > obj.fromDate }`.
Migration: add the four columns; backfill `status = 'OPEN'` for every existing row.

### 1.2 `Account`

Add `Date lockDate` (nullable). The last locked day, inclusive. Null means nothing is locked.

## 2. FinancialYear endpoints

All on `FinancialYearController`, under `/rest/financialYear/*`, behind `FinanceModuleInterceptor`. JSON in and out. Dates are `yyyy-MM-dd`.

### 2.1 `GET /rest/financialYear/index.json`

Exists. Add `status`, `closedAt`, `closedBy` to `fieldList` so the list returns them. The SPA sends `max=100&sort=fromDate&order=desc`.

### 2.2 `POST /rest/financialYear/save.json`

Exists (withForm, CSRF from `create.json`). Add validation, answering 422 with a `code`:

| Rule | code |
|---|---|
| `toDate` on or before `fromDate` | `FINANCIAL_YEAR_INVALID_RANGE` |
| Shares a day with another non-archived year of the tenant | `FINANCIAL_YEAR_OVERLAP` |

`update` must refuse to change the dates of a CLOSED year (`FINANCIAL_YEAR_CLOSED`, 409).

### 2.3 `GET /rest/financialYear/closeChecklist/{id}.json` (new)

```json
{
  "pendingEntries": 0,
  "pendingEntriesDetail": { "draftInvoices": 0, "draftBills": 0, "pendingVouchers": 0, "unpostedJournalEntries": 0 },
  "trialBalance": { "totalDebit": 153500.00, "totalCredit": 153500.00, "balanced": true },
  "netIncome": 41200.00,
  "retainedEarningsAccount": { "id": "…uuid…", "name": "Retained Earnings" }
}
```

- `pendingEntries` = the sum of `pendingEntriesDetail`: draft invoices and bills, PENDING vouchers, unposted LedgerTransactionGroups, each dated inside `fromDate..toDate`.
- `trialBalance` for `fromDate..toDate`, through the same service as `/rest/financeReports/trialBalance.json`. `balanced` = totals equal to the cent.
- `netIncome` = REVENUE minus EXPENSE for the range. Negative is a loss.
- `retainedEarningsAccount`: the tenant's `LedgerAccount` with `accountType = RETAINED_EARNINGS` once SOUPFIN-143 P3 ships; until then the non-archived account named `Retained Earnings` (exact, case-insensitive). Null when none exists.

### 2.4 `POST /rest/financialYear/close/{id}.json` (new)

Body `{}`. No withForm (custom action, like `reportSchedule/toggleStatus`). One transaction, with a pessimistic lock on the tenant `Account` row so two closes cannot interleave.

Refusals (no change made):

| Condition | Status | code |
|---|---|---|
| Already CLOSED | 409 | `FINANCIAL_YEAR_ALREADY_CLOSED` |
| An earlier year of the tenant is still OPEN | 422 | `PREVIOUS_YEAR_OPEN` (message names the year) |
| `pendingEntries > 0` | 422 | `PENDING_ENTRIES` |
| Trial balance not balanced | 422 | `TRIAL_BALANCE_UNBALANCED` |
| No Retained Earnings account | 422 | `RETAINED_EARNINGS_MISSING` |

Effects:

1. Post one LedgerTransactionGroup dated `toDate`, description `Year-end close {name}`. For every REVENUE and EXPENSE account with a non-zero balance for the range, one line that brings it to zero; one balancing line to Retained Earnings for `netIncome` (credit on profit, debit on loss). This entry is exempt from the lock check below, because it is dated on the day the close is about to lock.
2. `status = CLOSED`, `closedAt = now`, `closedBy = currentUser.username`, `closingTransactionGroup = <the group>`.
3. `account.lockDate = max(account.lockDate, toDate)`.
4. Respond 200 with the year (same JSON as `show`).

### 2.5 `POST /rest/financialYear/reopen/{id}.json` (new, `@Secured(['ROLE_ADMIN'])`)

| Condition | Status | code |
|---|---|---|
| Not CLOSED | 409 | `FINANCIAL_YEAR_NOT_CLOSED` |
| A later year is CLOSED | 422 | `LATER_YEAR_CLOSED` (reopen the latest first) |

Effects: reverse (archive) `closingTransactionGroup`; `status = OPEN`, clear `closedAt`/`closedBy`/`closingTransactionGroup`; `account.lockDate` = the `toDate` of the latest year still CLOSED, or null. Respond 200 with the year.

### 2.6 `GET /rest/financialYear/lockDate.json` and `PUT /rest/financialYear/lockDate.json` (new)

- GET (ROLE_ADMIN, ROLE_USER) → `{ "lockDate": "2025-12-31" }` or `{ "lockDate": null }`.
- PUT (`@Secured(['ROLE_ADMIN'])`), body `{ "lockDate": "2025-06-30" }` or `{ "lockDate": null }` → the stored value, same shape.
- Refuse a value earlier than the `toDate` of the latest CLOSED year: 422 `LOCK_DATE_BEFORE_CLOSED_YEAR`. Reopen the year to go further back.

## 3. Lock-date enforcement

Add `PeriodLockService.assertOpen(Date date, String field)`. It reads `Account.current().lockDate` and throws `PeriodLockedException(lockDate, field)` when `date` is on or before it (compare calendar days in the tenant's zone, not instants).

Call it on every create, update and delete of a posting document, from the service, so every controller and the MCP tools are covered:

| Service | Date checked | `field` |
|---|---|---|
| `LedgerTransactionService.save` / `delete` (covers `saveMultiple` and `ledgerTransactionGroup/update`) | each `LedgerTransaction.transactionDate`; on update also the stored date | `transactionDate` |
| `VoucherService.save` / `delete` | `transactionDate` | `transactionDate` |
| `InvoiceService.save` / `delete` | `invoiceDate` | `invoiceDate` |
| `BillService.save` / `delete` | `billDate` | `billDate` |
| Payments (`InvoicePayment`, `BillPayment`) | payment date | `paymentDate` |

An update must check both the old and the new date: moving an entry *out of* a locked period is also a change to it.

Render the exception (a controller advice or the existing error handler) as:

```http
HTTP/1.1 422
Content-Type: application/json

{ "code": "PERIOD_LOCKED",
  "error": "The books are closed up to 31 Dec 2025. Choose a date after the lock date.",
  "lockDate": "2025-12-31",
  "field": "transactionDate" }
```

**422, not 403.** 403 already means "module disabled" or "role denied" (SOUPFIN-150), and the SPA reads a 403 on a ledger URL as a disabled module. The SPA keys on `code`, so a 403 with `code: PERIOD_LOCKED` would still be shown correctly, but 422 keeps the two apart for every other client.

The SPA puts the message under the form's date field (journal entry, voucher, invoice, bill, opening balances).

## 4. Year-end close: accounting detail

- Close only REVENUE and EXPENSE accounts (the ledger groups the trial balance already uses). Never touch ASSET, LIABILITY or EQUITY balances other than Retained Earnings.
- Use the tenant currency. A foreign-currency P&L account closes at its booked base-currency balance; no revaluation.
- The closing group is an ordinary posted group, so the Trial Balance for the closed year, run as of `toDate`, shows P&L accounts at zero and Retained Earnings up by `netIncome`. Reports run for a range inside the year (`from` > `fromDate`) are unaffected except on `toDate`.

## 5. Opening balances

### `POST /rest/financialYear/openingBalances.json` (new, ROLE_ADMIN and ROLE_USER)

Request:

```json
{ "asOfDate": "2023-12-31",
  "lines": [
    { "ledgerAccount": { "id": "…" }, "debit": 60000.00, "credit": 0 },
    { "ledgerAccount": { "id": "…" }, "debit": 0, "credit": 27500.00 }
  ] }
```

Rules:

| Rule | Status | code |
|---|---|---|
| `lines` empty, or a line with both or neither side, or a negative amount | 422 | `OPENING_BALANCES_INVALID_LINE` (message names the account) |
| Total debit ≠ total credit (to the cent) | 422 | `OPENING_BALANCES_UNBALANCED` |
| An account not in this tenant, or archived | 422 | `OPENING_BALANCES_UNKNOWN_ACCOUNT` |
| `asOfDate` on or before the lock date | 422 | `PERIOD_LOCKED` (§3) |
| No Opening Balance Equity account | 422 | `OPENING_BALANCE_EQUITY_MISSING` |

Effect: post one balanced LedgerTransactionGroup dated `asOfDate`, description `Opening balances`, one LedgerTransaction per line. Opening Balance Equity (`accountType = OPENING_BALANCE_EQUITY`, else the account named `Opening Balance Equity`) is the plug: the SPA's "Put the difference in Opening Balance Equity" button writes the difference into that account's row, so a balanced grid already contains it. Respond 201:

```json
{ "ledgerTransactionGroup": { "id": "…" }, "asOfDate": "2023-12-31", "lineCount": 5, "totalDebit": 85000.00, "totalCredit": 85000.00 }
```

Posting opening balances twice posts twice. The SPA does not guard against it; a later ticket can add a "replace previous opening balances" option.

**Acceptance:** the Trial Balance run with `to = asOfDate` lists each line's account with the entered debit or credit.

## 6. Tests (soupmarkets-web)

- `PeriodLockServiceSpec`: null lock date; the lock day itself refused; the next day allowed; a tenant-zone date that is the previous UTC day.
- `FinancialYearServiceSpec`: close posts the right closing lines for profit, loss and zero; refusals for each §2.4 code; reopen restores the lock date to the previous closed year or null; lock date cannot go below a closed year.
- `FinancialYearFunctionalSpec` (HTTP): close FY N, then `POST /rest/ledgerTransaction/saveMultiple.json` dated in FY N returns 422 `PERIOD_LOCKED`; one dated the day after `toDate` returns 201. Opening balances then `GET /rest/financeReports/trialBalance.json?to=asOfDate` shows them. Overflow: close a year with 1,000 P&L accounts; post 1,000 opening-balance lines.

## 7. Frontend contract already built (SOUPFIN-158 branch)

| SPA file | Calls |
|---|---|
| `src/api/endpoints/financialYears.ts` | every endpoint above |
| `src/api/errors.ts` `getPeriodLockError()` | reads `code: PERIOD_LOCKED`, `lockDate`, `field`, `error` |
| `src/features/settings/FinancialYearsPage.tsx` | list, create, close with checklist, reopen (admin), lock date (admin edits) |
| `src/features/settings/OpeningBalancesPage.tsx` | the opening-balances grid |
| `e2e/soupfin-158-financial-years.spec.ts` | a stateful mock of this contract; swap it for the LXC backend once this ships |
