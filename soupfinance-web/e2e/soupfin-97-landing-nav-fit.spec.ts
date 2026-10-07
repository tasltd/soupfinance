/**
 * SOUPFIN-97 — landing nav button covers the SoupFinance wordmark at 320px
 *
 * At 320px the nav "Start Free Trial" button started at x=173 while the
 * "SoupFinance" wordmark ended at x=182, so the button sat over the end of the
 * name ("SoupFinanc" showed). The button had no whitespace-nowrap, so its label
 * also wrapped to two lines inside its fixed 40px height.
 *
 * The homepage is served from this checkout's soupfinance-landing/ files
 * through a routed origin, so the spec checks this code, not what is live.
 *
 * Run: E2E_PORT=5190 npx playwright test e2e/soupfin-97-landing-nav-fit.spec.ts --project=firefox
 */
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHOTS = 'e2e/playwright/screenshots/soupfin-97';
mkdirSync(SHOTS, { recursive: true });

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

/** Open the homepage and wait for the Play CDN styles and the web fonts. */
async function openHomepage(page: Page) {
  await serveLanding(page);
  await page.goto(`${LANDING_ORIGIN}/`);
  await page.waitForFunction(() => {
    const nav = document.querySelector('nav');
    return nav !== null && getComputedStyle(nav).position === 'fixed';
  });
  // Text widths depend on the loaded font, so measure only after it arrives.
  await page.evaluate(() => document.fonts.ready.then(() => true));
}

type NavFit = {
  wordmarkRight: number;
  wordmarkClipped: boolean;
  wordmarkLines: number;
  ctaLeft: number;
  ctaRight: number;
  navContentRight: number;
  buttonLabel: string;
  buttonLines: number;
  buttonClipped: boolean;
  buttonHeight: number;
  pageOverflow: number;
};

/** Measure the nav: where the wordmark ends, where the CTA group starts, and how the button label lays out. */
function measureNav(page: Page): Promise<NavFit> {
  return page.evaluate(() => {
    const nav = document.querySelector('nav')!;
    const wordmark = nav.querySelector<HTMLElement>('[data-testid="nav-wordmark"]')!;
    const cta = nav.querySelector<HTMLElement>('[data-testid="nav-cta"]')!;
    const button = nav.querySelector<HTMLElement>('[data-testid="nav-start-trial"]')!;
    const row = wordmark.closest<HTMLElement>('.max-w-7xl')!;

    // Distinct line tops of an element's visible text, via a Range over it.
    const lineCount = (el: HTMLElement) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const tops = new Set<number>();
      for (const rect of Array.from(range.getClientRects())) {
        if (rect.width > 0 && rect.height > 0) tops.add(Math.round(rect.top));
      }
      return tops.size;
    };

    const rowStyle = getComputedStyle(row);
    const w = wordmark.getBoundingClientRect();
    const c = cta.getBoundingClientRect();
    return {
      wordmarkRight: w.right,
      wordmarkClipped: wordmark.scrollWidth > wordmark.clientWidth,
      wordmarkLines: lineCount(wordmark),
      ctaLeft: c.left,
      ctaRight: c.right,
      navContentRight: row.getBoundingClientRect().right - parseFloat(rowStyle.paddingRight),
      buttonLabel: button.innerText.trim(),
      buttonLines: lineCount(button),
      buttonClipped: button.scrollWidth > button.clientWidth,
      buttonHeight: button.getBoundingClientRect().height,
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

function expectNavFits(fit: NavFit) {
  // The CTA group starts after the wordmark ends: nothing covers the name.
  expect(fit.ctaLeft).toBeGreaterThanOrEqual(fit.wordmarkRight);
  // The whole name shows, on one line, without being cut by an ellipsis.
  expect(fit.wordmarkClipped).toBe(false);
  expect(fit.wordmarkLines).toBe(1);
  // The button label sits on one line inside its 40px height.
  expect(fit.buttonLines).toBe(1);
  expect(fit.buttonClipped).toBe(false);
  expect(fit.buttonHeight).toBe(40);
  // The CTA group stays inside the padded nav row and the page never scrolls sideways.
  expect(fit.ctaRight).toBeLessThanOrEqual(fit.navContentRight + 0.5);
  expect(fit.pageOverflow).toBeLessThanOrEqual(0);
}

test.describe('SOUPFIN-97: landing nav wordmark and button fit', () => {
  test('at 320px the button does not cover the wordmark and its label stays on one line', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await openHomepage(page);

    const fit = await measureNav(page);
    console.log('SOUPFIN-97 nav at 320px:', JSON.stringify(fit));
    expectNavFits(fit);
    await expect(page.locator('[data-testid="nav-wordmark"]')).toHaveText('SoupFinance');
    await page.locator('nav').screenshot({ path: `${SHOTS}/landing-nav-320.png` });
    await page.screenshot({ path: `${SHOTS}/landing-hero-phone-320.png` });
  });

  // From the narrowest supported phone up to desktop, including both sides of every breakpoint the nav uses.
  for (const width of [320, 340, 359, 360, 375, 414, 639, 640, 767, 768, 1024, 1440]) {
    test(`at ${width}px the nav fits without overlap or wrapping`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await openHomepage(page);
      expectNavFits(await measureNav(page));
    });
  }

  test('the button keeps its register link and full label wherever there is room for it', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 780 });
    await openHomepage(page);

    const button = page.locator('[data-testid="nav-start-trial"]');
    await expect(button).toHaveAttribute('href', 'https://app.soupfinance.com/register');
    await expect(page.locator('nav').getByRole('link', { name: 'Start Free Trial' })).toBeVisible();
    await page.locator('nav').screenshot({ path: `${SHOTS}/landing-nav-375.png` });
  });
});
