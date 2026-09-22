/**
 * Landing Page E2E Tests
 * Tests the public landing page (soupfinance-landing/)
 * Validates hero section links are clickable on both desktop and mobile
 *
 * OPT-IN SUITE — run with `npm run test:e2e:landing`, NOT `npm run test:e2e`.
 *
 * Fix (SOUPFIN-66): this file used to hardcode https://www.soupfinance.com and
 * ran inside the default mock suite, so every mock E2E run made real network
 * calls to production. When the network was slow, offline, or Cloudflare was
 * throttling, all seven tests failed with
 * `page.goto: Test timeout of 30000ms exceeded` — 5 of the 22 flaky failures on
 * the full gate. It now runs as its own project (playwright.landing.config.ts)
 * against a LOCAL static copy by default. Override to smoke-test a deployment:
 *
 *   LANDING_BASE_URL=https://www.soupfinance.com npm run test:e2e:landing
 */
import { test, expect, type Page } from '@playwright/test';

// Resolved by playwright.landing.config.ts: the local static server by default,
// or LANDING_BASE_URL when smoke-testing a real deployment.
const LANDING_PAGE_URL = '/index.html';

// The page pulls stock photography from images.pexels.com and webfonts from
// fonts.gstatic.com. Neither is under test, both are slow, and `page.goto`
// waits for them on the `load` event — which is exactly how this spec used to
// blow its 30s budget. Stub them so the run is deterministic offline.
// cdn.tailwindcss.com is NOT stubbed: the layout assertions below
// (`toBeVisible`, `boundingBox`, `elementFromPoint`) need real CSS.
async function stubExternalAssets(page: Page) {
  await page.route('**://images.pexels.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/gif',
      // 1x1 transparent GIF
      body: Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'),
    })
  );
  await page.route('**://fonts.gstatic.com/**', (route) => route.abort());
}

