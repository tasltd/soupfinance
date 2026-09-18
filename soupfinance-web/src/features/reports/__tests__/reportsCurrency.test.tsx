/**
 * Unit tests for report-page currency formatting (SOUPFIN-54).
 *
 * Reported symptom: a tenant configured as GHS sees GH₵ on the dashboard, the invoice
 * list and the bill list, but the Trial Balance, Balance Sheet, Cash Flow and Profit &
 * Loss pages render every figure with a dollar sign (e.g. Trial Balance totalling
 * "$160,800.00" for a GHS account).
 *
 * Root cause: each of those four pages declared its own module-level
 *   new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
 * (TrialBalancePage used formatCurrency(amount, currency = 'USD')), bypassing the
 * account store entirely. The same defect was fixed on AgingReportsPage under
 * SOUPFIN-33 #4 but was never carried across.
 *
 * These tests drive the REAL account store (no formatter mock) so they assert the
 * rendered output actually follows the tenant currency.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useAccountStore, CURRENCIES } from '../../../stores/accountStore';
import type {
  TrialBalance,
  BalanceSheet,
  CashFlowStatement,
  ProfitLoss,
} from '../../../types';

vi.mock('../../../api/endpoints/reports', async () => {
  const actual =
    await vi.importActual<typeof import('../../../api/endpoints/reports')>(
      '../../../api/endpoints/reports'
    );
  return {
    ...actual,
    getTrialBalance: vi.fn(),
    getBalanceSheetDirect: vi.fn(),
    getCashFlowStatement: vi.fn(),
    getIncomeStatement: vi.fn(),
    exportFinanceReport: vi.fn(),
  };
});

import {
  getTrialBalance,
  getBalanceSheetDirect,
  getCashFlowStatement,
  getIncomeStatement,
} from '../../../api/endpoints/reports';
import { TrialBalancePage } from '../TrialBalancePage';
import { BalanceSheetPage } from '../BalanceSheetPage';
import { CashFlowPage } from '../CashFlowPage';
import { ProfitLossPage } from '../ProfitLossPage';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TRIAL_BALANCE: TrialBalance = {
  asOf: '2026-09-18',
  accounts: {
    ASSET: [
      {
        id: 'a1',
        name: 'Cash at Bank',
        currency: 'GHS',
        ledgerGroup: 'ASSET',
        endingDebit: 160800,
        endingCredit: 0,
      },
    ],
    LIABILITY: [],
    EQUITY: [],
    REVENUE: [],
    EXPENSE: [
      {
        id: 'e1',
        name: 'Office Rent',
        currency: 'GHS',
        ledgerGroup: 'EXPENSE',
        endingDebit: 0,
        endingCredit: 160800,
      },
    ],
  },
  totalDebit: 160800,
  totalCredit: 160800,
};

const BALANCE_SHEET: BalanceSheet = {
  asOf: '2026-09-18',
  assets: [{ account: 'Cash at Bank', balance: 9500.25 }],
  liabilities: [{ account: 'Accounts Payable', balance: 2500 }],
  equity: [{ account: 'Retained Earnings', balance: 7000.25 }],
  totalAssets: 9500.25,
  totalLiabilities: 2500,
  totalEquity: 7000.25,
};

const CASH_FLOW: CashFlowStatement = {
  periodStart: '2026-09-01',
  periodEnd: '2026-09-30',
  operatingActivities: [{ description: 'Customer receipts', amount: 4200.75 }],
  totalOperatingCashFlow: 4200.75,
  investingActivities: [{ description: 'Equipment purchase', amount: -1200 }],
  totalInvestingCashFlow: -1200,
  financingActivities: [{ description: 'Owner contribution', amount: 1000 }],
  totalFinancingCashFlow: 1000,
  netCashFlow: 4000.75,
  beginningCashBalance: 5000,
  endingCashBalance: 9000.75,
};

const PROFIT_LOSS: ProfitLoss = {
  periodStart: '2026-09-01',
  periodEnd: '2026-09-30',
  income: [{ account: 'Consulting Revenue', amount: 12500.5 }],
  expenses: [{ account: 'Office Rent', amount: 3200.25 }],
  totalIncome: 12500.5,
  totalExpenses: 3200.25,
  netProfit: 9300.25,
};

function setCurrency(code: keyof typeof CURRENCIES) {
  useAccountStore.setState({ currencyConfig: CURRENCIES[code] });
}

function renderPage(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getTrialBalance).mockResolvedValue(TRIAL_BALANCE);
  vi.mocked(getBalanceSheetDirect).mockResolvedValue(BALANCE_SHEET);
  vi.mocked(getCashFlowStatement).mockResolvedValue(CASH_FLOW);
  vi.mocked(getIncomeStatement).mockResolvedValue(PROFIT_LOSS);
});

afterEach(() => {
  useAccountStore.setState({ currencyConfig: CURRENCIES.DEFAULT });
});

// ---------------------------------------------------------------------------
// Trial Balance
// ---------------------------------------------------------------------------

describe('TrialBalancePage currency (SOUPFIN-54)', () => {
  it('renders the totals row in the tenant currency, not USD', async () => {
    setCurrency('GHS');
    renderPage(<TrialBalancePage />);

    const totals = await screen.findByTestId('trial-balance-totals');
    // The exact reported figure: "$160,800.00" on a GHS account.
    expect(totals.textContent).not.toContain('$160,800.00');
    expect(within(totals).getByTestId('trial-balance-total-debit').textContent).toBe(
      'GH₵160,800.00'
    );
    expect(within(totals).getByTestId('trial-balance-total-credit').textContent).toBe(
      'GH₵160,800.00'
    );
  });

  it('renders account rows and group headers in the tenant currency', async () => {
    setCurrency('GHS');
    renderPage(<TrialBalancePage />);

    const table = await screen.findByTestId('trial-balance-table');
    const text = table.textContent ?? '';
    expect(text).toContain('GH₵160,800.00');
    expect(text).not.toContain('$160,800.00');
  });

  it('honours a per-row account currency the backend supplies', async () => {
    // Tenant is GHS but this account is denominated in EUR — the row must follow
    // the row's own currency, the totals must follow the tenant's.
    setCurrency('GHS');
    vi.mocked(getTrialBalance).mockResolvedValue({
      ...TRIAL_BALANCE,
      accounts: {
        ...TRIAL_BALANCE.accounts,
        ASSET: [{ ...TRIAL_BALANCE.accounts.ASSET[0], currency: 'EUR' }],
      },
    });
    renderPage(<TrialBalancePage />);

    const row = await screen.findByTestId('trial-balance-account-a1');
    expect(row.textContent).toContain('€160,800.00');

    const totals = screen.getByTestId('trial-balance-totals');
    expect(totals.textContent).toContain('GH₵160,800.00');
  });

  it('falls back to the tenant currency (not USD) for an unknown row currency code', async () => {
    setCurrency('GHS');
    vi.mocked(getTrialBalance).mockResolvedValue({
      ...TRIAL_BALANCE,
      accounts: {
        ...TRIAL_BALANCE.accounts,
        ASSET: [{ ...TRIAL_BALANCE.accounts.ASSET[0], currency: 'ZZZ' }],
      },
    });
    renderPage(<TrialBalancePage />);

    const row = await screen.findByTestId('trial-balance-account-a1');
    expect(row.textContent).toContain('GH₵160,800.00');
    expect(row.textContent).not.toContain('$160,800.00');
  });

  it('still blanks zero cells rather than printing a zero amount', async () => {
    setCurrency('GHS');
    renderPage(<TrialBalancePage />);

    const row = await screen.findByTestId('trial-balance-account-a1');
    // endingCredit is 0 on this row — the cell stays empty by design.
    expect(row.textContent).not.toContain('GH₵0.00');
  });

  it('still renders $ when the tenant currency IS USD (no over-correction)', async () => {
    setCurrency('USD');
    vi.mocked(getTrialBalance).mockResolvedValue({
      ...TRIAL_BALANCE,
      accounts: {
        ...TRIAL_BALANCE.accounts,
        ASSET: [{ ...TRIAL_BALANCE.accounts.ASSET[0], currency: 'USD' }],
      },
    });
    renderPage(<TrialBalancePage />);

    const totals = await screen.findByTestId('trial-balance-totals');
    expect(totals.textContent).toContain('$160,800.00');
    expect(totals.textContent).not.toContain('GH₵');
  });
});

// ---------------------------------------------------------------------------
// Balance Sheet
// ---------------------------------------------------------------------------

describe('BalanceSheetPage currency (SOUPFIN-54)', () => {
  it('renders the summary cards in the tenant currency', async () => {
    setCurrency('GHS');
    renderPage(<BalanceSheetPage />);

    const stats = await screen.findByTestId('balance-sheet-stats');
    expect(within(stats).getByTestId('balance-sheet-total-assets').textContent).toContain(
      'GH₵9,500.25'
    );
    expect(
      within(stats).getByTestId('balance-sheet-total-liabilities').textContent
    ).toContain('GH₵2,500.00');
    expect(within(stats).getByTestId('balance-sheet-total-equity').textContent).toContain(
      'GH₵7,000.25'
    );
    expect(stats.textContent).not.toContain('$');
  });

  it('renders section totals and item rows in the tenant currency', async () => {
    setCurrency('GHS');
    renderPage(<BalanceSheetPage />);

    const sections = await screen.findByTestId('balance-sheet-sections');
    expect(sections.textContent).toContain('GH₵9,500.25');
    expect(sections.textContent).not.toContain('$9,500.25');
  });

  it('renders the accounting-equation line in the tenant currency', async () => {
    setCurrency('GHS');
    renderPage(<BalanceSheetPage />);

    const equation = await screen.findByTestId('balance-sheet-equation');
    expect(equation.textContent).toContain('GH₵');
    expect(equation.textContent).not.toContain('$');
  });

  it('still renders $ when the tenant currency IS USD', async () => {
    setCurrency('USD');
    renderPage(<BalanceSheetPage />);

    const stats = await screen.findByTestId('balance-sheet-stats');
    expect(stats.textContent).toContain('$9,500.25');
    expect(stats.textContent).not.toContain('GH₵');
  });
});

// ---------------------------------------------------------------------------
// Cash Flow
// ---------------------------------------------------------------------------

describe('CashFlowPage currency (SOUPFIN-54)', () => {
  it('renders the summary cards in the tenant currency', async () => {
    setCurrency('GHS');
    renderPage(<CashFlowPage />);

    const stats = await screen.findByTestId('cash-flow-stats');
    expect(
      within(stats).getByTestId('cash-flow-beginning-balance').textContent
    ).toContain('GH₵5,000.00');
    expect(within(stats).getByTestId('cash-flow-ending-balance').textContent).toContain(
      'GH₵9,000.75'
    );
    expect(stats.textContent).not.toContain('$');
  });

  it('renders the summary table in the tenant currency', async () => {
    setCurrency('GHS');
    renderPage(<CashFlowPage />);

    const summary = await screen.findByTestId('cash-flow-summary');
    expect(summary.textContent).toContain('GH₵');
    expect(summary.textContent).not.toContain('$');
  });

  it('renders activity rows and section totals in the tenant currency', async () => {
    setCurrency('GHS');
    renderPage(<CashFlowPage />);

    const sections = await screen.findByTestId('cash-flow-sections');
    expect(sections.textContent).toContain('GH₵4,200.75');
    expect(sections.textContent).not.toContain('$4,200.75');
  });

  it('still renders $ when the tenant currency IS USD', async () => {
    setCurrency('USD');
    renderPage(<CashFlowPage />);

    const stats = await screen.findByTestId('cash-flow-stats');
    expect(stats.textContent).toContain('$5,000.00');
    expect(stats.textContent).not.toContain('GH₵');
  });
});

// ---------------------------------------------------------------------------
// Profit & Loss
// ---------------------------------------------------------------------------

describe('ProfitLossPage currency (SOUPFIN-54)', () => {
  it('renders the summary cards in the tenant currency', async () => {
    setCurrency('GHS');
    renderPage(<ProfitLossPage />);

    const stats = await screen.findByTestId('profit-loss-stats');
    expect(within(stats).getByTestId('profit-loss-total-income').textContent).toContain(
      'GH₵12,500.50'
    );
    expect(within(stats).getByTestId('profit-loss-total-expenses').textContent).toContain(
      'GH₵3,200.25'
    );
    expect(within(stats).getByTestId('profit-loss-net-profit').textContent).toContain(
      'GH₵9,300.25'
    );
    expect(stats.textContent).not.toContain('$');
  });

  it('renders the net-profit summary block in the tenant currency', async () => {
    setCurrency('GHS');
    renderPage(<ProfitLossPage />);

    const summary = await screen.findByTestId('profit-loss-net-profit-summary');
    expect(summary.textContent).toContain('GH₵');
    expect(summary.textContent).not.toContain('$');
  });

  it('renders section totals and item rows in the tenant currency', async () => {
    setCurrency('GHS');
    renderPage(<ProfitLossPage />);

    const sections = await screen.findByTestId('profit-loss-sections');
    expect(sections.textContent).toContain('GH₵12,500.50');
    expect(sections.textContent).not.toContain('$12,500.50');
  });

  it('still renders $ when the tenant currency IS USD', async () => {
    setCurrency('USD');
    renderPage(<ProfitLossPage />);

    const stats = await screen.findByTestId('profit-loss-stats');
    expect(stats.textContent).toContain('$12,500.50');
    expect(stats.textContent).not.toContain('GH₵');
  });
});

// ---------------------------------------------------------------------------
// Cross-page consistency — the symbol follows the tenant everywhere
// ---------------------------------------------------------------------------

describe('All four report pages follow the configured symbol (SOUPFIN-54)', () => {
  it.each([
    ['EUR', '€'],
    ['NGN', '₦'],
    ['GBP', '£'],
    ['KES', 'KSh'],
  ])('uses %s symbol %s on every page', async (code, symbol) => {
    setCurrency(code as keyof typeof CURRENCIES);

    const { unmount: u1 } = renderPage(<TrialBalancePage />);
    expect((await screen.findByTestId('trial-balance-totals')).textContent).toContain(symbol);
    u1();

    const { unmount: u2 } = renderPage(<BalanceSheetPage />);
    expect((await screen.findByTestId('balance-sheet-stats')).textContent).toContain(symbol);
    u2();

    const { unmount: u3 } = renderPage(<CashFlowPage />);
    expect((await screen.findByTestId('cash-flow-stats')).textContent).toContain(symbol);
    u3();

    const { unmount: u4 } = renderPage(<ProfitLossPage />);
    expect((await screen.findByTestId('profit-loss-stats')).textContent).toContain(symbol);
    u4();
  });

  it('honours a zero-decimal currency (XOF) with the symbol AFTER the amount', async () => {
    setCurrency('XOF');
    renderPage(<ProfitLossPage />);

    const stats = await screen.findByTestId('profit-loss-stats');
    // XOF: decimals 0, symbolPosition 'after' — proves the store config is driving
    // formatting, not just the symbol being swapped in.
    expect(within(stats).getByTestId('profit-loss-total-income').textContent).toContain(
      '12,501 CFA'
    );
  });
});
