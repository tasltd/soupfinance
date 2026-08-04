# Bank Reference Data Quality (SOUPFIN-34) — Backend Plan

**Status:** Not started — backend/data work, must be executed from the `soupmarkets-web` repo.
**Filed from:** soupfinance context, which is not permitted to modify backend code
(`.claude/rules/backend-changes-workflow.md`).
**PM item:** SOUPFIN-34

## Context

The SoupFinance Edit Bank Account form populates its bank dropdown from
`GET /rest/bank/index.json?max=1000&sort=name&order=asc`
(`soupfinance-web/src/api/endpoints/settings.ts` → `banksApi.list()`).

Users reported the dropdown showing the same institutions repeated many times,
plus entries that are not banks at all. The frontend now de-duplicates on the
normalised name (`dedupeBanksByName`, shipped with SOUPFIN-33), which hides the
repetition in this one dropdown. That is a **display-layer mitigation only** —
the `bank` rows are still wrong and every other consumer of the endpoint (the
Angular admin SPA, the client portal, mobile, reports) still sees them.

## Reported defects

| # | Defect | Example |
|---|--------|---------|
| 1 | A personal name stored as a bank | `Frances Afia Boakyewaa Annor Boakye` |
| 2 | Typo in an institution name | `High BAnk` (capital A mid-word) |
| 3 | Competing spellings of one institution | `Access` vs `Access Bank (Ghana) Plc`; two `GCB` spellings |

The frontend deliberately does **not** collapse #3 — the names differ by more
than case/whitespace, and silently hiding a genuinely distinct bank is worse
than showing an extra option. Only the backend can decide which rows are the
same institution.

## STEP 0 (do this first): establish whether this is data quality or tenant leakage

This is the step that determines everything else, and it must not be skipped.

`Bank` (`grails-app/domain/soupbroker/Bank.groovy`) already declares:

```groovy
class Bank extends SbDomain implements MultiTenant<Bank>, Auditable {
    boolean archived = false
    String name
    String acronym
    static constraints = {
        delegate.with SbDomain.commonConstraints
        name nullable: false, unique: true
        acronym unique: true
    }
}
```

So within a single tenant the *exact* name is already required to be unique.
That gives two candidate explanations for what users saw, with very different
severity:

- **(a) Data quality (expected).** The repeated entries are *different strings*
  that render alike — `Access` / `Access Bank (Ghana) Plc`, `GCB` / `G C B`,
  `High Bank` / `High BAnk`. `unique: true` compares exact strings, so it never
  blocked them. This is the issue as filed.
- **(b) Tenant isolation defect (serious).** One name appears many times because
  the list is returning rows belonging to *other tenants*. `Bank` is
  `MultiTenant`, so a correctly-scoped query cannot do this — if it happens, the
  query path is escaping the discriminator filter (e.g. a `@WithoutTenant`
  annotation, a raw SQL/criteria path, or a null `tenant_id` on the rows). That
  would be a data-exposure bug well beyond a dropdown cosmetic.

**Diagnostic:**

```sql
-- If any (tenant_id, normalised name) count > 1, GORM validation was bypassed
-- (bulk SQL seed import) — uniqueness is app-level, not a DB index.
SELECT tenant_id,
       LOWER(REGEXP_REPLACE(name, '[^A-Za-z0-9]', '')) AS normalised,
       COUNT(*) AS n,
       GROUP_CONCAT(name SEPARATOR ' | ') AS spellings
FROM bank
WHERE archived = 0
GROUP BY tenant_id, normalised
HAVING n > 1
ORDER BY n DESC;

-- If the SAME name recurs across many tenant_ids AND the API returns them all
-- to one tenant, this is (b) — stop and fix the query scoping first.
SELECT name, COUNT(DISTINCT tenant_id) AS tenants, COUNT(*) AS rows_total
FROM bank
GROUP BY name
HAVING tenants > 1
ORDER BY rows_total DESC;

-- Rows with no tenant — these defeat discriminator filtering.
SELECT COUNT(*) FROM bank WHERE tenant_id IS NULL;
```

Confirm against the API as the SoupFinance tenant actually sees it:

```bash
curl -s -H "X-Auth-Token: $TOKEN" -H "Api-Authorization: Basic $CONSUMER" \
  'https://tas.soupmarkets.com/rest/bank/index.json?max=1000&sort=name&order=asc' \
  | jq -r '.[].name' | sort | uniq -c | sort -rn | head -30
```

If the counts here exceed the per-tenant DB counts, it is (b).

## Required changes (assuming Step 0 confirms (a))

### 1. Remove non-bank rows

Audit for rows that are not financial institutions (personal names, test data,
free-text that leaked in from an "Other (specify)" path).

