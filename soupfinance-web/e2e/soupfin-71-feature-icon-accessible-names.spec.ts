/**
 * SOUPFIN-71 — feature-page icon ligatures leak into control accessible names.
 *
 * Follow-up to SOUPFIN-63, which fixed the navigation chrome only. Material
 * Symbols draws its glyph from the element's TEXT CONTENT, so
 * `<span class="material-symbols-outlined">delete</span>` puts the literal
 * string "delete" in the DOM. Without `aria-hidden` that text joins the
 * accessible name of the control wrapping it:
 *
 *   - an icon-only control was named by the bare ligature   ("close", "more_vert")
 *   - an icon-plus-label control was named "<ligature> <label>" ("delete Delete")
 *
 * Screen reader users hear the raw ligature; exact-name role queries silently
 * never match. Every assertion below is therefore expressed as a role lookup by
 * accessible name rather than as an attribute check — it fails against the
 * pre-fix build by being unable to find (or by over-finding) the control.
 *
 * Hiding the icon has an inverse hazard this spec also pins: a control whose
 * ONLY text was the ligature is left with no accessible name at all. The
 * `ariaSnapshot` sweep catches that, because a nameless control renders as a
 * bare `- button` line with no name.
 */
import { test, expect, type Page } from '@playwright/test';
import {
  mockAmbientApi,
  mockTokenValidationApi,
  mockDashboardApi,
  mockInvoicesApi,
  mockBillsApi,
  mockVendorsApi,
  isLxcMode,
} from './fixtures';

/**
 * Screenshots go to a git-tracked directory rather than through the shared
 * `takeScreenshot` fixture: that helper writes under `test-results/`, which
 * Playwright wipes at the start of every run, so the evidence would not survive.
 */
async function shot(page: Page, name: string) {
  await page.screenshot({
    path: `e2e/playwright/screenshots/soupfin-71/${name}.png`,
    fullPage: true,
  });
}

/**
 * Ligatures rendered across the feature pages driven below. Pre-fix, each of
 * these appeared verbatim inside some control's accessible name.
 */
const LIGATURES = [
  'add',
  'search',
  'visibility',
  'visibility_off',
  'edit',
  'delete',
  'close',
  'warning',
  'error',
  'refresh',
  'more_vert',
  'arrow_back',
  'download',
  'print',
  'send',
  'picture_as_pdf',
  'progress_activity',
  'receipt_long',
  'storefront',
  'person_add',
  'cancel',
  'check_circle',
];

/**
 * Assert no control on the page is NAMED by a ligature — neither as the whole
 * name (icon-only control) nor as a prefix/suffix token (icon beside a label).
 */
async function expectNoLigatureNames(page: Page, label: string) {
  for (const ligature of LIGATURES) {
    // Whole name: the icon-only case ("close", "more_vert").
    for (const role of ['button', 'link'] as const) {
      await expect(
        page.getByRole(role, { name: ligature, exact: true }),
        `${label}: a ${role} is named exactly "${ligature}"`
      ).toHaveCount(0);
    }
    // Name containing the ligature as its own word: the "delete Delete" case.
    // Anchored with \b so "Add Vendor" is not flagged by the "add" ligature —
    // only a standalone lowercase token is.
    const token = new RegExp(`(^|\\s)${ligature}(\\s|$)`);
    for (const role of ['button', 'link'] as const) {
      await expect(
        page.getByRole(role, { name: token }),
        `${label}: a ${role} name still contains the bare ligature "${ligature}"`
      ).toHaveCount(0);
    }
  }
}

/**
 * Assert no button/link in the page's aria snapshot is nameless.
 *
 * `ariaSnapshot()` renders the real accessibility tree, so a control left
 * without a name by `aria-hidden` shows up as a bare `- button` / `- link`
 * line. Named ones render as `- button "Save"`.
 */
async function expectNoNamelessControls(page: Page, label: string) {
  const snapshot = await page.locator('body').ariaSnapshot();
  const nameless = snapshot
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^- (button|link)\s*:?\s*$/.test(l));
  expect(nameless, `${label}: control(s) with no accessible name`).toEqual([]);
}

