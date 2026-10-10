/**
 * SOUPFIN-103 acceptance: "A new report is a registry entry plus at most a
 * column definition."
 *
 * These tests render registry-only reports through the generic page with the
 * HTTP client mocked at its edge, so the round trip covers the request URL,
 * the row extraction, the tenant-currency formatting and the totals row.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import apiClient from '../../../api/client';
import { CURRENCIES, useAccountStore } from '../../../stores';
import { RegistryReportPage } from '../RegistryReportPage';
import { REPORTS, type ReportDefinition } from '../reportRegistry';

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

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-08-15T12:00:00Z'));
  useAccountStore.setState({ currencyConfig: CURRENCIES.GHS });
});

afterEach(() => {
  vi.useRealTimers();
  useAccountStore.getState().reset();
});

describe('Account Balances: a report that is only a registry entry', () => {
  it('requests the month, flattens the grouped accounts and totals them in the tenant currency', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        resultList: {
          ASSET: {
            accountList: [
              { id: 'a1', name: 'Cash at bank', startingBalance: 1_000_000, calculatedDebitBalance: 250_000, calculatedCreditBalance: 50_000, netMovement: 200_000, endingBalance: 1_200_000 },
            ],
          },
          LIABILITY: {
            accountList: [
              { id: 'l1', name: 'Supplier loan', startingBalance: -300_000, calculatedDebitBalance: 0, calculatedCreditBalance: 20_000, netMovement: -20_000, endingBalance: -320_000 },
            ],
          },
        },
      },
    });

    renderAt('/reports/view/account-balances');

    const table = await screen.findByTestId('account-balances-table');
    expect(apiClient.get).toHaveBeenCalledWith(
      expect.stringMatching(/^\/financeReports\/accountBalances\.json\?.*from=2026-08-01.*to=2026-08-31/)
    );
    expect(screen.getByTestId('account-balances-heading')).toHaveTextContent('Account Balances');

    const first = screen.getByTestId('account-balances-row-0');
    expect(within(first).getByText('Cash at bank')).toBeVisible();
    expect(within(first).getByText('Assets')).toBeVisible();
    expect(within(first).getByText('GH₵1,200,000.00')).toBeVisible();
    // The minus sign sits before the symbol (SOUPFIN-59).
    expect(within(screen.getByTestId('account-balances-row-1')).getByText('-GH₵320,000.00')).toBeVisible();

    const totals = screen.getByTestId('account-balances-totals');
    expect(within(totals).getByText('Total')).toBeVisible();
    expect(within(totals).getByText('GH₵880,000.00')).toBeVisible();
    expect(table.textContent).not.toContain('$');
  });

  it('shows the empty state for a response with no accounts', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { resultList: {} } });
    renderAt('/reports/view/account-balances');
    expect(await screen.findByTestId('account-balances-empty')).toHaveTextContent('Nothing to show');
  });

  it('shows the error, not an empty table, when the request fails', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('Request failed with status code 500'));
    renderAt('/reports/view/account-balances');
    expect(await screen.findByTestId('account-balances-error')).toHaveTextContent(
      'Request failed with status code 500'
    );
    expect(screen.queryByTestId('account-balances-empty')).not.toBeInTheDocument();
  });

  it('renders a thousand rows and totals them', async () => {
    const accountList = Array.from({ length: 1000 }, (_, i) => ({
      id: `a${i}`,
      name: `Account ${i}`,
      startingBalance: 0,
      calculatedDebitBalance: 1_000_000,
      calculatedCreditBalance: 0,
      netMovement: 1_000_000,
      endingBalance: 1_000_000,
    }));
    vi.mocked(apiClient.get).mockResolvedValue({ data: { resultList: { ASSET: { accountList } } } });
    renderAt('/reports/view/account-balances');

    await screen.findByTestId('account-balances-table');
    expect(screen.getByTestId('account-balances-row-999')).toBeInTheDocument();
    expect(within(screen.getByTestId('account-balances-totals')).getAllByText('GH₵1,000,000,000.00')).toHaveLength(3);
    // Fix (SOUPFIN-104): a thousand rows take ~4 s in jsdom on their own and
    // passed the 5 s default only when the suite was idle.
  }, 15_000);
});

describe('adding a report', () => {
  const NEW_REPORT: ReportDefinition = {
    id: 'test-sales-by-customer',
    title: 'Sales by Customer',
    description: 'Invoiced amounts per customer',
    icon: 'groups',
    category: 'who-owes-you',
    path: '/reports/view/test-sales-by-customer',
    page: {
      title: 'Sales by Customer',
      testIdPrefix: 'sales-by-customer',
      helpSection: 'reports',
      dateMode: 'range',
      defaultRange: 'monthToDate',
      comparison: false,
      classLocation: false,
    },
    export: { backendType: 'accountTransactions', fileStem: 'sales-by-customer' },
    source: { endpoint: '/financeReports/salesByCustomer.json', rows: 'array' },
    columns: [
      { key: 'customer', header: 'Customer', type: 'text' },
      { key: 'invoices', header: 'Invoices', type: 'number' },
      { key: 'amount', header: 'Amount', type: 'currency' },
    ],
  };

  beforeEach(() => {
    REPORTS.push(NEW_REPORT);
  });
  afterEach(() => {
    REPORTS.splice(REPORTS.indexOf(NEW_REPORT), 1);
  });

  it('needs nothing but the registry entry to render, with dates, currency and export', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: [
        { customer: 'Akosua Ltd', invoices: 3, amount: 45_000 },
        { customer: 'Kofi & Sons', invoices: 1, amount: 5_000 },
      ],
    });

    renderAt('/reports/view/test-sales-by-customer');

    await screen.findByTestId('sales-by-customer-table');
    expect(apiClient.get).toHaveBeenCalledWith(
      expect.stringMatching(/^\/financeReports\/salesByCustomer\.json\?.*from=2026-08-01.*to=2026-08-15/)
    );
    expect(screen.getByTestId('sales-by-customer-heading')).toHaveTextContent('Sales by Customer');
    expect(screen.getByTestId('sales-by-customer-from-date')).toHaveValue('2026-08-01');
    expect(screen.getByTestId('sales-by-customer-currency')).toHaveTextContent('GHS');
    expect(screen.getByTestId('sales-by-customer-export-pdf')).toBeEnabled();
    const totals = screen.getByTestId('sales-by-customer-totals');
    expect(within(totals).getByText('4')).toBeVisible();
    expect(within(totals).getByText('GH₵50,000.00')).toBeVisible();
  });
});

describe('routing', () => {
  it('sends an unknown report id back to the hub', async () => {
    renderAt('/reports/view/does-not-exist');
    expect(await screen.findByTestId('hub')).toBeVisible();
  });

  it('sends a report that has its own page back to the hub rather than a blank table', async () => {
    renderAt('/reports/view/profit-loss');
    await waitFor(() => expect(screen.getByTestId('hub')).toBeVisible());
    expect(apiClient.get).not.toHaveBeenCalled();
  });
});
