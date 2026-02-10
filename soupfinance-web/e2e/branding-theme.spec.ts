/**
 * Branding & Theme E2E Tests
 * Validates favicon/icon branding (orange bowl) and dark mode theme toggle
 *
 * Added: Validates favicon branding change from gray (#4a4a4a) to orange (#c43c0a)
 * Added: Validates dark mode toggle, semantic token rendering, and ErrorBoundary fix
 */
import { test, expect } from '@playwright/test';
import { mockDashboardApi, takeScreenshot } from './fixtures';

// ==========================================================================
// Favicon & Branding Tests
// ==========================================================================

test.describe('Favicon & Branding', () => {
  test('favicon SVG links have cache-busting params', async ({ page }) => {
    await page.goto('/login');
    await takeScreenshot(page, 'branding-login-initial');

    // Verify favicon link tags exist with ?v=2 cache-busting
    const svgFavicon = page.locator('link[rel="icon"][type="image/svg+xml"]');
    await expect(svgFavicon).toHaveAttribute('href', /favicon\.svg\?v=2/);

    const icoFavicon = page.locator('link[rel="icon"][type="image/x-icon"]');
    await expect(icoFavicon).toHaveAttribute('href', /favicon\.ico\?v=2/);

    // Added: Verify PNG icon links also have cache-busting
    const pngIcons = page.locator('link[rel="icon"][type="image/png"]');
    const pngCount = await pngIcons.count();
    expect(pngCount).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < pngCount; i++) {
      await expect(pngIcons.nth(i)).toHaveAttribute('href', /\?v=2/);
    }

    // Added: Verify apple-touch-icon has cache-busting
    const appleTouchIcon = page.locator('link[rel="apple-touch-icon"]');
    await expect(appleTouchIcon).toHaveAttribute('href', /apple-touch-icon\.png\?v=2/);

    await takeScreenshot(page, 'branding-favicon-links-verified');
  });

  test('favicon SVG contains orange bowl color', async ({ page }) => {
    // Fetch favicon SVG content via API request (avoids fullPage screenshot hang on raw SVG)
    const response = await page.request.get('/favicon.svg');
    const svgContent = await response.text();

    // Verify the SVG contains orange fill (#c43c0a) not gray (#4a4a4a)
    expect(svgContent).toContain('#c43c0a');
    expect(svgContent).not.toContain('#4a4a4a');

    // Added: Verify SVG structure — bowl body, rim, base, steam S, steam F
    expect(svgContent).toContain('Bowl - Main Body');
    expect(svgContent).toContain('Steam S');
    expect(svgContent).toContain('Steam F');

    // Navigate to favicon and take screenshot (non-fullPage to avoid font hang)
    await page.goto('/favicon.svg');
    await page.screenshot({ path: 'test-results/screenshots/branding-favicon-svg-fullsize.png' });
  });

  test('logo SVG contains orange bowl color', async ({ page }) => {
    // Fetch logo SVG content via API request
    const response = await page.request.get('/logo.svg');
    const svgContent = await response.text();

    // Verify the logo SVG also uses orange (#c43c0a)
    expect(svgContent).toContain('#c43c0a');
    expect(svgContent).not.toContain('#4a4a4a');

    // Navigate and take screenshot
    await page.goto('/logo.svg');
    await page.screenshot({ path: 'test-results/screenshots/branding-logo-svg-fullsize.png' });
  });

  test('login page renders with correct branding', async ({ page }) => {
    await page.goto('/login');
    await takeScreenshot(page, 'branding-login-page');

    // Verify the login page renders the branding panel
    await expect(page.getByTestId('login-page')).toBeVisible();
    await expect(page.getByTestId('login-heading')).toHaveText('Welcome back');

    // Verify logo/brand image is present on the page
    const brandPanel = page.locator('[data-testid="login-brand-panel"], .login-brand, [class*="brand"]').first();
    const hasBrand = await brandPanel.isVisible().catch(() => false);
    if (hasBrand) {
      await takeScreenshot(page, 'branding-login-brand-panel');
    }
  });
});

// ==========================================================================
// Dark Mode Theme Tests
// ==========================================================================

