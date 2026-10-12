/**
 * SOUPFIN-157: four voucher types — PAYMENT, RECEIPT, CONTRA, JOURNAL.
 *
 * For each type, reached by sidebar clicks (Accounting → <type> Voucher):
 *  - the debit and credit dropdowns offer only the accounts the type allows
 *    (CONTRA: bank/cash to bank/cash; JOURNAL: any account to any account)
 *  - saving posts the two sides as debitLedgerAccount / creditLedgerAccount,
 *    the backend Voucher's own field names
 *  - the saved voucher then appears in the Transaction Register with its type
 *    label, a debit row and a credit row, and the type filter isolates it
 *
 * Mock mode: the API state is a list held in this file. It is read before and
 * after each save, and the test asserts the save changed it. LXC verification
 * is tracked separately (the shared LXC backend refused every login on
 * 2026-10-12, see the PM ticket).
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import { installGuideMocks, seedAuthenticatedSession, ledgerAccounts } from './user-guide/guide-mocks';
import { installUnmockedApiGuard, isLxcMode, type UnmockedApiGuard } from './fixtures';

const SHOT_DIR = 'e2e/playwright/screenshots/soupfin-157';

test.use({ viewport: { width: 1440, height: 1000 } });
test.setTimeout(120_000);

async function shot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: true });
}

type SavedVoucher = Record<string, unknown> & { id: string };

/** The mock backend: vouchers saved through the form land here. */
async function installVoucherBackend(page: Page) {
  const saved: SavedVoucher[] = [];
  const posts: Record<string, unknown>[] = [];
  const json = (route: Route, body: unknown) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  const accountRef = (ref: unknown) => {
    const id = (ref as { id?: string } | undefined)?.id;
    const acc = ledgerAccounts.find((a) => a.id === id);
    return acc ? { id: acc.id, code: acc.code, name: acc.name } : undefined;
  };

  // Registered after installGuideMocks, so these win (Playwright routes are LIFO).
  await page.route('**/rest/voucher/index.json*', (route) => json(route, saved));
  await page.route('**/rest/voucher/create.json*', (route) =>
    json(route, { voucher: { SYNCHRONIZER_TOKEN: 'csrf-157', SYNCHRONIZER_URI: '/voucher/create' } })
  );
  await page.route('**/rest/voucher/save.json*', (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    posts.push(body);
    const record: SavedVoucher = {
      id: `v-${saved.length + 1}`,
      voucherNumber: `${String(body.voucherType).slice(0, 1)}V-157-${saved.length + 1}`,
      voucherType: body.voucherType,
      voucherTo: body.voucherTo,
      status: 'PENDING',
      ledgerTransaction: {
        transactionDate: body.transactionDate,
        notes: body.notes,
        amount: body.amount,
        debitLedgerAccount: accountRef(body.debitLedgerAccount),
        creditLedgerAccount: accountRef(body.creditLedgerAccount),
      },
    };
    saved.push(record);
    return json(route, record);
  });
  return { saved, posts };
}

