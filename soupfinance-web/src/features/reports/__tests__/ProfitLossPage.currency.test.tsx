/**
 * Unit tests for Profit & Loss currency formatting (SOUPFIN-73).
 *
 * Reported symptom: on a GHS tenant, /reports/profit-loss rendered every figure
 * with a dollar sign, so the same number read "GH₵1,200.00" on the dashboard and
 * on the aging reports but "$1,200.00" here.
 *
 * Root cause: ProfitLossPage declared a module-level
 *   new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
 * used at 7 call sites, bypassing the account store entirely.
 *
 * These tests drive the REAL account store (no formatter mock) so they assert the
 * rendered output actually follows the tenant currency, and they cover both ends:
 * zero amounts and seven-figure amounts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useAccountStore, CURRENCIES } from '../../../stores/accountStore';
import type { ProfitLoss } from '../../../types';

vi.mock('../../../api/endpoints/reports', async () => {
  const actual =
    await vi.importActual<typeof import('../../../api/endpoints/reports')>(
      '../../../api/endpoints/reports'
    );
  return {
    ...actual,
    getIncomeStatement: vi.fn(),
    exportFinanceReport: vi.fn(),
  };
});

import { getIncomeStatement } from '../../../api/endpoints/reports';
import { ProfitLossPage } from '../ProfitLossPage';

const REPORT: ProfitLoss = {
  periodStart: '2026-09-01',
  periodEnd: '2026-09-30',
  income: [{ account: 'Consulting Revenue', amount: 1200 }],
  expenses: [{ account: 'Office Rent', amount: 450 }],
  totalIncome: 1200,
  totalExpenses: 450,
  netProfit: 750,
};

/** Zero end: accounts exist (so the table renders) but every figure is zero. */
const ZERO_REPORT: ProfitLoss = {
  periodStart: '2026-09-01',
  periodEnd: '2026-09-30',
  income: [{ account: 'Consulting Revenue', amount: 0 }],
  expenses: [{ account: 'Office Rent', amount: 0 }],
  totalIncome: 0,
  totalExpenses: 0,
  netProfit: 0,
};

/** Overflow end: seven figures, to prove thousands separators survive. */
const LARGE_REPORT: ProfitLoss = {
  periodStart: '2026-09-01',
  periodEnd: '2026-09-30',
  income: [{ account: 'Consulting Revenue', amount: 9876543.21 }],
  expenses: [{ account: 'Office Rent', amount: 1234567.89 }],
  totalIncome: 9876543.21,
  totalExpenses: 1234567.89,
  netProfit: 8641975.32,
};

function setCurrency(code: keyof typeof CURRENCIES) {
  useAccountStore.setState({ currencyConfig: CURRENCIES[code] });
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ProfitLossPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('ProfitLossPage — amounts use the account currency (SOUPFIN-73)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getIncomeStatement).mockResolvedValue(REPORT);
  });

  afterEach(() => {
    useAccountStore.setState({ currencyConfig: CURRENCIES.DEFAULT });
  });

  it('renders GH₵ (not $) in the summary stat cards when the account currency is GHS', async () => {
    setCurrency('GHS');
    renderPage();

    const stats = await screen.findByTestId('profit-loss-stats');
    const text = stats.textContent ?? '';

    // The exact defect: the hardcoded USD formatter.
    expect(text).not.toContain('$');
    expect(text).toContain('GH₵1,200.00');
    expect(text).toContain('GH₵450.00');
    expect(text).toContain('GH₵750.00');
  });

  it('renders GH₵ in the income and expense section totals', async () => {
    setCurrency('GHS');
    renderPage();

    const incomeTotal = await screen.findByTestId('profit-loss-income-total');
    const expensesTotal = screen.getByTestId('profit-loss-expenses-total');

    expect(incomeTotal.textContent).toContain('GH₵1,200.00');
    expect(incomeTotal.textContent).not.toContain('$');
    expect(expensesTotal.textContent).toContain('GH₵450.00');
    expect(expensesTotal.textContent).not.toContain('$');
  });

  it('renders GH₵ on the individual account rows', async () => {
    setCurrency('GHS');
    renderPage();

    const row = await screen.findByTestId('income-item-0');
    expect(row.textContent).toContain('GH₵1,200.00');
    expect(row.textContent).not.toContain('$');
  });

  it('renders GH₵ in the net-profit summary equation', async () => {
    setCurrency('GHS');
    renderPage();

    const summary = await screen.findByTestId('profit-loss-net-profit-summary');
    expect(summary.textContent).toContain('GH₵');
    expect(summary.textContent).not.toContain('$');
  });

  it('formats a zero amount as a zero in the account currency, not as $0.00', async () => {
    setCurrency('GHS');
    vi.mocked(getIncomeStatement).mockResolvedValue(ZERO_REPORT);
    renderPage();

    const stats = await screen.findByTestId('profit-loss-stats');
    expect(stats.textContent).toContain('GH₵0.00');
    expect(stats.textContent).not.toContain('$0.00');
  });

  it('keeps thousands separators on seven-figure amounts', async () => {
    setCurrency('GHS');
    vi.mocked(getIncomeStatement).mockResolvedValue(LARGE_REPORT);
    renderPage();

    const stats = await screen.findByTestId('profit-loss-stats');
    expect(stats.textContent).toContain('GH₵9,876,543.21');
    expect(stats.textContent).toContain('GH₵8,641,975.32');
    expect(stats.textContent).not.toContain('$');
  });

  it('still renders $ when the account currency IS USD (no over-correction)', async () => {
    setCurrency('USD');
    renderPage();

    const stats = await screen.findByTestId('profit-loss-stats');
    expect(stats.textContent).toContain('$1,200.00');
    expect(stats.textContent).not.toContain('GH₵');
  });

  it('honours a zero-decimal, symbol-after currency (XOF)', async () => {
    setCurrency('XOF');
    renderPage();

    const stats = await screen.findByTestId('profit-loss-stats');
    // XOF has 0 decimals and places the symbol AFTER the amount.
    expect(stats.textContent).toContain('1,200 CFA');
    expect(stats.textContent).not.toContain('$');
    expect(stats.textContent).not.toContain('1,200.00');
  });

  it.each([
    ['EUR', '€'],
    ['NGN', '₦'],
    ['GBP', '£'],
  ])('follows the configured symbol for %s', async (code, symbol) => {
    setCurrency(code as keyof typeof CURRENCIES);
    renderPage();

    const stats = await screen.findByTestId('profit-loss-stats');
    expect(stats.textContent).toContain(symbol);
  });
});
