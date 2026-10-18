-- SOUPFIN-146 backfill: read-only checks to run before and after, on LXC and then on TAS.
-- Every statement is a SELECT. Run with:
--   mysql -h <host> -u <user> -p <database> < plans/coa-templates/backfill-verify.sql
--
-- "Empty" means 0 ledger_account rows for the tenant, archived rows included, because
-- the backfill tests the same way (an archived account still holds its number and name).

-- 1. Acceptance: tenants the backfill should seed whose chart is still empty.
--    Before the run this is the number to seed; after it must be 0.
SELECT COUNT(*) AS eligible_empty_tenants
FROM account a
WHERE a.archived = 0
  AND (a.business_licence_category IS NULL OR a.business_licence_category IN ('SERVICES', 'TRADING'))
  AND NOT EXISTS (SELECT 1 FROM ledger_account la WHERE la.tenant_id = a.id);

-- 2. Empty tenants the backfill skips by design (archived, or a brokerage licence).
--    The run reports them; the operator decides what to do with any that matter.
SELECT a.id, a.name, a.business_licence_category, a.archived + 0 AS archived
FROM account a
WHERE (a.archived = 1
       OR a.business_licence_category NOT IN ('SERVICES', 'TRADING'))
  AND NOT EXISTS (SELECT 1 FROM ledger_account la WHERE la.tenant_id = a.id)
ORDER BY a.name;

-- 3. Fingerprint of every tenant that already has accounts. Save the output before the
--    run and diff it with the output after: the acceptance criterion is no difference.
--    CRC32 over each row's identity and editable columns, summed per tenant.
SELECT la.tenant_id,
       COUNT(*) AS accounts,
       SUM(CRC32(CONCAT_WS('|', la.id, la.version, la.name, la.number, la.archived + 0,
                           la.ledger_account_category_id, la.parent_account_id))) AS fingerprint,
       MAX(la.last_updated) AS last_updated
FROM ledger_account la
GROUP BY la.tenant_id
ORDER BY la.tenant_id;

-- 4. After the run: seeded tenants have the finance module the interceptor looks for.
--    Expect 0 rows. A row for a tenant that already had accounts before the run is
--    outside this ticket: the backfill leaves those tenants alone. Compare with query 3.
SELECT a.id, a.name
FROM account a
WHERE a.archived = 0
  AND (a.business_licence_category IS NULL OR a.business_licence_category IN ('SERVICES', 'TRADING'))
  AND EXISTS (SELECT 1 FROM ledger_account la WHERE la.tenant_id = a.id)
  AND NOT EXISTS (SELECT 1 FROM account_module m
                  WHERE m.account_id = a.id AND m.module_group = 'FINANCE' AND m.archived = 0);

-- 5. After the run: no seeded tenant picked up the brokerage chart the module listener
--    seeds (AccountModuleUtilityService.createFinanceAccountAndCategory). Expect 0 rows.
SELECT c.tenant_id, c.name
FROM ledger_account_category c
JOIN account a ON a.id = c.tenant_id
WHERE (a.business_licence_category IS NULL OR a.business_licence_category IN ('SERVICES', 'TRADING'))
  AND c.name IN ('TRADING PORTFOLIO', 'SECURITIES UNDER CUSTODY');
