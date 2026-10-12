/**
 * SOUPFIN-147 — Chart of Accounts: set-up call to action, template picker, apply flow
 *
 * Flow under test: an empty chart -> "Set up chart of accounts" -> pick a template
 * (preselected from the tenant) -> grouped preview -> Review changes (dry run)
 * -> Apply template (real run) -> the chart lists the new accounts.
 *
 * The backend here is NOT a hand-written stub. coaTemplate/index and
 * ledgerAccount/applyTemplate are served by the SOUPFIN-145 reference
 * implementation (plans/coa-templates/apply.mjs) over an in-memory tenant store,
 * the same code the Spock specs port. ledgerAccount/index reads that store, so
 * the accounts the page shows after Apply are the ones the real run wrote.
 * The test checks that store before and after each UI action.
 *
 * The page is reached by clicking the sidebar, never page.goto.
 *
 * Run: npx playwright test e2e/soupfin-147-coa-template-picker.spec.ts --project=firefox
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import { installGuideMocks, seedAuthenticatedSession, accountSettings } from './user-guide/guide-mocks';
import { installUnmockedApiGuard, isLxcMode, type UnmockedApiGuard } from './fixtures';
// The SOUPFIN-145 contract, runnable (plain ESM; types are inferred from the JS)
import { loadCatalogue } from '../../plans/coa-templates/compose.mjs';
import { applyTemplate, effectiveLedgerGroup, listTemplates as listTemplatesJs } from '../../plans/coa-templates/apply.mjs';

// listTemplates' tenant parameter defaults to null, so the inferred type is null
const listTemplates = listTemplatesJs as (catalogue: unknown, tenant: { businessLicenceCategory: string; country: string }) => unknown;

const SHOT_DIR = 'e2e/playwright/screenshots/soupfin-147';
const TENANT = 'tenant-147';

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(120_000);

async function shot(page: Page, name: string, fullPage = false) {
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage });
}

type Row = Record<string, unknown> & { id: string; name: string; number: string; ledgerAccountCategory: string | null };
type Cat = { id: string; name: string; ledgerGroup: string; ledgerSubGroup?: string | null };

/** Tenant-scoped store with the shape apply.mjs expects (see createStore in apply.test.mjs). */
function createStore() {
  const accounts: Row[] = [];
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
        insertAccount: (row: Omit<Row, 'id'>) => {
          const saved = { id: `la-${++seq}`, ...row } as unknown as Row;
          accounts.push(saved);
          return saved;
        },
      });
    },
  };
}
type Store = ReturnType<typeof createStore>;

/**
 * Serve the SOUPFIN-145 endpoints from the reference implementation and
 * ledgerAccount/index from the same store. Returns a log of what the page sent.
 */
async function serveCoaBackend(page: Page, store: Store, tenant = { businessLicenceCategory: 'SERVICES', country: 'GH' }) {
  const catalogue = loadCatalogue();
  const log = { indexCalls: 0, tokensIssued: [] as string[], applies: [] as Array<{ token: string | null; body: Record<string, unknown> }> };

  // The tenant's own settings, so a client-side fallback would pick the same template
  await page.route('**/account/show/*.json*', (route) =>
    route.fulfill(json({ ...accountSettings, businessLicenceCategory: tenant.businessLicenceCategory, countryOfOrigin: tenant.country }))
  );

  await page.route('**/rest/coaTemplate/index.json*', (route) => {
    log.indexCalls += 1;
    return route.fulfill(json(listTemplates(catalogue, tenant)));
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
      return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ status: 409, code: 'invalid-token', message: 'The form expired. Please try again.' }) });
    }
    used.add(token);
    try {
      return route.fulfill(json(applyTemplate(store, TENANT, catalogue, body)));
    } catch (e) {
      const err = e as { status?: number; code?: string; message: string };
      // Contract error body: { status, code, message }
      return route.fulfill({ status: err.status ?? 500, contentType: 'application/json', body: JSON.stringify({ status: err.status ?? 500, code: err.code, message: err.message }) });
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
        return {
          id: a.id,
          name: a.name,
          number: a.number,
          ledgerAccountCategory: cat ? { id: cat.id, class: 'soupbroker.finance.LedgerAccountCategory', serialised: `${cat.name} < ${group}` } : null,
          systemAccount: Boolean(a.systemAccount),
        };
      });
    const max = Math.min(Number(url.searchParams.get('max')) || 10, 1000);
    const offset = Number(url.searchParams.get('offset')) || 0;
    return route.fulfill(json(rows.slice(offset, offset + max)));
  });

  return log;
}

function json(body: unknown) {
  return { status: 200, contentType: 'application/json', body: JSON.stringify(body) };
}

async function openChartOfAccountsFromMenu(page: Page) {
  await page.goto('/dashboard');
  await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 20_000 });
  await page.locator('aside').locator('a[href="/ledger/accounts"]').first().click();
  await expect(page).toHaveURL(/\/ledger\/accounts$/);
  await expect(page.getByTestId('chart-of-accounts-page')).toBeVisible({ timeout: 15_000 });
}