test.describe('SOUPFIN-71: feature-page controls are named without icon ligatures', () => {
  test.skip(isLxcMode(), 'Mock-only spec: drives page chrome, not backend data');

  test.beforeEach(async ({ page }) => {
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
        JSON.stringify({ state: { user: mockUser, isAuthenticated: true }, version: 0 })
      );
    });
    await mockAmbientApi(page);
    await mockTokenValidationApi(page, true);
    await mockDashboardApi(page);
    await mockInvoicesApi(page);
    await mockBillsApi(page);
    await mockVendorsApi(page);
  });

  test('vendor rows expose View/Edit/Delete under their exact names', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 15000 });

    // Navigate by CLICKING the menu — never page.goto() for an internal route.
    await page.locator('nav').getByRole('link', { name: 'Vendors', exact: true }).click();
    await expect(page.getByTestId('vendor-list-page')).toBeVisible({ timeout: 15000 });
    await shot(page, '01-vendors-list');

    const rows = page.getByTestId(/^vendor-row-/);
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      // Pre-fix these were "visibility View" / "edit Edit" / "delete Delete",
      // so each exact lookup resolved to zero elements.
      await expect(row.getByRole('link', { name: 'View', exact: true })).toHaveCount(1);
      await expect(row.getByRole('link', { name: 'Edit', exact: true })).toHaveCount(1);
      await expect(row.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(1);
    }

    await expectNoLigatureNames(page, 'vendors list');
    await expectNoNamelessControls(page, 'vendors list');
    await shot(page, '02-vendors-names-verified');
  });

  test('the vendor delete dialog close button is named, not "close"', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 15000 });
    await page.locator('nav').getByRole('link', { name: 'Vendors', exact: true }).click();
    await expect(page.getByTestId('vendor-list-page')).toBeVisible({ timeout: 15000 });

    // Open the confirm dialog by clicking a row's Delete — located by exact name.
    await page.getByTestId(/^vendor-row-/).first()
      .getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByTestId('delete-confirmation-modal')).toBeVisible();
    await shot(page, '03-vendor-delete-dialog');

    // Pre-fix this button's only text was the ligature, so it was named "close".
    await expect(page.getByRole('button', { name: 'close', exact: true })).toHaveCount(0);
    const closeBtn = page.getByRole('button', { name: 'Close delete vendor dialog', exact: true });
    await expect(closeBtn).toHaveCount(1);

    await expectNoNamelessControls(page, 'vendor delete dialog');

    // And it still works — an aria-label must not be cosmetic.
    await closeBtn.click();
    await expect(page.getByTestId('delete-confirmation-modal')).toBeHidden();
    await shot(page, '04-vendor-delete-dialog-closed');
  });

  test.describe('pages reached from the sidebar carry no ligature names', () => {
    const PAGES: Array<[navLabel: string, testId: string, shotName: string]> = [
      ['Invoices', 'invoice-list-page', '10-invoices'],
      ['Bills', 'bill-list-page', '11-bills'],
      ['Clients', 'client-list-page', '12-clients'],
      ['Payments', 'payment-list-page', '13-payments'],
      ['Reports', 'reports-page', '14-reports'],
    ];

    for (const [navLabel, testId, shotName] of PAGES) {
      test(`${navLabel}`, async ({ page }) => {
        await page.goto('/dashboard');
        await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 15000 });

        await page.locator('nav').getByRole('link', { name: navLabel, exact: true }).click();
        await expect(page.getByTestId(testId)).toBeVisible({ timeout: 15000 });
        await shot(page, shotName);

        await expectNoLigatureNames(page, navLabel);
        await expectNoNamelessControls(page, navLabel);
      });
    }
  });

  test('an empty list still names its call to action (zero-row end)', async ({ page }) => {
    // The empty state renders a LARGE decorative icon plus one CTA. Unhidden,
    // the icon names the CTA "add Add Vendor"; hidden without a sibling label it
    // would leave the CTA nameless. Both ends are excluded here.
    await mockVendorsApi(page, []);

    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 15000 });
    await page.locator('nav').getByRole('link', { name: 'Vendors', exact: true }).click();
    await expect(page.getByTestId('vendor-list-empty')).toBeVisible({ timeout: 15000 });
    await shot(page, '20-vendors-empty-state');

    await expect(
      page.getByRole('link', { name: 'Add Vendor', exact: true }).first()
    ).toBeVisible();
    await expectNoLigatureNames(page, 'vendors empty state');
    await expectNoNamelessControls(page, 'vendors empty state');
  });

  test('the dashboard itself carries no ligature names', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 15000 });
    await shot(page, '30-dashboard');

    await expectNoLigatureNames(page, 'dashboard');
    await expectNoNamelessControls(page, 'dashboard');
  });
});
