/**
 * Unit tests for Cash Flow Statement currency formatting (SOUPFIN-67).
 *
 * Reported symptom: every figure on /reports/cash-flow rendered with a "$",
 * regardless of the tenant's configured currency. A GHS tenant read its own cedi
 * amounts labelled as dollars — the same figure showed GH₵1,200.00 on the
 * dashboard and $1,200.00 on Cash Flow.
 *
 * Root cause: CashFlowPage declared its own module-level
 *   const currencyFormatter = new Intl.NumberFormat('en-US', { currency: 'USD' })
 * and routed all eleven amount call sites through it — the three KPI tiles, the
 * per-section totals, every activity row, and the whole summary block — so the
 * account store's currency config was never consulted.
 *
 * These tests drive the real account store (no formatter mock) so they assert the
 * rendered output actually follows the tenant currency across every surface of
 * the page, and cover a zero-decimal / symbol-after currency plus the zero and
 * large-value ends.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useAccountStore, CURRENCIES } from '../../../stores/accountStore';
import type { CashFlowStatement } from '../../../types';

vi.mock('../../../api/endpoints/reports', async () => {
  const actual =
    await vi.importActual<typeof import('../../../api/endpoints/reports')>(
      '../../../api/endpoints/reports'
    );
  return {
    ...actual,
    getCashFlowStatement: vi.fn(),
  };
});

import { getCashFlowStatement } from '../../../api/endpoints/reports';
import { CashFlowPage } from '../CashFlowPage';

const REPORT: CashFlowStatement = {
  periodStart: '2026-09-01',
  periodEnd: '2026-09-30',
  operatingActivities: [
    { description: 'Cash received from customers', amount: 8500.25 },
    { description: 'Rent paid', amount: -1200 },
  ],
  totalOperatingCashFlow: 7300.25,
  investingActivities: [{ description: 'Equipment purchase', amount: -2500.5 }],
  totalInvestingCashFlow: -2500.5,
  financingActivities: [{ description: 'Owner contribution', amount: 1000 }],
  totalFinancingCashFlow: 1000,
  netCashFlow: 5799.75,
  beginningCashBalance: 12000,
  endingCashBalance: 17799.75,
};

/** Every figure zero — the "nothing happened this period" end of the range. */
const ZERO_REPORT: CashFlowStatement = {
  periodStart: '2026-09-01',
  periodEnd: '2026-09-30',
  operatingActivities: [{ description: 'No movement', amount: 0 }],
  totalOperatingCashFlow: 0,
  investingActivities: [],
  totalInvestingCashFlow: 0,
  financingActivities: [],
  totalFinancingCashFlow: 0,
  netCashFlow: 0,
  beginningCashBalance: 0,
  endingCashBalance: 0,
};

/** Seven-figure balances — the overflow end, where separators matter. */
const LARGE_REPORT: CashFlowStatement = {
  ...REPORT,
  operatingActivities: [{ description: 'Bulk settlement', amount: 9876543.21 }],
  totalOperatingCashFlow: 9876543.21,
  netCashFlow: 9876543.21,
  beginningCashBalance: 1234567.89,
  endingCashBalance: 11111111.1,
};

