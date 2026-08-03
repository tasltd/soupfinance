/**
 * SOUPFIN-33 — V20 test-round frontend fixes.
 *
 * Covers the six user-visible surfaces changed in this issue:
 *
 *  #1 Ledger Transactions "From"/"To" filters read as "0/0/0". The bound value was
 *     already sanitised to '' — the zeroes are how an *unnamed* empty native date
 *     control serialises, so the fix is the accessible name plus an explicit
 *     "no date selected" description. Same root cause as #6.
 *  #2 Trial Balance empty state printed raw ISO dates ("between 2026-08-01 and
 *     2026-08-31 .") while the header above it printed "August 31, 2026".
 *  #3 The Edit Bank Account bank dropdown listed ~15 copies of every bank.
 *  #4 Aging Reports A/P amounts rendered "$0.00" instead of the tenant currency.
 *  #5 Settings > Users printed "No email on file" underneath a valid @username.
 *  #6 Form fields on list pages had no label and no id/name attribute.
 *
 * Navigation is done by clicking sidebar menu items (never a direct route `goto`),
 * so the tests also prove each surface is reachable through the UI. Screenshots land
 * in e2e/playwright/screenshots/soupfin-33/ and are committed as evidence.
 */
import { test, expect, type Page } from '@playwright/test';
import { mockTokenValidationApi, isLxcMode } from './fixtures';

/**
 * Screenshots go to a git-tracked directory rather than through the shared
 * `takeScreenshot` fixture: that helper writes under `test-results/`, which
 * Playwright wipes at the start of every run, so the evidence would not survive.
 */
async function shot(page: Page, name: string) {
  await page.screenshot({
    path: `e2e/playwright/screenshots/soupfin-33/${name}.png`,
    fullPage: true,
  });
}

/** The reported shape: the same banks repeated ~15x, each row with a distinct id. */
const DUPLICATE_BANKS = Array.from({ length: 15 }, (_, i) => [
  { id: `gcb-${i}`, name: 'GCB Bank' },
  { id: `absa-${i}`, name: 'Absa Bank Ghana Limited' },
  { id: `fidelity-${i}`, name: 'Fidelity Bank' },
]).flat();

/** An agent with a login but NO emailContacts — the row that showed the stray note. */
const AGENTS_WITHOUT_EMAIL = [
  {
    id: 'agent-1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    userAccess: { id: 1, username: 'ada.lovelace', enabled: true },
    authorities: [{ id: 1, authority: 'ROLE_ADMIN' }],
  },
];

/**
 * A single all-zero A/P vendor row — the exact reported scenario for #4.
 *
 * These payloads are in the BACKEND shape (`agedPayablesList`, `resultList`) because
 * src/api/endpoints/reports.ts transforms them before the page ever sees them.
 */
const AP_AGING_ZERO = {
  agedPayablesList: [
    {
      name: 'V19 Test Vendor',
      notYetOverdue: 0,
      thirtyOrLess: 0,
      thirtyOneToSixty: 0,
      sixtyOneToNinety: 0,
      ninetyOneOrMore: 0,
      totalUnpaid: 0,
    },
  ],
};

const EMPTY_TRIAL_BALANCE = {
  resultList: {
    ASSET: { accountList: [] },
    LIABILITY: { accountList: [] },
    EQUITY: { accountList: [] },
    REVENUE: { accountList: [] },
    EXPENSE: { accountList: [] },
  },
  totalDebit: 0,
  totalCredit: 0,
};

const CLIENTS = [
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
 * Common mocks + landing on the dashboard, which is the only direct URL any of these
 * tests uses. Everything after this happens through sidebar menu clicks.
 *
 * @param currency ISO code the tenant account reports — drives the symbol the money
 *   columns render (#4).
 */
async function signInAndLand(page: Page, currency = 'GHS') {
  await setupMockAuth(page);

  // Catch-all FIRST so it has the lowest precedence (Playwright routes are LIFO):
  // any endpoint a page touches that this spec does not care about answers with an
  // empty list instead of hanging against a backend that is not running.
  await page.route('**/rest/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );

  await mockTokenValidationApi(page, true);

  // Registered AFTER mockTokenValidationApi so it wins and the tenant currency is
  // whatever this test asked for.
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

  await page.route('**/rest/client/index.json*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CLIENTS) })
  );
  await page.route('**/rest/bank/index.json*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(DUPLICATE_BANKS),
    })
  );
  await page.route('**/rest/agent/index.json*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(AGENTS_WITHOUT_EMAIL),
    })
  );
  await page.route('**/rest/financeReports/agedPayables*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(AP_AGING_ZERO),
    })
  );
  await page.route('**/rest/financeReports/agedReceivables*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ agedReceivablesList: [] }),
    })
  );
  // An empty trial balance is what surfaces the empty-state message (#2).
  await page.route('**/rest/financeReports/trialBalance*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(EMPTY_TRIAL_BALANCE),
    })
  );

  await page.goto('/dashboard');
  await page.waitForLoadState('domcontentloaded');
}

