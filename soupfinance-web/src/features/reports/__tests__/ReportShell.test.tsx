/**
 * SOUPFIN-103: the shared report shell, driven through the real report pages.
 *
 * Each test goes from user action to the request the page makes and back to
 * what it renders: tenant currency in place of USD, the comparison period,
 * export (request, filename, failure), the invalid-range guard and Reset.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import type { BalanceSheet, CashFlowStatement, ProfitLoss, TrialBalance } from '../../../types';

vi.mock('../../../api/endpoints/reports', async () => {
  const actual =
    await vi.importActual<typeof import('../../../api/endpoints/reports')>('../../../api/endpoints/reports');
  return {
    ...actual,
    getIncomeStatement: vi.fn(),
    getBalanceSheetDirect: vi.fn(),
    getCashFlowStatement: vi.fn(),
    getTrialBalance: vi.fn(),
    exportFinanceReport: vi.fn(),
  };
});

import {
  exportFinanceReport,
  getBalanceSheetDirect,
  getCashFlowStatement,
  getIncomeStatement,
  getTrialBalance,
} from '../../../api/endpoints/reports';
import { CURRENCIES, useAccountStore } from '../../../stores';
import { ProfitLossPage } from '../ProfitLossPage';
import { BalanceSheetPage } from '../BalanceSheetPage';
import { CashFlowPage } from '../CashFlowPage';
import { TrialBalancePage } from '../TrialBalancePage';

const FROZEN_NOW = new Date('2026-08-15T12:00:00Z');
const ORIGINAL_TZ = process.env.TZ;

function renderPage(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

function profitLoss(from: string, to: string, income: [string, number][], expenses: [string, number][]): ProfitLoss {
  const totalIncome = income.reduce((s, [, a]) => s + a, 0);
  const totalExpenses = expenses.reduce((s, [, a]) => s + a, 0);
  return {
    periodStart: from,
    periodEnd: to,
    income: income.map(([account, amount]) => ({ account, amount })),
    expenses: expenses.map(([account, amount]) => ({ account, amount })),
    totalIncome,
    totalExpenses,
    netProfit: totalIncome - totalExpenses,
  };
}

/** Capture what the page tries to download. */
let downloads: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(FROZEN_NOW);
  // A Ghana-cedi tenant: every amount must render as GH₵, never $.
  useAccountStore.setState({ currencyConfig: CURRENCIES.GHS });
  downloads = [];
  URL.createObjectURL = vi.fn(() => 'blob:report');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push(this.download);
  });

  vi.mocked(getIncomeStatement).mockImplementation(async ({ from, to }) =>
    from === '2026-08-01'
      ? profitLoss(from, to, [['Consulting', 1_250_000], ['Training', 30_000]], [['Rent', 400_000]])
      : profitLoss(from, to, [['Consulting', 900_000]], [['Rent', 380_000], ['Travel', 12_500]])
  );
});

