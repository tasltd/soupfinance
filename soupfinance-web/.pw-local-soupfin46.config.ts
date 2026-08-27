/**
 * TEMPORARY local runner config for the SOUPFIN-46 spec — NOT committed.
 * This worktree's playwright.config.ts hardcodes port 5180, which another
 * worktree already serves; reuseExistingServer would silently test THAT
 * checkout. Pin our own port instead.
 */
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT || 5187);

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  testIgnore: '**/integration/**',
  timeout: 30 * 1000,
  expect: { timeout: 5000 },
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    headless: true,
  },
  projects: [{ name: 'firefox', use: { ...devices['Desktop Firefox'] } }],
  outputDir: './test-results/',
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,

    reuseExistingServer: false,
    timeout: 120 * 1000,
  },
});
