/**
 * SOUPFIN-89 — free beta banner
 *
 * "SoupFinance is available for all users for one year of free beta, until
 * November 2027." The owner asked for it on the homepage and the onboarding
 * pages. In the app that means:
 *   - the dashboard (the signed-in home page),
 *   - every step of the company verification (onboarding) wizard,
 *   - the sign-up form, where a new user starts.
 * On the public site it means an announcement bar on www.soupfinance.com.
 *
 * Every app page is reached by clicking. The marketing homepage is served
 * from the local soupfinance-landing/ files through a routed origin, so the
 * spec checks this checkout's HTML, not whatever is live.
 *
 * Run: E2E_PORT=5189 npx playwright test e2e/soupfin-89-free-beta-banner.spec.ts --project=firefox
 */
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  installGuideMocks,
  installKycGuideMocks,
  seedAuthenticatedSession,
  kycCorporate,
} from './user-guide/guide-mocks';
import { installUnmockedApiGuard, isLxcMode, type UnmockedApiGuard } from './fixtures';

const SHOTS = 'e2e/playwright/screenshots/soupfin-89';
mkdirSync(SHOTS, { recursive: true });

const TITLE = 'Free beta until November 2027';
const MESSAGE = 'All users get one free year of beta access until November 2027.';

async function shot(page: Page, name: string, fullPage = true) {
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage });
}

/** The banner inside a page container: visible once, with the full offer. */
async function expectBanner(page: Page, pageTestId: string) {
  const container = page.getByTestId(pageTestId);
  const banner = container.getByTestId('free-beta-banner');
  await expect(banner).toHaveCount(1);
  await expect(banner).toBeVisible();
  await expect(banner).toHaveAttribute('role', 'status');
  await expect(banner.getByTestId('free-beta-banner-title')).toHaveText(TITLE);
  await expect(banner.getByTestId('free-beta-banner-message')).toHaveText(MESSAGE);

  // It sits under the page heading, near the top, not buried below the fold.
  const heading = await container.locator('h1, h2').first().boundingBox();
  const box = await banner.boundingBox();
  expect(heading && box && box.y > heading.y).toBeTruthy();
  expect(box!.y).toBeLessThan(600);
  return banner;
}

/**
 * The dashboard fades in with a GSAP entrance. Wait for it to finish so the
 * screenshot is not half-drawn.
 */
async function waitForDashboardEntrance(page: Page) {
  await page.waitForFunction(() =>
    ['[data-anim="hero-heading"]', '[data-anim="activity-section"]'].every((sel) => {
      const el = document.querySelector(sel);
      return el !== null && getComputedStyle(el).opacity === '1';
    })
  );
}

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(90_000);

test.describe('SOUPFIN-89: free beta banner in the app', () => {
  test.skip(isLxcMode(), 'Mock-only spec: drives the curated guide data set');

  let apiGuard: UnmockedApiGuard;

  test.beforeEach(async ({ page }) => {
    apiGuard = await installUnmockedApiGuard(page);
    await installGuideMocks(page);
    await installKycGuideMocks(page);
  });

  test.afterEach(() => apiGuard.assertNone('SOUPFIN-89 banner spec'));

  test('the dashboard and every onboarding step show the free beta banner', async ({ page }) => {
    await seedAuthenticatedSession(page);

    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 20_000 });
    await expectBanner(page, 'dashboard-page');
    await waitForDashboardEntrance(page);
    await shot(page, 'banner-dashboard');

    // Into the wizard the way a user gets there: the verification banner.
    await page.getByTestId('kyc-onboarding-banner-cta').click();
    await expect(page).toHaveURL(new RegExp(`/onboarding/company\\?id=${kycCorporate.id}$`));
    await expectBanner(page, 'company-info-page');
    await shot(page, 'banner-onboarding-1-company');

    await page.getByRole('button', { name: /Save & Continue/ }).click();
    await expect(page.getByTestId('directors-page')).toBeVisible();
    await expectBanner(page, 'directors-page');
    await shot(page, 'banner-onboarding-2-directors');

    await page.getByRole('button', { name: /Continue to Documents/ }).click();
    await expect(page.getByTestId('documents-page')).toBeVisible();
    await expectBanner(page, 'documents-page');
    await shot(page, 'banner-onboarding-3-documents');

    await page.getByRole('button', { name: /Submit for Review/ }).click();
    await expect(page.getByTestId('kyc-status-page')).toBeVisible();
    await expectBanner(page, 'kyc-status-page');
    await shot(page, 'banner-onboarding-4-status');
  });

  test('the sign-up form shows the banner to a visitor who is not signed in', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByTestId('login-register-link')).toBeVisible({ timeout: 20_000 });
    // No banner on sign-in: it is for new and onboarding users, not every visit.
    await expect(page.getByTestId('free-beta-banner')).toHaveCount(0);

    await page.getByTestId('login-register-link').click();
    await expect(page).toHaveURL(/\/register$/);
    await expect(page.getByTestId('registration-heading')).toHaveText('Create Your Account');
    await expectBanner(page, 'registration-page');

    // It sits between the heading and the form, so it is read before signing up.
    const banner = await page.getByTestId('free-beta-banner').boundingBox();
    const form = await page.getByTestId('registration-form').boundingBox();
    expect(banner!.y + banner!.height).toBeLessThanOrEqual(form!.y);
    await shot(page, 'banner-register');
  });

  test('the banner follows the language switcher', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('free-beta-banner-title')).toHaveText(TITLE);

    await page.getByRole('button', { name: 'Change language' }).click();
    await page.getByTitle('Deutsch').click();

    await expect(page.getByTestId('free-beta-banner-title')).toHaveText('Kostenlose Beta bis November 2027');
    await expect(page.getByTestId('free-beta-banner-message')).toHaveText(
      'Alle Nutzer erhalten bis November 2027 ein Jahr lang kostenlosen Beta-Zugang.'
    );
    await waitForDashboardEntrance(page);
    await shot(page, 'banner-dashboard-german', false);
  });

  test('on a phone the banner wraps inside its page instead of widening it (narrow edge)', async ({
    page,
  }) => {
    // The page column itself is wider than a 360px screen, because the top
    // bar will not wrap (a separate, existing defect filed from SOUPFIN-89).
    // So this checks the banner against the page it sits in, not the screen.
    await page.setViewportSize({ width: 360, height: 780 });
    await seedAuthenticatedSession(page);
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 20_000 });

    const banner = page.getByTestId('free-beta-banner');
    await expect(banner).toBeVisible();
    const box = (await banner.boundingBox())!;
    const pageBox = (await page.getByTestId('dashboard-page').boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(pageBox.x);
    expect(box.x + box.width).toBeLessThanOrEqual(pageBox.x + pageBox.width + 0.5);

    // Nothing inside the banner is clipped or spills past its edge.
    for (const testId of ['free-beta-banner', 'free-beta-banner-title', 'free-beta-banner-message']) {
      const spill = await page.getByTestId(testId).evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(spill, testId).toBeLessThanOrEqual(0);
    }

    await waitForDashboardEntrance(page);
    await shot(page, 'banner-dashboard-phone', false);
  });
});