afterEach(() => {
  vi.useRealTimers();
  useAccountStore.getState().reset();
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

describe('Profit & Loss in the shell', () => {
  it('renders every amount in the tenant currency, not USD', async () => {
    renderPage(<ProfitLossPage />);
    const income = await screen.findByTestId('profit-loss-total-income');
    expect(income).toHaveTextContent('GH₵1,280,000.00');
    expect(screen.getByTestId('profit-loss-net-profit')).toHaveTextContent('GH₵880,000.00');
    expect(screen.getByTestId('profit-loss-page').textContent).not.toContain('$');
    expect(screen.getByTestId('profit-loss-currency')).toHaveTextContent('GHS');
  });

  it('compares with the previous period: requests it and shows previous figures per account', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPage(<ProfitLossPage />);
    await screen.findByTestId('profit-loss-total-income');

    await user.selectOptions(screen.getByTestId('profit-loss-comparison'), 'previousPeriod');

    // Aug 1-15 (15 days) compares with the 15 days before it.
    await waitFor(() =>
      expect(getIncomeStatement).toHaveBeenCalledWith({ from: '2026-07-17', to: '2026-07-31' })
    );
    expect(screen.getByTestId('profit-loss-comparison-range')).toHaveTextContent(
      'Compared with July 17, 2026 – July 31, 2026'
    );
    expect(await screen.findByTestId('profit-loss-total-income-previous')).toHaveTextContent('GH₵900,000.00');
    expect(screen.getByTestId('income-item-0-previous')).toHaveTextContent('GH₵900,000.00');
    // Training had no income in the earlier period: it shows zero, not a blank.
    expect(screen.getByTestId('income-item-1-previous')).toHaveTextContent('GH₵0.00');
    expect(screen.getByTestId('profit-loss-expenses-total-previous')).toHaveTextContent('GH₵392,500.00');
  });

  it('drops the previous column when comparison is switched off again', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPage(<ProfitLossPage />);
    await screen.findByTestId('profit-loss-total-income');
    await user.selectOptions(screen.getByTestId('profit-loss-comparison'), 'previousYear');
    await waitFor(() =>
      expect(getIncomeStatement).toHaveBeenCalledWith({ from: '2025-08-01', to: '2025-08-15' })
    );
    await screen.findByTestId('income-item-0-previous');
    await user.selectOptions(screen.getByTestId('profit-loss-comparison'), 'none');
    expect(screen.queryByTestId('income-item-0-previous')).not.toBeInTheDocument();
    expect(screen.queryByTestId('profit-loss-comparison-range')).not.toBeInTheDocument();
  });

  it('exports through the backend with the selected range and names the file after it', async () => {
    vi.mocked(exportFinanceReport).mockResolvedValue(new Blob(['%PDF']));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPage(<ProfitLossPage />);
    await screen.findByTestId('profit-loss-total-income');

    await user.click(screen.getByTestId('profit-loss-export-excel'));

    await waitFor(() => expect(downloads).toEqual(['profit-loss-2026-08-01-to-2026-08-15.xls']));
    expect(exportFinanceReport).toHaveBeenCalledWith(
      'incomeStatement',
      { from: '2026-08-01', to: '2026-08-15' },
      'xlsx'
    );
  });

  it('shows the export failure instead of failing silently', async () => {
    vi.mocked(exportFinanceReport).mockRejectedValue(new Error('Request failed with status code 500'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPage(<ProfitLossPage />);
    await screen.findByTestId('profit-loss-total-income');

    await user.click(screen.getByTestId('profit-loss-export-pdf'));

    const banner = await screen.findByTestId('profit-loss-export-error');
    expect(banner).toHaveTextContent('Request failed with status code 500');
    expect(downloads).toEqual([]);
    // The buttons are usable again after the failure.
    expect(screen.getByTestId('profit-loss-export-pdf')).toBeEnabled();
  });

  it('refuses a reversed range: warns, disables refresh and export, and sends no request for it', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPage(<ProfitLossPage />);
    await screen.findByTestId('profit-loss-total-income');

    const from = screen.getByTestId('profit-loss-from-date');
    await user.clear(from);
    await user.type(from, '2026-09-30');

    expect(await screen.findByTestId('profit-loss-invalid-range')).toBeVisible();
    expect(screen.getByTestId('profit-loss-refresh')).toBeDisabled();
    expect(screen.getByTestId('profit-loss-export-pdf')).toBeDisabled();
    expect(
      vi.mocked(getIncomeStatement).mock.calls.some(([f]) => f.from === '2026-09-30')
    ).toBe(false);
  });

  it('Reset refetches even when the dates are already the defaults', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPage(<ProfitLossPage />);
    await screen.findByTestId('profit-loss-total-income');
    const before = vi.mocked(getIncomeStatement).mock.calls.length;

    await user.click(screen.getByTestId('profit-loss-reset'));

    await waitFor(() => expect(vi.mocked(getIncomeStatement).mock.calls.length).toBe(before + 1));
  });

  it('prints the period without shifting a day west of UTC', async () => {
    process.env.TZ = 'America/Los_Angeles';
    renderPage(<ProfitLossPage />);
    await screen.findByTestId('profit-loss-total-income');
    // The old subtitle parsed '2026-08-01' as UTC midnight and printed July 31 here.
    expect(screen.getByTestId('profit-loss-subtitle')).toHaveTextContent('August 1, 2026 – August 15, 2026');
  });
});

