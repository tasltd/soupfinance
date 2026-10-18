/**
 * SOUPFIN-190 — Cash Flow reads the backend cashFlowStatement endpoint, and
 * PDF / Excel export through it.
 *
 * Before: the page built its statement from accountTransactions by matching
 * words in the account NAME, opened every period on 0 cash, and kept PDF and
 * Excel permanently disabled with a "coming soon" tooltip.
 *
 * The backend endpoint is not deployed yet (plans/soupfin-190-cash-flow-statement-backend.md),
 * so this mock-mode spec stands in for it with a tiny dated cash ledger: each
 * response is computed from the movements up to and inside the requested range.
 * That is what lets it check the two acceptance invariants through the UI:
 *   - opening cash of a period equals closing cash of the period before it;
 *   - net change equals the sum of the three sections.
 * The same contract is checked against the real backend by
 * e2e/integration/soupfin-190-cash-flow.integration.spec.ts.
 *
 * Navigation is by CLICKING the sidebar, never `page.goto` on an internal route.
 */
import { promises as fs } from 'node:fs';
import { test, expect, type Page, type Route } from '@playwright/test';
import {
  installUnmockedApiGuard,
  isLxcMode,
  mockAmbientApi,
  mockDashboardApi,
  mockTokenValidationApi,
  type UnmockedApiGuard,
} from './fixtures';

/** Git-tracked screenshot dir — `test-results/` is wiped at the start of every run. */
async function shot(page: Page, name: string) {
  await page.screenshot({
    path: `e2e/playwright/screenshots/soupfin-190/${name}.png`,
    fullPage: true,
  });
}

type Section = 'operating' | 'investing' | 'financing';

/** Cash held before the first movement below. */
const OPENING_CASH = 50_000;

/** Every cash movement on the books, oldest first. */
const LEDGER: { date: string; section: Section; description: string; amount: number }[] = [
  { date: '2026-07-10', section: 'operating', description: 'Receipt — Zenith Retail Ltd', amount: 12_000 },
  { date: '2026-07-28', section: 'investing', description: 'Delivery van', amount: -30_000 },
  { date: '2026-08-03', section: 'operating', description: 'Receipt — Harbour Logistics Ltd', amount: 20_700 },
  { date: '2026-08-09', section: 'operating', description: 'Payment — Volta Power Services', amount: -3_565 },
  { date: '2026-08-14', section: 'investing', description: 'Office laptops', amount: -9_200 },
  { date: '2026-08-20', section: 'financing', description: 'Owner capital injection', amount: 25_000 },
  { date: '2026-08-27', section: 'financing', description: 'Loan repayment — GCB Bank', amount: -4_000 },
];

/** The statement the backend contract promises for a date range. */
function statementFor(from: string, to: string) {
  const before = LEDGER.filter((m) => m.date < from);
  const inside = LEDGER.filter((m) => m.date >= from && m.date <= to);
  const opening = OPENING_CASH + before.reduce((sum, m) => sum + m.amount, 0);
  const rows = (section: Section) =>
    inside
      .filter((m) => m.section === section)
      .map((m) => ({ description: m.description, amount: m.amount, transactionDate: m.date }));
  const total = (section: Section) => rows(section).reduce((sum, r) => sum + r.amount, 0);
  const net = total('operating') + total('investing') + total('financing');
  return {
    periodStart: from,
    periodEnd: to,
    beginningCashBalance: opening,
    operatingActivities: rows('operating'),
    totalOperatingCashFlow: total('operating'),
    investingActivities: rows('investing'),
    totalInvestingCashFlow: total('investing'),
    financingActivities: rows('financing'),
    totalFinancingCashFlow: total('financing'),
    netCashFlow: net,
    endingCashBalance: opening + net,
  };
}

/** Minimal file bytes per export format, matching what the backend sends. */
const EXPORT_BYTES: Record<string, { contentType: string; body: Buffer }> = {
  pdf: { contentType: 'application/pdf', body: Buffer.from('%PDF-1.4\n%cash-flow\n') },
  // POI HSSF (.xls) starts with the OLE2 signature d0cf11e0 (SOUPFIN-60).
  excel: { contentType: 'application/vnd.ms-excel', body: Buffer.from('d0cf11e0a1b11ae1', 'hex') },
};

