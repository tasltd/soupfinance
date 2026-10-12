# SOUPFIN-155: Journal Entry Post / Reverse Backend Plan

**Status:** Needed. The frontend ships against the contract below with mocked E2E.
**Repo:** soupmarkets-web (do not change it from this repo, see `.claude/rules/backend-changes-workflow.md`)
**Date:** 2026-10-12

## Context

The SoupFinance Journal Entry page now has a real lifecycle:

| Button | When shown | Calls |
|--------|-----------|-------|
| Save Draft | New or PENDING entry | `saveMultiple` (new) or `ledgerTransactionGroup/update/:id` |
| Save & Post / Post | New or PENDING entry | save as above, then `POST /rest/ledgerTransactionGroup/post/:id.json` |
| Reverse | POSTED entry | `POST /rest/ledgerTransactionGroup/reverse/:id.json` |
| Delete | PENDING entry | `DELETE /rest/ledgerTransactionGroup/delete/:id.json` |

The Transaction Register menu has called `post` and `reverse` since SOUPFIN-9.

## What the backend has today (verified 2026-10-12)

Checked `LedgerTransactionGroupController.groovy` on `master`,
`authentication-base-on-multi-tenancy-descriminator` and the working branch:

- Actions: `index`, `archived`, `show`, `create`, `save`, `edit`, `update`, `delete`.
- **No `post` action and no `reverse` action.** Both calls from the register and
  the new entry page fail.
- `LedgerTransactionGroup` has **no `status` field**. The frontend type declares
  `status: 'PENDING' | 'POSTED' | 'REVERSED'`, but real responses never carry it,
  so every entry is treated as editable.
- `LedgerTransaction.status` is an `ApprovalState` (PENDING/APPROVED/REJECTED)
  used by `LedgerTransactionApprovalController`. That is an approval workflow,
  not posting. Do not reuse it for this.
- `delete` does not check state, so a posted entry can be deleted.
- `ledgerTransaction/saveMultiple` responds with the saved group and `201`, so
  the frontend gets the new `id` it needs for the post call.

The LXC backend could not be probed live: `/rest/api/login` returned 401 for the
seed users (stale connection pool, needs a service restart, which this run was
not allowed to do). The source check above is the evidence.

## Required changes

### Domain: `LedgerTransactionGroup`

```groovy
enum JournalEntryStatus { PENDING, POSTED, REVERSED }

JournalEntryStatus status = JournalEntryStatus.PENDING
Date postedDate
Date reversedDate
LedgerTransactionGroup reversalOf   // set on the reversing group
LedgerTransactionGroup reversedBy   // set on the original group

static constraints = {
    status nullable: false
    postedDate nullable: true
    reversedDate nullable: true
    reversalOf nullable: true
    reversedBy nullable: true
}
```

Migration: add the columns. Existing rows get `status = 'POSTED'` if their
transactions already hit account balances, otherwise `PENDING`. Confirm which
applies before writing the migration.

### Controller: `LedgerTransactionGroupController`

```groovy
static allowedMethods = [save: "POST", update: "PUT", delete: "DELETE",
                         post: "POST", reverse: "POST"]
```

No `withForm` on `post` or `reverse`. The register and the entry page send them
without a CSRF token, the same as `update` and `delete`.

#### `post(String id)`

- 404 if the group does not exist in the tenant.
- 409 `{ "error": "Only a pending journal entry can be posted" }` unless `PENDING`.
- 422 `{ "error": "Journal entry is not balanced" }` if debits != credits.
- Otherwise set `status = POSTED`, `postedDate = now`, apply the transactions
  to the ledger (whatever "posting" means in `LedgerTransactionService`), and
  respond with the group and `200`.

#### `reverse(String id)`

Optional JSON body: `{ "reversalDate": "yyyy-MM-dd" }`. Default: today.

- 404 if missing, 409 `{ "error": "Only a posted journal entry can be reversed" }`
  unless `POSTED`.
- Create a **new** group: same accounts and amounts, DEBIT and CREDIT swapped,
  `transactionDate = reversalDate`, description `"Reversal of <reference>"`,
  `reversalOf = original`, `status = POSTED`.
- On the original: `status = REVERSED`, `reversedDate = now`, `reversedBy = new group`.
- Respond with the **new reversing group** and `201`.

A reversing entry, not a status flip, keeps the audit trail: the original stays
on the books and the reversal offsets it on its own date.

#### `delete(String id)`

- 409 `{ "error": "Only a pending journal entry can be deleted" }` unless `PENDING`.

#### `update`

- 409 unless `PENDING`. A posted entry must be reversed, not edited.

### JSON view

Render `status`, `postedDate`, `reversedDate`, `reversalOf.id` and
`reversedBy.id` in the group's GSON, so `show` and `index` carry them.

## Frontend contract (already implemented)

- `postTransactionGroup(id)` → `POST /rest/ledgerTransactionGroup/post/:id.json`, no body.
- `reverseTransactionGroup(id, { reversalDate? })` →
  `POST /rest/ledgerTransactionGroup/reverse/:id.json`, body `{ reversalDate }`
  only when the user picked one.
- The page only needs a 2xx. After `post` and `reverse` it refetches
  `show/:id.json` and reads `status` to switch the buttons, so the response
  body shape is not load-bearing.
- A missing `status` is treated as PENDING, which matches today's backend.
- Errors are shown with `getApiErrorMessage`, so the `error` strings above reach
  the user as written.

## Tests to add (backend)

- `post` on PENDING → POSTED; on POSTED → 409; unbalanced → 422.
- `reverse` on POSTED → new group with swapped states and the given date,
  original REVERSED and linked both ways; on PENDING → 409.
- `delete` and `update` on POSTED → 409.
