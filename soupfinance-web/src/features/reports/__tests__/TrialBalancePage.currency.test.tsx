/**
 * Unit tests for Trial Balance currency formatting (SOUPFIN-73).
 *
 * Reported symptom: on a GHS tenant, /reports/trial-balance rendered its totals
 * with a dollar sign, so the same number read "GH₵1,200.00" on the dashboard and
 * on the aging reports but "$1,200.00" here.
 *
 * Root cause: TrialBalancePage declared a local
 *   formatCurrency(amount, currency = 'USD')
 * with two defects:
 *   1. The 'USD' default — every total (group subtotals, the Totals footer, the
 *      out-of-balance difference) was called with no currency argument at all.
 *   2. `if (amount === 0) return ''` — a genuinely zero balance rendered as a
 *      blank cell, which also blanked the Totals footer on zero-balance books.
 *
 * Both are fixed: amounts come from the account store via useFormatCurrency(),
 * and the zero short-circuit is gone (the same removal SOUPFIN-33 #4 applied to
 * the aging reports). These tests drive the REAL account store — no formatter
 * mock — and cover the zero and seven-figure ends.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useAccountStore, CURRENCIES } from '../../../stores/accountStore';
import type { TrialBalance, TrialBalanceItem } from '../../../types';

vi.mock('../../../api/endpoints/reports', async () => {
  const actual =
    await vi.importActual<typeof import('../../../api/endpoints/reports')>(
      '../../../api/endpoints/reports'
    );
  return {
    ...actual,
    getTrialBalance: vi.fn(),
    exportFinanceReport: vi.fn(),
  };
});

import { getTrialBalance } from '../../../api/endpoints/reports';
import { TrialBalancePage } from '../TrialBalancePage';

const EMPTY_GROUPS: TrialBalance['accounts'] = {
  ASSET: [],
  LIABILITY: [],
  EQUITY: [],
  REVENUE: [],
  EXPENSE: [],
};

function account(over: Partial<TrialBalanceItem> = {}): TrialBalanceItem {
  return {
    id: 'a1',
    name: 'Cash at Bank',
    // NOTE: the backend sends a per-account currency code, and the table still
    // prints it in its own "Currency" column. It is deliberately NOT used to
    // format the amount — see the comment block in TrialBalancePage.
    currency: 'USD',
    ledgerGroup: 'ASSET',
    endingDebit: 1200,
    endingCredit: 0,
    ...over,
  };
}

function report(over: Partial<TrialBalance> = {}): TrialBalance {
  return {
    asOf: '2026-09-30',
    accounts: { ...EMPTY_GROUPS, ASSET: [account()] },
    totalDebit: 1200,
    totalCredit: 1200,
    ...over,
  };
}

function setCurrency(code: keyof typeof CURRENCIES) {
  useAccountStore.setState({ currencyConfig: CURRENCIES[code] });
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <TrialBalancePage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('TrialBalancePage — amounts use the account currency (SOUPFIN-73)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getTrialBalance).mockResolvedValue(report());
  });

  afterEach(() => {
    useAccountStore.setState({ currencyConfig: CURRENCIES.DEFAULT });
  });

  it('renders GH₵ (not $) in the Totals footer when the account currency is GHS', async () => {
    setCurrency('GHS');
    renderPage();

    const debit = await screen.findByTestId('trial-balance-total-debit');
    const credit = screen.getByTestId('trial-balance-total-credit');

    // The exact defect: these two call sites passed no currency at all, so the
    // helper's 'USD' default won.
    expect(debit.textContent).toBe('GH₵1,200.00');
    expect(credit.textContent).toBe('GH₵1,200.00');
  });

  it('renders GH₵ in the group subtotal row', async () => {
    setCurrency('GHS');
    renderPage();

    const group = await screen.findByTestId('trial-balance-group-ASSET');
    expect(group.textContent).toContain('GH₵1,200.00');
    expect(group.textContent).not.toContain('$');
  });

  it('renders GH₵ on the per-account row, ignoring the per-account currency code', async () => {
    setCurrency('GHS');
    renderPage();

    // Group rows start expanded, so the account row is visible.
    const row = await screen.findByTestId('trial-balance-account-a1');
    expect(row.textContent).toContain('GH₵1,200.00');
    expect(row.textContent).not.toContain('$');
    // The per-account code is still shown as text in the Currency column.
    expect(row.textContent).toContain('USD');
  });

  it('renders GH₵ in the out-of-balance difference message', async () => {
    setCurrency('GHS');
    vi.mocked(getTrialBalance).mockResolvedValue(report({ totalDebit: 1200, totalCredit: 1150 }));
    renderPage();

    const status = await screen.findByTestId('trial-balance-status');
    expect(status.textContent).toContain('Difference: GH₵50.00');
    expect(status.textContent).not.toContain('$');
  });

  // --- The removed zero short-circuit -------------------------------------

  it('renders a zero balance as a formatted zero, not as a blank cell', async () => {
    setCurrency('GHS');
    vi.mocked(getTrialBalance).mockResolvedValue(
      report({
        accounts: { ...EMPTY_GROUPS, ASSET: [account({ endingDebit: 0, endingCredit: 0 })] },
        totalDebit: 0,
        totalCredit: 0,
      })
    );
    renderPage();

    // Previously `if (amount === 0) return ''` blanked the Totals footer entirely,
    // so zero-balance books rendered as an empty row rather than a balanced one.
    const debit = await screen.findByTestId('trial-balance-total-debit');
    const credit = screen.getByTestId('trial-balance-total-credit');

    expect(debit.textContent).toBe('GH₵0.00');
    expect(credit.textContent).toBe('GH₵0.00');
    expect(debit.textContent).not.toBe('');
  });

  it('renders the unused side of an account row as a zero rather than blank', async () => {
    setCurrency('GHS');
    renderPage();

    // endingCredit is 0 on this asset account — it used to render as ''.
    const row = await screen.findByTestId('trial-balance-account-a1');
    expect(row.textContent).toContain('GH₵0.00');
  });

  // --- Ends and other currencies ------------------------------------------

  it('keeps thousands separators on seven-figure totals', async () => {
    setCurrency('GHS');
    vi.mocked(getTrialBalance).mockResolvedValue(
      report({
        accounts: { ...EMPTY_GROUPS, ASSET: [account({ endingDebit: 9876543.21 })] },
        totalDebit: 9876543.21,
        totalCredit: 9876543.21,
      })
    );
    renderPage();

    const debit = await screen.findByTestId('trial-balance-total-debit');
    expect(debit.textContent).toBe('GH₵9,876,543.21');
  });

  it('still renders $ when the account currency IS USD (no over-correction)', async () => {
    setCurrency('USD');
    renderPage();

    const debit = await screen.findByTestId('trial-balance-total-debit');
    expect(debit.textContent).toBe('$1,200.00');
    expect(debit.textContent).not.toContain('GH₵');
  });

  it('honours a zero-decimal, symbol-after currency (XOF)', async () => {
    setCurrency('XOF');
    renderPage();

    const debit = await screen.findByTestId('trial-balance-total-debit');
    // XOF has 0 decimals and places the symbol AFTER the amount.
    expect(debit.textContent).toBe('1,200 CFA');
  });

  it.each([
    ['EUR', '€'],
    ['NGN', '₦'],
    ['GBP', '£'],
  ])('follows the configured symbol for %s', async (code, symbol) => {
    setCurrency(code as keyof typeof CURRENCIES);
    renderPage();

    const debit = await screen.findByTestId('trial-balance-total-debit');
    expect(debit.textContent).toContain(symbol);
  });
});
