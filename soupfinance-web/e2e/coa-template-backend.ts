/**
 * Mock backend for the chart-of-accounts template flow (SOUPFIN-147, SOUPFIN-152).
 *
 * Moved here from soupfin-147-coa-template-picker.spec.ts so the SOUPFIN-152 regression spec
 * drives the same backend. coaTemplate/index and ledgerAccount/applyTemplate are served by
 * the SOUPFIN-145 reference implementation (plans/coa-templates/apply.mjs) over an in-memory
 * tenant store; ledgerAccount/index reads that store, so the accounts the page shows after
 * Apply are the ones the real run wrote.
 */
import { expect, type Page, type Route } from '@playwright/test';
import { accountSettings } from './user-guide/guide-mocks';
// The SOUPFIN-145 contract, runnable (plain ESM; types are inferred from the JS)
import { loadCatalogue } from '../../plans/coa-templates/compose.mjs';
import { applyTemplate, effectiveLedgerGroup, listTemplates as listTemplatesJs } from '../../plans/coa-templates/apply.mjs';

// listTemplates' tenant parameter defaults to null, so the inferred type is null
const listTemplates = listTemplatesJs as unknown as (
  catalogue: unknown,
  tenant: { businessLicenceCategory: string; country: string }
) => unknown;

export const TENANT = 'tenant-147';

export type StoredAccount = Record<string, unknown> & {
  id: string;
  name: string;
  number: string;
  ledgerAccountCategory: string | null;
  systemAccount?: boolean;
};
type Cat = { id: string; name: string; ledgerGroup: string; ledgerSubGroup?: string | null };

/** Tenant-scoped store with the shape apply.mjs expects (see createStore in apply.test.mjs). */
export function createStore() {
  const accounts: StoredAccount[] = [];
  const categories: Cat[] = [];
  let seq = 0;
  return {
    accounts: () => accounts.map((a) => ({ ...a })),
    categories: () => categories.map((c) => ({ ...c })),
    transaction(_tenant: string, fn: (tx: unknown) => void) {
      fn({
        categories: () => categories.map((c) => ({ ...c })),
        insertCategory: (row: Omit<Cat, 'id'>) => {
          const saved = { id: `cat-${++seq}`, ...row };
          categories.push(saved);
          return saved;
        },
        insertAccount: (row: Omit<StoredAccount, 'id'>) => {
          const saved = { id: `la-${++seq}`, ...row } as unknown as StoredAccount;
          accounts.push(saved);
          return saved;
        },
      });
    },
  };
}
export type Store = ReturnType<typeof createStore>;

export interface CoaBackendOptions {
  /** The caller's Account, used for `recommended` and the client-side fallback. */
  tenant?: { businessLicenceCategory: string; country: string };
  /**
   * Added (SOUPFIN-152): behave like a server on contract revision 1, which sends no
   * `ledgerGroup` on preview or created rows. The picker must group by number range.
   */
  omitLedgerGroup?: boolean;
  /**
   * Added (SOUPFIN-152): render these stored accounts with a shallow category FK (id only,
   * no serialised group), as the backend does for some rows. The chart must list them
   * under Uncategorised rather than drop them.
   */
  shallowCategory?: (account: StoredAccount) => boolean;
}

function withoutLedgerGroup<T>(value: T): T {
  return JSON.parse(JSON.stringify(value), (key, v) => (key === 'ledgerGroup' ? undefined : v)) as T;
}

/**
 * Serve the SOUPFIN-145 endpoints from the reference implementation and
 * ledgerAccount/index from the same store. Returns a log of what the page sent.
 */