async function openFromSidebar(page: Page, linkName: string, path: string) {
  // Accounting → Transaction Register, which reveals the Accounting sub-items.
  await page.locator('aside').getByRole('link', { name: 'Accounting', exact: true }).click();
  await expect(page).toHaveURL(/\/accounting\/transactions$/);
  await page.locator('aside').getByRole('link', { name: linkName, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/accounting/voucher/${path}$`));
  await expect(page.getByTestId('voucher-form-page')).toBeVisible();
}

const optionLabels = (page: Page, testId: string) =>
  page.getByTestId(testId).locator('option').evaluateAll((opts) =>
    opts.map((o) => (o as HTMLOptionElement).value ? o.textContent?.trim() : null).filter(Boolean)
  );

const ALL = ledgerAccounts.map((a) => `${a.code} - ${a.name}`);
const ASSETS = ['1000 - Cash at Bank', '1100 - Accounts Receivable', '1200 - Office Equipment'];

const CASES = [
  {
    type: 'PAYMENT', menu: 'Payment Voucher', path: 'payment', label: 'Payment',
    debitOptions: ['5000 - Office Expenses', '5100 - Utilities'], creditOptions: ASSETS,
    debit: 'acc-5100', credit: 'acc-1000', debitName: 'Utilities', creditName: 'Cash at Bank',
    party: true,
  },
  {
    type: 'RECEIPT', menu: 'Receipt Voucher', path: 'receipt', label: 'Receipt',
    debitOptions: ASSETS, creditOptions: ['4000 - Consulting Revenue'],
    debit: 'acc-1000', credit: 'acc-4000', debitName: 'Cash at Bank', creditName: 'Consulting Revenue',
    party: true,
  },
  {
    type: 'CONTRA', menu: 'Contra Voucher', path: 'contra', label: 'Contra',
    debitOptions: ASSETS, creditOptions: ASSETS,
    debit: 'acc-1100', credit: 'acc-1000', debitName: 'Accounts Receivable', creditName: 'Cash at Bank',
    party: false,
  },
  {
    type: 'JOURNAL', menu: 'Journal Voucher', path: 'journal', label: 'Journal Voucher',
    debitOptions: ALL, creditOptions: ALL,
    debit: 'acc-3000', credit: 'acc-2100', debitName: 'Share Capital', creditName: 'VAT Payable',
    party: true,
  },
] as const;

let apiGuard: UnmockedApiGuard;

test.describe('SOUPFIN-157: payment, receipt, contra and journal vouchers', () => {
  test.skip(isLxcMode(), 'Mock-only spec: holds the voucher list itself to compare before and after');

  test.beforeEach(async ({ page }) => {
    apiGuard = await installUnmockedApiGuard(page);
    await installGuideMocks(page);
    await seedAuthenticatedSession(page);
  });

  test.afterEach(() => {
    apiGuard?.assertNone();
  });

  for (const c of CASES) {
    test(`${c.type}: menu → filtered accounts → save → Dr/Cr rows in the register`, async ({ page }) => {
      const backend = await installVoucherBackend(page);
      await page.goto('/dashboard');
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 20_000 });

      // API state before: nothing saved yet.
      expect(backend.saved).toHaveLength(0);

      await openFromSidebar(page, c.menu, c.path);
      await expect(page.getByTestId('voucher-form-heading')).toHaveText(`New ${c.menu}`);
      await expect(page.getByTestId(`voucher-type-${c.path}`)).toHaveClass(/bg-primary/);
      await expect(page.getByTestId('voucher-type-deposit')).toHaveCount(0);
      await expect(page.getByTestId('voucher-beneficiary-section')).toHaveCount(c.party ? 1 : 0);

      expect(await optionLabels(page, 'voucher-debit-account-select')).toEqual(c.debitOptions);
      expect(await optionLabels(page, 'voucher-credit-account-select')).toEqual(c.creditOptions);
      await shot(page, `${c.path}-01-form-opened`);

      await page.getByTestId('voucher-notes-input').fill(`SOUPFIN-157 ${c.type} test`);
      if (c.type === 'PAYMENT') await page.getByTestId('voucher-vendor-input').fill('vendor-157');
      if (c.type === 'RECEIPT') await page.getByTestId('voucher-client-input').fill('as-157');
      await page.getByTestId('voucher-debit-account-select').selectOption(c.debit);
      await page.getByTestId('voucher-credit-account-select').selectOption(c.credit);
      await page.getByTestId('voucher-amount-input').fill('1250');

      await expect(page.getByTestId('voucher-preview-debit-row')).toContainText(c.debitName);
      await expect(page.getByTestId('voucher-preview-credit-row')).toContainText(c.creditName);
      await shot(page, `${c.path}-02-form-filled`);

      await page.getByTestId('voucher-form-save-draft-button').click();
      await expect(page).toHaveURL(/\/accounting\/transactions$/);
      await expect(page.getByTestId('transaction-register-page')).toBeVisible();

      // API state after: the save reached the backend with both sides named as
      // the Voucher domain names them, and nothing else.
      expect(backend.saved).toHaveLength(1);
      expect(backend.posts[0]).toMatchObject({
        voucherType: c.type,
        amount: 1250,
        notes: `SOUPFIN-157 ${c.type} test`,
        debitLedgerAccount: { id: c.debit },
        creditLedgerAccount: { id: c.credit },
      });
      expect(backend.posts[0]).not.toHaveProperty('cashAccount');
      expect(backend.posts[0]).not.toHaveProperty('expenseAccount');
      expect(backend.posts[0]).not.toHaveProperty('incomeAccount');
      if (!c.party) expect(backend.posts[0].voucherTo).toBe('OTHER');

      // The register shows one debit row and one credit row for the voucher.
      const debitRow = page.getByTestId('transaction-type-v-1-debit');
      const creditRow = page.getByTestId('transaction-type-v-1-credit');
      await expect(debitRow).toHaveText(c.label);
      await expect(creditRow).toHaveText(c.label);
      const debitTr = page.locator('tr', { has: debitRow });
      const creditTr = page.locator('tr', { has: creditRow });
      await expect(debitTr).toContainText(c.debitName);
      await expect(debitTr).toContainText('1,250.00');
      await expect(creditTr).toContainText(c.creditName);
      await expect(creditTr).toContainText('1,250.00');

      // The type filter keeps this voucher's rows and drops the journal entries.
      await page.getByTestId('filter-type').selectOption(c.type);
      await expect(debitTr).toBeVisible();
      await expect(page.getByTestId(/^transaction-type-/)).toHaveCount(2);
      await shot(page, `${c.path}-03-register-filtered`);
    });
  }

  test('moving between voucher types in the sidebar opens each type, not the previous one', async ({ page }) => {
    await installVoucherBackend(page);
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 20_000 });
    await openFromSidebar(page, 'Receipt Voucher', 'receipt');
    await expect(page.getByTestId('voucher-form-heading')).toHaveText('New Receipt Voucher');

    for (const [menu, path] of [['Contra Voucher', 'contra'], ['Journal Voucher', 'journal'], ['Payment Voucher', 'payment']]) {
      await page.locator('aside').getByRole('link', { name: menu, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/accounting/voucher/${path}$`));
      await expect(page.getByTestId('voucher-form-heading')).toHaveText(`New ${menu}`);
      await expect(page.getByTestId(`voucher-type-${path}`)).toHaveClass(/bg-primary/);
    }
    await shot(page, 'sidebar-01-switched-to-payment');
  });

  test('switching to Contra clears accounts chosen for another type', async ({ page }) => {
    await installVoucherBackend(page);
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 20_000 });
    await openFromSidebar(page, 'Journal Voucher', 'journal');

    await page.getByTestId('voucher-debit-account-select').selectOption('acc-5000');
    await page.getByTestId('voucher-credit-account-select').selectOption('acc-2000');
    await page.getByTestId('voucher-type-contra').click();

    await expect(page.getByTestId('voucher-form-heading')).toHaveText('New Contra Voucher');
    await expect(page.getByTestId('voucher-debit-account-select')).toHaveValue('');
    await expect(page.getByTestId('voucher-credit-account-select')).toHaveValue('');
    expect(await optionLabels(page, 'voucher-debit-account-select')).toEqual(ASSETS);
    await shot(page, 'contra-04-switched-from-journal');
  });

  test('refuses a contra from an account to itself', async ({ page }) => {
    const backend = await installVoucherBackend(page);
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 20_000 });
    await openFromSidebar(page, 'Contra Voucher', 'contra');

    await page.getByTestId('voucher-notes-input').fill('Nowhere');
    await page.getByTestId('voucher-debit-account-select').selectOption('acc-1000');
    await page.getByTestId('voucher-credit-account-select').selectOption('acc-1000');
    await page.getByTestId('voucher-amount-input').fill('10');
    await page.getByTestId('voucher-form-save-draft-button').click();

    await expect(page.getByText('Debit and credit accounts must be different')).toBeVisible();
    await expect(page).toHaveURL(/\/accounting\/voucher\/contra$/);
    expect(backend.posts).toHaveLength(0);
    await shot(page, 'contra-05-same-account-refused');
  });
});
