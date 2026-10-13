# SOUPFIN-163 Ledger Paging: Backend Plan

## Context

SOUPFIN-163 moved the Ledger Transactions page to server-side paging, added an
account ledger with a running balance (`/ledger/accounts/:id`), and added a CSV
export that walks every page. The frontend needs nothing more to work. This plan
lists what the backend should add so the remaining client-side work can move to
the server.

Verified on the LXC backend (10.115.213.183:9090) on 2026-10-13.

| Endpoint | Paging | Filters it reads | Total count |
|---|---|---|---|
| `GET /rest/ledgerTransaction/index.json` | `max` (≤1000), `offset`, `sort`, `order` | `ledgerAccount`, `from`, `to` (transactionDate), `search`, `balanced`, `verifiedTransaction` | `totalCount` on every row |
| `GET /rest/ledgerTransactionGroup/index.json` | same | `from`, `to` on **dateCreated** (SbDomain.defaultSearch) | `totalCount` on every row |
| `GET /rest/voucher/index.json` | same | `voucherType`, `voucherTo`, `status` (ApprovalState), `from`, `to` (transactionDate) | `totalCount` on every row |
| `GET /rest/ledgerAccount/balance/{id}.json` | n/a | `from`, `to` | n/a |

No endpoint sends an `X-Total-Count` header. The frontend reads it first if it
ever appears (`src/api/paging.ts`), then falls back to the per-row `totalCount`.

## Required Changes

### 1. Status filter on LedgerTransaction.searchList

The page offers Draft / Pending / Posted / Reversed. The domain field is
`status` of type `ApprovalState` (PENDING, APPROVED, REJECTED and others), and
`searchList` has no `status` clause. The page filters the loaded page only and
says "on this page" when it does.

- Add to `LedgerTransaction.searchList`:
  `if (params?.status) eq('status', ApprovalState.valueOf(params.status))`
- Decide and document how the four UI states map to `ApprovalState`
  (likely Draft → PENDING, Posted → APPROVED, Reversed → a reversal flag).
  The frontend will then send `status` and drop the client-side filter.

### 2. Stable sort for offset paging

`sort=transactionDate` is not unique; rows on the same date can move between
pages. The frontend dedupes by id, which stops repeats but not gaps.

- In `LedgerTransactionController.index`, add `id` as a secondary order after
  the requested sort (for example `order(params.sort, params.order); order('id', 'asc')`
  inside the criteria), or accept `sort=transactionDate,id`.

### 3. Group date filter on the entry date

`LedgerTransactionGroup.searchList` delegates to `SbDomain.defaultSearch`, which
applies `from`/`to` to `dateCreated`. The register filters groups by date in the
browser instead.

- Override `searchList` for `LedgerTransactionGroup` to apply `from`/`to` to
  `transactionDate`.
- Note: `sort=groupDate` returns 500 (`could not resolve property: groupDate`).
  The frontend sorts groups by `transactionDate`.

### 4. Index rows for the Transaction Register

The register builds its rows from `ledgerTransactionList` on each group and
from `voucherType`, `amount`, `cashAccount`, `expenseAccount` and
`incomeAccount` on each voucher. Neither index template renders those fields,
so on real data the register is mostly empty. Filed separately; see the PM
comment on SOUPFIN-163 for the new issue key.

- Either render those fields in `_ledgerTransactionGroup.gson` /
  `_voucher.gson` for the index view, or
- Add a unified `GET /rest/financeReports/transactionRegister.json` that returns
  one line per posting (date, reference, account, debit, credit, status, type,
  source id) with `max`, `offset`, `from`, `to`, `ledgerAccount`, `status` and
  `type` filters and a total. The register would then page on the server like
  the Ledger Transactions page, instead of loading every page of two sources.

### 5. Opening balance sign

`/ledgerAccount/balance/{id}` signs `startingBalance`/`endingBalance` by the
account's `ledgerState`, which is null on many accounts (null makes both 0
whatever was posted). The account ledger therefore asks for the raw `debit` and
`credit` sums from the start of the books to the day before the period and
signs them on the client (assets and expenses debit-normal, the rest
credit-normal).

- Backfill `ledgerState` from the account category's group, or default it in
  `getBalanceAt` from the group when null.

## API Contract the Frontend Uses Today

```
GET /rest/ledgerTransaction/index.json?max=50&offset=50&sort=transactionDate&order=desc
    &ledgerAccount={id}&from=YYYY-MM-DD&to=YYYY-MM-DD
→ [ { id, transactionDate, transactionState, amount, notes, quickReference,
      status, ledgerAccount: { id, serialised }, totalCount }, ... ]

GET /rest/ledgerAccount/balance/{id}.json?from=1900-01-01&to=YYYY-MM-DD
→ { id, name, debit, credit, startingBalance, endingBalance, balance, currency, from, to }
```