/** Every cashFlowStatement request the page made, as parsed query params. */
type Requested = { from: string | null; to: string | null; f: string | null };

async function mockCashFlowEndpoint(page: Page, requested: Requested[]) {
  await page.route('**/rest/financeReports/cashFlowStatement*', (route: Route) => {
    const url = new URL(route.request().url());
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const f = url.searchParams.get('f');
    requested.push({ from, to, f });

    if (f) {
      const file = EXPORT_BYTES[f];
      return route.fulfill(
        file
          ? { status: 200, contentType: file.contentType, body: file.body }
          : { status: 500, contentType: 'application/json', body: JSON.stringify({ error: `No exporter found for type: ${f}` }) }
      );
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(statementFor(from ?? '', to ?? '')),
    });
  });
}

async function openCashFlowFromSidebar(page: Page) {
  await page.goto('/dashboard');
  await page.waitForLoadState('domcontentloaded');
  await page.getByRole('link', { name: 'Reports', exact: true }).click();
  await page.getByRole('link', { name: 'Cash Flow', exact: true }).click();
  await expect(page).toHaveURL(/\/reports\/cash-flow$/);
  await expect(page.getByTestId('cash-flow-page')).toBeVisible({ timeout: 15000 });
}

async function setRange(page: Page, from: string, to: string) {
  await page.getByTestId('cash-flow-from-date').fill(from);
  await page.getByTestId('cash-flow-to-date').fill(to);
  await page.getByTestId('cash-flow-refresh').click();
}

/** Read a money figure such as "GH₵-1,234.50" or "+$20,700.00" as a number. */
async function amountOf(page: Page, testId: string): Promise<number> {
  const text = (await page.getByTestId(testId).innerText()).trim();
  const negative = /-/.test(text);
  const digits = text.replace(/[^0-9.]/g, '');
  return (negative ? -1 : 1) * Number(digits);
}

