/**
 * Unit tests for Balance Sheet currency formatting (SOUPFIN-73).
 *
 * Reported symptom: on a GHS tenant, /reports/balance-sheet rendered every figure
 * with a dollar sign, so the same number read "GH₵1,200.00" on the dashboard and
 * on the aging reports but "$1,200.00" here.
 *
 * Root cause: BalanceSheetPage declared a module-level
 *   new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
 * used at 10 call sites, bypassing the account store entirely.
 *
 * These tests drive the REAL account store (no formatter mock) and cover both
 * ends: zero balances and seven-figure balances.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useAccountStore, CURRENCIES } from '../../../stores/accountStore';
import type { BalanceSheet } from '../../../types';

vi.mock('../../../api/endpoints/reports', async () => {
  const actual =
    await vi.importActual<typeof import('../../../api/endpoints/reports')>(
      '../../../api/endpoints/reports'
    );
  return {
    ...actual,
    getBalanceSheetDirect: vi.fn(),
    exportFinanceReport: vi.fn(),
  };
});

import { getBalanceSheetDirect } from '../../../api/endpoints/reports';
import { BalanceSheetPage } from '../BalanceSheetPage';

/** Balanced books: Assets 1200 = Liabilities 450 + Equity 750. */
const REPORT: BalanceSheet = {
  asOf: '2026-09-30',
  assets: [{ account: 'Cash at Bank', balance: 1200 }],
  liabilities: [{ account: 'Accounts Payable', balance: 450 }],
  equity: [{ account: 'Retained Earnings', balance: 750 }],
  totalAssets: 1200,
  totalLiabilities: 450,
  totalEquity: 750,
};

/** Zero end: accounts exist (so the table renders) but every balance is zero. */
const ZERO_REPORT: BalanceSheet = {
  asOf: '2026-09-30',
  assets: [{ account: 'Cash at Bank', balance: 0 }],
  liabilities: [{ account: 'Accounts Payable', balance: 0 }],
  equity: [{ account: 'Retained Earnings', balance: 0 }],
  totalAssets: 0,
  totalLiabilities: 0,
  totalEquity: 0,
};

/** Overflow end: seven figures, still balanced. */
const LARGE_REPORT: BalanceSheet = {
  asOf: '2026-09-30',
  assets: [{ account: 'Cash at Bank', balance: 9876543.21 }],
  liabilities: [{ account: 'Accounts Payable', balance: 1234567.89 }],
  equity: [{ account: 'Retained Earnings', balance: 8641975.32 }],
  totalAssets: 9876543.21,
  totalLiabilities: 1234567.89,
  totalEquity: 8641975.32,
};

/** Out of balance, so the "Difference:" line renders. */
const UNBALANCED_REPORT: BalanceSheet = {
  ...REPORT,
  totalEquity: 700,
  equity: [{ account: 'Retained Earnings', balance: 700 }],
};

function setCurrency(code: keyof typeof CURRENCIES) {
  useAccountStore.setState({ currencyConfig: CURRENCIES[code] });
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <BalanceSheetPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('BalanceSheetPage — amounts use the account currency (SOUPFIN-73)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getBalanceSheetDirect).mockResolvedValue(REPORT);
  });

  afterEach(() => {
    useAccountStore.setState({ currencyConfig: CURRENCIES.DEFAULT });
  });

  it('renders GH₵ (not $) in the summary stat cards when the account currency is GHS', async () => {
    setCurrency('GHS');
    renderPage();

    const stats = await screen.findByTestId('balance-sheet-stats');
    const text = stats.textContent ?? '';

    // The exact defect: the hardcoded USD formatter.
    expect(text).not.toContain('$');
    expect(text).toContain('GH₵1,200.00');
    expect(text).toContain('GH₵450.00');
    expect(text).toContain('GH₵750.00');
  });

  it('renders GH₵ in the accounting-equation panel', async () => {
    setCurrency('GHS');
    renderPage();

    const equation = await screen.findByTestId('balance-sheet-equation');
    expect(equation.textContent).toContain('GH₵1,200.00');
    expect(equation.textContent).not.toContain('$');
  });

  it('renders GH₵ in the out-of-balance difference line', async () => {
    setCurrency('GHS');
    vi.mocked(getBalanceSheetDirect).mockResolvedValue(UNBALANCED_REPORT);
    renderPage();

    const equation = await screen.findByTestId('balance-sheet-equation');
    expect(equation.textContent).toContain('Difference: GH₵50.00');
    expect(equation.textContent).not.toContain('$');
  });

  it('renders GH₵ in each section total', async () => {
    setCurrency('GHS');
    renderPage();

    const assetsTotal = await screen.findByTestId('balance-sheet-assets-total');
    const liabilitiesTotal = screen.getByTestId('balance-sheet-liabilities-total');
    const equityTotal = screen.getByTestId('balance-sheet-equity-total');

    expect(assetsTotal.textContent).toContain('GH₵1,200.00');
    expect(liabilitiesTotal.textContent).toContain('GH₵450.00');
    expect(equityTotal.textContent).toContain('GH₵750.00');
    for (const el of [assetsTotal, liabilitiesTotal, equityTotal]) {
      expect(el.textContent).not.toContain('$');
    }
  });

  it('renders GH₵ in the Liabilities + Equity grand total', async () => {
    setCurrency('GHS');
    renderPage();

    const grandTotal = await screen.findByTestId('balance-sheet-grand-total');
    expect(grandTotal.textContent).toContain('GH₵1,200.00');
    expect(grandTotal.textContent).not.toContain('$');
  });

  it('formats a zero balance as a zero in the account currency, not as $0.00', async () => {
    setCurrency('GHS');
    vi.mocked(getBalanceSheetDirect).mockResolvedValue(ZERO_REPORT);
    renderPage();

    const stats = await screen.findByTestId('balance-sheet-stats');
    expect(stats.textContent).toContain('GH₵0.00');
    expect(stats.textContent).not.toContain('$0.00');
  });

  it('keeps thousands separators on seven-figure balances', async () => {
    setCurrency('GHS');
    vi.mocked(getBalanceSheetDirect).mockResolvedValue(LARGE_REPORT);
    renderPage();

    const stats = await screen.findByTestId('balance-sheet-stats');
    expect(stats.textContent).toContain('GH₵9,876,543.21');
    expect(stats.textContent).toContain('GH₵8,641,975.32');
    expect(stats.textContent).not.toContain('$');
  });

  it('still renders $ when the account currency IS USD (no over-correction)', async () => {
    setCurrency('USD');
    renderPage();

    const stats = await screen.findByTestId('balance-sheet-stats');
    expect(stats.textContent).toContain('$1,200.00');
    expect(stats.textContent).not.toContain('GH₵');
  });

  it('honours a zero-decimal, symbol-after currency (XOF)', async () => {
    setCurrency('XOF');
    renderPage();

    const stats = await screen.findByTestId('balance-sheet-stats');
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

    const stats = await screen.findByTestId('balance-sheet-stats');
    expect(stats.textContent).toContain(symbol);
  });
});
