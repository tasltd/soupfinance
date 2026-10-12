# SOUPFIN-146 — Backfill a chart of accounts for tenants with an empty one

Skeleton of `soupfin-146-coa-backfill.html` (the plan a person reads). The `plan-index` block below is
copied verbatim from the page; `node --test plans/coa-templates/backfill.test.mjs` fails if they differ.

**Goal:** After one reviewed run, no non-archived SERVICES, TRADING or unclassified tenant has an empty chart of accounts, each of them has the FINANCE module, and every tenant that already had accounts is byte-for-byte unchanged.

**Reference and checks:** `plans/coa-templates/backfill.mjs`, `plans/coa-templates/backfill.test.mjs`,
read-only before/after SQL in `plans/coa-templates/backfill-verify.sql`.

## Parts

- **P1** [done] Backfill rules and report shape fixed in a runnable reference (plans/coa-templates/backfill.mjs)
- **P2** [done] Acceptance checks: zero empty after, untouched tenants identical, idempotent, dry run predicts real run, listener ordering, per-tenant rollback, race, zero and overflow (backfill.test.mjs, 21 checks)
- **P3** [done] Read-only before/after SQL (backfill-verify.sql), run against the LXC database for the baseline
- **P4** [todo] Backend: CoaBackfillService.run(dryRun, accountIds) on top of SOUPFIN-145 CoaTemplateService.apply
- **P5** [todo] Backend: rewire AccountController.seedChartOfAccounts and seedAllChartOfAccounts to it; POST only, dryRun defaults to true
- **P6** [todo] Backend: CoaBackfillServiceSpec (ports backfill.test.mjs) and a functional spec over HTTP
- **P7** [todo] Run on LXC: dry run, real run, verify SQL, second run creates nothing
- **P8** [todo] Run on TAS through the soupmarkets-web deploy workflow, with the dry-run report reviewed by a person first

## LXC baseline (2026-10-12)

207 of 214 tenants have an empty chart. All 207 have a null licence, already have a FINANCE module,
and have no agent or user (functional-test leftovers, created 2025-11-24 to 2025-12-01). The run
seeds 207 SERVICES charts, 14,283 accounts, and creates no modules.

## Depends on

- SOUPFIN-143 P3 and P4 (LedgerAccountType, CoaTemplateService.compose)
- SOUPFIN-145 P3 (CoaTemplateService.apply)

## Follow-ups

- SOUPFIN-235: Backend: the FINANCE module listener seeds a brokerage chart on SoupFinance tenants.

```json plan-index
{
  "title": "SOUPFIN-146 — Backfill a chart of accounts for tenants with an empty one",
  "revision": "1",
  "goal": "After one reviewed run, no non-archived SERVICES, TRADING or unclassified tenant has an empty chart of accounts, each of them has the FINANCE module, and every tenant that already had accounts is byte-for-byte unchanged.",
  "stories": [
    {"id": "P1", "title": "Backfill rules and report shape fixed in a runnable reference (plans/coa-templates/backfill.mjs)", "status": "done"},
    {"id": "P2", "title": "Acceptance checks: zero empty after, untouched tenants identical, idempotent, dry run predicts real run, listener ordering, per-tenant rollback, race, zero and overflow (backfill.test.mjs, 21 checks)", "status": "done"},
    {"id": "P3", "title": "Read-only before/after SQL (backfill-verify.sql), run against the LXC database for the baseline", "status": "done"},
    {"id": "P4", "title": "Backend: CoaBackfillService.run(dryRun, accountIds) on top of SOUPFIN-145 CoaTemplateService.apply", "status": "todo"},
    {"id": "P5", "title": "Backend: rewire AccountController.seedChartOfAccounts and seedAllChartOfAccounts to it; POST only, dryRun defaults to true", "status": "todo"},
    {"id": "P6", "title": "Backend: CoaBackfillServiceSpec (ports backfill.test.mjs) and a functional spec over HTTP", "status": "todo"},
    {"id": "P7", "title": "Run on LXC: dry run, real run, verify SQL, second run creates nothing", "status": "todo"},
    {"id": "P8", "title": "Run on TAS through the soupmarkets-web deploy workflow, with the dry-run report reviewed by a person first", "status": "todo"}
  ],
  "screens": [],
  "dependsOn": ["SOUPFIN-143 P3 and P4 (LedgerAccountType, CoaTemplateService.compose)", "SOUPFIN-145 P3 (CoaTemplateService.apply)"],
  "followUps": ["SOUPFIN-235"]
}
```
