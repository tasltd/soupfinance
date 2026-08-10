/**
 * SOUPFIN-30 — V19 test-round frontend fixes.
 *
 * Covers the four user-visible surfaces changed in this issue:
 *
 *  #6  Accessibility — every form field rendered by the shared Input / Select /
 *      Textarea / DatePicker controls now carries an `id` and an explicitly
 *      associated <label>, so the "No label associated with a form field" and
 *      "A form field element should have an id or name attribute" findings on
 *      /clients are gone.
 *  #14 Editing an INDIVIDUAL client must not offer the Corporate type tab.
 *  #15 A "+" affordance sits beside the vendor dropdown on the bill form.
 *  #16 (a) Expanding Reports must not squash the sidebar; the logo and the
 *      Logout block stay intact and every sub-item is reachable.
 *      (b/c) The journal-entry amount fields reject letters and render the
 *      *tenant's* currency symbol (GH₵ for GHS) rather than a hardcoded "$".
 *
 * Navigation is done by clicking sidebar menu items (never a direct route
 * `goto`), so the tests also prove the features are reachable through the UI.
 * Screenshots land in e2e/playwright/screenshots/soupfin-30/ and are committed
 * as evidence for this fix.
 */
import { test, expect, type Page } from '@playwright/test';
import { mockTokenValidationApi, mockVendorsApi, isLxcMode } from './fixtures';

/**
 * Screenshots go to a git-tracked directory rather than through the shared
 * `takeScreenshot` fixture: that helper writes under `test-results/`, which
 * Playwright wipes at the start of every run, so the evidence for this fix would
 * not survive.
 */
async function shot(page: Page, name: string) {
  await page.screenshot({
    path: `e2e/playwright/screenshots/soupfin-30/${name}.png`,
    fullPage: true,
  });
}

const mockClients = [
  {
    id: 'client-ind',
    name: 'Ama Mensah',
    firstName: 'Ama',
    lastName: 'Mensah',
    companyName: '',
    email: 'ama@example.com',
    clientType: 'INDIVIDUAL' as const,
    archived: false,
    tenantId: 'account-001',
    dateCreated: '2024-03-01T09:00:00Z',
    lastUpdated: '2024-03-01T09:00:00Z',
  },
  {
    id: 'client-corp',
    name: 'Acme Holdings Ltd',
    firstName: '',
    lastName: '',
    companyName: 'Acme Holdings Ltd',
    email: 'billing@acme.example',
    clientType: 'CORPORATE' as const,
    archived: false,
    tenantId: 'account-001',
    dateCreated: '2024-03-01T09:00:00Z',
    lastUpdated: '2024-03-01T09:00:00Z',
  },
];

const mockLedgerAccounts = [
  {
    id: 'la-1',
    number: '1000',
    name: 'Cash',
    serialised: 'Cash < ASSET',
    ledgerAccountCategory: { id: 'cat-1', serialised: 'ASSET' },
  },
  {
    id: 'la-2',
    number: '4000',
    name: 'Sales Revenue',
    serialised: 'Sales Revenue < INCOME',
    ledgerAccountCategory: { id: 'cat-2', serialised: 'INCOME' },
  },
];

async function setupMockAuth(page: Page) {
  await page.addInitScript(() => {
    const mockUser = {
      username: 'admin',
      email: 'admin@soupfinance.com',
      roles: ['ROLE_ADMIN', 'ROLE_USER'],
      tenantId: 'account-001',
    };
    localStorage.setItem('access_token', 'mock-jwt-token');
    localStorage.setItem('user', JSON.stringify(mockUser));
    localStorage.setItem(
      'auth-storage',
      JSON.stringify({
        state: { user: mockUser, isAuthenticated: true, isInitialized: true },
        version: 0,
      })
    );
  });
}

/**
 * Common mocks + landing on the dashboard, which is the only direct URL any of
 * these tests uses. Everything after this happens through menu clicks.
 *
 * @param currency ISO code the tenant account reports — drives the currency
 *   symbol the money fields render (#16c).
 */
