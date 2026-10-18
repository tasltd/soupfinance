// Reference implementation of the SOUPFIN-146 backfill: seed a chart of accounts for
// every tenant whose chart is empty, and enable its finance module.
//
// The backend (soupmarkets-web) ports this one for one into CoaBackfillService and the
// two existing ROLE_ADMIN_ROOT actions on AccountController (seedChartOfAccounts and
// seedAllChartOfAccounts). backfill.test.mjs holds the acceptance checks the Spock
// specs must port. The plan is plans/soupfin-146-coa-backfill.html.
//
// Run the checks with: node --test plans/coa-templates/*.test.mjs

import { compose, validate } from './compose.mjs';
import { planApply, writePlan } from './apply.mjs';

// Licence categories that get a SoupFinance template, and the one used when the
// tenant has none recorded (the ticket: "defaulting to SERVICES").
export const TEMPLATE_FOR_LICENCE = Object.freeze({ SERVICES: 'services', TRADING: 'trading' });
export const DEFAULT_LICENCE = 'SERVICES';

// Brokerage licences have their own chart (AccountRegistrationService.createBrokerChartOfAccounts).
// A SoupFinance template on a broker would be wrong, so the backfill reports them and moves on.
export const BROKERAGE_LICENCES = Object.freeze(['BROKER', 'ASSET_MANAGER', 'CUSTODIAN', 'TRUSTEE', 'PRIMARY_DEALER', 'FUND_MANAGER']);

// The module the finance interceptor looks for. "Ledger and Accounting" in the ticket are
// both gated by this one row (FinanceModuleInterceptor matches every finance controller).
export const FINANCE_MODULE = 'FINANCE';

// The category the backend's afterCommit listener checks before it seeds its brokerage
// chart on a new FINANCE module (AccountModuleUtilityService.createFinanceAccountAndCategory).
// Every base template must contain it; a check fails if one stops doing so.
export const LISTENER_GUARD_CATEGORY = 'SHORT -TERM LIABILITIES';

// Account.countryOfOrigin is free text. The LXC broker holds "gha"; registration sends
// ISO 3166 alpha-2. Map the spellings we have seen to an overlay key.
const COUNTRY_ALIASES = Object.freeze({ GHA: 'GH', GHANA: 'GH' });

export const OUTCOMES = Object.freeze(['seeded', 'would-seed', 'skipped', 'failed']);

/** Overlay key for a countryOfOrigin value, or null when no country overlay exists for it. */
export function countryOverlayFor(catalogue, countryOfOrigin) {
  if (typeof countryOfOrigin !== 'string' || !countryOfOrigin.trim()) return null;
  const raw = countryOfOrigin.trim().toUpperCase();
  const key = COUNTRY_ALIASES[raw] ?? raw;
  return catalogue.countries[key] ? key : null;
}

/**
 * What the backfill would do for one tenant, before looking at its chart.
 * @returns {{ seed: true, licence, template, overlays, licenceDefaulted } | { seed: false, reason }}
 */
export function selectionFor(catalogue, tenant) {
  if (tenant.archived) return { seed: false, reason: 'archived' };
  const licence = tenant.businessLicenceCategory ?? null;
  if (licence && BROKERAGE_LICENCES.includes(licence)) return { seed: false, reason: 'no-template' };
  const effective = licence ?? DEFAULT_LICENCE;
  const template = TEMPLATE_FOR_LICENCE[effective];
  if (!template) return { seed: false, reason: 'no-template' };
  const country = countryOverlayFor(catalogue, tenant.countryOfOrigin);
  return { seed: true, licence: effective, template, overlays: country ? [country] : [], licenceDefaulted: licence === null };
}

const hasActiveFinanceModule = (modules) => modules.some((m) => m.moduleGroup === FINANCE_MODULE && !m.archived);

/**
 * Run the backfill.
 *
 * @param store     the persistence the backend gets from GORM: tenants() lists every Account
 *                  (no tenant filter); accounts(t), categories(t) and modules(t) read one tenant,
 *                  archived rows included; transaction(t, fn) is one tenant's transaction.
 * @param catalogue loadCatalogue()
 * @param options   dryRun defaults to TRUE: a call with no options only reports.
 *                  accountIds limits the run to those tenants (null = every tenant).
 */
