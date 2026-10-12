/**
 * Unit tests for ChartOfAccountsPage grouping (SOUPFIN-148).
 *
 * The page used to render one section per known ledger group and return null
 * for everything else. Accounts with no category serialised, or with a backend
 * group the frontend did not know (SHARES, DIVIDENDS), fell into no section, so
 * a chart made only of them rendered a blank page.
 *
 * The API client is mocked at the HTTP layer so the real listLedgerAccounts and
 * transformLedgerAccount run on backend-shaped rows, end to end.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../../api/client', () => ({
  default: { get: vi.fn() },
  toQueryString: () => '',
  getCsrfToken: vi.fn(),
  csrfQueryString: vi.fn(),
}));

vi.mock('../../../stores', () => ({
  useFormatCurrency: () => (amount: number | null | undefined) => `$${(amount ?? 0).toFixed(2)}`,
}));

vi.mock('../../../utils/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import apiClient from '../../../api/client';
import { logger } from '../../../utils/logger';
import { ChartOfAccountsPage } from '../ChartOfAccountsPage';

// A backend LedgerAccount row: no code, ledgerGroup, isActive or balance.
function rawRow(id: string, name: string, serialised?: string, number?: string) {
  return {
    id,
    name,
    number,
    quickReference: `QR-${id}`,
    ledgerAccountCategory: serialised === undefined
      ? { id: `cat-${id}`, class: 'soupbroker.finance.LedgerAccountCategory' }
      : { id: `cat-${id}`, class: 'soupbroker.finance.LedgerAccountCategory', serialised },
  };
}

function mockRows(rows: unknown[]) {
  (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: rows });
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ChartOfAccountsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('ChartOfAccountsPage grouping (SOUPFIN-148)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders rows for accounts whose category has no serialised string', async () => {
    mockRows([rawRow('a1', 'Suspense Account', undefined, '9000'), rawRow('a2', 'Clearing', undefined, '9010')]);
    renderPage();

    const group = await screen.findByTestId('coa-group-uncategorised');
    expect(within(group).getByText('Uncategorised')).toBeInTheDocument();
    expect(within(group).getByText('2 accounts')).toBeInTheDocument();
    expect(screen.getByTestId('coa-account-a1')).toHaveTextContent('Suspense Account');
    expect(screen.getByTestId('coa-account-a2')).toHaveTextContent('Clearing');
    expect(logger.warn).toHaveBeenCalledWith(
      'Chart of Accounts: unknown ledger account categories',
      '["(no category)"]'
    );
  });

  it('lists SHARES and DIVIDENDS groups under Equity', async () => {
    mockRows([
      rawRow('s1', 'Ordinary Shares', 'Share Capital < SHARES', '3100'),
      rawRow('d1', 'Interim Dividend', 'Dividends Paid < DIVIDENDS', '3200'),
    ]);
    renderPage();

    const equity = await screen.findByTestId('coa-group-equity');
    expect(within(equity).getByText('2 accounts')).toBeInTheDocument();
    expect(within(equity).getByTestId('coa-account-s1')).toHaveTextContent('Ordinary Shares');
    expect(within(equity).getByTestId('coa-account-d1')).toHaveTextContent('Interim Dividend');
    expect(screen.queryByTestId('coa-group-uncategorised')).not.toBeInTheDocument();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('lists INCOME and EXPENSE subgroups nested under EQUITY in their own sections', async () => {
    // Shapes taken from the seed database: ledger_group EQUITY with a subgroup.
    mockRows([
      rawRow('i1', 'Interest Earned', 'Revenue < INCOME < RETAINED_EARNINGS < EQUITY', '4100'),
      rawRow('e1', 'Bank Charges', 'Operating Costs < EXPENSE < RETAINED_EARNINGS < EQUITY', '5100'),
      rawRow('q1', 'Retained Earnings', 'Retained Earnings < RETAINED_EARNINGS < EQUITY', '3300'),
    ]);
    renderPage();

    expect(within(await screen.findByTestId('coa-group-income')).getByTestId('coa-account-i1')).toBeInTheDocument();
    expect(within(screen.getByTestId('coa-group-expense')).getByTestId('coa-account-e1')).toBeInTheDocument();
    const equity = screen.getByTestId('coa-group-equity');
    expect(within(equity).getByTestId('coa-account-q1')).toBeInTheDocument();
    expect(within(equity).queryByTestId('coa-account-i1')).not.toBeInTheDocument();
  });

  it('keeps known groups and puts only the leftovers in Uncategorised, logging each unknown category once', async () => {
    mockRows([
      rawRow('c1', 'Cash', 'Cash and Bank < ASSET', '1000'),
      rawRow('u1', 'Mystery A', 'Odd Category < SOMETHING_NEW', '9100'),
      rawRow('u2', 'Mystery B', 'Odd Category < SOMETHING_NEW', '9200'),
    ]);
    renderPage();

    expect(within(await screen.findByTestId('coa-group-asset')).getByTestId('coa-account-c1')).toBeInTheDocument();
    const uncategorised = screen.getByTestId('coa-group-uncategorised');
    expect(within(uncategorised).getByText('2 accounts')).toBeInTheDocument();
    expect(within(uncategorised).queryByTestId('coa-account-c1')).not.toBeInTheDocument();
    // Uncategorised is the last section on the page.
    const sections = screen.getByTestId('coa-groups').children;
    expect(sections[sections.length - 1]).toBe(uncategorised);
    expect(logger.warn).toHaveBeenCalledWith(
      'Chart of Accounts: unknown ledger account categories',
      '["Odd Category < SOMETHING_NEW"]'
    );
  });

  it('renders every row when the chart is large and wholly uncategorised', async () => {
    const rows = Array.from({ length: 500 }, (_, i) => rawRow(`x${i}`, `Account ${i}`, undefined, String(10000 + i)));
    mockRows(rows);
    renderPage();

    const group = await screen.findByTestId('coa-group-uncategorised');
    expect(within(group).getByText('500 accounts')).toBeInTheDocument();
    expect(within(group).getAllByTestId(/^coa-account-/)).toHaveLength(500);
  });

  it('still shows the empty state when there are no accounts at all', async () => {
    mockRows([]);
    renderPage();

    expect(await screen.findByTestId('coa-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('coa-groups')).not.toBeInTheDocument();
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
