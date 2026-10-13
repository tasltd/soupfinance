/**
 * SOUPFIN-60 — report Excel export returned HTTP 500.
 *
 * FinanceReportsController hands `params.f` to the Grails export plugin, which
 * registers excel, csv, xml, pdf, ods and rtf, and no "xlsx". The UI sent
 * `f=xlsx`, the plugin threw ExporterNotFoundException, and every Excel button
 * on the report pages produced a 500 instead of a spreadsheet.
 *
 * The mock below behaves like that backend: `f=xlsx` answers 500, `f=excel`
 * answers with OLE2/BIFF8 bytes (d0cf11e0, a legacy .xls). So against the
 * pre-fix build every test fails on the request AND on the missing download.
 *
 * Navigation is by clicking the sidebar, never `page.goto` on an internal route.
 */
import { test, expect, type Page } from '@playwright/test';
import {
  mockAmbientApi,
  mockTokenValidationApi,
  mockDashboardApi,
  isLxcMode,
} from './fixtures';

/** Git-tracked screenshot dir — `test-results/` is wiped at the start of every run. */
async function shot(page: Page, name: string) {
  await page.screenshot({
    path: `e2e/playwright/screenshots/soupfin-60/${name}.png`,
    fullPage: true,
  });
}

/** OLE2 compound-file header: what the backend's POI HSSF "excel" exporter returns. */
const BIFF8_BYTES = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);

/** Every export request the page sends, so the test can check what it ASKED for. */
let exportRequests: string[] = [];

test.describe('SOUPFIN-60: Excel export asks for f=excel and downloads a .xls', () => {
  test.skip(isLxcMode(), 'Mock-only spec: it stands in for the export plugin');

  test.beforeEach(async ({ page }) => {
    exportRequests = [];

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

    await mockAmbientApi(page);
    await mockTokenValidationApi(page, true);
    await mockDashboardApi(page);

    await page.route('**/rest/financeReports/**', (route) => {
      const url = new URL(route.request().url());
      const f = url.searchParams.get('f');
      if (f === null) {
        // The on-screen report itself: an empty result is enough to render the page.
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ resultList: {}, accountList: [], itemList: [] }),
        });
      }
      exportRequests.push(url.toString());
      if (f === 'excel') {
        return route.fulfill({
          status: 200,
          contentType: 'application/vnd.ms-excel',
          body: BIFF8_BYTES,
        });
      }
      if (f === 'pdf' || f === 'csv') {
        return route.fulfill({ status: 200, contentType: 'application/octet-stream', body: 'x' });
      }
      // Anything else is what the real plugin does with an unknown type.
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: `No exporter found for type: ${f}` }),
      });
    });
  });

  /** Open a Reports sub-page by clicking the sidebar group, then the child link. */
  async function navigateToReport(page: Page, childLabel: string) {
    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');
    await page.getByRole('link', { name: 'Reports', exact: true }).click();
    await page.getByRole('link', { name: childLabel, exact: true }).click();
  }

  /** Click an Excel button and return the downloaded file name. */
  async function clickExcel(page: Page, testId: string): Promise<string> {
    const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
    await page.getByTestId(testId).click();
    const download = await downloadPromise;
    return download.suggestedFilename();
  }

  function expectExcelRequest(reportType: string) {
    expect(exportRequests, 'one export request was sent').toHaveLength(1);
    const url = exportRequests[0];
    expect(url).toContain(`/financeReports/${reportType}`);
    expect(url).toContain('f=excel');
    expect(url).not.toContain('f=xlsx');
  }

  const PAGES = [
    {
      label: 'Trial Balance',
      pageId: 'trial-balance-page',
      button: 'trial-balance-export-excel',
      reportType: 'trialBalance',
      slug: 'trial-balance',
    },
    {
      label: 'Balance Sheet',
      pageId: 'balance-sheet-page',
      button: 'balance-sheet-export-excel',
      reportType: 'balanceSheet',
      slug: 'balance-sheet',
    },
    {
      label: 'Profit & Loss',
      pageId: 'profit-loss-page',
      button: 'profit-loss-export-excel',
      reportType: 'incomeStatement',
      slug: 'profit-loss',
    },
  ];

  for (const p of PAGES) {
    test(`${p.label}: Excel downloads a .xls from f=excel`, async ({ page }) => {
      await navigateToReport(page, p.label);
      await expect(page.getByTestId(p.pageId)).toBeVisible({ timeout: 15000 });
      await shot(page, `${p.slug}-before-export`);

      const filename = await clickExcel(page, p.button);

      expectExcelRequest(p.reportType);
      expect(filename).toMatch(/\.xls$/);
      expect(filename).not.toContain('null');
      await shot(page, `${p.slug}-after-export`);
    });
  }

  test('Aging Reports: both AR and AP Excel buttons download a .xls', async ({ page }) => {
    await navigateToReport(page, 'Aging Reports');
    await expect(page.getByTestId('aging-reports-page')).toBeVisible({ timeout: 15000 });
    await shot(page, 'aging-before-export');

    const arFile = await clickExcel(page, 'ar-aging-export-excel');
    expectExcelRequest('agedReceivables');
    expect(arFile).toMatch(/^ar-aging-.*\.xls$/);

    // AR and AP render side by side on the same page; no tab to switch.
    exportRequests = [];
    const apFile = await clickExcel(page, 'ap-aging-export-excel');
    expectExcelRequest('agedPayables');
    expect(apFile).toMatch(/^ap-aging-.*\.xls$/);
    await shot(page, 'aging-after-export');
  });
});