let apiGuard: UnmockedApiGuard;

test.describe('SOUPFIN-147: set up the chart of accounts from a template', () => {
  test.skip(isLxcMode(), 'Mock-only spec: the endpoints come from the SOUPFIN-145 reference implementation');

  test.beforeEach(async ({ page }) => {
    // FIRST, so every explicit mock below takes precedence over it.
    apiGuard = await installUnmockedApiGuard(page);
    await installGuideMocks(page);
    await seedAuthenticatedSession(page);
  });

  test.afterEach(() => {
    apiGuard?.assertNone();
  });

  test('empty chart -> pick the recommended template -> review -> apply -> populated chart', async ({ page }) => {
    const store = createStore();
    const log = await serveCoaBackend(page, store);
    await openChartOfAccountsFromMenu(page);

    // 1. Empty state is a call to action, not a dead end
    const empty = page.getByTestId('coa-empty');
    await expect(empty).toContainText('Set up your chart of accounts');
    await expect(page.getByTestId('coa-empty-hint')).toContainText('Start from a template built for your kind of business.');
    await expect(page.getByTestId('coa-setup-cta')).toBeVisible();
    expect(store.accounts()).toHaveLength(0);
    await shot(page, 'soupfin-147-01-empty-state-cta');

    // 2. The picker lists the templates and preselects services + Ghana
    await page.getByTestId('coa-setup-cta').click();
    const picker = page.getByTestId('coa-template-picker');
    await expect(picker).toBeVisible();
    await expect(page.getByTestId('coa-template-option-services')).toBeVisible();
    await expect(page.getByTestId('coa-template-option-services').locator('input')).toBeChecked();
    await expect(page.getByTestId('coa-template-option-services')).toContainText('Recommended');
    await expect(page.getByTestId('coa-template-option-trading')).toBeVisible();
    await expect(page.getByTestId('coa-country-select')).toHaveValue('GH');
    expect(log.indexCalls).toBe(1);

    // The preview is grouped into the five statement sections, Ghana accounts included
    for (const group of ['asset', 'liability', 'equity', 'income', 'expense']) {
      await expect(page.getByTestId(`coa-template-preview-group-${group}`)).toBeVisible();
    }
    await expect(page.getByTestId('coa-template-preview-group-asset')).toContainText('Mobile Money Wallets');
    await expect(page.getByTestId('coa-template-preview-group-income')).not.toContainText('Cash on Hand');
    const previewCount = await page.getByTestId('coa-template-preview-count').textContent();
    await shot(page, 'soupfin-147-02-picker-preselected');

    // 3. Review changes = dry run: nothing is written yet
    await page.getByTestId('coa-template-review').click();
    const summary = page.getByTestId('coa-template-summary');
    await expect(summary).toContainText('accounts will be created.');
    expect(log.applies).toHaveLength(1);
    expect(log.applies[0].body).toEqual({ template: 'services', overlays: ['GH'], dryRun: true });
    expect(log.applies[0].token).toBe('csrf-1');
    expect(store.accounts()).toHaveLength(0);
    const willCreate = Number((await summary.textContent())?.match(/(\d+) accounts will be created/)?.[1]);
    expect(willCreate).toBeGreaterThan(60);
    expect(previewCount).toContain(String(willCreate));
    await expect(page.getByTestId('coa-template-created-group-liability')).toBeVisible();
    await shot(page, 'soupfin-147-03-review-dry-run');

    // 4. Apply = real run with a fresh token; the store now holds the accounts
    await page.getByTestId('coa-template-apply').click();
    await expect(page.getByTestId('coa-setup-success')).toContainText(
      `${willCreate} accounts added from the Services business template.`
    );
    await expect(picker).toHaveCount(0);
    expect(log.applies).toHaveLength(2);
    expect(log.applies[1].body).toEqual({ template: 'services', overlays: ['GH'], dryRun: false });
    expect(log.applies[1].token).toBe('csrf-2');
    expect(store.accounts()).toHaveLength(willCreate);

    // 5. The chart lists exactly what was written, in the right sections
    await expect(page.locator('[data-testid^="coa-account-"]')).toHaveCount(willCreate);
    await expect(page.getByTestId('coa-empty')).toHaveCount(0);
    const stored = store.accounts();
    const momo = stored.find((a) => a.name === 'Mobile Money Wallets')!;
    const revenue = stored.find((a) => a.number.startsWith('4'))!;
    await expect(page.getByTestId('coa-group-asset').getByTestId(`coa-account-${momo.id}`)).toBeVisible();
    await expect(page.getByTestId('coa-group-income').getByTestId(`coa-account-${revenue.id}`)).toBeVisible();
    await expect(page.getByTestId('coa-group-uncategorised')).toHaveCount(0);
    await shot(page, 'soupfin-147-04-populated-after-apply');
    await shot(page, 'soupfin-147-05-populated-full', true);
  });

  test('changing template and industry updates the preview and what is applied', async ({ page }) => {
    const store = createStore();
    const log = await serveCoaBackend(page, store);
    await openChartOfAccountsFromMenu(page);
    await page.getByTestId('coa-setup-cta').click();
    await expect(page.getByTestId('coa-template-option-services').locator('input')).toBeChecked();

    const before = await page.getByTestId('coa-template-preview-count').textContent();
    await page.getByTestId('coa-template-option-trading').click();
    await expect(page.getByTestId('coa-template-option-trading').locator('input')).toBeChecked();
    await expect(page.getByTestId('coa-template-preview-count')).not.toHaveText(before ?? '');
    // Ghana applies to trading too, so the country choice survives the switch
    await expect(page.getByTestId('coa-country-select')).toHaveValue('GH');
    await page.getByTestId('coa-country-select').selectOption('');
    await shot(page, 'soupfin-147-06-trading-no-country');

    await page.getByTestId('coa-template-review').click();
    await expect(page.getByTestId('coa-template-summary')).toBeVisible();
    expect(log.applies[0].body).toEqual({ template: 'trading', overlays: [], dryRun: true });

    // Back keeps the choice and writes nothing
    await page.getByTestId('coa-template-back').click();
    await expect(page.getByTestId('coa-template-option-trading').locator('input')).toBeChecked();
    expect(store.accounts()).toHaveLength(0);
    await page.getByTestId('coa-template-cancel').click();
    await expect(page.getByTestId('coa-template-picker')).toHaveCount(0);
    await expect(page.getByTestId('coa-empty')).toBeVisible();
  });

  test('a chart that already has every account: the dry run creates nothing and Apply stays off', async ({ page }) => {
    const store = createStore();
    // Seed the tenant with exactly what the services+GH template would create
    const catalogue = loadCatalogue();
    applyTemplate(store, TENANT, catalogue, { template: 'services', overlays: ['GH'], dryRun: false });
    const seeded = store.accounts().length;
    const log = await serveCoaBackend(page, store);

    // The CTA only shows on an empty chart, so this reaches the picker through
    // the empty state of a fresh page whose list we blank for the first read.
    let first = true;
    await page.route('**/rest/ledgerAccount/index.json*', (route) => {
      if (first) {
        first = false;
        return route.fulfill(json([]));
      }
      return route.fallback();
    });
    await openChartOfAccountsFromMenu(page);
    await page.getByTestId('coa-setup-cta').click();
    await page.getByTestId('coa-template-review').click();

    await expect(page.getByTestId('coa-template-summary')).toContainText(
      'You already have every account in this template. Nothing will be created.'
    );
    await expect(page.getByTestId('coa-template-summary')).toContainText(`${seeded} accounts you already have will be kept`);
    await expect(page.getByTestId('coa-template-apply')).toBeDisabled();
    expect(log.applies).toHaveLength(1);
    expect(store.accounts()).toHaveLength(seeded);
    await shot(page, 'soupfin-147-07-nothing-to-create');
  });

  test('a refused apply shows the error and leaves the chart empty', async ({ page }) => {
    const store = createStore();
    await serveCoaBackend(page, store);
    // Registered last, so it wins over the reference handler for the real run only
    await page.route('**/rest/ledgerAccount/applyTemplate.json*', async (route) => {
      const body = route.request().postDataJSON() as { dryRun: boolean };
      if (body.dryRun) return route.fallback();
      return route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ status: 409, code: 'apply-conflict', message: 'Nothing was saved. Please try again.' }),
      });
    });
    await openChartOfAccountsFromMenu(page);
    await page.getByTestId('coa-setup-cta').click();
    await page.getByTestId('coa-template-review').click();
    await page.getByTestId('coa-template-apply').click();

    await expect(page.getByTestId('coa-template-error')).toContainText('We could not set up your chart of accounts.');
    // The server's sentence, never the machine code
    await expect(page.getByTestId('coa-template-error')).toContainText('Nothing was saved. Please try again.');
    await expect(page.getByTestId('coa-template-error')).not.toContainText('apply-conflict');
    await expect(page.getByTestId('coa-template-picker')).toBeVisible();
    await expect(page.getByTestId('coa-setup-success')).toHaveCount(0);
    expect(store.accounts()).toHaveLength(0);
    await shot(page, 'soupfin-147-08-apply-refused');
  });

  test('dark mode: the picker and the empty state use the dark surfaces', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    const store = createStore();
    await serveCoaBackend(page, store);
    await openChartOfAccountsFromMenu(page);
    await expect(page.locator('html')).toHaveClass(/dark/);
    await shot(page, 'soupfin-147-09-dark-empty-state');

    await page.getByTestId('coa-setup-cta').click();
    const picker = page.getByTestId('coa-template-picker');
    await expect(page.getByTestId('coa-template-option-services')).toBeVisible();
    const bg = await picker.evaluate((el) => getComputedStyle(el).backgroundColor);
    // surface-dark, never the white light-mode surface
    expect(bg).not.toBe('rgb(255, 255, 255)');
    await shot(page, 'soupfin-147-10-dark-picker');
  });
});
