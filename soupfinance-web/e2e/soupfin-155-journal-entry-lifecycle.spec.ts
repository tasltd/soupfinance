/**
 * SOUPFIN-155: a journal entry is created, posted and reversed from its own page.
 *
 * Before the fix "Save & Post" ran the same handler as "Save Draft", so the
 * entry stayed pending, and a posted entry had no Reverse action.
 *
 * The mocked backend keeps state (the list of groups and their status), so each
 * test asserts what the backend holds before and after each click, not only
 * what the page shows. The contract it mocks is
 * plans/soupfin-155-journal-entry-post-reverse.md: the real backend does not
 * have `post` or `reverse` yet.
 *
 * Mock-only. Navigation is by sidebar and button clicks after the dashboard.
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import { installGuideMocks, seedAuthenticatedSession } from './user-guide/guide-mocks';
import { installUnmockedApiGuard, isLxcMode, type UnmockedApiGuard } from './fixtures';

const SHOT_DIR = 'e2e/playwright/screenshots/soupfin-155';

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(120_000);

/** Screenshots go to a git-tracked directory, not the wiped test-results/. */
async function shot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: true });
}

type Line = {
  id: string;
  ledgerAccount: { id: string; code: string; name: string };
  amount: number;
  transactionState: 'DEBIT' | 'CREDIT';
  description?: string;
  transactionDate?: string;
};
type Group = {
  id: string;
  groupDate: string;
  reference?: string;
  description: string;
  status: 'PENDING' | 'POSTED' | 'REVERSED';
  ledgerTransactionList: Line[];
};

const ACCOUNTS: Record<string, { id: string; code: string; name: string }> = {
  'acc-1000': { id: 'acc-1000', code: '1000', name: 'Cash at Bank' },
  'acc-4000': { id: 'acc-4000', code: '4000', name: 'Consulting Revenue' },
};

/** A small in-memory journal backend for the ledgerTransactionGroup endpoints. */
class JournalBackend {
  groups: Group[] = [];
  postCalls: string[] = [];
  reverseCalls: { id: string; body: unknown }[] = [];
  postFailure: { status: number; body: unknown } | null = null;

  find(id: string) {
    return this.groups.find((g) => g.id === id);
  }

  async install(page: Page) {
    const json = (route: Route, status: number, body: unknown) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    const idFrom = (url: string) => url.match(/\/(?:show|post|reverse|update|delete)\/([^/.?]+)/)?.[1] ?? '';

    await page.route('**/rest/ledgerTransactionGroup/index.json*', (route) => json(route, 200, this.groups));
    await page.route('**/rest/ledgerTransactionGroup/show/*', (route) => {
      const group = this.find(idFrom(route.request().url()));
      return group ? json(route, 200, group) : json(route, 404, { error: 'Not found' });
    });
    await page.route('**/rest/ledgerTransaction/create.json*', (route) =>
      json(route, 200, { SYNCHRONIZER_TOKEN: 'tok', SYNCHRONIZER_URI: '/ledgerTransaction/saveMultiple' })
    );
    await page.route('**/rest/ledgerTransaction/saveMultiple*', (route) => {
      const body = route.request().postDataJSON() as {
        groupDate: string;
        description: string;
        reference?: string;
        ledgerTransactionList: { ledgerAccount: { id: string }; amount: number; transactionState: 'DEBIT' | 'CREDIT'; description?: string }[];
      };
      const id = `group-155-${this.groups.length + 1}`;
      const group: Group = {
        id,
        groupDate: body.groupDate,
        reference: body.reference,
        description: body.description,
        status: 'PENDING',
        ledgerTransactionList: body.ledgerTransactionList.map((tx, i) => ({
          id: `${id}-tx-${i}`,
          ledgerAccount: ACCOUNTS[tx.ledgerAccount.id],
          amount: tx.amount,
          transactionState: tx.transactionState,
          description: tx.description,
          transactionDate: body.groupDate,
        })),
      };
      this.groups.unshift(group);
      return json(route, 201, group);
    });
    await page.route('**/rest/ledgerTransactionGroup/post/*', (route) => {
      const id = idFrom(route.request().url());
      this.postCalls.push(id);
      if (this.postFailure) return json(route, this.postFailure.status, this.postFailure.body);
      const group = this.find(id);
      if (!group || group.status !== 'PENDING') {
        return json(route, 409, { error: 'Only a pending journal entry can be posted' });
      }
      group.status = 'POSTED';
      return json(route, 200, group);
    });
    await page.route('**/rest/ledgerTransactionGroup/reverse/*', (route) => {
      const id = idFrom(route.request().url());
      const body = route.request().postDataJSON() as { reversalDate?: string } | null;
      this.reverseCalls.push({ id, body });
      const original = this.find(id);
      if (!original || original.status !== 'POSTED') {
        return json(route, 409, { error: 'Only a posted journal entry can be reversed' });
      }
      const date = body?.reversalDate ?? original.groupDate;
      const reversal: Group = {
        id: `${id}-rev`,
        groupDate: date,
        reference: `REV-${original.reference ?? id}`,
        description: `Reversal of ${original.reference ?? id}`,
        status: 'POSTED',
        ledgerTransactionList: original.ledgerTransactionList.map((tx, i) => ({
          ...tx,
          id: `${id}-rev-tx-${i}`,
          transactionDate: date,
          transactionState: tx.transactionState === 'DEBIT' ? 'CREDIT' : 'DEBIT',
        })),
      };
      original.status = 'REVERSED';
      this.groups.unshift(reversal);
      return json(route, 201, reversal);
    });
  }
}