async function signInAndLand(page: Page, currency = 'USD') {
  await setupMockAuth(page);

  // Catch-all FIRST so it has the lowest precedence (Playwright routes are LIFO):
  // any endpoint a page touches that this spec does not care about answers with an
  // empty list instead of hanging against a backend that is not running.
  await page.route('**/rest/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );

  await mockTokenValidationApi(page, true);

  // Registered AFTER mockTokenValidationApi so it wins (Playwright routes are LIFO)
  // and the tenant currency is whatever this test asked for.
  await page.route('**/account/show/*.json*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'account-001',
        name: 'Test Company',
        currency,
        dateCreated: '2024-01-01T00:00:00Z',
      }),
    })
  );

  await mockVendorsApi(page);
  await page.route('**/rest/client/index.json*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockClients),
    })
  );
  await page.route('**/rest/ledgerAccount/index.json*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockLedgerAccounts),
    })
  );
  await page.route('**/rest/invoice/index.json*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await page.route('**/rest/bill/index.json*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await page.route('**/rest/serviceDescription/index.json*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );

  await page.goto('/dashboard');
  await page.waitForLoadState('domcontentloaded');
}

/**
 * Click a top-level sidebar entry by its visible label.
 *
 * Top-level entries are the direct `nav > div > a` children; sub-items live one
 * level deeper. Matching by accessible name would not work here because each
 * top-level link also renders a Material Symbols span, so its name is
 * "people Clients" rather than "Clients".
 */
async function clickNav(page: Page, label: string) {
  await page.locator('nav > div > a', { hasText: label }).first().click();
}

test.describe('SOUPFIN-30 #16a — sidebar survives expanding Reports', () => {
  test('every Reports sub-item is reachable and the Logout block is not squashed', async ({
    page,
  }) => {
    if (isLxcMode()) {
      test.skip();
      return;
    }
    // A short viewport is the condition that produced the reported distortion:
    // 7 Reports children pushed the nav column past the available height.
    await page.setViewportSize({ width: 1280, height: 700 });
    await signInAndLand(page);

    const logout = page.getByTestId('logout-button');
    const heightBefore = (await logout.boundingBox())?.height ?? 0;
    expect(heightBefore).toBeGreaterThan(0);

    await clickNav(page, 'Reports');
    await page.waitForLoadState('domcontentloaded');

    const nav = page.locator('nav');
    for (const child of [
      'All Reports',
      'Profit & Loss',
      'Balance Sheet',
      'Cash Flow',
      'Aging Reports',
      'Trial Balance',
      'Scheduled Reports',
    ]) {
      await expect(nav.getByRole('link', { name: child, exact: true })).toBeVisible();
    }

    // The Logout block keeps its full height (it is `shrink-0`) instead of being
    // compressed by the now-taller nav column.
    const heightAfter = (await logout.boundingBox())?.height ?? 0;
    expect(heightAfter).toBeGreaterThanOrEqual(heightBefore);
    await expect(logout).toBeVisible();

    await shot(page, 'sidebar-reports-expanded');

    // The nav column scrolls rather than overflowing the sidebar.
    const navColumn = page.locator('nav').locator('xpath=..');
    await expect(navColumn).toHaveClass(/overflow-y-auto/);
  });
});

test.describe('SOUPFIN-30 #16b/c — journal entry money fields', () => {
  test('renders the tenant currency symbol and refuses letters in the debit field', async ({
    page,
  }) => {
    if (isLxcMode()) {
      test.skip();
      return;
    }
    await signInAndLand(page, 'GHS');

    await clickNav(page, 'Accounting');
    await page.locator('nav').getByRole('link', { name: 'Journal Entry', exact: true }).click();
    await expect(page.getByTestId('journal-entry-page')).toBeVisible();

    // #16c — the account's currency drives the symbol; GHS must NOT show "$".
    const symbols = page.getByTestId('money-input-currency-symbol');
    await expect(symbols.first()).toHaveText('GH₵');
    await expect(page.getByTestId('journal-entry-lines-table')).not.toContainText('$');

    // #16b — typing letters leaves the field empty; digits are accepted.
    const debit = page.getByTestId('journal-entry-line-0-debit');
    await debit.fill('');
    await debit.pressSequentially('abc');
    await expect(debit).toHaveValue('');

    // The letters above must be blocked by MoneyInput itself, not by the
    // browser: Chromium discards them, but Firefox keeps them in the control's
    // raw buffer and only reports `.value` as "". If the component ever stops
    // blocking them, the digits below land on top of a leftover "abc" and this
    // assertion sees "" instead of "15".
    //
    // `e`, `E`, `+` and `-` are additionally legal in a bare <input
    // type="number"> (scientific-notation grammar) — MoneyInput blocks those too.
    await debit.pressSequentially('1e5');
    await expect(debit).toHaveValue('15');
    await debit.fill('');

    await debit.pressSequentially('150.25');
    await expect(debit).toHaveValue('150.25');

    // Regression guard: MoneyInput must keep forwarding react-hook-form's
    // onChange, otherwise the field renders a value the running totals never
    // see. The totals are also the second place the tenant currency shows up.
    await expect(page.getByTestId('journal-entry-total-debit')).toHaveText('GH₵150.25');
    await expect(page.getByTestId('journal-entry-total-credit')).toHaveText('GH₵0.00');

    await shot(page, 'journal-entry-currency-and-validation');
  });
});

test.describe('SOUPFIN-30 #15 — add-vendor affordance beside the bill vendor dropdown', () => {
  test('the bill form shows a labelled "+" button next to the vendor select', async ({ page }) => {
    if (isLxcMode()) {
      test.skip();
      return;
    }
    await signInAndLand(page);

    await clickNav(page, 'Bills');
    await page.getByTestId('bill-new-button').click();
    await expect(page.getByTestId('bill-form-page')).toBeVisible();

    const addButton = page.getByTestId('bill-vendor-add-button');
    await expect(addButton).toBeVisible();
    await expect(addButton).toHaveAttribute('aria-label', 'Add new vendor');

    // It sits beside the select, not below it.
    const selectBox = await page.getByTestId('bill-vendor-select').boundingBox();
    const buttonBox = await addButton.boundingBox();
    expect(selectBox).not.toBeNull();
    expect(buttonBox).not.toBeNull();
    expect(buttonBox!.x).toBeGreaterThan(selectBox!.x);
    expect(Math.abs(buttonBox!.y - selectBox!.y)).toBeLessThan(selectBox!.height);

    await shot(page, 'bill-form-add-vendor-button');
  });
});

test.describe('SOUPFIN-30 #14 — client type tabs while editing', () => {
  test('editing an INDIVIDUAL client hides the Corporate tab', async ({ page }) => {
    if (isLxcMode()) {
      test.skip();
      return;
    }
    await signInAndLand(page);
    // Registered AFTER signInAndLand so it beats that helper's catch-all (LIFO).
    await page.route('**/rest/client/show/client-ind*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockClients[0]),
      })
    );

    await clickNav(page, 'Clients');
    await page.getByTestId('client-edit-client-ind').click();

    await expect(page.getByTestId('client-type-individual')).toBeVisible();
    await expect(page.getByTestId('client-type-corporate')).toHaveCount(0);
    await expect(page.getByTestId('client-form-personal-section')).toBeVisible();

    await shot(page, 'client-edit-individual-no-corporate-tab');
  });

  test('editing a CORPORATE client still offers both tabs so a misclassification can be corrected', async ({
    page,
  }) => {
    if (isLxcMode()) {
      test.skip();
      return;
    }
    await signInAndLand(page);
    // Registered AFTER signInAndLand so it beats that helper's catch-all (LIFO).
    await page.route('**/rest/client/show/client-corp*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockClients[1]),
      })
    );

    await clickNav(page, 'Clients');
    await page.getByTestId('client-edit-client-corp').click();

    await expect(page.getByTestId('client-type-corporate')).toBeVisible();
    await expect(page.getByTestId('client-type-individual')).toBeVisible();
    await expect(page.getByTestId('client-type-individual')).toBeEnabled();

    await shot(page, 'client-edit-corporate-both-tabs');
  });
});