test.describe('Landing Page', () => {
  test.beforeEach(async ({ page }) => {
    await stubExternalAssets(page);
  });

  test.describe('Desktop', () => {
    test('hero section CTA buttons are clickable', async ({ page }) => {
      await page.goto(LANDING_PAGE_URL, { waitUntil: 'domcontentloaded' });

      // Wait for page to load
      await expect(page.locator('nav')).toBeVisible();

      // Find the "Start Free Trial" button in hero section
      const startTrialButton = page.locator('section').first().getByRole('link', { name: /Start Free Trial/i }).first();
      await expect(startTrialButton).toBeVisible();

      // Check the button is clickable (has correct href)
      const href = await startTrialButton.getAttribute('href');
      expect(href).toBe('https://app.soupfinance.com/register');

      // Verify button is not blocked by overlays - check pointer-events
      const isClickable = await startTrialButton.evaluate((el) => {
        const style = window.getComputedStyle(el);
        return style.pointerEvents !== 'none';
      });
      expect(isClickable).toBe(true);

      // Click and verify navigation would work (don't actually navigate to app)
      await expect(startTrialButton).toBeEnabled();
    });

    test('navigation Sign In link is clickable', async ({ page }) => {
      await page.goto(LANDING_PAGE_URL, { waitUntil: 'domcontentloaded' });

      const signInLink = page.locator('nav').getByRole('link', { name: /Sign In/i });
      await expect(signInLink).toBeVisible();

      const href = await signInLink.getAttribute('href');
      expect(href).toBe('https://app.soupfinance.com/login');
    });

    test('navigation Start Free Trial button is clickable', async ({ page }) => {
      await page.goto(LANDING_PAGE_URL, { waitUntil: 'domcontentloaded' });

      const navTrialButton = page.locator('nav').getByRole('link', { name: /Start Free Trial/i });
      await expect(navTrialButton).toBeVisible();

      const href = await navTrialButton.getAttribute('href');
      expect(href).toBe('https://app.soupfinance.com/register');
    });
  });

  test.describe('Mobile', () => {
    test.use({ viewport: { width: 375, height: 667 } }); // iPhone SE size

    test('hero section CTA buttons are clickable on mobile', async ({ page }) => {
      await page.goto(LANDING_PAGE_URL, { waitUntil: 'domcontentloaded' });

      // Wait for page to load
      await expect(page.locator('nav')).toBeVisible();

      // Find the "Start Free Trial" button in hero section
      const startTrialButton = page.locator('section').first().getByRole('link', { name: /Start Free Trial/i }).first();
      await expect(startTrialButton).toBeVisible();

      // Verify button is not blocked by overlays
      const boundingBox = await startTrialButton.boundingBox();
      expect(boundingBox).not.toBeNull();

      // Check if element at button center is the button itself (not blocked by overlay)
      if (boundingBox) {
        const centerX = boundingBox.x + boundingBox.width / 2;
        const centerY = boundingBox.y + boundingBox.height / 2;

        // Get element at the center point
        const elementAtPoint = await page.evaluate(({ x, y }) => {
          const el = document.elementFromPoint(x, y);
          if (!el) return null;
          // Walk up to find the anchor
          let current: Element | null = el;
          while (current && current.tagName !== 'A') {
            current = current.parentElement;
          }
          return current ? {
            tagName: current.tagName,
            href: current.getAttribute('href'),
            text: current.textContent?.trim()
          } : {
            tagName: el.tagName,
            text: el.textContent?.trim()
          };
        }, { x: centerX, y: centerY });

        console.log('Element at button center:', elementAtPoint);

        // The element at center should be the button or its anchor parent
        expect(elementAtPoint).not.toBeNull();
        expect(elementAtPoint?.tagName).toBe('A');
        expect(elementAtPoint?.href).toBe('https://app.soupfinance.com/register');
      }
    });

    test('See How It Works button is clickable on mobile', async ({ page }) => {
      await page.goto(LANDING_PAGE_URL, { waitUntil: 'domcontentloaded' });

      const seeHowButton = page.locator('section').first().getByRole('link', { name: /See How It Works/i });
      await expect(seeHowButton).toBeVisible();

      // Verify it scrolls to screenshots section
      const href = await seeHowButton.getAttribute('href');
      expect(href).toBe('#screenshots');

      // Check if element is actually clickable
      const boundingBox = await seeHowButton.boundingBox();
      expect(boundingBox).not.toBeNull();

      if (boundingBox) {
        const centerX = boundingBox.x + boundingBox.width / 2;
        const centerY = boundingBox.y + boundingBox.height / 2;

        const elementAtPoint = await page.evaluate(({ x, y }) => {
          const el = document.elementFromPoint(x, y);
          if (!el) return null;
          let current: Element | null = el;
          while (current && current.tagName !== 'A') {
            current = current.parentElement;
          }
          return current ? {
            tagName: current.tagName,
            href: current.getAttribute('href')
          } : {
            tagName: el.tagName
          };
        }, { x: centerX, y: centerY });

        console.log('Element at See How It Works button center:', elementAtPoint);
        expect(elementAtPoint?.tagName).toBe('A');
        expect(elementAtPoint?.href).toBe('#screenshots');
      }
    });

    test('mobile navigation Start Free Trial is visible and clickable', async ({ page }) => {
      await page.goto(LANDING_PAGE_URL, { waitUntil: 'domcontentloaded' });

      // On mobile, the nav Start Free Trial should still be visible
      const navTrialButton = page.locator('nav').getByRole('link', { name: /Start Free Trial/i });
      await expect(navTrialButton).toBeVisible();

      const href = await navTrialButton.getAttribute('href');
      expect(href).toBe('https://app.soupfinance.com/register');
    });
  });

  test.describe('All CTA Links', () => {
    test('all register links point to correct URL', async ({ page }) => {
      await page.goto(LANDING_PAGE_URL, { waitUntil: 'domcontentloaded' });

      // Find all links that should go to register
      const registerLinks = page.getByRole('link', { name: /Start Free Trial|Join the Beta/i });
      const count = await registerLinks.count();

      console.log(`Found ${count} register/trial links`);
      expect(count).toBeGreaterThan(0);

      for (let i = 0; i < count; i++) {
        const link = registerLinks.nth(i);
        const href = await link.getAttribute('href');
        expect(href).toBe('https://app.soupfinance.com/register');
      }
    });

    test('all login links point to correct URL', async ({ page }) => {
      await page.goto(LANDING_PAGE_URL, { waitUntil: 'domcontentloaded' });

      // Find all Sign In links
      const loginLinks = page.getByRole('link', { name: /Sign In/i });
      const count = await loginLinks.count();

      console.log(`Found ${count} login links`);
      expect(count).toBeGreaterThan(0);

      for (let i = 0; i < count; i++) {
        const link = loginLinks.nth(i);
        const href = await link.getAttribute('href');
        expect(href).toBe('https://app.soupfinance.com/login');
      }
    });
  });
});
