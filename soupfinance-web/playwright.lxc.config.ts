/**
 * Playwright E2E Test Configuration for LXC Backend
 *
 * This configuration is used when running E2E tests against a real
 * soupmarkets-web backend running in an LXC container.
 *
 * Key differences from playwright.config.ts:
 * - Sets TEST_MODE=lxc to disable mock helpers (fixtures use real API)
 * - Longer timeouts (real API calls are slower than mocks)
 * - Uses dev:lxc mode which loads .env.lxc
 * - Retries disabled to see real failures
 *
 * DUAL-MODE TESTING:
 * - npm run test:e2e           → Mock mode (default config)
 * - npm run test:e2e:lxc       → Integration tests against real backend
 * - npm run test:e2e:lxc:all   → ALL tests against real backend
 *
 * Usage:
 *   npm run test:e2e:lxc
 *   # or
 *   npx playwright test --config=playwright.lxc.config.ts
 */
import { defineConfig, devices } from '@playwright/test';

// Set TEST_MODE for fixtures to detect LXC backend mode
process.env.TEST_MODE = 'lxc';

export default defineConfig({
  // Test directory
  testDir: './e2e',

  // Test file pattern
  testMatch: '**/*.spec.ts',

  // Changed: Longer timeout for real API calls (60 seconds)
  timeout: 60 * 1000,

  // Changed: Longer expect timeout for real API responses
  expect: {
    timeout: 15000,
  },

  // Run tests serially - parallel execution causes auth conflicts with real backend
  fullyParallel: false,

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Changed: No retries - we want to see real failures
  retries: 0,

  // Changed: Single worker to avoid auth conflicts with real backend
  // Multiple concurrent logins can cause session conflicts
  workers: 1,

  // Reporter to use
  reporter: [
    ['html', { outputFolder: 'playwright-report-lxc' }],
    ['list'],
  ],

  // Shared settings for all the projects below
  use: {
    // Base URL to use in actions like `await page.goto('/')`
    // Changed: Use port 5180 to avoid conflicts with other dev servers
    baseURL: 'http://localhost:5180',

    // Collect trace when retrying the failed test
    trace: 'on-first-retry',

    // Take screenshot on failure
    screenshot: 'only-on-failure',

    // Video on failure
    video: 'on-first-retry',

    // Headless mode
    headless: true,

    // Changed: Longer navigation timeout for real API
    navigationTimeout: 30000,

    // Changed: Longer action timeout for real API
    actionTimeout: 15000,
  },

  // Configure projects for major browsers
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Changed: Separate output folder for LXC test artifacts
  outputDir: 'test-results-lxc/',

  // Changed: Run dev server in LXC mode
  webServer: {
    command: 'npm run dev:lxc -- --port 5180',
    url: 'http://localhost:5180',
    reuseExistingServer: !process.env.CI,
    // Changed: Longer timeout for backend startup
    timeout: 180 * 1000,
    // Added: Environment variables for LXC mode
    env: {
      // VITE_API_URL is set dynamically by run-e2e-with-lxc.sh
    },
  },
});