test.describe('SOUPFIN-30 #6 — form fields carry ids and associated labels', () => {
  test('no field on the new-client form is missing an id or an accessible name', async ({
    page,
  }) => {
    if (isLxcMode()) {
      test.skip();
      return;
    }
    await signInAndLand(page);

    await clickNav(page, 'Clients');
    await page.getByTestId('client-new-button').click();
    await expect(page.getByTestId('client-form-container')).toBeVisible();

    // The two accessibility findings, checked directly against the rendered DOM:
    //  1. every field element has an id (or a name)
    //  2. every field resolves to an accessible name via <label for>, a wrapping
    //     <label>, aria-label or aria-labelledby
    const offenders = await page.evaluate(() => {
      // Hidden inputs are excluded: they have no visual affordance, carry a
      // `name`, and are not what the accessibility scanner flags.
      const fields = Array.from(
        document.querySelectorAll(
          'form input:not([type="hidden"]), form select, form textarea'
        )
      ) as HTMLElement[];
      const noId: string[] = [];
      const noLabel: string[] = [];
      for (const field of fields) {
        const id = field.getAttribute('id');
        const name = field.getAttribute('name');
        if (!id && !name) noId.push(field.outerHTML.slice(0, 120));

        const labelled =
          (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) ||
          field.closest('label') ||
          field.getAttribute('aria-label') ||
          field.getAttribute('aria-labelledby');
        if (!labelled) noLabel.push(field.outerHTML.slice(0, 120));
      }
      return { total: fields.length, noId, noLabel };
    });

    expect(offenders.total).toBeGreaterThan(0);
    expect(offenders.noId).toEqual([]);
    expect(offenders.noLabel).toEqual([]);

    await shot(page, 'client-form-accessible-fields');
  });
});
