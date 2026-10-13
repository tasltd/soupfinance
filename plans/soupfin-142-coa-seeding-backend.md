# SOUPFIN-142 COA Seeding — Backend Plan (soupmarkets-web)

**Date**: 2026-10-10
**Epic**: SOUPFIN-142 · **Children**: SOUPFIN-143, 144, 145, 146 (backend), 147 (frontend, blocked on 145)
**Supersedes the root-cause table in**: `plans/coa-template-seeding.md` §1 (see the correction note there)
**Executed by**: a separate session with soupmarkets-web context (`.claude/rules/backend-changes-workflow.md`)

---

## Context

`plans/coa-template-seeding.md` assumed the backend never seeds a Chart of Accounts.
That is no longer true. Checked against soupmarkets-web on 2026-10-10:

| Plan claim | What the code and the LXC database show |
|---|---|
| Registration never seeds a COA | `AccountRegistrationService.register()` calls `createDefaultChartOfAccounts(account)` (line ~179). SERVICES gets 9 categories and 32 accounts, TRADING 37 accounts, brokers the Ghana SEC chart. Six SERVICES tenants registered on the LXC in June 2026 each have exactly 32 accounts and 9 categories. |
| SERVICES tenants get 403 on `/rest/ledgerAccount/*` | `createDefaultAccountModules(account)` (SOUP-1817) creates `AccountModule(FINANCE)` for SERVICES. `ledgerAccount` is in `FinanceModuleInterceptor`'s match list, so new tenants pass. |
| There is no backfill | `seedChartOfAccountsForTenant` / `seedChartOfAccountsForAllTenants` and the module equivalents exist, exposed as `POST /account/seedChartOfAccounts.json` and `/account/seedAllChartOfAccounts.json`. Both require `ROLE_ADMIN_ROOT`. |

So why did the page look empty? Two frontend bugs, both fixed in the SOUPFIN-142 frontend commit:

1. The page called `/rest/ledgerAccount/index.json` with no `max`. `LedgerAccountController.index` defaults `max` to 10 and sorts by `dateCreated desc`, so a 32-account chart showed only the 10 newest rows (all expenses). It now pages with `max=1000&offset=N&sort=number&order=asc`.
2. Accounts whose category FK carried no group were dropped. When every account was affected the page rendered nothing. They now show under "Uncategorised".

What remains is real backend work. It is listed below.

---

## Gap 1 — A/P lookup returns null on every seeded tenant (SOUPFIN-143/144, urgent)

`Account.checkAndGetDefaultPayableAccount()` (`grails-app/domain/soupbroker/Account.groovy` ~558) does:

```groovy
def category = LedgerAccountCategory.findByName("OTHER LIABILITIES")
if (!category) return null
```

Neither `createServicesChartOfAccounts` nor `createTradingChartOfAccounts` creates an "Other Liabilities" category
(their liability categories are "Current Liabilities" and "Non-Current Liabilities"). So the default payable
account is null for every tenant seeded at registration, and bill posting has no credit account.

`checkAndGetDefaultReceivableAccount()` (~693) looks up "OTHER ASSETS". The templates do create "Other Assets",
so it succeeds, but it creates a **second** receivable account named `"{tenant name} Receivable Account"`
instead of using the template's `1100 Accounts Receivable`. A/R balances split across two accounts.

**Required change** (pick one, prefer A):

- **A.** At the end of `createDefaultChartOfAccounts`, link the seeded accounts:
  `account.defaultReceivableAccount = <1100>`, `account.defaultPayableAccount = <2000>`, and save the Account
  inside the same `Tenants.withId` block. `checkAndGetDefault*` then returns early (`if(!defaultPayableAccount)`)
  and never needs the category lookup.
- **B.** Add an "Other Liabilities" category (LIABILITY) to both templates. This fixes the null but keeps the
  duplicate-A/R problem, so it is the weaker option.

Backfill: for tenants that already have a seeded chart but null `default_payable_account_id`, run the same
linking by account number (`1100`, `2000`) in the Gap 4 job.

## Gap 2 — no system-account flags (SOUPFIN-143)