export function backfill(store, catalogue, { dryRun = true, accountIds = null } = {}) {
  if (typeof dryRun !== 'boolean') throw new TypeError(`dryRun must be a boolean, not ${JSON.stringify(dryRun)}`);
  if (accountIds !== null && !Array.isArray(accountIds)) throw new TypeError('accountIds must be a list or null');

  const wanted = accountIds ? new Set(accountIds) : null;
  const tenants = store.tenants().filter((t) => !wanted || wanted.has(t.id));
  const rows = [];
  let untouched = 0;

  for (const tenant of tenants) {
    // Tenants that already have accounts are not listed: on production that is every
    // brokerage tenant, and the operator only needs the ones the run acts on.
    if (store.accounts(tenant.id).length > 0) {
      untouched += 1;
      continue;
    }
    const row = {
      accountId: tenant.id,
      name: tenant.name ?? null,
      businessLicenceCategory: tenant.businessLicenceCategory ?? null,
      outcome: 'skipped',
      reason: null,
      template: null,
      overlays: [],
      licenceDefaulted: false,
      accountsCreated: 0,
      categoriesCreated: 0,
      moduleEnabled: false,
      problems: [],
      error: null,
    };
    rows.push(row);

    const sel = selectionFor(catalogue, tenant);
    if (!sel.seed) {
      row.reason = sel.reason;
      continue;
    }
    Object.assign(row, { template: sel.template, overlays: sel.overlays, licenceDefaulted: sel.licenceDefaulted });

    try {
      const composed = compose(catalogue, { businessLicenceCategory: sel.licence, country: sel.overlays[0] ?? null });
      const invalid = validate(catalogue, composed);
      if (invalid.length) throw new Error(`Template ${composed.key} is invalid: ${invalid.join('; ')}`);

      const needsModule = !hasActiveFinanceModule(store.modules(tenant.id));
      if (dryRun) {
        const plan = planApply(store, tenant.id, composed, catalogue);
        Object.assign(row, {
          outcome: 'would-seed',
          accountsCreated: plan.accountsToCreate.length,
          categoriesCreated: plan.categoriesToCreate.length,
          moduleEnabled: needsModule,
          problems: plan.problems,
        });
        continue;
      }

      let gained = false;
      store.transaction(tenant.id, (tx) => {
        // Re-check under the tenant lock: a user may have added an account since the scan.
        // The backend takes Account.lock(id) first, as SOUPFIN-145's apply does.
        if (tx.accounts().length > 0) {
          gained = true;
          return;
        }
        const plan = planApply(store, tenant.id, composed, catalogue);
        // The chart goes in before the module: the module's afterCommit listener seeds a
        // brokerage chart unless the tenant already has categories when it runs.
        writePlan(tx, tenant.id, plan);
        if (needsModule && !hasActiveFinanceModule(tx.modules())) {
          tx.insertModule({ moduleGroup: FINANCE_MODULE, account: tenant.id, archived: false });
          row.moduleEnabled = true;
        }
        Object.assign(row, {
          accountsCreated: plan.accountsToCreate.length,
          categoriesCreated: plan.categoriesToCreate.length,
          problems: plan.problems,
        });
      });
      if (gained) {
        Object.assign(row, { outcome: 'skipped', reason: 'gained-accounts' });
      } else {
        row.outcome = 'seeded';
      }
    } catch (e) {
      // One tenant's failure rolls back that tenant only; the run carries on.
      Object.assign(row, { outcome: 'failed', error: e.message, accountsCreated: 0, categoriesCreated: 0, moduleEnabled: false, problems: [] });
    }
  }

  const count = (pred) => rows.filter(pred).length;
  const stillEmpty = dryRun ? null : tenants.filter((t) => !t.archived && store.accounts(t.id).length === 0).map((t) => t.id);
  return {
    dryRun,
    summary: {
      scanned: tenants.length,
      untouched,
      empty: rows.length,
      // In a dry run: the tenants a real run would seed.
      seeded: count((r) => r.outcome === 'seeded' || r.outcome === 'would-seed'),
      skipped: count((r) => r.outcome === 'skipped'),
      failed: count((r) => r.outcome === 'failed'),
      accountsCreated: rows.reduce((n, r) => n + r.accountsCreated, 0),
      modulesEnabled: count((r) => r.moduleEnabled),
      // After a real run: every non-archived tenant whose chart is still empty. The
      // acceptance criterion is that this holds only no-template and failed tenants.
      stillEmpty: stillEmpty === null ? null : stillEmpty.length,
    },
    stillEmpty,
    tenants: rows,
  };
}
