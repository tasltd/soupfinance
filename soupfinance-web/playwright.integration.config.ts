/**
 * Playwright Integration Test Configuration
 * Runs E2E tests against the REAL LXC backend (soupfinance-backend)
 *
 * Usage:
 *   npm run test:e2e:integration
 *   npx playwright test --config=playwright.integration.config.ts
 *
 * Prerequisites:
 *   1. LXC containers running: soupmarkets-mariadb, soupfinance-backend
 *   2. Backend accessible at http://10.115.213.183:9090
 *   3. Test users seeded in database (test.admin, test.user, test.finance)
 */
import { defineConfig, devices } from '@playwright/test';

// Integration test port (different from mock tests to allow parallel runs)
const INTEGRATION_TEST_PORT = 5181;

// LXC Backend URL
const LXC_BACKEND_URL = 'http://10.115.213.183:9090';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',

  // Longer timeout for real backend calls
  timeout: 60 * 1000,

  expect: {
    timeout: 10000,
  },

  // Run sequentially to avoid race conditions with real data
  fullyParallel: false,
  workers: 1,

  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,

  reporter: [
    ['html', { outputFolder: 'playwright-report-integration' }],
    ['list'],
  ],

  use: {
    baseURL: `http://localhost:${INTEGRATION_TEST_PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
    headless: true,

    // Extra HTTP headers for debugging
    extraHTTPHeaders: {
      'X-Test-Mode': 'integration',
    },
  },

  projects: [
    {
      name: 'integration-chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  outputDir: 'test-results-integration/',

  // Start dev server pointing to real LXC backend
  webServer: {
    command: `VITE_API_URL=${LXC_BACKEND_URL} npm run dev -- --port ${INTEGRATION_TEST_PORT}`,
    url: `http://localhost:${INTEGRATION_TEST_PORT}`,
    reuseExistingServer: false,
    timeout: 120 * 1000,
    env: {
      VITE_API_URL: LXC_BACKEND_URL,
    },
  },
});
