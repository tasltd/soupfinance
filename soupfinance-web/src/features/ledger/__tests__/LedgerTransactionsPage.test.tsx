/**
 * Added (SOUPFIN-161): page tests for the Ledger Transactions filters.
 *
 * Only the HTTP client is mocked, so the ledger endpoint module builds the
 * real query string. Account and date filters go to the server; the status
 * filter is applied in the page because the index action does not take one.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LedgerTransactionsPage } from '../LedgerTransactionsPage';
import { moduleDisabled403 } from '../../../test/apiErrorFixtures';

const http = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  interceptors: { request: { use: () => 0 }, response: { use: () => 0 } },
}));

vi.mock('axios', () => {
  const isAxiosError = (v: unknown) =>
    typeof v === 'object' && v !== null && (v as { isAxiosError?: boolean }).isAxiosError === true;
  return { default: { create: () => http, isAxiosError }, isAxiosError };
});

const RAW_ACCOUNTS = [
  { id: 'acc-cash', name: 'Cash', number: '1001', ledgerAccountCategory: { id: 'c1', serialised: 'Cash < ASSET' } },
  { id: 'acc-rent', name: 'Rent Expense', number: '5200', ledgerAccountCategory: { id: 'c2', serialised: 'Rent < EXPENSE' } },
];

const tx = (id: string, state: 'DEBIT' | 'CREDIT', amount: number, status: string, accountId = 'acc-cash') => ({
  id,
  transactionDate: '2026-03-15',
  transactionNumber: `TX-${id}`,
  description: `Line ${id}`,
  amount,
  transactionState: state,
  status,
  ledgerAccount: { id: accountId, code: accountId === 'acc-cash' ? '1001' : '5200', name: accountId === 'acc-cash' ? 'Cash' : 'Rent Expense' },
});

const TRANSACTIONS = [
  tx('t1', 'DEBIT', 1200, 'POSTED', 'acc-rent'),
  tx('t2', 'CREDIT', 1200, 'POSTED'),
  tx('t3', 'DEBIT', 300, 'PENDING', 'acc-rent'),
  tx('t4', 'CREDIT', 300, 'PENDING'),
  tx('t5', 'DEBIT', 50, 'REVERSED', 'acc-rent'),
];

let transactionsResponse: (query: URLSearchParams) => Promise<unknown>;

// The query of every /ledgerTransaction/index.json call, in order.
const txQueries = () =>
  http.get.mock.calls
    .map(([url]) => url as string)
    .filter((url) => url.startsWith('/ledgerTransaction/index.json'))
    .map((url) => new URLSearchParams(url.split('?')[1] ?? ''));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <LedgerTransactionsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  transactionsResponse = () => Promise.resolve({ data: TRANSACTIONS });
  http.get.mockImplementation((url: string) => {
    if (url.startsWith('/ledgerAccount/index.json')) return Promise.resolve({ data: RAW_ACCOUNTS });
    if (url.startsWith('/ledgerTransaction/index.json')) {
      return transactionsResponse(new URLSearchParams(url.split('?')[1] ?? ''));
    }
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
});

describe('LedgerTransactionsPage filters', () => {
  it('first loads the 100 newest transactions with no filter params', async () => {
    renderPage();
    await screen.findByTestId('ledger-table');

    const [first] = txQueries();
    expect(first.get('max')).toBe('100');
    expect(first.get('sort')).toBe('transactionDate');
    expect(first.get('order')).toBe('desc');
    for (const key of ['accountId', 'startDate', 'endDate', 'status']) {
      expect(first.has(key)).toBe(false);
    }
    expect(screen.getByTestId('ledger-summary')).toHaveTextContent('Showing 5 transactions');
    expect(screen.getByTestId('ledger-summary')).not.toHaveTextContent('(filtered)');
    expect(screen.queryByTestId('clear-filters-button')).not.toBeInTheDocument();
  });

  it('lists the accounts in the account filter and sends the chosen accountId', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId('ledger-table');
    await waitFor(() =>
      expect(within(screen.getByTestId('account-filter')).getByRole('option', { name: '5200 - Rent Expense' })).toBeInTheDocument()
    );

    await user.selectOptions(screen.getByTestId('account-filter'), 'acc-rent');

    await waitFor(() => expect(txQueries().at(-1)?.get('accountId')).toBe('acc-rent'));
    expect(screen.getByTestId('clear-filters-button')).toBeInTheDocument();
  });

  it('sends the From and To dates as startDate and endDate', async () => {
    renderPage();
    await screen.findByTestId('ledger-table');

    fireEvent.change(screen.getByTestId('start-date-filter'), { target: { value: '2026-03-01' } });
    fireEvent.change(screen.getByTestId('end-date-filter'), { target: { value: '2026-03-31' } });

    await waitFor(() => {
      const last = txQueries().at(-1)!;
      expect(last.get('startDate')).toBe('2026-03-01');
      expect(last.get('endDate')).toBe('2026-03-31');
    });
    expect(txQueries().at(-1)!.has('accountId')).toBe(false);
  });

  it('filters by status in the page, never sends it to the server, and totals only what is shown', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId('ledger-table');

    await user.selectOptions(screen.getByTestId('status-filter'), 'PENDING');

    expect(screen.getByTestId('ledger-row-t3')).toBeInTheDocument();
    expect(screen.getByTestId('ledger-row-t4')).toBeInTheDocument();
    for (const hidden of ['t1', 't2', 't5']) {
      expect(screen.queryByTestId(`ledger-row-${hidden}`)).not.toBeInTheDocument();
    }
    const summary = screen.getByTestId('ledger-summary');
    expect(summary).toHaveTextContent('Showing 2 transactions (filtered)');
    expect(summary).toHaveTextContent(/Total Debits:\s*\D*300\.00/);
    expect(summary).toHaveTextContent(/Total Credits:\s*\D*300\.00/);
    // Status is applied in the page: no request ever carries it, and any
    // refetch it causes asks the server for exactly the same rows.
    expect(txQueries().every((q) => !q.has('status'))).toBe(true);
    expect(new Set(txQueries().map((q) => q.toString())).size).toBe(1);
  });

  it('says "No matching transactions" when a filter hides every row', async () => {
    transactionsResponse = () => Promise.resolve({ data: TRANSACTIONS.filter((t) => t.status !== 'REVERSED') });
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId('ledger-table');

    await user.selectOptions(screen.getByTestId('status-filter'), 'REVERSED');

    const empty = screen.getByTestId('ledger-empty');
    expect(empty).toHaveTextContent('No matching transactions');
    expect(screen.queryByTestId('create-first-entry-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('ledger-summary')).not.toBeInTheDocument();
  });

  it('Clear resets every filter and reloads without filter params', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId('ledger-table');
    await waitFor(() => expect(within(screen.getByTestId('account-filter')).getAllByRole('option')).toHaveLength(3));

    await user.selectOptions(screen.getByTestId('account-filter'), 'acc-cash');
    fireEvent.change(screen.getByTestId('start-date-filter'), { target: { value: '2026-03-01' } });
    await user.selectOptions(screen.getByTestId('status-filter'), 'POSTED');
    await waitFor(() => expect(txQueries().at(-1)?.get('startDate')).toBe('2026-03-01'));

    await user.click(screen.getByTestId('clear-filters-button'));

    expect(screen.getByTestId('account-filter')).toHaveValue('');
    expect(screen.getByTestId('start-date-filter')).toHaveValue('');
    expect(screen.getByTestId('status-filter')).toHaveValue('');
    expect(screen.queryByTestId('clear-filters-button')).not.toBeInTheDocument();
    expect(await screen.findByTestId('ledger-row-t5')).toBeInTheDocument();
    expect(screen.getByTestId('ledger-summary')).toHaveTextContent('Showing 5 transactions');
  });
});

describe('LedgerTransactionsPage states', () => {
  it('shows the first-entry prompt for a ledger with no transactions (zero)', async () => {
    transactionsResponse = () => Promise.resolve({ data: [] });
    renderPage();

    const empty = await screen.findByTestId('ledger-empty');
    expect(empty).toHaveTextContent('No transactions yet');
    expect(screen.getByTestId('create-first-entry-button')).toHaveAttribute('href', '/accounting/journal-entry/new');
  });

  it('renders 100 seven-figure rows with exact totals (overflow)', async () => {
    transactionsResponse = () =>
      Promise.resolve({
        data: Array.from({ length: 100 }, (_, i) =>
          tx(`big${i}`, i % 2 === 0 ? 'DEBIT' : 'CREDIT', 1234567.89, 'POSTED')
        ),
      });
    renderPage();

    await screen.findByTestId('ledger-table');
    expect(screen.getAllByTestId(/^ledger-row-/)).toHaveLength(100);
    const summary = screen.getByTestId('ledger-summary');
    expect(summary).toHaveTextContent('Showing 100 transactions');
    // 50 x 1,234,567.89 each side
    expect(summary).toHaveTextContent(/Total Debits:\s*\D*61,728,394\.50/);
    expect(summary).toHaveTextContent(/Total Credits:\s*\D*61,728,394\.50/);
  });

  it('shows the module-disabled state on a 403 and does not retry', async () => {
    transactionsResponse = () =>
      Promise.reject(moduleDisabled403('Ledger', '/rest/ledgerTransaction/index.json'));
    renderPage();

    const error = await screen.findByTestId('ledger-error');
    expect(error).toHaveTextContent(/Ledger/i);
    expect(error).not.toHaveTextContent('Request failed with status code');
    expect(txQueries()).toHaveLength(1);
  });
});