async function openRegisterFromSidebar(page: Page) {
  await page.goto('/dashboard');
  await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 20_000 });
  await page.locator('aside').locator('a[href="/accounting/transactions"]').first().click();
  await expect(page).toHaveURL(/\/accounting\/transactions$/);
  await expect(page.getByTestId('transaction-register-page')).toBeVisible({ timeout: 15_000 });
}

async function fillNewEntry(page: Page) {
  await page.getByTestId('new-journal-entry-button').click();
  await expect(page.getByTestId('journal-entry-heading')).toHaveText('New Journal Entry');
  await page.getByTestId('journal-entry-date-input').fill('2026-10-12');
  await page.getByTestId('journal-entry-reference-input').fill('JE-155');
  await page.getByTestId('journal-entry-description-input').fill('October consulting retainer');
  await page.getByTestId('journal-entry-line-0-account').selectOption('acc-1000');
  await page.getByTestId('journal-entry-line-0-debit').fill('12500');
  await page.getByTestId('journal-entry-line-1-account').selectOption('acc-4000');
  await page.getByTestId('journal-entry-line-1-credit').fill('12500');
  await expect(page.getByTestId('journal-entry-balance-indicator')).toContainText('Balanced');
}

let apiGuard: UnmockedApiGuard;
let backend: JournalBackend;

