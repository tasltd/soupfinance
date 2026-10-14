/**
 * SOUPFIN-190 — Cash Flow statement against the REAL LXC backend.
 *
 * Checks the contract in plans/soupfin-190-cash-flow-statement-backend.md and
 * the two acceptance invariants on real ledger data:
 *   - opening cash of a period equals closing cash of the period before it;
 *   - net change equals the sum of the three sections (and closing - opening).
 * Then exports PDF and Excel and opens the page from the sidebar.
 *
 * EXPECTED TO FAIL until the backend plan ships: on 2026-10-14 the LXC backend
 * answered 404 for cashFlowStatement.json, and its older cashFlow.json answered
 * 500 "could not resolve property: account of: soupbroker.finance.LedgerAccount".
 * The failure message names the plan rather than skipping silently.
 *
 * Requests go through the Vite proxy (relative /rest/ URLs), which adds the
 * Api-Authorization header the backend needs.
 *
 * Run: E2E_ADMIN_USERNAME=david.tetteh E2E_ADMIN_PASSWORD=david.tetteh \
 *      npx playwright test --config=playwright.lxc.config.ts e2e/integration/soupfin-190-cash-flow.integration.spec.ts
 */
import { promises as fs } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { backendTestUsers } from '../fixtures';

const PLAN = 'plans/soupfin-190-cash-flow-statement-backend.md';
const SHOTS = 'e2e/playwright/screenshots/soupfin-190-lxc';

async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.getByTestId('login-email-input').waitFor({ state: 'visible', timeout: 10000 });
  await page.getByTestId('login-email-input').fill(backendTestUsers.admin.username);
  await page.getByTestId('login-password-input').fill(backendTestUsers.admin.password);
  const remember = page.getByTestId('login-remember-checkbox');
  if (await remember.isVisible().catch(() => false)) await remember.check();
  await page.getByTestId('login-submit-button').click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20000 });
}

async function authToken(page: Page): Promise<string> {
  return page.evaluate(
    () => localStorage.getItem('access_token') || sessionStorage.getItem('access_token') || ''
  );
}

interface Statement {
  beginningCashBalance: number | string;
  endingCashBalance: number | string;
  totalOperatingCashFlow: number | string;
  totalInvestingCashFlow: number | string;
  totalFinancingCashFlow: number | string;
  netCashFlow: number | string;
  operatingActivities: unknown[];
  investingActivities: unknown[];
  financingActivities: unknown[];
}

async function fetchStatement(page: Page, from: string, to: string, f?: string) {
  const query = `from=${from}&to=${to}${f ? `&f=${f}` : ''}`;
  return page.request.get(`/rest/financeReports/cashFlowStatement.json?${query}`, {
    headers: { 'X-Auth-Token': await authToken(page), Accept: f ? '*/*' : 'application/json' },
    maxRedirects: 0,
    timeout: 90000,
  });
}

async function statement(page: Page, from: string, to: string): Promise<Statement> {
  const response = await fetchStatement(page, from, to);
  expect(
    response.status(),
    `cashFlowStatement.json ${from}..${to} answered ${response.status()}: ` +
      `${(await response.text()).slice(0, 200)}. The backend endpoint is specified in ${PLAN}.`
  ).toBe(200);
  return (await response.json()) as Statement;
}

const n = (value: number | string) => Number(value);

test.describe('SOUPFIN-190: cash flow statement on the real backend', () => {
  test.describe.configure({ timeout: 240000 });

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('returns the contract, and the statement reconciles', async ({ page }) => {
    const cashFlow = await statement(page, '2026-08-01', '2026-08-31');

    for (const list of ['operatingActivities', 'investingActivities', 'financingActivities'] as const) {
      expect(Array.isArray(cashFlow[list]), `${list} must be an array`).toBe(true);
    }
    expect(Number.isFinite(n(cashFlow.beginningCashBalance)), 'opening cash must be a number').toBe(true);

    const sections =
      n(cashFlow.totalOperatingCashFlow) + n(cashFlow.totalInvestingCashFlow) + n(cashFlow.totalFinancingCashFlow);
    expect(n(cashFlow.netCashFlow)).toBeCloseTo(sections, 2);
    expect(n(cashFlow.endingCashBalance) - n(cashFlow.beginningCashBalance)).toBeCloseTo(n(cashFlow.netCashFlow), 2);
  });

  test('the opening cash of a month is the closing cash of the month before', async ({ page }) => {
    const july = await statement(page, '2026-07-01', '2026-07-31');
    const august = await statement(page, '2026-08-01', '2026-08-31');

    expect(n(august.beginningCashBalance)).toBeCloseTo(n(july.endingCashBalance), 2);
  });

  test('exports PDF and Excel', async ({ page }) => {
    const pdf = await fetchStatement(page, '2026-08-01', '2026-08-31', 'pdf');
    expect(pdf.status(), `f=pdf answered ${pdf.status()}; see ${PLAN}`).toBe(200);
    expect((await pdf.body()).subarray(0, 4).toString()).toBe('%PDF');

    // The UI's xlsx goes out as f=excel (SOUPFIN-60); POI HSSF bytes start d0cf11e0.
    const excel = await fetchStatement(page, '2026-08-01', '2026-08-31', 'excel');
    expect(excel.status(), `f=excel answered ${excel.status()}; see ${PLAN}`).toBe(200);
    expect((await excel.body()).subarray(0, 4).toString('hex')).toBe('d0cf11e0');
  });

  test('the page opens from the sidebar with backend figures and downloads a PDF', async ({ page }) => {
    await page.getByRole('link', { name: 'Reports', exact: true }).click();
    await page.getByRole('link', { name: 'Cash Flow', exact: true }).click();
    await expect(page.getByTestId('cash-flow-page')).toBeVisible({ timeout: 20000 });

    await page.getByTestId('cash-flow-from-date').fill('2026-08-01');
    await page.getByTestId('cash-flow-to-date').fill('2026-08-31');
    await page.getByTestId('cash-flow-refresh').click();

    const loaded = page.getByTestId('cash-flow-stats');
    const failed = page.getByTestId('cash-flow-error');
    await expect(loaded.or(failed)).toBeVisible({ timeout: 120000 });
    await fs.mkdir(SHOTS, { recursive: true });
    await page.screenshot({ path: `${SHOTS}/cash-flow-august.png`, fullPage: true });
    await expect(failed, `the page shows an error; see ${PLAN}`).toHaveCount(0);

    const download = page.waitForEvent('download', { timeout: 120000 });
    await page.getByTestId('cash-flow-export-pdf').click();
    expect((await download).suggestedFilename()).toBe('cash-flow-2026-08-01-to-2026-08-31.pdf');
  });
});
