# Chart of Accounts Templates & Tenant Seeding

**Date**: 2026-10-06
**Status**: PLANNED (TASCIM module "COA Templates & Tenant Seeding")
**Problem**: Every new tenant opens Ledger → Chart of Accounts and sees "No accounts found — Your chart of accounts is empty."
We already capture the company profile (business type, country, currency, industry), so the tenant should start with a COA built from its business template.

---

## 1. Root cause analysis

| # | Cause | Layer | Evidence |
|---|-------|-------|----------|
| 1 | **Registration seeds a COA of the wrong shape.** *(Corrected 2026-10-10, SOUPFIN-143.)* On the multi-tenancy branch, `AccountRegistrationService.createDefaultChartOfAccounts` already seeds a hard-coded TRADING or SERVICES chart (SERVICES: 9 categories, 32 accounts). Its income and expense categories have no `ledgerSubGroup`, so the income statement drops them. It sets no system flags and no default A/R or A/P, and it lacks the category names posting looks up. | Backend (soupmarkets-web) | `AccountRegistrationService.groovy:593-640,1140-1300`; LXC DB: all 6 SERVICES tenants have 9 categories and 32 accounts, with `ledger_sub_group` NULL and both default FKs NULL. Full evidence: `plans/soupfin-143-coa-template-seed-data.html` section 1. |
| 2 | **Module/licence gating.** SERVICES-licence tenants get 403 on `/rest/ledgerAccount/*` (Ledger and Accounting modules are not enabled). Seeded accounts would still be invisible. | Backend config | `plans/soupfinance-ledger-accounting-module-enablement.md:10-18,42-54`, `plans/soupfinance-finance-module-tenant-enablement.md:57-66` |
| 3 | **No category seed.** `LedgerAccount` requires a `LedgerAccountCategory`. The frontend has no category endpoints, so it cannot seed accounts on its own. | Backend | `src/types/index.ts:369-391`; `ledger.ts:140-150` `createLedgerAccount` is unused, and there is no category API |
| 4 | **System accounts missing.** *(Corrected 2026-10-10, SOUPFIN-143.)* `LedgerAccountType` does **not** exist in the backend; the snippet in `soupmarkets-multi-invoice-payment.md` was never built. Posting finds A/R and A/P through `Account.defaultReceivableAccount`/`defaultPayableAccount`, then through categories named `OTHER ASSETS` / `OTHER LIABILITIES`. Service descriptions and tax entries look up other category names. SOUPFIN-143 introduces the enum and wires the FKs. | Backend | `Account.groovy:559-737`, `ServiceDescription.groovy:24-60`, `TaxEntry.groovy:35-55`; plan `plans/soupfin-143-coa-template-seed-data.html` |
| 5 | **Frontend display gaps** (minor). (a) If accounts come back but none derives to a group in `GROUP_ORDER`, the page renders blank with no empty state. (b) A 403 caused by a missing role is labelled "Ledger module not available". (c) The empty state offers no way forward (no "Set up chart of accounts" CTA). | Frontend | `features/ledger/ChartOfAccountsPage.tsx:98-108`, `api/endpoints/ledger.ts:45-58`, `api/errors.ts:40-46,143-147` |

**Conclusion**: this is mainly a backend gap. The COA template exists only on paper, in `plans/soupfinance-tenant-architecture-refactor.md:243-330` and `prd/features/ledger.md:92-115`. The frontend needs a template picker, a "set up COA" path for tenants that already exist, and better empty and error states.

---

## 2. Target design

### 2.1 Templates (data-driven, backend)

A `CoaTemplate` holds categories and accounts. It is selected by:

1. `businessLicenceCategory` — TRADING (inventory, COGS) or SERVICES (labour and service costs, no inventory)
2. `industry` (optional overlay) — e.g. Professional Services, Retail, Construction, Hospitality, Non-profit, Tech/SaaS
3. `country` (optional overlay) — tax accounts, e.g. Ghana VAT / NHIL / GETFund / COVID levy payable, WHT payable

Each template account has a code, name, category, ledger group, parent code, `LedgerAccountType` (system role), `systemAccount`, `editable`, `deletable` and `cashFlow` classification.

**System accounts every template must include**: Cash/Bank, Accounts Receivable, Accounts Payable, Tax Payable (per country), Undeposited Funds, Retained Earnings, Opening Balance Equity, Sales/Service Income, Discounts Given, FX Gain/Loss, Rounding. TRADING adds Inventory Asset and Cost of Goods Sold.

