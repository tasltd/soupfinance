/**
 * SOUPFIN-75 — Route in SoupFinance for the documentation
 *
 * The user guide written for SOUPFIN-52 shipped as a static page under
 * public/user-guide/, but nothing in the app linked to it, and the sidebar Help
 * button had no click handler. The fix adds a /help route that embeds the guide
 * and turns Help into a link to it.
 *
 * Every test starts on the dashboard and reaches the guide by clicking Help —
 * never page.goto('/help'). The assertions look INSIDE the iframe: a frame that
 * points at a missing file still renders (the SPA fallback serves index.html),
 * so only the guide's own content proves the route works.
 */
import { test, expect, type Page } from '@playwright/test';
import { mockAmbientApi, mockTokenValidationApi, mockDashboardApi, isLxcMode } from './fixtures';

/**
 * Screenshots go to a git-tracked directory rather than through the shared
 * `takeScreenshot` fixture: that helper writes under `test-results/`, which
 * Playwright wipes at the start of every run, so the evidence would not survive.
 */
async function shot(page: Page, name: string) {
  await page.screenshot({
    path: `e2e/playwright/screenshots/soupfin-75/${name}.png`,
    fullPage: true,
  });
}

const FRAME = '[data-testid="help-guide-frame"]';

/**
 * Wait until the guide inside the frame is really on screen: its heading is
 * visible AND its webfont has loaded. Without the font wait a screenshot can
 * land while the guide's text is still invisible, which looks like a bug.
 */
async function waitForGuide(page: Page) {
  const guide = page.frameLocator(FRAME);
  await expect(
    guide.getByRole('heading', { level: 1, name: 'SoupFinance User Guide' })
  ).toBeVisible({ timeout: 15000 });
  const frame = page.frame({ url: /\/user-guide\/index\.html/ });
  expect(frame).not.toBeNull();
  await frame!.evaluate(() => document.fonts.ready.then(() => true));
  return guide;
}

async function openDashboard(page: Page) {
  await page.goto('/dashboard');
  await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 15000 });
}

test.describe('SOUPFIN-75: the user guide has a route in the app', () => {
  test.skip(isLxcMode(), 'Mock-only spec: serves a static guide, no backend data involved');

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
  });

  test('clicking Help in the sidebar opens the guide inside the app', async ({ page }) => {
    // Wide enough that the frame passes the guide's 960px breakpoint, so its
    // contents list sits beside the text instead of folding behind a button.
    await page.setViewportSize({ width: 1600, height: 1000 });
    await openDashboard(page);
    await shot(page, '01-dashboard-before-help');

    const help = page.getByRole('link', { name: 'Help', exact: true });
    await expect(help).toHaveAttribute('href', '/help');
    await help.click();

    await expect(page).toHaveURL(/\/help$/);
    await expect(page.getByTestId('help-page')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Help', exact: true })).toBeVisible();

    // The app chrome is still around the guide: this is a route, not a redirect.
    await expect(page.getByTestId('logout-button')).toBeVisible();
    await expect(help).toHaveClass(/bg-primary\/10/);

    // The guide's own content, read from inside the frame.
    const guide = await waitForGuide(page);
    await expect(guide.getByRole('navigation', { name: 'Contents' })).toBeVisible();

    // Its screenshots load too — a broken relative path would leave them at 0px.
    const firstImage = guide.locator('img').first();
    await firstImage.scrollIntoViewIfNeeded();
    await expect
      .poll(() => firstImage.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);

    await shot(page, '02-help-page-guide-loaded');
  });

  test('the guide contents work inside the frame', async ({ page }) => {
    await openDashboard(page);
    await page.getByRole('link', { name: 'Help', exact: true }).click();
    await expect(page).toHaveURL(/\/help$/);

    const guide = await waitForGuide(page);

    // At the default 1280px window the frame is under the guide's 960px
    // breakpoint, so the contents fold behind the guide's own toggle.
    const contents = guide.getByRole('navigation', { name: 'Contents' });
    await expect(contents).toBeHidden();
    await guide.getByRole('button', { name: 'Contents' }).click();
    await expect(contents).toBeVisible();
    await shot(page, '03-help-guide-contents-open');

    // Following a contents link moves within the guide, not the app.
    await contents.getByRole('link', { name: 'Invoices', exact: true }).click();
    await expect
      .poll(() => page.frame({ url: /\/user-guide\/index\.html/ })?.url())
      .toMatch(/#invoices$/);
    await expect(page).toHaveURL(/\/help$/);
    await expect(guide.locator('#invoices')).toBeInViewport();

    await shot(page, '04-help-guide-jumped-to-invoices');
  });

  test('"Open in new tab" shows the same guide on its own', async ({ page, context }) => {
    await openDashboard(page);
    await page.getByRole('link', { name: 'Help', exact: true }).click();
    await expect(page.getByTestId('help-page')).toBeVisible();

    const [popup] = await Promise.all([
      context.waitForEvent('page'),
      page.getByRole('link', { name: 'Open in new tab' }).click(),
    ]);
    await popup.waitForLoadState('domcontentloaded');

    await expect(popup).toHaveURL(/\/user-guide\/index\.html$/);
    await expect(popup).toHaveTitle('SoupFinance | User Guide');
    await expect(
      popup.getByRole('heading', { level: 1, name: 'SoupFinance User Guide' })
    ).toBeVisible();
    await popup.evaluate(() => document.fonts.ready.then(() => true));
    await popup.screenshot({
      path: 'e2e/playwright/screenshots/soupfin-75/05-guide-in-new-tab.png',
    });
    await popup.close();
  });

  test('Help is still reachable, and named, with the sidebar collapsed', async ({ page }) => {
    await openDashboard(page);
    await page.getByRole('button', { name: 'Collapse sidebar' }).click();

    // Collapsed, the label text is gone; the aria-label must carry the name.
    const help = page.getByRole('link', { name: 'Help', exact: true });
    await expect(help).toBeVisible();
    await shot(page, '06-collapsed-sidebar-help');

    await help.click();
    await expect(page).toHaveURL(/\/help$/);
    const guide = await waitForGuide(page);
    // Wide frame here, so the contents list is laid out beside the text.
    await expect(guide.getByRole('navigation', { name: 'Contents' })).toBeVisible();
    await shot(page, '07-collapsed-sidebar-help-page');
  });

  test('the guide fits a phone-sized screen, reached from the mobile menu', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openDashboard(page);

    await page.getByRole('button', { name: 'Open navigation menu' }).click();
    await page.getByRole('link', { name: 'Help', exact: true }).click();
    await expect(page).toHaveURL(/\/help$/);

    const frame = page.getByTestId('help-guide-frame');
    await waitForGuide(page);

    // The drawer closes itself on navigation (SOUPFIN-76), so the page is
    // visible without dismissing anything by hand.
    await expect(page.locator('div.fixed.inset-0.bg-black\\/50')).toHaveCount(0);
    await expect(page.locator('aside')).not.toBeInViewport();
    await expect(page.getByTestId('help-open-new-tab')).toBeVisible();

    // The frame must not push the page wider than the phone.
    const box = await frame.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeLessThanOrEqual(390);
    await shot(page, '08-mobile-help-page');
  });
});
