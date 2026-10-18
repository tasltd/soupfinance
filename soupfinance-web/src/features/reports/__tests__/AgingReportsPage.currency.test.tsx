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

// Changed (SOUPFIN-281): the page reads open documents through api/endpoints/aging (SOUPFIN-105),
// not the backend aging report, so the tests give it bills and invoices instead of a report.
vi.mock('../../../api/endpoints/aging', async () => {
  const actual =
    await vi.importActual<typeof import('../../../api/endpoints/aging')>(
      '../../../api/endpoints/aging'
    );
  return {
    ...actual,
    fetchReceivablesSource: vi.fn(),
    fetchPayablesSource: vi.fn(),
    fetchClientIdsByAccountServices: vi.fn(),
    fetchControlAccountSource: vi.fn(),
  };
});

import {
  fetchReceivablesSource,
  fetchPayablesSource,
  fetchClientIdsByAccountServices,
  fetchControlAccountSource,
} from '../../../api/endpoints/aging';
import { AgingReportsPage } from '../AgingReportsPage';
import { NO_CONTROL_ACCOUNTS, openBill, openInvoice, payables, receivables } from './agingTestSource';

/** One vendor: 1,234.50 not yet due and 500 more than 90 days overdue, 1,734.50 in all. */
const apOwing = () => payables([openBill('Acme Supplies', 1234.5, 10), openBill('Acme Supplies', 500, -120)]);
const arOwing = () => receivables([openInvoice('Acme Corp', 1234.5, 10), openInvoice('Acme Corp', 500, -120)]);

function mockSources(ar = receivables(), ap = apOwing()) {
  vi.mocked(fetchReceivablesSource).mockResolvedValue(ar);
  vi.mocked(fetchPayablesSource).mockResolvedValue(ap);
  vi.mocked(fetchClientIdsByAccountServices).mockResolvedValue({});
  vi.mocked(fetchControlAccountSource).mockResolvedValue(NO_CONTROL_ACCOUNTS as never);
}

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
    mockSources();
  });

  afterEach(() => {
    useAccountStore.setState({ currencyConfig: CURRENCIES.DEFAULT });
  });

  // Changed (SOUPFIN-281): a document with nothing owed is no longer listed (SOUPFIN-105), so the
  // zero cells of a row with a balance carry the original '$0.00' check.
  it('renders GH₵ (not $) for the zero cells of an A/P row when the account currency is GHS', async () => {
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
    renderPage();

    const table = await screen.findByTestId('ap-aging-table');
    const row = within(table).getByTestId('ap-aging-row-0');

    expect(row.textContent).toContain('GH₵1,234.50');
    expect(row.textContent).toContain('GH₵1,734.50');
    expect(row.textContent).not.toContain('$');
  });

  it('applies the same currency to the A/R table (both sides stay consistent)', async () => {
    setCurrency('GHS');
    mockSources(arOwing());
    renderPage();

    const table = await screen.findByTestId('ar-aging-table');
    expect(table.textContent).toContain('GH₵');
    expect(table.textContent).not.toContain('$');
  });

  it('uses the account currency in the summary cards above the tables', async () => {
    setCurrency('GHS');
    renderPage();

    await screen.findByTestId('ap-aging-table');
    // The "Total Payables" / "over 90 days" cards used the same broken helper.
    expect(document.body.textContent).toContain('GH₵1,734.50');
    expect(document.body.textContent).not.toContain('$1,734.50');
  });

  it('still renders $ when the account currency IS USD (no over-correction)', async () => {
    setCurrency('USD');
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
    renderPage();

    const table = await screen.findByTestId('ap-aging-table');
    expect(table.textContent).toContain(symbol);
  });
});

describe('AgingReportsPage — as-of date picker a11y (SOUPFIN-33 #6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSources(receivables(), payables());
  });

  it('binds the "As of:" label to the date input and exposes id/name', async () => {
    renderPage();

    const input = (await screen.findByTestId('aging-reports-date-picker')) as HTMLInputElement;
    expect(input.id).toBe('aging-as-of-date');
    expect(input.name).toBe('aging-as-of-date');
    expect(screen.getByLabelText('Aging reports as-of date')).toBe(input);
  });
});