The base account trees are already written in `plans/soupfinance-tenant-architecture-refactor.md:277-330` (codes 1000-6999). Reuse them.

### 2.2 Seeding points

| Trigger | Behaviour |
|---------|-----------|
| `POST /account/register.json` | In the same transaction: create the categories and accounts from the template selected by `businessType` (+ industry and country when supplied), and enable the Ledger and Accounting modules for the tenant. |
| `POST /rest/ledgerAccount/applyTemplate.json` (new) | For **existing** tenants with an empty COA, or to add accounts from an industry overlay. Idempotent: matches on code and skips accounts that exist. Supports `dryRun=true`, which returns a preview. |
| `GET /rest/coaTemplate/index.json` (new) | Lists templates with account counts so the UI can preview them. |
| Backfill job | One-off migration that seeds every tenant whose COA has 0 accounts, using that tenant's `businessLicenceCategory`. |

### 2.3 Frontend

- **Registration**: an optional Industry select next to Business type, sent in the register payload.
- **Onboarding / CompanyInfoPage**: industry is currently stored only as JSON metadata. Send it as a first-class field when the backend adds it.
- **Chart of Accounts page**:
  - Empty state gets a "Set up your chart of accounts" CTA that opens a template picker. The picker previews the accounts and calls `applyTemplate`.
  - Fix the blank render: when no account maps to a group, show the accounts in an "Uncategorised" group and log the bad category.
  - Add "New account", "Edit" and "Deactivate" actions (the `createLedgerAccount` helper already exists), respecting `editable`/`deletable`/`systemAccount`.
- **Errors**: tell a "module disabled" 403 apart from a "role missing" 403 (use the response body or code), so the user gets the right message.
- **Dashboard welcome checklist** (`empty-state-welcome-dashboard` design): a "Chart of accounts set up" step.

---

## 3. Task breakdown (TASCIM)

| # | Task | Layer | Priority |
|---|------|-------|----------|
| 1 | Backend plan + implementation: COA template domain and seed data (TRADING, SERVICES, + Ghana tax overlay) | Backend | Urgent |
| 2 | Backend: seed the COA and enable the Ledger/Accounting modules inside `/account/register.json` | Backend | Urgent |
| 3 | Backend: `applyTemplate` (idempotent, dry-run) + `coaTemplate/index` endpoints | Backend | High |
| 4 | Backend: backfill migration for existing tenants with an empty COA | Backend | High |
| 5 | Frontend: COA empty-state CTA + template picker + apply flow | Frontend | High |
| 6 | Frontend: fix the blank COA render when no group derives; "Uncategorised" fallback | Frontend | Medium |
| 7 | Frontend: CRUD for ledger accounts (new/edit/deactivate) respecting system flags | Frontend | Medium |
| 8 | Frontend: tell a module-disabled 403 apart from a missing-role 403 on ledger endpoints | Frontend | Medium |
| 9 | Registration + onboarding: capture industry as a first-class field and send it to the backend | Frontend+Backend | Medium |
| 10 | Tests: unit tests (template picker, grouping fallback), mock E2E (empty → apply → populated), LXC integration test (a new registration has a COA with A/R and A/P) | Test | High |
| 11 | Docs: correct `plans/soupfinance-tenant-architecture-refactor.md` (line 30 contradicts lines 430-431) and the PRD ledger section | Docs | Low |

## 4. Acceptance criteria (overall)

- A fresh registration (TRADING or SERVICES) opens the Chart of Accounts with the template's accounts, grouped by Asset, Liability, Equity, Income and Expense.
- An invoice and a bill can be saved and posted on a brand-new tenant, because the A/R, A/P and tax system accounts exist.
- An existing tenant with an empty COA can apply a template from the UI. Applying it twice creates no duplicates.
- Templates stay lean and usable: 60-90 accounts each. There is no account cap, because SoupFinance has no pricing tiers until the end of 2027 (SOUPFIN-109 cancelled).

## 5. Related

- `plans/soupfinance-tenant-architecture-refactor.md` — original template trees
- `plans/soupfinance-ledger-accounting-module-enablement.md` — 403 / module gating
- `plans/qbo-feature-parity-roadmap.md` — Class/Location tracking (SOUPFIN-110), custom fields (SOUPFIN-111)
- `prd/features/ledger.md`, `prd/04-business-rules.md`
