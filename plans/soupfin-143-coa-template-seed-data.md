# SOUPFIN-143 — COA template domain and seed data

Skeleton of `soupfin-143-coa-template-seed-data.html` (the plan a person reads). Regenerate both with
`node plans/coa-templates/render-plan.mjs`; do not edit either by hand.

**Goal:** Every new SERVICES or TRADING tenant starts with a lean 69-90 account chart that contains every system account invoice and bill posting needs, seeded from versioned JSON templates with a Ghana tax overlay and optional industry overlays.

**Data:** `plans/coa-templates/` — the backend copies these JSON files to
`soupmarkets-web/grails-app/conf/seed-data/coa/` verbatim. Check them with
`node --test plans/coa-templates/coa-templates.test.mjs`.

## Parts

- **P1** [done] Template data (categories, account types, SERVICES, TRADING, GH, 6 industries, service-description map) committed in plans/coa-templates/
- **P2** [done] Reference composer and 50-check validator (node --test plans/coa-templates/coa-templates.test.mjs)
- **P3** [todo] Backend: LedgerAccountType enum, LedgerAccount.accountType, TaxEntry liability/recoverable FKs, Flyway migration
- **P4** [todo] Backend: CoaTemplateService (compose, seed with dry run, listTemplates) replacing createTrading/ServicesChartOfAccounts
- **P5** [todo] Backend: default A/R and A/P FKs at seed time; linkLookups for service descriptions and tax entries
- **P6** [todo] Backend: CoaTemplateServiceSpec + CoaTemplateSeedIntegrationSpec

## Compositions

| Composition | Accounts | Categories | Role accounts |
|---|---|---|---|
| services | 69 | 21 | 18 |
| services+construction | 77 | 21 | 18 |
| services+hospitality | 75 | 21 | 19 |
| services+non-profit | 76 | 21 | 18 |
| services+professional-services | 75 | 21 | 18 |
| services+saas | 76 | 21 | 18 |
| services+GH | 78 | 21 | 24 |
| services+GH+construction | 86 | 21 | 24 |
| services+GH+hospitality | 84 | 21 | 25 |
| services+GH+non-profit | 85 | 21 | 24 |
| services+GH+professional-services | 84 | 21 | 24 |
| services+GH+saas | 85 | 21 | 24 |
| trading | 73 | 23 | 21 |
| trading+construction | 81 | 23 | 21 |
| trading+hospitality | 79 | 23 | 22 |
| trading+retail | 80 | 23 | 21 |
| trading+GH | 82 | 23 | 27 |
| trading+GH+construction | 90 | 23 | 27 |
| trading+GH+hospitality | 88 | 23 | 28 |
| trading+GH+retail | 89 | 23 | 27 |

## Follow-ups

- SOUPFIN-231: Frontend: the COA page files income and expense accounts under Equity, because `deriveLedgerGroup` reads the last segment of the category string. Blocks the epic's grouping criterion.
- SOUPFIN-232: Backend: post invoice and bill tax to the new TaxEntry liability and recoverable accounts. Output VAT currently lands in an expense account and A/P.
- SOUPFIN-233: Backend: update the Ghana tax seed for Act 1151 (drop the COVID-19 levy and flat rate, fix the 12.5% VAT row, mark NHIL and GETFund recoverable).
- SOUPFIN-234: Backend: the cash-flow statement filters `LedgerAccount` by an `account` property it does not have.

```json plan-index
{
  "title": "SOUPFIN-143 — COA template domain and seed data",
  "revision": "1",
  "goal": "Every new SERVICES or TRADING tenant starts with a lean 69-90 account chart that contains every system account invoice and bill posting needs, seeded from versioned JSON templates with a Ghana tax overlay and optional industry overlays.",
  "stories": [
    {
      "id": "P1",
      "title": "Template data (categories, account types, SERVICES, TRADING, GH, 6 industries, service-description map) committed in plans/coa-templates/",
      "status": "done"
    },
    {
      "id": "P2",
      "title": "Reference composer and 50-check validator (node --test plans/coa-templates/coa-templates.test.mjs)",
      "status": "done"
    },
    {
      "id": "P3",
      "title": "Backend: LedgerAccountType enum, LedgerAccount.accountType, TaxEntry liability/recoverable FKs, Flyway migration",
      "status": "todo"
    },
    {
      "id": "P4",
      "title": "Backend: CoaTemplateService (compose, seed with dry run, listTemplates) replacing createTrading/ServicesChartOfAccounts",
      "status": "todo"
    },
    {
      "id": "P5",
      "title": "Backend: default A/R and A/P FKs at seed time; linkLookups for service descriptions and tax entries",
      "status": "todo"
    },
    {
      "id": "P6",
      "title": "Backend: CoaTemplateServiceSpec + CoaTemplateSeedIntegrationSpec",
      "status": "todo"
    }
  ],
  "screens": [],
  "followUps": [
    "SOUPFIN-144",
    "SOUPFIN-145",
    "SOUPFIN-146",
    "SOUPFIN-231",
    "SOUPFIN-232",
    "SOUPFIN-233",
    "SOUPFIN-234"
  ]
}
```