`createLedgerAccounts` saves accounts with only `name`, `number` and `ledgerAccountCategory`. Every account is
`systemAccount=false, editable=true, deletable=true`, so a user can delete Accounts Receivable or Accounts Payable
(the frontend CRUD in SOUPFIN-149 will respect these flags once they are right).

**Required change**: extend the template maps with `system: true` for 1000 Cash, 1100 A/R, 2000 A/P, 2300/2310
taxes, 3100 Retained Earnings, 3200 Current Year Earnings (TRADING also 1200 Inventory and 5000 COGS) and set
`systemAccount: true, editable: false, deletable: false` on those rows. Keep the `cashFlow` flag on 1000.

## Gap 3 — tenant admins cannot apply a template (SOUPFIN-145)

Existing tenants with an empty chart have no self-service path; the seed endpoints are `ROLE_ADMIN_ROOT` only.

**Required endpoints**:

```
GET  /rest/coaTemplate/index.json
     → [{ "code": "SERVICES", "name": "Services company", "accountCount": 32,
          "accounts": [{ "number": "1000", "name": "Cash and Cash Equivalents",
                         "category": "Current Assets", "ledgerGroup": "ASSET", "system": true }] }]

POST /rest/ledgerAccount/applyTemplate.json?SYNCHRONIZER_TOKEN=..&SYNCHRONIZER_URI=..
     body: { "template": "SERVICES", "dryRun": true }
     → { "template": "SERVICES", "created": 32, "skipped": 0,
         "accounts": [{ "number": "1000", "name": "Cash and Cash Equivalents", "action": "create" }] }
```

- `@Secured(['ROLE_ADMIN'])` (tenant admin), scoped to `Account.current()` — never an `id` parameter.
- Idempotent: match on `number` within the tenant, skip existing rows (do not compare by name; names collide
  with user-renamed accounts). Running it twice returns `created: 0`.
- Reuse `createLedgerAccounts`, but drop its `count > 0 → skip everything` guard for this path, so a tenant with
  a partial chart gets the missing rows.
- `template` defaults to the tenant's `businessLicenceCategory`; reject an unknown code with 422.
- Both controllers sit under `FinanceModuleInterceptor`; add `coaTemplate` to its match list.
- When this ships, file the frontend picker against it (SOUPFIN-147); the frontend empty state already offers
  "Refresh accounts" and points to an administrator until then.

## Gap 4 — legacy tenants are skipped by the backfill (SOUPFIN-146)

On the LXC copy, 207 of 214 accounts have `business_licence_category IS NULL`. `createDefaultChartOfAccounts`
does nothing for NULL ("admin creates manually"), so `seedAllChartOfAccounts` skips them.

**Required change**: a one-off job (or extend `seedChartOfAccountsForAllTenants`) that, for each tenant with
**zero non-archived ledger accounts**:

1. treats NULL `businessLicenceCategory` as SERVICES only when the tenant was created through `/account/register`
   (has an Agent with an SbUser and no brokerage modules) — otherwise log and skip;
2. seeds the chart, links defaults (Gap 1A), seeds `AccountModule` rows;
3. writes one structured log line per tenant (`COA_BACKFILL accountId= created= skipped= reason=`).

Never touch a tenant that already has accounts. Take a database backup before the production run.

## Gap 5 — balances always show 0.00 (separate ticket)

`LedgerAccountController.fieldList` renders `calculatedBalance`, but the frontend reads `balance`. Filed as its
own frontend issue; not part of this plan.

---

## Tests (backend)

- `AccountRegistrationServiceSpec`: a SERVICES registration produces 32 accounts, `defaultReceivableAccount.number
  == '1100'`, `defaultPayableAccount.number == '2000'`, and the system accounts are not deletable.
- `LedgerAccountControllerFunctionalSpec`: `applyTemplate` dry run creates nothing; a real run creates 32; a
  second run creates 0; ROLE_USER gets 403; another tenant's accounts are untouched.
- Integration: register → post an invoice and a bill on the brand-new tenant → both create ledger transactions
  against 1100 and 2000.

## Acceptance (epic)

- A new TRADING or SERVICES registration opens a populated, grouped chart (already true after the frontend fix)
  **and** can post an invoice and a bill (needs Gap 1).
- An existing empty tenant can apply a template from the UI, idempotently (needs Gap 3 + SOUPFIN-147), or is
  backfilled (Gap 4).