function setCurrency(code: keyof typeof CURRENCIES) {
  useAccountStore.setState({ currencyConfig: CURRENCIES[code] });
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CashFlowPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('CashFlowPage — amounts use the account currency (SOUPFIN-67)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCashFlowStatement).mockResolvedValue(REPORT);
  });

  afterEach(() => {
    useAccountStore.setState({ currencyConfig: CURRENCIES.DEFAULT });
  });

  it('renders the three KPI tiles in the account currency, not USD', async () => {
    setCurrency('GHS');
    renderPage();

    const stats = await screen.findByTestId('cash-flow-stats');

    expect(within(stats).getByTestId('cash-flow-beginning-balance').textContent).toBe('GH₵12,000.00');
    expect(within(stats).getByTestId('cash-flow-net').textContent).toBe('GH₵5,799.75');
    expect(within(stats).getByTestId('cash-flow-ending-balance').textContent).toBe('GH₵17,799.75');
    expect(stats.textContent).not.toContain('$');
  });

  it('renders every section total in the account currency', async () => {
    setCurrency('GHS');
    renderPage();

    await screen.findByTestId('cash-flow-sections');

    // The `+` prefix on non-negative totals must survive the formatter swap.
    expect(screen.getByTestId('cash-flow-operating-total').textContent).toContain('+GH₵7,300.25');
    expect(screen.getByTestId('cash-flow-financing-total').textContent).toContain('+GH₵1,000.00');

    const investing = screen.getByTestId('cash-flow-investing-total');
    expect(investing.textContent).toContain('GH₵');
    expect(investing.textContent).toContain('2,500.50');
    // A negative total must NOT pick up the inflow `+`.
    expect(investing.textContent).not.toContain('+');

    expect(screen.getByTestId('cash-flow-sections').textContent).not.toContain('$');
  });

  it('renders every activity row in the account currency, keeping the inflow "+"', async () => {
    setCurrency('GHS');
    renderPage();

    await screen.findByTestId('cash-flow-sections');

    const inflow = screen.getByTestId('operating-activity-0');
    expect(inflow.textContent).toContain('+GH₵8,500.25');

    const outflow = screen.getByTestId('operating-activity-1');
    // Sign placement itself is SOUPFIN-59's concern and lives in the account
    // store; here we only assert the row goes through the store at all.
    expect(outflow.textContent).toContain('GH₵');
    expect(outflow.textContent).toContain('1,200.00');
    expect(outflow.textContent).not.toContain('+');
    expect(outflow.textContent).not.toContain('$');
  });

  it('renders the whole summary block in the account currency', async () => {
    setCurrency('GHS');
    renderPage();

    const summary = await screen.findByTestId('cash-flow-summary');

    expect(summary.textContent).toContain('GH₵12,000.00'); // beginning
    expect(summary.textContent).toContain('+GH₵7,300.25'); // operating
    expect(summary.textContent).toContain('+GH₵1,000.00'); // financing
    expect(summary.textContent).toContain('+GH₵5,799.75'); // net
    expect(summary.textContent).toContain('GH₵17,799.75'); // ending
    expect(summary.textContent).not.toContain('$');
  });

  it('leaves no "$" anywhere on the page for a GHS tenant', async () => {
    setCurrency('GHS');
    renderPage();

    const page = await screen.findByTestId('cash-flow-page');
    expect(page.textContent).not.toContain('$');
  });

  it('still renders $ when the account currency IS USD (no over-correction)', async () => {
    setCurrency('USD');
    renderPage();

    const stats = await screen.findByTestId('cash-flow-stats');
    expect(within(stats).getByTestId('cash-flow-net').textContent).toBe('$5,799.75');
    expect(stats.textContent).not.toContain('GH₵');
  });

  it('honours a zero-decimal, symbol-after currency (XOF) on every surface', async () => {
    setCurrency('XOF');
    renderPage();

    const stats = await screen.findByTestId('cash-flow-stats');
    // decimals: 0 and symbolPosition: 'after' — the hardcoded formatter could
    // express neither.
    expect(within(stats).getByTestId('cash-flow-beginning-balance').textContent).toBe('12,000 CFA');
    expect(within(stats).getByTestId('cash-flow-net').textContent).toBe('5,800 CFA');

    expect(screen.getByTestId('cash-flow-operating-total').textContent).toContain('+7,300 CFA');
    expect(screen.getByTestId('operating-activity-0').textContent).toContain('+8,500 CFA');
    expect(screen.getByTestId('cash-flow-page').textContent).not.toContain('$');
  });

  it('formats an all-zero report with the account symbol (zero end)', async () => {
    setCurrency('GHS');
    vi.mocked(getCashFlowStatement).mockResolvedValue(ZERO_REPORT);
    renderPage();

    const stats = await screen.findByTestId('cash-flow-stats');
    expect(within(stats).getByTestId('cash-flow-beginning-balance').textContent).toBe('GH₵0.00');
    expect(within(stats).getByTestId('cash-flow-net').textContent).toBe('GH₵0.00');
    expect(screen.getByTestId('operating-activity-0').textContent).toContain('+GH₵0.00');
    expect(screen.getByTestId('cash-flow-page').textContent).not.toContain('$');
  });

  it('keeps thousands separators on seven-figure balances (overflow end)', async () => {
    setCurrency('GHS');
    vi.mocked(getCashFlowStatement).mockResolvedValue(LARGE_REPORT);
    renderPage();

    const stats = await screen.findByTestId('cash-flow-stats');
    expect(within(stats).getByTestId('cash-flow-beginning-balance').textContent).toBe('GH₵1,234,567.89');
    expect(within(stats).getByTestId('cash-flow-ending-balance').textContent).toBe('GH₵11,111,111.10');
    expect(screen.getByTestId('operating-activity-0').textContent).toContain('+GH₵9,876,543.21');
  });

  it.each([
    ['EUR', '€'],
    ['NGN', '₦'],
    ['GBP', '£'],
    ['KES', 'KSh'],
  ])('follows the configured symbol for %s', async (code, symbol) => {
    setCurrency(code as keyof typeof CURRENCIES);
    renderPage();

    const stats = await screen.findByTestId('cash-flow-stats');
    expect(within(stats).getByTestId('cash-flow-net').textContent).toContain(symbol);
  });
});
