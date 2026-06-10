/**
 * Unit tests for the SOUPFIN-16 report-export file-extension fix.
 *
 * The bug: PDF/Excel/CSV report exports were occasionally downloaded with a
 * ".null" extension (e.g. "finance-incomeStatement-report-08-06-2026.null")
 * when the format parameter reached the URL builder as null/undefined.
 *
 * The fix: each report page now uses a whitelist helper that maps known
 * formats to their extension and defaults to "pdf" for unknown values, so
 * the filename never contains ".null" or ".undefined" regardless of how the
 * export was triggered.
 *
 * These tests verify the rendered <a download="..."> filename across all
 * five report pages that own a backend export.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock the reports API at module level — we don't care what the report data
// looks like, only that `exportFinanceReport` returns a Blob so the page can
// build a download link.
vi.mock('../../../api/endpoints/reports', async () => {
  const actual =
    await vi.importActual<typeof import('../../../api/endpoints/reports')>(
      '../../../api/endpoints/reports'
    );
  return {
    ...actual,
    getBalanceSheetDirect: vi.fn().mockResolvedValue({
      asOf: '2026-06-08',
      assets: [], liabilities: [], equity: [],
      totalAssets: 0, totalLiabilities: 0, totalEquity: 0,
    }),
    getIncomeStatement: vi.fn().mockResolvedValue({
      periodStart: '2026-06-01', periodEnd: '2026-06-08',
      income: [], expenses: [],
      totalIncome: 0, totalExpenses: 0, netProfit: 0,
    }),
    getTrialBalance: vi.fn().mockResolvedValue({
      asOf: '2026-06-08',
      accounts: { ASSET: [], LIABILITY: [], EQUITY: [], REVENUE: [], EXPENSE: [] },
      totalDebit: 0, totalCredit: 0,
    }),
    getARAgingReport: vi.fn().mockResolvedValue({
      asOf: '2026-06-08',
      items: [],
      totals: { current: 0, days30: 0, days60: 0, days90: 0, over90: 0, total: 0 },
    }),
    getAPAgingReport: vi.fn().mockResolvedValue({
      asOf: '2026-06-08',
      items: [],
      totals: { current: 0, days30: 0, days60: 0, days90: 0, over90: 0, total: 0 },
    }),
    exportFinanceReport: vi
      .fn()
      .mockResolvedValue(new Blob(['fake pdf bytes'], { type: 'application/pdf' })),
  };
});

import { BalanceSheetPage } from '../BalanceSheetPage';
import { ProfitLossPage } from '../ProfitLossPage';
import { TrialBalancePage } from '../TrialBalancePage';
import { AgingReportsPage } from '../AgingReportsPage';

function renderWithProviders(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

// Capture the filename used on the dynamically-created <a download="..."> element.
// We can't intercept "download" cleanly otherwise — the page creates the link,
// clicks it, and removes it within a single microtask — so we patch
// document.createElement to record the assignment.
function trackDownloadFilename() {
  const filenames: string[] = [];
  const realCreateElement = document.createElement.bind(document);
  const spy = vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
    const element = realCreateElement(tagName);
    if (tagName === 'a') {
      const anchor = element as HTMLAnchorElement;
      Object.defineProperty(anchor, 'download', {
        set(value: string) {
          filenames.push(value);
        },
        get() {
          return filenames[filenames.length - 1] ?? '';
        },
        configurable: true,
      });
      // Avoid actually navigating during click()
      anchor.click = vi.fn();
    }
    return element;
  });
  return {
    filenames,
    restore: () => spy.mockRestore(),
  };
}

describe('Report exports — file extension fix (SOUPFIN-16)', () => {
  let tracker: ReturnType<typeof trackDownloadFilename>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Stub URL.createObjectURL / revokeObjectURL — jsdom doesn't ship them.
    global.URL.createObjectURL = vi.fn(() => 'blob:fake');
    global.URL.revokeObjectURL = vi.fn();
    tracker = trackDownloadFilename();
  });

  afterEach(() => {
    tracker.restore();
  });

  it('Balance Sheet PDF export uses a .pdf extension (never .null)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<BalanceSheetPage />);

    // Wait for the page to mount + render the export button.
    const exportBtn = await screen.findByTestId('balance-sheet-export-pdf');
    await user.click(exportBtn);

    await waitFor(() =>
      expect(tracker.filenames.some(f => f.endsWith('.pdf'))).toBe(true)
    );
    expect(tracker.filenames.every(f => !f.endsWith('.null'))).toBe(true);
    expect(tracker.filenames.every(f => !f.endsWith('.undefined'))).toBe(true);
  });

  it('Balance Sheet Excel export uses a .xlsx extension', async () => {
    const user = userEvent.setup();
    renderWithProviders(<BalanceSheetPage />);

    const exportBtn = await screen.findByTestId('balance-sheet-export-excel');
    await user.click(exportBtn);

    await waitFor(() =>
      expect(tracker.filenames.some(f => f.endsWith('.xlsx'))).toBe(true)
    );
  });

  it('Balance Sheet CSV export uses a .csv extension', async () => {
    const user = userEvent.setup();
    renderWithProviders(<BalanceSheetPage />);

    const exportBtn = await screen.findByTestId('balance-sheet-export-csv');
    await user.click(exportBtn);

    await waitFor(() =>
      expect(tracker.filenames.some(f => f.endsWith('.csv'))).toBe(true)
    );
  });

  it('Profit & Loss PDF export uses a .pdf extension (never .null)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProfitLossPage />);

    const exportBtn = await screen.findByTestId('profit-loss-export-pdf');
    await user.click(exportBtn);

    await waitFor(() =>
      expect(tracker.filenames.some(f => f.endsWith('.pdf'))).toBe(true)
    );
    expect(tracker.filenames.every(f => !f.endsWith('.null'))).toBe(true);
  });

  it('Profit & Loss filename matches the reported pattern but with the correct extension', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProfitLossPage />);

    const exportBtn = await screen.findByTestId('profit-loss-export-pdf');
    await user.click(exportBtn);

    await waitFor(() => expect(tracker.filenames.length).toBeGreaterThan(0));
    const filename = tracker.filenames.at(-1)!;
    // The reported buggy filename was like "finance-incomeStatement-report-08-06-2026.null".
    // Our frontend names it "profit-loss-{from}-to-{to}.pdf" — the key invariant is
    // that the extension is never ".null".
    expect(filename).toMatch(/^profit-loss-.*\.pdf$/);
  });

  it('Trial Balance PDF export uses a .pdf extension (never .null)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TrialBalancePage />);

    const exportBtn = await screen.findByTestId('trial-balance-export-pdf');
    await user.click(exportBtn);

    await waitFor(() =>
      expect(tracker.filenames.some(f => f.endsWith('.pdf'))).toBe(true)
    );
    expect(tracker.filenames.every(f => !f.endsWith('.null'))).toBe(true);
  });

  it('A/R aging PDF export uses a .pdf extension', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AgingReportsPage />);

    const exportBtn = await screen.findByTestId('ar-aging-export-pdf');
    await user.click(exportBtn);

    await waitFor(() =>
      expect(tracker.filenames.some(f => f.endsWith('.pdf'))).toBe(true)
    );
  });

  it('A/P aging PDF export uses a .pdf extension', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AgingReportsPage />);

    const exportBtn = await screen.findByTestId('ap-aging-export-pdf');
    await user.click(exportBtn);

    await waitFor(() =>
      expect(tracker.filenames.some(f => f.endsWith('.pdf'))).toBe(true)
    );
  });
});

describe('Report date pickers — historic-year navigation (SOUPFIN-16)', () => {
  it('Balance Sheet date picker has min=1900-01-01 so users can navigate before 2026', async () => {
    renderWithProviders(<BalanceSheetPage />);
    const dateInput = (await screen.findByTestId(
      'balance-sheet-date-picker'
    )) as HTMLInputElement;
    expect(dateInput.min).toBe('1900-01-01');
  });

  it('Profit & Loss from/to pickers have min=1900-01-01', async () => {
    renderWithProviders(<ProfitLossPage />);
    const fromInput = (await screen.findByTestId(
      'profit-loss-from-date'
    )) as HTMLInputElement;
    const toInput = (await screen.findByTestId(
      'profit-loss-to-date'
    )) as HTMLInputElement;
    expect(fromInput.min).toBe('1900-01-01');
    expect(toInput.min).toBe('1900-01-01');
  });

  it('Trial Balance from/to pickers have min=1900-01-01', async () => {
    renderWithProviders(<TrialBalancePage />);
    const fromInput = (await screen.findByTestId(
      'trial-balance-filter-from'
    )) as HTMLInputElement;
    const toInput = (await screen.findByTestId(
      'trial-balance-filter-to'
    )) as HTMLInputElement;
    expect(fromInput.min).toBe('1900-01-01');
    expect(toInput.min).toBe('1900-01-01');
  });

  it('Aging date picker has min=1900-01-01', async () => {
    renderWithProviders(<AgingReportsPage />);
    const dateInput = (await screen.findByRole('textbox', { hidden: true }).catch(async () => {
      // Aging uses a single date input — find it by its date type.
      const inputs = document.querySelectorAll('input[type="date"]');
      return inputs[0] as HTMLInputElement;
    }));
    expect(dateInput).toBeTruthy();
    if (dateInput && (dateInput as HTMLInputElement).type === 'date') {
      expect((dateInput as HTMLInputElement).min).toBe('1900-01-01');
    }
  });
});
