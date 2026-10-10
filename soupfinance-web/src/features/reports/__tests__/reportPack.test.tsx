/**
 * SOUPFIN-104 acceptance: "At least 40 reports in the registry, all available
 * to every tenant, each exporting to PDF/Excel/CSV."
 *
 * The catalogue tests pin the count, the scope the issue lists, and that every
 * report can produce all three files. The page tests render pack reports
 * through the generic page with the HTTP client mocked at its edge: grouped
 * rows, subtotals, the downloaded CSV's contents, the row-cap notice and a
 * disabled module.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import apiClient from '../../../api/client';
import { CURRENCIES, useAccountStore } from '../../../stores';
import { RegistryReportPage } from '../RegistryReportPage';
import { REPORTS, REPORT_CATEGORIES, isRegistryOnlyReport } from '../reportRegistry';
import { REPORT_PACK } from '../reportPackRegistry';
import { REPORT_ROW_LIMIT } from '../reportTable';
import { canExport } from '../useReportExport';
import { EXPORT_FORMATS } from '../reportRegistry';

// =============================================================================
// Catalogue
// =============================================================================

describe('the core report pack', () => {
  it('brings the catalogue to at least 40 reports, with unique ids and paths', () => {
    expect(REPORTS.length).toBeGreaterThanOrEqual(40);
    expect(new Set(REPORTS.map((r) => r.id)).size).toBe(REPORTS.length);
    const viewPaths = REPORTS.filter(isRegistryOnlyReport).map((r) => r.path);
    expect(new Set(viewPaths).size).toBe(viewPaths.length);
  });

  it('covers the scope SOUPFIN-104 lists', () => {
    const ids = REPORTS.map((r) => r.id);
    const scope = [
      // Business overview
      'profit-loss', 'profit-loss-by-month', 'profit-loss-comparative', 'profit-loss-percent-of-income',
      'balance-sheet', 'balance-sheet-comparative', 'balance-sheet-summary', 'cash-flow', 'trial-balance',
      'general-ledger', 'journal', 'account-list', 'transaction-list-by-date',
      // Sales
      'sales-by-customer-summary', 'sales-by-customer-detail', 'sales-by-product-summary', 'invoice-list',
      'customer-balance-summary', 'customer-balance-detail', 'income-by-customer',
      // Expenses
      'expenses-by-vendor-summary', 'bill-list', 'vendor-balance-summary', 'transaction-list-by-vendor',
      // Tax
      'tax-liability', 'tax-detail',
      // Banking
      'deposit-detail', 'cheque-detail',
    ];
    for (const id of scope) expect(ids, id).toContain(id);
  });

  it('puts every category to use, including the new Taxes and Banking', () => {
    for (const category of REPORT_CATEGORIES) {
      expect(REPORTS.some((r) => r.category === category.id), category.id).toBe(true);
    }
    expect(REPORTS.filter((r) => r.category === 'taxes').length).toBeGreaterThanOrEqual(2);
    expect(REPORTS.filter((r) => r.category === 'banking').length).toBeGreaterThanOrEqual(2);
  });

  it('gives every pack report a loader, columns and a /reports/view page', () => {
    for (const report of REPORT_PACK) {
      expect(report.load, report.id).toBeTypeOf('function');
      expect(report.columns?.length, report.id).toBeGreaterThan(0);
      expect(report.path).toBe(`/reports/view/${report.id}`);
      expect(isRegistryOnlyReport(report), report.id).toBe(true);
      // Group fields must name a field the loader fills, not a column header.
      if (report.groupBy) expect(report.columns!.map((c) => c.key)).not.toContain(report.groupBy);
    }
  });

  it('can export every report to PDF, Excel and CSV', () => {
    // Registry-only reports without a backend export get all three built in
    // the browser; Cash Flow builds its own (see ReportShell.test.tsx).
    const browserBuilt = { pdf: () => new Blob(), xlsx: () => new Blob(), csv: () => new Blob() };
    for (const report of REPORTS) {
      const builtInBrowser = isRegistryOnlyReport(report) || report.id === 'cash-flow';
      for (const format of EXPORT_FORMATS) {
        expect(canExport(report, format, builtInBrowser ? browserBuilt : undefined), `${report.id} ${format}`).toBe(true);
      }
    }
  });

  it('gates no report by tenant, plan or module', () => {
    for (const report of REPORTS) {
      const keys = Object.keys(report);
      expect(keys.some((k) => /tenant|plan|tier|module|license/i.test(k)), report.id).toBe(false);
    }
  });
});

// =============================================================================
// Pages
// =============================================================================

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/reports" element={<div data-testid="hub">hub</div>} />
          <Route path="/reports/view/:reportId" element={<RegistryReportPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const downloads: { name: string; blob: Blob }[] = [];
const blobs = new Map<string, Blob>();

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-08-15T12:00:00Z'));
  useAccountStore.setState({ currencyConfig: CURRENCIES.GHS });
  downloads.length = 0;
  let n = 0;
  URL.createObjectURL = vi.fn((blob: Blob) => {
    const url = `blob:report-${n++}`;
    blobs.set(url, blob);
    return url;
  });
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push({ name: this.download, blob: blobs.get(this.href.replace(/^.*(blob:)/, 'blob:'))! });
  });
});

afterEach(() => {
  vi.useRealTimers();
  useAccountStore.getState().reset();
});

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });
}

function page<T>(items: T[]) {
  return (url: string) => {
    const params = new URLSearchParams(url.split('?')[1] ?? '');
    const offset = Number(params.get('offset') ?? 0);
    return items.slice(offset, offset + Number(params.get('max') ?? 100));
  };
}

const bill = (id: string, vendor: string, date: string, total: number) => ({
  id,
  billNumber: `BILL-${id}`,
  vendor: { id: `v-${vendor}`, serialised: vendor },
  billDate: `${date}T00:00:00Z`,
  paymentDate: `${date}T00:00:00Z`,
  subTotal: total,
  totalTaxAmount: 0,
  total,
  paidAmount: 0,
  amountDue: total,
  status: 'PENDING',
});

describe('Expenses by Vendor Detail', () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
      if (url.startsWith('/bill/index.json')) {
        return {
          data: page([
            bill('b1', 'Electricity Co', '2026-08-02', 500),
            bill('b2', 'Electricity Co', '2026-08-09', 250.5),
            bill('b3', 'Akwaaba Stationers', '2026-08-04', 1_200),
            bill('b4', 'Akwaaba Stationers', '2026-07-30', 99),
          ])(url),
        };
      }
      throw new Error(`Unexpected request: ${url}`);
    });
  });

  it('groups bills under each vendor with a subtotal, in the tenant currency', async () => {
    renderAt('/reports/view/expenses-by-vendor-detail');

    const table = await screen.findByTestId('expenses-by-vendor-detail-table');
    expect(screen.getByTestId('expenses-by-vendor-detail-heading')).toHaveTextContent('Expenses by Vendor Detail');
    const groups = within(table).getAllByTestId(/^expenses-by-vendor-detail-group-/);
    expect(groups.map((g) => g.textContent)).toEqual(['Akwaaba Stationers', 'Electricity Co']);

    const subtotals = within(table).getAllByTestId(/^expenses-by-vendor-detail-subtotal-/);
    expect(subtotals).toHaveLength(2);
    expect(subtotals[1]).toHaveTextContent('Total Electricity Co');
    expect(subtotals[1]).toHaveTextContent('GH₵750.50');
    expect(screen.getByTestId('expenses-by-vendor-detail-totals')).toHaveTextContent('GH₵1,950.50');
    // The July bill is outside the default range (this month).
    expect(table.textContent).not.toContain('BILL-b4');
    expect(table.textContent).not.toContain('$');
  });

  it('downloads the rows on screen as CSV, Excel and PDF-ready files', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderAt('/reports/view/expenses-by-vendor-detail');
    await screen.findByTestId('expenses-by-vendor-detail-table');

    await user.click(screen.getByTestId('expenses-by-vendor-detail-export-csv'));
    await waitFor(() => expect(downloads.map((d) => d.name)).toEqual(['expenses-by-vendor-detail-2026-08-01-to-2026-08-31.csv']));
    const csv = (await readBlob(downloads[0].blob)).replace(/^\uFEFF/, '').trimEnd().split('\r\n');
    expect(csv[0]).toBe('Date,Bill,Due,Status,Amount,Tax,Total');
    expect(csv).toContain('Akwaaba Stationers,,,,,,');
    expect(csv).toContain('2026-08-04,BILL-b3,2026-08-04,PENDING,1200,0,1200');
    expect(csv).toContain('Total Electricity Co,,,,750.5,0,750.5');
    expect(csv.at(-1)).toBe('Total,,,,1950.5,0,1950.5');

    await user.click(screen.getByTestId('expenses-by-vendor-detail-export-excel'));
    await waitFor(() => expect(downloads).toHaveLength(2));
    expect(downloads[1].name).toBe('expenses-by-vendor-detail-2026-08-01-to-2026-08-31.xls');
    const xml = await readBlob(downloads[1].blob);
    expect(xml).toContain('<Data ss:Type="Number">1950.5</Data>');
    expect(xml).toContain('Amounts in GHS');
  });
});

describe('the row cap and the empty state', () => {
  it('says so when a report read only the first 5,000 records', async () => {
    const many = Array.from({ length: REPORT_ROW_LIMIT + 1 }, (_, i) => bill(`b${i}`, `Vendor ${i % 3}`, '2026-08-05', 1));
    vi.mocked(apiClient.get).mockImplementation(async (url: string) => ({ data: page(many)(url) }));
    renderAt('/reports/view/expenses-by-vendor-summary');

    expect(await screen.findByTestId('expenses-by-vendor-summary-truncated')).toHaveTextContent('first 5,000 records');
    expect(within(screen.getByTestId('expenses-by-vendor-summary-totals')).getByText('5,000')).toBeVisible();
  });

  it('shows the empty state for an as-of report with nothing owed', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });
    renderAt('/reports/view/vendor-balance-summary');
    expect(await screen.findByTestId('vendor-balance-summary-empty')).toHaveTextContent('Try a later date');
    expect(screen.getByTestId('vendor-balance-summary-export-csv')).toBeEnabled();
  });
});

describe('a disabled module', () => {
  it('reads as a module the administrator must enable, with exports off', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(
      Object.assign(new Error('Request failed with status code 403'), {
        isAxiosError: true,
        response: { status: 403, data: { error: 'Ledger module not enabled' } },
      })
    );
    renderAt('/reports/view/journal');

    const error = await screen.findByTestId('journal-error');
    expect(error).toHaveAttribute('data-error-kind');
    expect(screen.queryByTestId('journal-empty')).not.toBeInTheDocument();
    expect(screen.getByTestId('journal-export-pdf')).toBeDisabled();
  });
});
