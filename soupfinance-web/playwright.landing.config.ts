/**
 * Landing Page E2E Configuration (opt-in)
 *
 * Why this config exists (SOUPFIN-66):
 * `e2e/landing-page.spec.ts` used to run inside the default mock suite while
 * pointing at https://www.soupfinance.com. The mock suite therefore made real
 * network calls to production on every run, and every test in that file failed
 * with `page.goto: Test timeout of 30000ms exceeded` whenever the network was
 * slow, offline, or Cloudflare was throttling. That made the full gate an
 * untrustworthy merge signal.
 *
 * The landing page is a separate deliverable (`soupfinance-landing/`, deployed
 * by `deploy-landing.sh`), so it now runs as its own opt-in project against a
 * LOCAL static server by default:
 *
 *   npm run test:e2e:landing                       # local copy (deterministic)
 *   LANDING_BASE_URL=https://www.soupfinance.com \
 *     npm run test:e2e:landing                     # post-deploy smoke check
 *
 * The default mock suite excludes this spec — see `testIgnore` in
 * playwright.config.ts.
 */
import { defineConfig, devices } from '@playwright/test';

// Dedicated port so this never collides with the SPA dev server (5180) or the
// integration config (5181).
const LANDING_PORT = Number(process.env.LANDING_PORT) || 5185;

// When set, tests run against the given origin instead of the local copy.
const LANDING_BASE_URL = process.env.LANDING_BASE_URL || `http://localhost:${LANDING_PORT}`;
const usingLocalCopy = !process.env.LANDING_BASE_URL;

export default defineConfig({
  testDir: './e2e',
  testMatch: 'landing-page.spec.ts',

  timeout: 30 * 1000,
  expect: { timeout: 5000 },

  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  reporter: [
    ['html', { outputFolder: 'playwright-report-landing', open: 'never' }],
    ['list'],
  ],

  use: {
    baseURL: LANDING_BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
    headless: true,
  },

  // Firefox is the mandated default browser — do not add chromium/webkit here.
  projects: [
    {
      name: 'landing-firefox',
      use: { ...devices['Desktop Firefox'] },
    },
  ],

  outputDir: 'test-results-landing/',

  // Serve the static landing page from this repo. Vite is already a dependency,
  // so this needs no extra static-server package.
  ...(usingLocalCopy
    ? {
        webServer: {
          command: `npx vite --root ../soupfinance-landing --port ${LANDING_PORT} --strictPort`,
          url: `http://localhost:${LANDING_PORT}/index.html`,
          reuseExistingServer: !process.env.CI,
          timeout: 120 * 1000,
        },
      }
    : {}),
});