export async function serveCoaBackend(page: Page, store: Store, options: CoaBackendOptions = {}) {
  const tenant = options.tenant ?? { businessLicenceCategory: 'SERVICES', country: 'GH' };
  const shape = <T>(body: T): T => (options.omitLedgerGroup ? withoutLedgerGroup(body) : body);
  const catalogue = loadCatalogue();
  const log = {
    indexCalls: 0,
    tokensIssued: [] as string[],
    applies: [] as Array<{ token: string | null; body: Record<string, unknown> }>,
  };

  // The tenant's own settings, so a client-side fallback would pick the same template
  await page.route('**/account/show/*.json*', (route) =>
    route.fulfill(
      json({ ...accountSettings, businessLicenceCategory: tenant.businessLicenceCategory, countryOfOrigin: tenant.country })
    )
  );

  await page.route('**/rest/coaTemplate/index.json*', (route) => {
    log.indexCalls += 1;
    return route.fulfill(json(shape(listTemplates(catalogue, tenant))));
  });

  await page.route('**/rest/ledgerAccount/create.json*', (route) => {
    const token = `csrf-${log.tokensIssued.length + 1}`;
    log.tokensIssued.push(token);
    return route.fulfill(json({ SYNCHRONIZER_TOKEN: token, SYNCHRONIZER_URI: '/ledgerAccount/create' }));
  });

  const used = new Set<string>();
  await page.route('**/rest/ledgerAccount/applyTemplate.json*', (route: Route) => {
    const url = new URL(route.request().url());
    const token = url.searchParams.get('SYNCHRONIZER_TOKEN');
    const body = route.request().postDataJSON() as Record<string, unknown>;
    log.applies.push({ token, body });
    // withForm: a missing, unknown or reused token is refused
    if (!token || !log.tokensIssued.includes(token) || used.has(token)) {
      return route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ status: 409, code: 'invalid-token', message: 'The form expired. Please try again.' }),
      });
    }
    used.add(token);
    try {
      return route.fulfill(json(shape(applyTemplate(store, TENANT, catalogue, body))));
    } catch (e) {
      const err = e as { status?: number; code?: string; message: string };
      // Contract error body: { status, code, message }
      return route.fulfill({
        status: err.status ?? 500,
        contentType: 'application/json',
        body: JSON.stringify({ status: err.status ?? 500, code: err.code, message: err.message }),
      });
    }
  });

  // Backend-shaped rows: the group lives in the category's serialised string
  await page.route('**/rest/ledgerAccount/index.json*', (route: Route) => {
    const url = new URL(route.request().url());
    const cats = new Map(store.categories().map((c) => [c.id, c]));
    const rows = store
      .accounts()
      .sort((a, b) => a.number.localeCompare(b.number, 'en', { numeric: true }))
      .map((a) => {
        const cat = a.ledgerAccountCategory ? cats.get(a.ledgerAccountCategory) : undefined;
        const group = cat ? effectiveLedgerGroup(catalogue, cat.name) ?? cat.ledgerGroup : null;
        const shallow = options.shallowCategory?.(a) ?? false;
        return {
          id: a.id,
          name: a.name,
          number: a.number,
          ledgerAccountCategory: cat
            ? shallow
              ? { id: cat.id }
              : { id: cat.id, class: 'soupbroker.finance.LedgerAccountCategory', serialised: `${cat.name} < ${group}` }
            : null,
          systemAccount: Boolean(a.systemAccount),
        };
      });
    const max = Math.min(Number(url.searchParams.get('max')) || 10, 1000);
    const offset = Number(url.searchParams.get('offset')) || 0;
    return route.fulfill(json(rows.slice(offset, offset + max)));
  });

  return log;
}

export function json(body: unknown) {
  return { status: 200, contentType: 'application/json', body: JSON.stringify(body) };
}

export async function openChartOfAccountsFromMenu(page: Page) {
  await page.goto('/dashboard');
  await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 20_000 });
  await page.locator('aside').locator('a[href="/ledger/accounts"]').first().click();
  await expect(page).toHaveURL(/\/ledger\/accounts$/);
  await expect(page.getByTestId('chart-of-accounts-page')).toBeVisible({ timeout: 15_000 });
}