test.describe('SOUPFIN-155: journal entry lifecycle on the entry page', () => {
  test.skip(isLxcMode(), 'Mock-only spec: the backend has no post/reverse actions yet');

  test.beforeEach(async ({ page }) => {
    // FIRST, so every explicit mock takes precedence over it.
    apiGuard = await installUnmockedApiGuard(page);
    await installGuideMocks(page);
    backend = new JournalBackend();
    // Registered after the guide mocks so these win (Playwright routes are LIFO).
    await backend.install(page);
    await seedAuthenticatedSession(page);
  });

  test.afterEach(() => {
    apiGuard?.assertNone();
  });

  test('create -> Save & Post -> Reverse', async ({ page }) => {
    await openRegisterFromSidebar(page);
    await shot(page, '01-register-before');

    await fillNewEntry(page);
    await shot(page, '02-new-entry-filled');
    expect(backend.groups).toHaveLength(0);

    await page.getByTestId('journal-entry-save-post-button').click();

    // Back on the register, and the backend holds one POSTED entry.
    await expect(page).toHaveURL(/\/accounting\/transactions$/);
    await expect(page.getByText('Journal entry saved and posted.')).toBeVisible();
    expect(backend.groups).toHaveLength(1);
    const [entry] = backend.groups;
    expect(backend.postCalls).toEqual([entry.id]);
    expect(entry.status).toBe('POSTED');
    await expect(page.getByTestId(`transaction-status-${entry.id}-0`)).toHaveText(/posted/i);
    await shot(page, '03-register-after-post');

    // Open it from the row menu: read-only, with Reverse and no Delete.
    await page.getByTestId(`transaction-actions-${entry.id}-0`).click();
    await page.getByTestId(`transaction-dropdown-${entry.id}-0`).getByRole('button', { name: 'View' }).click();
    await expect(page).toHaveURL(new RegExp(`/accounting/journal-entry/${entry.id}$`));
    await expect(page.getByTestId('journal-entry-readonly-banner')).toContainText('Use Reverse to undo it.');
    await expect(page.getByTestId('journal-entry-delete-button')).toHaveCount(0);
    await expect(page.getByTestId('journal-entry-save-post-button')).toHaveCount(0);
    await shot(page, '04-posted-entry-with-reverse');

    await page.getByTestId('journal-entry-reverse-button').click();
    const dialog = page.getByTestId('journal-entry-reverse-dialog');
    await expect(dialog).toBeVisible();
    await page.getByTestId('journal-entry-reversal-date-input').fill('2026-10-31');
    await shot(page, '05-reverse-dialog');
    expect(backend.reverseCalls).toHaveLength(0);

    await page.getByTestId('journal-entry-reverse-confirm-button').click();

    await expect(page.getByText('Journal entry reversed.')).toBeVisible();
    await expect(dialog).toHaveCount(0);
    expect(backend.reverseCalls).toEqual([{ id: entry.id, body: { reversalDate: '2026-10-31' } }]);
    expect(backend.find(entry.id)?.status).toBe('REVERSED');
    const reversal = backend.find(`${entry.id}-rev`);
    expect(reversal?.groupDate).toBe('2026-10-31');
    expect(reversal?.ledgerTransactionList.map((tx) => tx.transactionState)).toEqual(['CREDIT', 'DEBIT']);
    // The refetched entry is reversed: no Reverse button any more.
    await expect(page.getByTestId('journal-entry-readonly-banner')).toContainText('reversed');
    await expect(page.getByTestId('journal-entry-reverse-button')).toHaveCount(0);
    await shot(page, '06-entry-reversed');

    await page.getByTestId('journal-entry-cancel-button').click();
    await expect(page).toHaveURL(/\/accounting\/transactions$/);
    await expect(page.getByTestId(`transaction-status-${entry.id}-0`)).toHaveText(/reversed/i);
    await expect(page.getByTestId(`transaction-row-${entry.id}-rev-0`)).toBeVisible();
    await shot(page, '07-register-with-reversal');
  });

  test('Save Draft saves without posting', async ({ page }) => {
    await openRegisterFromSidebar(page);
    await fillNewEntry(page);

    await page.getByTestId('journal-entry-save-draft-button').click();

    await expect(page).toHaveURL(/\/accounting\/transactions$/);
    await expect(page.getByText('Journal entry saved as a draft.')).toBeVisible();
    expect(backend.groups).toHaveLength(1);
    expect(backend.groups[0].status).toBe('PENDING');
    expect(backend.postCalls).toHaveLength(0);
    await shot(page, '08-register-after-save-draft');

    // A pending entry offers Post and Delete, not Reverse.
    const id = backend.groups[0].id;
    await page.getByTestId(`transaction-actions-${id}-0`).click();
    await page.getByTestId(`transaction-dropdown-${id}-0`).getByRole('button', { name: 'View' }).click();
    await expect(page.getByTestId('journal-entry-save-post-button')).toHaveText(/^\s*Post\s*$/);
    await expect(page.getByTestId('journal-entry-delete-button')).toBeVisible();
    await expect(page.getByTestId('journal-entry-reverse-button')).toHaveCount(0);
    await shot(page, '09-pending-entry-actions');

    await page.getByTestId('journal-entry-save-post-button').click();
    await expect(page).toHaveURL(/\/accounting\/transactions$/);
    expect(backend.postCalls).toEqual([id]);
    expect(backend.groups[0].status).toBe('POSTED');
  });

  test('a failed post after a good save says so and stays on the saved entry', async ({ page }) => {
    backend.postFailure = { status: 422, body: { error: 'Journal entry is not balanced' } };
    await openRegisterFromSidebar(page);
    await fillNewEntry(page);

    await page.getByTestId('journal-entry-save-post-button').click();

    const id = 'group-155-1';
    await expect(page).toHaveURL(new RegExp(`/accounting/journal-entry/${id}$`));
    await expect(page.getByTestId('journal-entry-error')).toContainText(
      'Journal entry saved as a draft, but posting failed: Journal entry is not balanced'
    );
    expect(backend.groups).toHaveLength(1);
    expect(backend.groups[0].status).toBe('PENDING');
    expect(backend.postCalls).toEqual([id]);
    // The saved entry is loaded, so the next click posts it rather than saving a copy.
    await expect(page.getByTestId('journal-entry-reference-input')).toHaveValue('JE-155');
    await expect(page.getByTestId('journal-entry-save-post-button')).toHaveText(/^\s*Post\s*$/);
    await shot(page, '10-post-failed-after-save');
  });
});