/**
 * Click a top-level sidebar entry by its visible label.
 *
 * Top-level entries are the direct `nav > div > a` children; sub-items live one level
 * deeper. Matching by accessible name would not work here because each top-level link
 * also renders a Material Symbols span, so its name is "people Clients".
 */
async function clickNav(page: Page, label: string) {
  await page.locator('nav > div > a', { hasText: label }).first().click();
}

/** Expand a top-level section, then click one of its sub-items. */
async function clickSubNav(page: Page, section: string, child: string) {
  await clickNav(page, section);
  await page.getByRole('link', { name: child, exact: true }).first().click();
  await page.waitForLoadState('domcontentloaded');
}

/**
 * Mirrors the browser console audit that produced the #6 findings: every visible
 * form control must carry an id or a name, AND resolve to an accessible name.
 */
async function auditFormControls(page: Page) {
  return page.evaluate(() => {
    const controls = Array.from(
      document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
        'input:not([type="hidden"]), select, textarea'
      )
    );

    const describe = (el: Element) =>
      `<${el.tagName.toLowerCase()} ${['id', 'name', 'type', 'placeholder', 'data-testid']
        .map((a) => (el.getAttribute(a) ? `${a}="${el.getAttribute(a)}"` : ''))
        .filter(Boolean)
        .join(' ')}>`;

    const nameOf = (el: HTMLElement): string => {
      const aria = el.getAttribute('aria-label');
      if (aria && aria.trim()) return aria.trim();
      const labelledBy = el.getAttribute('aria-labelledby');
      if (labelledBy) {
        const text = labelledBy
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent || '')
          .join(' ')
          .trim();
        if (text) return text;
      }
      if (el.id) {
        const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (label && label.textContent && label.textContent.trim()) return label.textContent.trim();
      }
      const wrapping = el.closest('label');
      if (wrapping && wrapping.textContent && wrapping.textContent.trim())
        return wrapping.textContent.trim();
      return '';
    };

    return {
      total: controls.length,
      missingIdOrName: controls.filter((el) => !el.id && !el.getAttribute('name')).map(describe),
      missingLabel: controls.filter((el) => !nameOf(el)).map(describe),
    };
  });
}

test.describe('SOUPFIN-33 #1 — ledger date filters are named, not anonymous zeroes', () => {
  test('From/To announce their purpose and their empty state', async ({ page }) => {
    if (isLxcMode()) {
      test.skip();
      return;
    }
    await signInAndLand(page);
    await clickSubNav(page, 'Ledger', 'Transactions');

    await expect(page.getByTestId('ledger-filters')).toBeVisible();

    for (const [testId, accessibleName, expectedId] of [
      ['start-date-filter', 'Filter transactions from date', 'ledger-start-date-filter'],
      ['end-date-filter', 'Filter transactions to date', 'ledger-end-date-filter'],
    ] as const) {
      const input = page.getByTestId(testId);
      await expect(input).toHaveAttribute('id', expectedId);
      await expect(input).toHaveAttribute('name', expectedId);
      await expect(input).toHaveAttribute('aria-label', accessibleName);
      // Empty by default, and the emptiness is ANNOUNCED rather than drawn as 0/0/0.
      await expect(input).toHaveValue('');
      await expect(input).toHaveAttribute('data-empty', 'true');
      await expect(page.getByLabel(accessibleName)).toBeVisible();
    }

    await shot(page, '01-ledger-date-filters-empty');

    // Picking a date clears the "nothing selected" description.
    await page.getByTestId('start-date-filter').fill('2026-08-01');
    await expect(page.getByTestId('start-date-filter')).toHaveAttribute('data-empty', 'false');
    await shot(page, '02-ledger-date-filters-selected');
  });
});

test.describe('SOUPFIN-33 #2 — trial balance empty state formats its dates', () => {
  test('the message reads "Month D, YYYY", never raw ISO', async ({ page }) => {
    if (isLxcMode()) {
      test.skip();
      return;
    }
    await signInAndLand(page);
    await clickSubNav(page, 'Reports', 'Trial Balance');

    const empty = page.getByTestId('trial-balance-empty');
    await expect(empty).toBeVisible();

    const text = (await empty.textContent()) ?? '';
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(text).toMatch(/between [A-Z][a-z]+ \d{1,2}, \d{4} and [A-Z][a-z]+ \d{1,2}, \d{4}\./);
    // The reported stray gap before the sentence-ending period.
    expect(text).not.toMatch(/\s+\./);

    await shot(page, '03-trial-balance-empty-formatted-dates');
  });
});