Prefer `archived = 1` over `DELETE` — `Bank` already implements the platform's
soft-delete pattern and `searchList` filters on `eq('archived', false)`, so
archiving removes the row from every dropdown while preserving referential
integrity for any historical record that points at it.

```sql
UPDATE bank SET archived = 1
WHERE id IN (/* reviewed ids */) AND archived = 0;
```

Only hard-delete a row once confirmed to have zero referencing rows (see §3).

### 2. Fix the typo

`High BAnk` → the correct institution name. Confirm the intended institution
before editing; if it cannot be identified, archive it rather than guessing.

### 3. Merge duplicate institutions

For each duplicate group, pick the canonical row (prefer the fullest legal name
— `Access Bank (Ghana) Plc` over `Access`), then repoint every foreign key at
the canonical id before archiving the losers.

Referencing domains found in `grails-app/domain/`:

| Domain | File |
|--------|------|
| `AccountBankDetails` | `soupbroker/AccountBankDetails.groovy` |
| `ClientBankDetails` | `soupbroker/kyc/ClientBankDetails.groovy` |
| `VendorBankDetails` | `soupbroker/trading/VendorBankDetails.groovy` |
| `LedgerAccount` | `soupbroker/finance/LedgerAccount.groovy` |

**Confirm this list is complete before writing any UPDATE** — grep for `Bank`
across `grails-app/domain/` and check the live schema, since an association may
be declared on a side this list missed:

```sql
SELECT TABLE_NAME, COLUMN_NAME
FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
WHERE REFERENCED_TABLE_NAME = 'bank'
  AND TABLE_SCHEMA = DATABASE();
```

Repoint pattern, per referencing table, inside one transaction:

```sql
START TRANSACTION;
UPDATE account_bank_details SET bank_id = :canonicalId WHERE bank_id IN (:loserIds);
UPDATE client_bank_details  SET bank_id = :canonicalId WHERE bank_id IN (:loserIds);
UPDATE vendor_bank_details  SET bank_id = :canonicalId WHERE bank_id IN (:loserIds);
UPDATE ledger_account       SET bank_id = :canonicalId WHERE bank_id IN (:loserIds);
UPDATE bank SET archived = 1 WHERE id IN (:loserIds);
COMMIT;
```

Re-run the §3 verification query after each group; a non-zero count means a
referencing table was missed.

### 4. Prevent recurrence

`unique: true` on `name` is exact-match and app-level only, so it stops neither
a spelling variant nor a bulk SQL insert. Add a normalised-name guard:

- **Application level** — a custom validator on `Bank.name` that rejects a value
  whose normalised form (lowercase, non-alphanumerics stripped) already exists
  within the tenant. This catches the `High BAnk` / `High Bank` class.
- **Database level** — a generated column plus a unique index on
  `(tenant_id, normalised_name)`, so a seed import cannot reintroduce duplicates
  by bypassing GORM. This is the durable half; the validator only produces the
  friendly error message.

Note the interaction with soft delete: an archived row still occupies the unique
index, so either exclude archived rows from the index or include `archived` in
the key. Decide this explicitly — getting it wrong makes it impossible to
re-create a bank that was once archived.

### 5. Seed-data source

The duplicates most likely entered through a seed/import script rather than the
UI (GORM validation would otherwise have blocked exact matches). Find and fix
the source, or the next environment rebuild reintroduces all of it. Check
`docker/seed-data.sql.gz` and `lxc/migrations/*.sql`.

## Acceptance criteria

- [ ] Step 0 answered in writing: data quality (a) or tenant leakage (b). If (b), that is fixed first and this plan is re-scoped.
- [ ] `/rest/bank/index.json` returns no personal names or non-institutions.
- [ ] No two active rows normalise to the same name within a tenant.
- [ ] `High BAnk` corrected or archived.
- [ ] Every FK that pointed at an archived duplicate now points at its canonical row; the `KEY_COLUMN_USAGE` verification query returns zero orphans.
- [ ] A normalised-name uniqueness guard exists at both the validator and index level, with the archived-row interaction decided.
- [ ] The seed-data source no longer produces duplicates.

## Notes

- Once the table is clean, `dedupeBanksByName` in `banksApi.list()` becomes a
  harmless safety net and should stay — it costs nothing and protects other
  tenants whose data may not have been cleaned.
- This work touches production reference data on Soupmarkets infrastructure. It
  must be executed by someone operating in the `soupmarkets-web` repo, against a
  backup, with the repoints wrapped in a transaction. The SoupFinance project is
  explicitly forbidden from deploying to or mutating that infrastructure
  (`.claude/rules/deployment-restrictions.md`).
