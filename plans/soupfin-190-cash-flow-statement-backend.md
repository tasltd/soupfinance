# SOUPFIN-190 Cash Flow Statement — Backend Plan (soupmarkets-web)

Do not implement this from the soupfinance repo. It is a hand-off for a session
that works in `soupmarkets-web` (see `.claude/rules/backend-changes-workflow.md`).

## Context

The SoupFinance Cash Flow page used to build its statement in the browser from
`/rest/financeReports/accountTransactions.json`. It sorted rows into sections by
matching words in the account *name* ("loan", "equipment") and always showed an
opening cash balance of 0. Those figures were not a cash flow statement.

The frontend (SOUPFIN-190) now calls a real endpoint and enables PDF and Excel
export through it. Until this plan ships, the page shows a "not available on
this server yet" error instead of invented figures.

## What exists today (verified 2026-10-14)

`FinanceReportsController.cashFlow()` (SOUP-1748, on both `master` and
`authentication-base-on-multi-tenancy-descriminator`) wraps
`FinanceService.generateCashFlowStatement(from, to)`. Against the SoupFinance
LXC backend (`10.115.213.183:9090`, user `david.tetteh`) it fails on every call:

```
GET /rest/financeReports/cashFlow.json?from=2026-01-01&to=2026-10-14
-> 500 {"error":"could not resolve property: account of: soupbroker.finance.LedgerAccount", ...}

GET /rest/financeReports/cashFlowStatement.json?from=2026-01-01&to=2026-10-14
-> 404 (no such action)

GET /rest/financeReports/cashFlow.json?...&f=pdf
-> 500, same error: the action never looks at params.f
```

Defects in `generateCashFlowStatement` (FinanceService.groovy ~line 190):

1. `eq('account', Account.current())` on `LedgerAccount` and `LedgerTransaction`.
   Neither domain has an `account` property; tenancy is the discriminator
   `tenantId`. This is the 500 above. The same pattern is at lines 18, 209 and 221.
2. `ledgerAccountService.calculateBalanceAsOf(account, date)` does not exist in
   `LedgerAccountService` (grep finds only the call sites). Once defect 1 is
   fixed, this throws `MissingMethodException`.
3. Only double-entry rows are read (`debitLedgerAccount` / `creditLedgerAccount`).
   Single-entry rows (`ledgerAccount` + `transactionState`) are ignored.
4. A cash movement whose other side is a current asset (a customer paying an
   A/R invoice) or a current liability falls into no section, so
   `beginning + net != ending`. Those are operating cash flows.
5. A transfer between two cash accounts is counted once, as an operating
   outflow or inflow. It moves no cash and must be left out.

## Required changes

### FinanceService.generateCashFlowStatement(Date from, Date to)

- Drop every `eq('account', Account.current())`; rely on the tenant filter.
- Cash accounts: `LedgerAccount.findAllByCashFlowAndArchived(true, false)`.
- Opening cash = sum over cash accounts of the balance as of the end of
  `from - 1 day`. Closing cash = the same as of the end of `to`. Use ONE helper
  for both (add `LedgerAccountService.balanceAsOf(LedgerAccount, Date)` if no
  equivalent exists; check `financeOtherReportsService.accountBalances`, which
  already computes `endingDebit` / `endingCredit` per account for a date range).
  Using the same helper is what guarantees *opening of period N = closing of
  period N-1*.
- Read both entry modes: double-entry rows where either side is a cash account,
  and single-entry rows on a cash account.
- Skip rows where both sides are cash accounts.
- Classify by the *other* side's ledger group, never by name:
  | Other side | Section |
  |---|---|
  | REVENUE, EXPENSE | operating |
  | ASSET with `ledgerGroupType == LONG_TERM_ASSETS` | investing |
  | ASSET, any other (receivables, prepayments, inventory) | operating |
  | LIABILITY with a long-term group type (loans) | financing |
  | LIABILITY, any other (payables, tax due) | operating |
  | EQUITY | financing |
  | unknown / single-entry with no counter-account | operating |
- Sign: cash debited = inflow (+amount), cash credited = outflow (-amount).
  Use `baseAmount` when the account currency differs from the tenant currency,
  so all figures are in the reporting currency.
- `netCashFlow` = operating + investing + financing.
- Invariant to assert in tests: `closing - opening == netCashFlow` (to the cent).