// ---------------------------------------------------------------------------
// Public homepage (www.soupfinance.com)
// ---------------------------------------------------------------------------

// ESM spec: no __dirname, derive it from the module URL.
const LANDING_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../soupfinance-landing');
const LANDING_ORIGIN = 'http://soupfinance-landing.localhost';

/** Serve soupfinance-landing/ from this checkout on a routed origin. */
async function serveLanding(page: Page) {
  await page.route(`${LANDING_ORIGIN}/**`, (route) => {
    const pathname = decodeURIComponent(new URL(route.request().url()).pathname);
    const file = normalize(join(LANDING_DIR, pathname === '/' ? 'index.html' : pathname));
    if (!file.startsWith(LANDING_DIR) || !existsSync(file)) {
      return route.fulfill({ status: 404, body: 'Not found' });
    }
    return route.fulfill({ path: file });
  });
}

test.describe('SOUPFIN-89: free beta bar on the marketing homepage', () => {
  test('the homepage opens with the free beta bar and no conflicting trial length', async ({ page }) => {
    await serveLanding(page);
    await page.goto(`${LANDING_ORIGIN}/`);

    const bar = page.locator('#free-beta-bar');
    await expect(bar).toBeVisible();
    await expect(bar).toContainText('One free year of beta access for all users until November 2027');

    // Readable, not white on white: a dark bar with white text. The page's
    // custom Tailwind colours do not load, so this guards against using them.
    const colours = await bar.evaluate((el) => ({
      background: getComputedStyle(el).backgroundColor,
      text: getComputedStyle(el).color,
    }));
    expect(colours.background).toBe('rgb(24, 19, 17)');
    expect(colours.text).toBe('rgb(255, 255, 255)');

    // First thing on the page, inside the fixed header, so it stays in view.
    const barBox = await bar.boundingBox();
    expect(barBox!.y).toBe(0);
    await expect(page.locator('nav #free-beta-bar')).toHaveCount(1);

    const link = bar.getByRole('link', { name: 'Create your free account' });
    await expect(link).toHaveAttribute('href', 'https://app.soupfinance.com/register');

    // The old "Free 14-day trial" footnote contradicted the free beta.
    await expect(page.getByText(/14-day/)).toHaveCount(0);
    await expect(page.getByText('Free one-year beta until November 2027')).toBeVisible();
    await expect(page.getByText('Free for all users until November 2027')).toBeVisible();

    // Domain rule: the landing page links to the app, it never signs anyone in.
    await expect(page.locator('input[type="password"]')).toHaveCount(0);

    await shot(page, 'landing-homepage-bar', false);
  });

  test('on a phone the bar wraps without covering the hero heading (narrow edge)', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await serveLanding(page);
    await page.goto(`${LANDING_ORIGIN}/`);

    const bar = page.locator('#free-beta-bar');
    await expect(bar).toBeVisible();
    // The offer itself stays; the link gives way to the hero's sign-up button.
    await expect(bar).toContainText('until November 2027');
    await expect(bar.getByRole('link', { name: 'Create your free account' })).toBeHidden();
    await expect(
      page.locator('section').first().getByRole('link', { name: /Start Free Trial/ })
    ).toBeInViewport();
    const nav = await page.locator('nav').boundingBox();
    const heading = await page.locator('h1').first().boundingBox();
    // The taller header still ends above the hero heading.
    expect(nav!.y + nav!.height).toBeLessThanOrEqual(heading!.y);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);

    await shot(page, 'landing-homepage-bar-phone', false);
  });
});
