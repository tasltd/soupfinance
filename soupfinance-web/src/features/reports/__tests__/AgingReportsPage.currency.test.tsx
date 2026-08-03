/**
 * Unit tests for Aging Reports currency formatting (SOUPFIN-33 #4).
 *
 * Reported symptom on app.soupfinance.com/reports/aging: the whole A/P aging table
 * (and its totals row) rendered "$0.00" — US dollars — even though the account's
 * default currency is GHS and every other report on the site renders "GH₵".
 *
 * Root cause: AgingReportsPage declared its own module-level
 *   formatCurrency(amount, currency = 'USD')
 * which short-circuited zero to the literal '$0.00' and otherwise ran
 * Intl.NumberFormat('en-US', { currency: 'USD' }) — ignoring the account store's
 * configured currency entirely.
 *
 * These tests drive the real account store (no formatter mock) so they assert the
 * rendered output actually follows the tenant currency, and cover the zero case that
 * the hardcoded '$0.00' short-circuit hid.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useAccountStore, CURRENCIES } from '../../../stores/accountStore';
import type { AgingReport } from '../../../types';

vi.mock('../../../api/endpoints/reports', async () => {
  const actual =
    await vi.importActual<typeof import('../../../api/endpoints/reports')>(
      '../../../api/endpoints/reports'
    );
  return {
    ...actual,
    getARAgingReport: vi.fn(),
    getAPAgingReport: vi.fn(),
    exportFinanceReport: vi.fn(),
  };
});

import { getARAgingReport, getAPAgingReport } from '../../../api/endpoints/reports';
import { AgingReportsPage } from '../AgingReportsPage';

const ZERO_TOTALS = { current: 0, days30: 0, days60: 0, days90: 0, over90: 0, total: 0 };

/** An A/P report with a single all-zero vendor row — the exact reported scenario. */
const AP_ZERO_REPORT: AgingReport = {
  asOf: '2026-08-03',
  items: [{ entity: { id: 'v1', name: 'V19 Test Vendor' }, ...ZERO_TOTALS }],
  totals: { ...ZERO_TOTALS },
};

const AP_NONZERO_REPORT: AgingReport = {
  asOf: '2026-08-03',
  items: [
    {
      entity: { id: 'v2', name: 'Acme Supplies' },
      current: 1234.5,
      days30: 0,
      days60: 0,
      days90: 0,
      over90: 500,
      total: 1734.5,
    },
  ],
  totals: { current: 1234.5, days30: 0, days60: 0, days90: 0, over90: 500, total: 1734.5 },
};

const EMPTY_REPORT: AgingReport = { asOf: '2026-08-03', items: [], totals: { ...ZERO_TOTALS } };

function setCurrency(code: keyof typeof CURRENCIES) {
  useAccountStore.setState({ currencyConfig: CURRENCIES[code] });
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AgingReportsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('AgingReportsPage — A/P amounts use the account currency (SOUPFIN-33 #4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getARAgingReport).mockResolvedValue(EMPTY_REPORT);
    vi.mocked(getAPAgingReport).mockResolvedValue(AP_ZERO_REPORT);
  });

  afterEach(() => {
    useAccountStore.setState({ currencyConfig: CURRENCIES.DEFAULT });
  });

  it('renders GH₵ (not $) for an all-zero A/P row when the account currency is GHS', async () => {
    setCurrency('GHS');
    renderPage();

    const table = await screen.findByTestId('ap-aging-table');
    const text = table.textContent ?? '';

    // The exact defect: the hardcoded '$0.00' zero short-circuit.
    expect(text).not.toContain('$0.00');
    expect(text).not.toContain('$');
    expect(text).toContain('GH₵0.00');
  });

  it('renders GH₵ in the A/P totals row too', async () => {
    setCurrency('GHS');
    renderPage();

    const totals = await screen.findByTestId('ap-aging-totals');
    expect(totals.textContent).toContain('GH₵');
    expect(totals.textContent).not.toContain('$');
  });

  it('formats NON-zero A/P amounts with the account symbol and thousands separators', async () => {
    setCurrency('GHS');
    vi.mocked(getAPAgingReport).mockResolvedValue(AP_NONZERO_REPORT);
    renderPage();

    const table = await screen.findByTestId('ap-aging-table');
    const row = within(table).getByTestId('ap-aging-row-0');

    expect(row.textContent).toContain('GH₵1,234.50');
    expect(row.textContent).toContain('GH₵1,734.50');
    expect(row.textContent).not.toContain('$');
  });

  it('applies the same currency to the A/R table (both sides stay consistent)', async () => {
    setCurrency('GHS');
    vi.mocked(getARAgingReport).mockResolvedValue(AP_NONZERO_REPORT);
    renderPage();

    const table = await screen.findByTestId('ar-aging-table');
    expect(table.textContent).toContain('GH₵');
    expect(table.textContent).not.toContain('$');
  });

  it('uses the account currency in the summary cards above the tables', async () => {
    setCurrency('GHS');
    vi.mocked(getAPAgingReport).mockResolvedValue(AP_NONZERO_REPORT);
    renderPage();

    await screen.findByTestId('ap-aging-table');
    // The "Total Payables" / "over 90 days" cards used the same broken helper.
    expect(document.body.textContent).toContain('GH₵1,734.50');
    expect(document.body.textContent).not.toContain('$1,734.50');
  });

  it('still renders $ when the account currency IS USD (no over-correction)', async () => {
    setCurrency('USD');
    vi.mocked(getAPAgingReport).mockResolvedValue(AP_NONZERO_REPORT);
    renderPage();

    const table = await screen.findByTestId('ap-aging-table');
    expect(table.textContent).toContain('$1,234.50');
    expect(table.textContent).not.toContain('GH₵');
  });

  it.each([
    ['EUR', '€'],
    ['NGN', '₦'],
    ['GBP', '£'],
  ])('follows the configured symbol for %s', async (code, symbol) => {
    setCurrency(code as keyof typeof CURRENCIES);
    vi.mocked(getAPAgingReport).mockResolvedValue(AP_NONZERO_REPORT);
    renderPage();

    const table = await screen.findByTestId('ap-aging-table');
    expect(table.textContent).toContain(symbol);
  });
});

describe('AgingReportsPage — as-of date picker a11y (SOUPFIN-33 #6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getARAgingReport).mockResolvedValue(EMPTY_REPORT);
    vi.mocked(getAPAgingReport).mockResolvedValue(EMPTY_REPORT);
  });

  it('binds the "As of:" label to the date input and exposes id/name', async () => {
    renderPage();

    const input = (await screen.findByTestId('aging-reports-date-picker')) as HTMLInputElement;
    expect(input.id).toBe('aging-as-of-date');
    expect(input.name).toBe('aging-as-of-date');
    expect(screen.getByLabelText('Aging reports as-of date')).toBe(input);
  });
});