test.describe('SOUPFIN-190: Cash Flow from the backend cashFlowStatement endpoint', () => {
  test.skip(isLxcMode(), 'Mock-mode spec; the real backend is covered by the integration spec');

  let guard: UnmockedApiGuard;
  let requested: Requested[];

  test.beforeEach(async ({ page }) => {
    requested = [];
    await page.addInitScript(() => {
      const mockUser = {
        username: 'admin',
        email: 'admin@soupfinance.com',
        roles: ['ROLE_ADMIN', 'ROLE_USER'],
        tenantId: 'account-001',
      };
      localStorage.setItem('access_token', 'mock-jwt-token');
      localStorage.setItem('user', JSON.stringify(mockUser));
      localStorage.setItem(
        'auth-storage',
        JSON.stringify({ state: { user: mockUser, isAuthenticated: true }, version: 0 })
      );
    });

    guard = await installUnmockedApiGuard(page); // FIRST: catches anything unmocked
    await mockAmbientApi(page);
    await mockTokenValidationApi(page, true);
    await mockDashboardApi(page);
    await mockCashFlowEndpoint(page, requested);
  });

  test.afterEach(() => guard.assertNone('SOUPFIN-190'));

  test('August shows real opening cash, three sections, and a net change that adds up', async ({ page }) => {
    await openCashFlowFromSidebar(page);
    await shot(page, 'cash-flow-opened-from-sidebar');

    await setRange(page, '2026-08-01', '2026-08-31');
    await expect(page.getByTestId('cash-flow-net')).toContainText('28,935.00', { timeout: 10000 });
    await shot(page, 'cash-flow-august');

    // The page asked the new endpoint for August, and nothing else for its data.
    expect(requested.some((r) => r.from === '2026-08-01' && r.to === '2026-08-31' && r.f === null)).toBe(true);

    // Opening cash is the ledger before August: 50,000 + 12,000 - 30,000. Never 0.
    expect(await amountOf(page, 'cash-flow-beginning-balance')).toBe(32_000);

    const operating = await amountOf(page, 'cash-flow-operating-total');
    const investing = await amountOf(page, 'cash-flow-investing-total');
    const financing = await amountOf(page, 'cash-flow-financing-total');
    expect([operating, investing, financing]).toEqual([17_135, -9_200, 21_000]);

    const net = await amountOf(page, 'cash-flow-net');
    expect(net).toBe(operating + investing + financing);
    expect(await amountOf(page, 'cash-flow-ending-balance')).toBe(32_000 + net);

    // Rows sit in the section the backend put them in. "Loan repayment" is
    // financing because the backend said so, not because of the word "Loan".
    await expect(page.getByTestId('cash-flow-section-financing')).toContainText('Loan repayment — GCB Bank');
    await expect(page.getByTestId('cash-flow-section-operating')).toContainText('Payment — Volta Power Services');
    await expect(page.getByTestId('cash-flow-empty')).toHaveCount(0);
  });

  test('the opening cash of September is the closing cash of August', async ({ page }) => {
    await openCashFlowFromSidebar(page);

    await setRange(page, '2026-08-01', '2026-08-31');
    await expect(page.getByTestId('cash-flow-net')).toContainText('28,935.00', { timeout: 10000 });
    const augustClosing = await amountOf(page, 'cash-flow-ending-balance');

    await setRange(page, '2026-09-01', '2026-09-30');
    await expect(page.getByTestId('cash-flow-empty')).toBeVisible({ timeout: 10000 });
    await shot(page, 'cash-flow-september-empty');

    expect(await amountOf(page, 'cash-flow-beginning-balance')).toBe(augustClosing);
    expect(await amountOf(page, 'cash-flow-net')).toBe(0);
    expect(await amountOf(page, 'cash-flow-ending-balance')).toBe(augustClosing);
  });

  test('PDF and Excel download from the backend as .pdf and .xls', async ({ page }) => {
    await openCashFlowFromSidebar(page);
    await setRange(page, '2026-08-01', '2026-08-31');
    await expect(page.getByTestId('cash-flow-net')).toContainText('28,935.00', { timeout: 10000 });

    const pdfButton = page.getByTestId('cash-flow-export-pdf');
    const excelButton = page.getByTestId('cash-flow-export-excel');
    await expect(pdfButton).toBeEnabled();
    await expect(excelButton).toBeEnabled();
    // Not the old "not available for this report yet" tooltip.
    await expect(pdfButton).toHaveAttribute('title', 'Export as PDF');
    await expect(excelButton).toHaveAttribute('title', 'Export as Excel');
    await shot(page, 'cash-flow-export-buttons-enabled');

    const pdfDownload = page.waitForEvent('download');
    await pdfButton.click();
    const pdf = await pdfDownload;
    expect(pdf.suggestedFilename()).toBe('cash-flow-2026-08-01-to-2026-08-31.pdf');
    const pdfBytes = await fs.readFile(await pdf.path());
    expect(pdfBytes.subarray(0, 4).toString()).toBe('%PDF');

    const excelDownload = page.waitForEvent('download');
    await excelButton.click();
    const excel = await excelDownload;
    expect(excel.suggestedFilename()).toBe('cash-flow-2026-08-01-to-2026-08-31.xls');
    const excelBytes = await fs.readFile(await excel.path());
    expect(excelBytes.subarray(0, 4).toString('hex')).toBe('d0cf11e0');

    // The exports went to the backend with the page's range and the SOUPFIN-60 format names.
    const exports = requested.filter((r) => r.f !== null);
    expect(exports).toEqual([
      { from: '2026-08-01', to: '2026-08-31', f: 'pdf' },
      { from: '2026-08-01', to: '2026-08-31', f: 'excel' },
    ]);
    await expect(page.getByTestId('cash-flow-export-error')).toHaveCount(0);
    await shot(page, 'cash-flow-after-exports');
  });

  test('a backend without the endpoint says so instead of showing invented figures', async ({ page }) => {
    // Registered last, so it wins over the ledger mock (routes are LIFO).
    await page.route('**/rest/financeReports/cashFlowStatement*', (route) =>
      route.fulfill({ status: 404, contentType: 'text/html', body: '<html>Page Not Found</html>' })
    );

    await openCashFlowFromSidebar(page);

    const error = page.getByTestId('cash-flow-error');
    await expect(error).toContainText('not available on this server yet', { timeout: 10000 });
    await expect(page.getByTestId('cash-flow-stats')).toHaveCount(0);
    await shot(page, 'cash-flow-endpoint-missing');
  });
});