describe('Balance Sheet in the shell', () => {
  const sheet = (asOf: string, cash: number): BalanceSheet => ({
    asOf,
    assets: [{ account: 'Cash', balance: cash }],
    liabilities: [{ account: 'Loan', balance: 200 }],
    equity: [{ account: 'Capital', balance: cash - 200 }],
    totalAssets: cash,
    totalLiabilities: 200,
    totalEquity: cash - 200,
  });

  it('compares with the same date a year earlier', async () => {
    vi.mocked(getBalanceSheetDirect).mockImplementation(async (asOf) =>
      sheet(asOf, asOf.startsWith('2026') ? 5_000_000 : 1_000)
    );
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPage(<BalanceSheetPage />);
    expect(await screen.findByTestId('balance-sheet-total-assets')).toHaveTextContent('GH₵5,000,000.00');

    await user.selectOptions(screen.getByTestId('balance-sheet-comparison'), 'previousYear');

    await waitFor(() => expect(getBalanceSheetDirect).toHaveBeenCalledWith('2025-08-15'));
    expect(await screen.findByTestId('balance-sheet-total-assets-previous')).toHaveTextContent('GH₵1,000.00');
    expect(screen.getByTestId('assets-item-0-previous')).toHaveTextContent('GH₵1,000.00');
  });

  it('exports everything up to the as-of date, named after that date', async () => {
    vi.mocked(getBalanceSheetDirect).mockImplementation(async (asOf) => sheet(asOf, 10));
    vi.mocked(exportFinanceReport).mockResolvedValue(new Blob(['%PDF']));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPage(<BalanceSheetPage />);
    await screen.findByTestId('balance-sheet-total-assets');

    await user.click(screen.getByTestId('balance-sheet-export-pdf'));

    await waitFor(() => expect(downloads).toEqual(['balance-sheet-2026-08-15.pdf']));
    expect(exportFinanceReport).toHaveBeenCalledWith('balanceSheet', { from: '1900-01-01', to: '2026-08-15' }, 'pdf');
  });
});

describe('Cash Flow in the shell', () => {
  const statement: CashFlowStatement = {
    periodStart: '2026-08-01',
    periodEnd: '2026-08-15',
    operatingActivities: [{ description: 'Customer receipts', amount: 2_400_000 }],
    totalOperatingCashFlow: 2_400_000,
    investingActivities: [],
    totalInvestingCashFlow: 0,
    financingActivities: [],
    totalFinancingCashFlow: 0,
    netCashFlow: 2_400_000,
    beginningCashBalance: 0,
    endingCashBalance: 2_400_000,
  };

  it('uses the tenant currency, keeps PDF/Excel off, and builds the CSV in the browser', async () => {
    vi.mocked(getCashFlowStatement).mockResolvedValue(statement);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPage(<CashFlowPage />);

    expect(await screen.findByTestId('cash-flow-net')).toHaveTextContent('GH₵2,400,000.00');
    expect(screen.getByTestId('cash-flow-page').textContent).not.toContain('$');
    expect(screen.getByTestId('cash-flow-export-pdf')).toBeDisabled();
    expect(screen.getByTestId('cash-flow-export-excel')).toBeDisabled();

    await user.click(screen.getByTestId('cash-flow-export-csv'));

    await waitFor(() => expect(downloads).toEqual(['cash-flow-2026-08-01-to-2026-08-15.csv']));
    expect(exportFinanceReport).not.toHaveBeenCalled();
  });
});

describe('Trial Balance in the shell', () => {
  it('totals in the tenant currency and keeps each account in its own currency', async () => {
    const trialBalance: TrialBalance = {
      asOf: '2026-08-31',
      accounts: {
        ASSET: [
          { id: 'a1', name: 'Cash (GHS)', currency: 'GHS', ledgerGroup: 'ASSET', endingDebit: 3_000_000, endingCredit: 0 },
          { id: 'a2', name: 'Dollar account', currency: 'USD', ledgerGroup: 'ASSET', endingDebit: 500, endingCredit: 0 },
          { id: 'a3', name: 'Odd account', currency: 'XYZ', ledgerGroup: 'ASSET', endingDebit: 7, endingCredit: 0 },
        ],
        LIABILITY: [],
        EQUITY: [],
        REVENUE: [],
        EXPENSE: [],
      },
      totalDebit: 3_000_507,
      totalCredit: 3_000_507,
    };
    vi.mocked(getTrialBalance).mockResolvedValue(trialBalance);
    renderPage(<TrialBalancePage />);

    expect(await screen.findByTestId('trial-balance-total-debit')).toHaveTextContent('GH₵3,000,507.00');
    expect(within(screen.getByTestId('trial-balance-account-a1')).getByText('GH₵3,000,000.00')).toBeVisible();
    expect(within(screen.getByTestId('trial-balance-account-a2')).getByText('$500.00')).toBeVisible();
    // A currency with no known symbol shows its code, never the tenant's symbol.
    expect(within(screen.getByTestId('trial-balance-account-a3')).getByText('XYZ 7.00')).toBeVisible();
    expect(vi.mocked(getTrialBalance).mock.calls[0][0]).toMatchObject({ from: '2026-08-01', to: '2026-08-31' });
  });
});