### FinanceReportsController.cashFlowStatement()

Add a new action; keep `cashFlow()` as a one-line alias so nothing that calls it breaks.

```groovy
def cashFlowStatement() {
    utilityService?.formatFromAndToDates(params)
    // defaults: from = first of current month, to = today (same as cashFlow())
    def data = financeService.generateCashFlowStatement(params.from as Date, params.to as Date)
    if (params.f && params.f != 'html') {
        params.fields = ['section', 'transactionDate', 'description', 'ledgerAccountName', 'amount']
        return doExport(toExportRows(data), params)   // see below
    }
    render(toCashFlowResponse(data, params.from as Date, params.to as Date) as JSON)
}
```

- Export rows: one row per activity with `section` = "Operating" / "Investing" /
  "Financing", then three subtotal rows, then "Opening cash", "Net change",
  "Closing cash". `doExport` takes Maps fine: the formatters only read `value`.
- `doExport` names the file `finance-<action>-report-<date>.<f>`; for
  `f=excel` that is `.excel`. Either pass `params.extension = 'xls'` for excel or
  leave it: the frontend saves the blob under its own name
  (`cash-flow-<from>-to-<to>.pdf` / `.xls`).
- Errors: return a real 500 with `{error: message}`. Do NOT return a
  200 with an empty statement, the frontend would show it as "no activity".
- The module interceptor must allow `cashFlowStatement` for SERVICES tenants
  exactly as it allows `trialBalance` (SoupFinance tenants are SERVICES).

## API contract the frontend reads

`GET /rest/financeReports/cashFlowStatement.json?from=YYYY-MM-DD&to=YYYY-MM-DD`

```json
{
  "periodStart": "2026-08-01",
  "periodEnd": "2026-08-31",
  "beginningCashBalance": 120000.00,
  "operatingActivities": [
    {
      "description": "Customer receipt — INV-0042",
      "amount": 2400.00,
      "ledgerGroup": "ASSET",
      "ledgerAccountId": "8a8081...",
      "ledgerAccountName": "Accounts Receivable",
      "transactionDate": "2026-08-14"
    }
  ],
  "totalOperatingCashFlow": 2400.00,
  "investingActivities": [],
  "totalInvestingCashFlow": 0,
  "financingActivities": [],
  "totalFinancingCashFlow": 0,
  "netCashFlow": 2400.00,
  "endingCashBalance": 122400.00
}
```

`beginningCashBalance` is required: the frontend rejects a 200 without it rather
than show 0 again. Money fields may be numbers or numeric strings. `ledgerGroup`,
`ledgerAccountId`, `ledgerAccountName` and `transactionDate` are optional but wanted.

Export: same URL with `f=pdf`, `f=excel` or `f=csv` returns the file bytes.
The frontend maps its `xlsx` choice to `f=excel` (SOUPFIN-60).

## Tests (soupmarkets-web)

- `FinanceServiceSpec` (unit, data-driven):
  - empty period, no cash accounts -> all zero, empty arrays;
  - one receipt against REVENUE -> operating +x;
  - A/R receipt (current ASSET) -> operating, and `closing - opening == net`;
  - fixed-asset purchase -> investing -x; loan drawdown -> financing +x;
  - cash-to-cash transfer -> excluded, net 0;
  - single-entry row on a cash account -> counted;
  - two consecutive months -> opening(Sep) == closing(Aug);
  - 10,000 rows -> totals still reconcile (overflow case).
- `FinanceReportsFunctionalSpec`: `cashFlowStatement.json` 200 with the contract
  above; `f=pdf` returns `application/pdf`; `f=excel` returns OLE2 bytes
  (`d0cf11e0`); a SERVICES tenant gets 200, not the module 403.

## Frontend side (done in SOUPFIN-190)

- `getCashFlowStatement` calls `cashFlowStatement.json`, validates with
  `cashFlowStatementResponseSchema` and normalises (section totals, net = sum of
  sections). The name heuristic is gone.
- Cash Flow PDF and Excel use `exportFinanceReport('cashFlowStatement', ...)`.
- `e2e/integration/soupfin-190-cash-flow.integration.spec.ts` checks this
  contract and the two invariants against the LXC backend. It fails until this
  plan is deployed there.