test.describe('SOUPFIN-33 #3 — the bank dropdown lists each bank once', () => {
  test('45 duplicate rows collapse to 3 selectable options', async ({ page }) => {
    if (isLxcMode()) {
      test.skip();
      return;
    }
    await signInAndLand(page);
    await clickSubNav(page, 'Settings', 'Bank Accounts');

    // Reach the form through its own button rather than a route goto.
    await page.getByRole('link', { name: /add bank account|new bank account/i }).first().click();
    await page.waitForLoadState('domcontentloaded');

    const select = page.getByTestId('bank-account-bank');
    await expect(select).toBeVisible();

    const bankOptions = await select.locator('option').allTextContents();
    const gcb = bankOptions.filter((o) => o.trim() === 'GCB Bank');
    expect(gcb, 'GCB Bank must appear exactly once, not 15 times').toHaveLength(1);
    expect(bankOptions.filter((o) => o.trim() === 'Absa Bank Ghana Limited')).toHaveLength(1);
    expect(bankOptions.filter((o) => o.trim() === 'Fidelity Bank')).toHaveLength(1);

    await shot(page, '04-bank-dropdown-deduplicated');
  });
});

test.describe('SOUPFIN-33 #4 — aging report amounts use the tenant currency', () => {
  test('A/P zero rows render GH₵0.00, not $0.00', async ({ page }) => {
    if (isLxcMode()) {
      test.skip();
      return;
    }
    await signInAndLand(page, 'GHS');
    await clickSubNav(page, 'Reports', 'Aging Reports');

    const table = page.getByTestId('ap-aging-table');
    await expect(table).toBeVisible();

    const tableText = (await table.textContent()) ?? '';
    expect(tableText).toContain('GH₵0.00');
    expect(tableText, 'the hardcoded "$0.00" zero short-circuit must be gone').not.toContain('$');

    const totals = (await page.getByTestId('ap-aging-totals').textContent()) ?? '';
    expect(totals).toContain('GH₵');
    expect(totals).not.toContain('$');

    await shot(page, '05-aging-reports-tenant-currency');
  });
});

test.describe('SOUPFIN-33 #5 — no redundant "No email on file" note', () => {
  test('a user with a login shows only @username', async ({ page }) => {
    if (isLxcMode()) {
      test.skip();
      return;
    }
    await signInAndLand(page);
    await clickSubNav(page, 'Settings', 'Users');

    await expect(page.getByTestId('user-list-page')).toBeVisible();
    await expect(page.getByText('@ada.lovelace')).toBeVisible();
    await expect(page.getByText('No email on file')).toHaveCount(0);

    await shot(page, '06-users-no-redundant-email-note');
  });
});

test.describe('SOUPFIN-33 #6 — list page form fields are labelled and identifiable', () => {
  test('/clients — the page named in the report has zero audit findings', async ({ page }) => {
    if (isLxcMode()) {
      test.skip();
      return;
    }
    await signInAndLand(page);
    await clickNav(page, 'Clients');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByTestId('client-list-page')).toBeVisible();

    const audit = await auditFormControls(page);
    // Guard against a vacuous pass: search + type filter + global search must exist.
    expect(audit.total).toBeGreaterThanOrEqual(3);
    expect(audit.missingIdOrName, 'controls with neither id nor name').toEqual([]);
    expect(audit.missingLabel, 'controls with no accessible name').toEqual([]);

    await expect(page.getByLabel('Search clients')).toBeVisible();
    await expect(page.getByLabel('Filter clients by type')).toBeVisible();

    await shot(page, '07-clients-form-fields-labelled');
  });

  for (const [label, navigate] of [
    ['vendors', async (page: Page) => clickNav(page, 'Vendors')],
    ['ledger transactions', async (page: Page) => clickSubNav(page, 'Ledger', 'Transactions')],
    ['settings users', async (page: Page) => clickSubNav(page, 'Settings', 'Users')],
  ] as const) {
    test(`${label} — every rendered control passes the same audit`, async ({ page }) => {
      if (isLxcMode()) {
        test.skip();
        return;
      }
      await signInAndLand(page);
      await navigate(page);
      await page.waitForLoadState('domcontentloaded');

      const audit = await auditFormControls(page);
      expect(audit.total).toBeGreaterThanOrEqual(1);
      expect(audit.missingIdOrName).toEqual([]);
      expect(audit.missingLabel).toEqual([]);

      await shot(page, `08-${label.replace(/\s+/g, '-')}-form-fields-labelled`);
    });
  }
});