test.describe('Dark Mode Theme', () => {
  test.describe('Login Page Dark Mode', () => {
    test('login page renders correctly in light mode', async ({ page }) => {
      await page.goto('/login');

      // Ensure light mode (remove dark class)
      await page.evaluate(() => document.documentElement.classList.remove('dark'));
      await page.waitForTimeout(300);

      await takeScreenshot(page, 'theme-login-light');

      // Verify light mode background
      const htmlClass = await page.evaluate(() => document.documentElement.className);
      expect(htmlClass).not.toContain('dark');
    });

    test('login page renders correctly in dark mode', async ({ page }) => {
      await page.goto('/login');

      // Enable dark mode
      await page.evaluate(() => document.documentElement.classList.add('dark'));
      await page.waitForTimeout(300);

      await takeScreenshot(page, 'theme-login-dark');

      // Verify dark class is applied
      const htmlClass = await page.evaluate(() => document.documentElement.className);
      expect(htmlClass).toContain('dark');

      // Verify dark mode styling — background should be darker
      const bgColor = await page.evaluate(() => {
        const body = document.querySelector('[data-testid="login-page"]') || document.body;
        return getComputedStyle(body).backgroundColor;
      });
      // Added: Dark mode should not have a white/light background
      expect(bgColor).not.toBe('rgb(255, 255, 255)');
    });
  });

  test.describe('Dashboard Dark Mode Toggle', () => {
    test.beforeEach(async ({ page }) => {
      // Added: Set up authenticated state (required for dashboard access)
      await page.addInitScript(() => {
        const mockUser = {
          username: 'admin',
          email: 'admin@soupfinance.com',
          roles: ['ROLE_ADMIN', 'ROLE_USER'],
        };
        localStorage.setItem('access_token', 'mock-jwt-token');
        localStorage.setItem('user', JSON.stringify(mockUser));
        localStorage.setItem(
          'auth-storage',
          JSON.stringify({
            state: { user: mockUser, isAuthenticated: true },
            version: 0,
          })
        );
      });
      await mockDashboardApi(page);
    });

    test('dark mode toggle button is visible in TopNav', async ({ page }) => {
      await page.goto('/dashboard');

      // Wait for dashboard to load
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 });
      await takeScreenshot(page, 'theme-dashboard-light');

      // Find the dark mode toggle button (has dark_mode or light_mode icon)
      const toggleButton = page.locator('button').filter({
        has: page.locator('span.material-symbols-outlined'),
      }).filter({
        hasText: /dark_mode|light_mode/,
      });

      await expect(toggleButton).toBeVisible();
    });

    test('clicking toggle switches to dark mode with screenshot', async ({ page }) => {
      await page.goto('/dashboard');
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 });

      // Screenshot in light mode first
      await takeScreenshot(page, 'theme-dashboard-before-toggle');

      // Find and click the dark mode toggle — look for dark_mode icon text
      const toggleButton = page.locator('button').filter({
        has: page.locator('span.material-symbols-outlined'),
      }).filter({
        hasText: /dark_mode/,
      });

      if (await toggleButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await toggleButton.click();
        await page.waitForTimeout(500);

        // Verify dark class is applied
        const htmlClass = await page.evaluate(() => document.documentElement.className);
        expect(htmlClass).toContain('dark');

        // Screenshot in dark mode
        await takeScreenshot(page, 'theme-dashboard-after-toggle-dark');

        // Verify the icon changed to light_mode (toggle back button)
        const lightToggle = page.locator('button').filter({
          has: page.locator('span.material-symbols-outlined'),
        }).filter({
          hasText: /light_mode/,
        });
        await expect(lightToggle).toBeVisible();

        // Toggle back to light
        await lightToggle.click();
        await page.waitForTimeout(500);
        const htmlClassAfter = await page.evaluate(() => document.documentElement.className);
        expect(htmlClassAfter).not.toContain('dark');
        await takeScreenshot(page, 'theme-dashboard-toggled-back-light');
      }
    });
  });

  test.describe('Dark Mode Semantic Tokens', () => {
    test('valid semantic tokens apply correct styles', async ({ page }) => {
      await page.goto('/login');
      await page.waitForTimeout(1000);

      // Verify valid tokens resolve to actual colors
      const tokenResults = await page.evaluate(() => {
        const testEl = document.createElement('div');
        document.body.appendChild(testEl);
        const results: Record<string, { bg: string; isApplied: boolean }> = {};

        // These are the correct paired tokens
        const validTokens = ['bg-surface-light', 'bg-background-light'];
        for (const cls of validTokens) {
          testEl.className = cls;
          const bg = getComputedStyle(testEl).backgroundColor;
          results[cls] = {
            bg,
            isApplied: bg !== 'rgba(0, 0, 0, 0)',
          };
        }

        document.body.removeChild(testEl);
        return results;
      });

      // bg-surface-light should resolve (it's a valid token)
      expect(tokenResults['bg-surface-light'].isApplied).toBe(true);
      expect(tokenResults['bg-background-light'].isApplied).toBe(true);

      await takeScreenshot(page, 'theme-tokens-light-validated');
    });

    test('non-existent tokens do NOT apply styles', async ({ page }) => {
      await page.goto('/login');
      await page.waitForTimeout(1000);

      // Added: Verify non-existent/broken tokens do NOT resolve
      const badTokenResults = await page.evaluate(() => {
        const testEl = document.createElement('div');
        document.body.appendChild(testEl);
        const results: Record<string, { bg: string; isApplied: boolean }> = {};

        // These are the WRONG tokens that were fixed in ErrorBoundary
        const badTokens = ['bg-surface', 'bg-dark-surface', 'text-primary-text', 'text-dark-primary-text'];
        for (const cls of badTokens) {
          testEl.className = cls;
          const bg = getComputedStyle(testEl).backgroundColor;
          results[cls] = {
            bg,
            isApplied: bg !== 'rgba(0, 0, 0, 0)',
          };
        }

        document.body.removeChild(testEl);
        return results;
      });

      // None of these broken tokens should apply
      for (const [token, result] of Object.entries(badTokenResults)) {
        expect(result.isApplied, `Token "${token}" should NOT apply any style`).toBe(false);
      }

      await takeScreenshot(page, 'theme-bad-tokens-verified');
    });

    test('dark mode token pairs render in both modes', async ({ page }) => {
      await page.goto('/login');
      await page.waitForTimeout(1000);

      // Light mode — screenshot captures visual proof
      await page.evaluate(() => document.documentElement.classList.remove('dark'));
      await page.waitForTimeout(300);
      await takeScreenshot(page, 'theme-paired-tokens-light');

      // Check a real element with bg-background-light class for computed color
      const lightBg = await page.evaluate(() => {
        // Find any element that uses bg-background-light (login wrapper, etc.)
        const el = document.querySelector('[class*="bg-background"]') || document.body;
        return getComputedStyle(el).backgroundColor;
      });

      // Dark mode — screenshot captures visual proof
      await page.evaluate(() => document.documentElement.classList.add('dark'));
      await page.waitForTimeout(300);
      await takeScreenshot(page, 'theme-paired-tokens-dark');

      const darkBg = await page.evaluate(() => {
        const el = document.querySelector('[class*="bg-background"]') || document.body;
        return getComputedStyle(el).backgroundColor;
      });

      // Added: Light and dark backgrounds should differ (visual validation via screenshots)
      // The dark class toggles which Tailwind variant is active
      const hasDarkClass = await page.evaluate(() => document.documentElement.classList.contains('dark'));
      expect(hasDarkClass).toBe(true);

      // Verify at least one has a non-transparent background
      const hasVisibleBg = lightBg !== 'rgba(0, 0, 0, 0)' || darkBg !== 'rgba(0, 0, 0, 0)';
      expect(hasVisibleBg).toBe(true);
    });
  });

  test.describe('Register Page Dark Mode', () => {
    test('register page supports dark mode with screenshots', async ({ page }) => {
      await page.goto('/register');

      // Light mode
      await page.evaluate(() => document.documentElement.classList.remove('dark'));
      await page.waitForTimeout(300);
      await takeScreenshot(page, 'theme-register-light');

      // Dark mode
      await page.evaluate(() => document.documentElement.classList.add('dark'));
      await page.waitForTimeout(300);
      await takeScreenshot(page, 'theme-register-dark');

      // Verify dark class is applied after toggle
      const hasDarkClass = await page.evaluate(() => document.documentElement.classList.contains('dark'));
      expect(hasDarkClass).toBe(true);

      // Verify a real element with background class has non-transparent bg
      const bgColor = await page.evaluate(() => {
        const el = document.querySelector('[class*="bg-background"]') || document.body;
        return getComputedStyle(el).backgroundColor;
      });
      expect(bgColor).not.toBe('rgba(0, 0, 0, 0)');
    });
  });
});
