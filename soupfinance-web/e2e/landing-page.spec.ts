/**
 * Landing Page E2E Tests
 * Tests the public landing page at www.soupfinance.com
 * Validates hero section links are clickable on both desktop and mobile
 */
import { test, expect } from '@playwright/test';

// Production landing page URL
const LANDING_PAGE_URL = 'https://www.soupfinance.com';

test.describe('Landing Page', () => {
  test.describe('Desktop', () => {
    test('hero section CTA buttons are clickable', async ({ page }) => {
      await page.goto(LANDING_PAGE_URL);

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
      await page.goto(LANDING_PAGE_URL);

      const signInLink = page.locator('nav').getByRole('link', { name: /Sign In/i });
      await expect(signInLink).toBeVisible();

      const href = await signInLink.getAttribute('href');
      expect(href).toBe('https://app.soupfinance.com/login');
    });

    test('navigation Start Free Trial button is clickable', async ({ page }) => {
      await page.goto(LANDING_PAGE_URL);

      const navTrialButton = page.locator('nav').getByRole('link', { name: /Start Free Trial/i });
      await expect(navTrialButton).toBeVisible();

      const href = await navTrialButton.getAttribute('href');
      expect(href).toBe('https://app.soupfinance.com/register');
    });
  });

  test.describe('Mobile', () => {
    test.use({ viewport: { width: 375, height: 667 } }); // iPhone SE size

    test('hero section CTA buttons are clickable on mobile', async ({ page }) => {
      await page.goto(LANDING_PAGE_URL);

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
      await page.goto(LANDING_PAGE_URL);

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
      await page.goto(LANDING_PAGE_URL);

      // On mobile, the nav Start Free Trial should still be visible
      const navTrialButton = page.locator('nav').getByRole('link', { name: /Start Free Trial/i });
      await expect(navTrialButton).toBeVisible();

      const href = await navTrialButton.getAttribute('href');
      expect(href).toBe('https://app.soupfinance.com/register');
    });
  });

  test.describe('All CTA Links', () => {
    test('all register links point to correct URL', async ({ page }) => {
      await page.goto(LANDING_PAGE_URL);

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
      await page.goto(LANDING_PAGE_URL);

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
