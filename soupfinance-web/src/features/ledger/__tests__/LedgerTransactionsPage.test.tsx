/**
 * Added (SOUPFIN-161): page tests for the Ledger Transactions filters.
 *
 * Only the HTTP client is mocked, so the ledger endpoint module builds the
 * real query string. Account and date filters go to the server; the status
 * filter is applied in the page because the index action does not take one.
 *
 * Changed (SOUPFIN-163): the backend reads `ledgerAccount`, `from` and `to`
 * (verified on LXC; the old `accountId`/`startDate`/`endDate` were ignored).
 * The page now pages on the server (max/offset, total from the rows'
 * `totalCount`) and exports every filtered row to CSV.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LedgerTransactionsPage } from '../LedgerTransactionsPage';
import { moduleDisabled403 } from '../../../test/apiErrorFixtures';
import { ToastProvider } from '../../../components/feedback';

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
      <ToastProvider>
        <MemoryRouter>
          <LedgerTransactionsPage />
        </MemoryRouter>
      </ToastProvider>
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
  it('first loads the 50 newest transactions from offset 0 with no filter params', async () => {
    renderPage();
    await screen.findByTestId('ledger-table');

    const [first] = txQueries();
    expect(first.get('max')).toBe('50');
    expect(first.get('offset')).toBe('0');
    expect(first.get('sort')).toBe('transactionDate');
    expect(first.get('order')).toBe('desc');
    for (const key of ['ledgerAccount', 'from', 'to', 'status', 'accountId', 'startDate', 'endDate']) {
      expect(first.has(key)).toBe(false);
    }
    expect(screen.getByTestId('ledger-summary')).toHaveTextContent('Showing 5 transactions');
    expect(screen.getByTestId('ledger-summary')).not.toHaveTextContent('(filtered)');
    expect(screen.queryByTestId('clear-filters-button')).not.toBeInTheDocument();
  });

  it('lists the accounts in the account filter and sends the chosen account as ledgerAccount', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId('ledger-table');
    await waitFor(() =>
      expect(within(screen.getByTestId('account-filter')).getByRole('option', { name: '5200 - Rent Expense' })).toBeInTheDocument()
    );

    await user.selectOptions(screen.getByTestId('account-filter'), 'acc-rent');

    await waitFor(() => expect(txQueries().at(-1)?.get('ledgerAccount')).toBe('acc-rent'));
    expect(txQueries().at(-1)!.has('accountId')).toBe(false);
    expect(screen.getByTestId('clear-filters-button')).toBeInTheDocument();
  });

  it('sends the From and To dates as from and to', async () => {
    renderPage();
    await screen.findByTestId('ledger-table');

    fireEvent.change(screen.getByTestId('start-date-filter'), { target: { value: '2026-03-01' } });
    fireEvent.change(screen.getByTestId('end-date-filter'), { target: { value: '2026-03-31' } });

    await waitFor(() => {
      const last = txQueries().at(-1)!;
      expect(last.get('from')).toBe('2026-03-01');
      expect(last.get('to')).toBe('2026-03-31');
    });
    expect(txQueries().at(-1)!.has('ledgerAccount')).toBe(false);
    expect(txQueries().at(-1)!.has('startDate')).toBe(false);
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
    await waitFor(() => expect(txQueries().at(-1)?.get('from')).toBe('2026-03-01'));

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

  it('renders a full page of seven-figure rows with exact totals (overflow)', async () => {
    transactionsResponse = () =>
      Promise.resolve({
        data: Array.from({ length: 50 }, (_, i) =>
          ({ ...tx(`big${i}`, i % 2 === 0 ? 'DEBIT' : 'CREDIT', 1234567.89, 'POSTED'), totalCount: 50 })
        ),
      });
    renderPage();

    await screen.findByTestId('ledger-table');
    expect(screen.getAllByTestId(/^ledger-row-/)).toHaveLength(50);
    const summary = screen.getByTestId('ledger-summary');
    expect(summary).toHaveTextContent('Showing 50 transactions');
    // 25 x 1,234,567.89 each side
    expect(summary).toHaveTextContent(/Total Debits:\s*\D*30,864,197\.25/);
    expect(summary).toHaveTextContent(/Total Credits:\s*\D*30,864,197\.25/);
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

// Added (SOUPFIN-163): a fake index action holding `count` rows that honours
// max/offset and stamps totalCount on every row, as the Grails backend does.
function serveLedger(count: number, make = (i: number) => tx(`p${i}`, i % 2 === 0 ? 'DEBIT' : 'CREDIT', 10, i % 3 === 0 ? 'PENDING' : 'POSTED')) {
  const all = Array.from({ length: count }, (_, i) => ({ ...make(i), totalCount: count }));
  transactionsResponse = (q) => {
    const max = Number(q.get('max') ?? 10);
    const offset = Number(q.get('offset') ?? 0);
    return Promise.resolve({ data: all.slice(offset, offset + max) });
  };
  return all;
}

describe('LedgerTransactionsPage server paging (SOUPFIN-163)', () => {
  it('shows the server total and pages forward with offset', async () => {
    serveLedger(120);
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId('ledger-row-p0');

    expect(screen.getByTestId('ledger-pagination-range')).toHaveTextContent('Rows 1–50 of 120');
    expect(screen.getByTestId('ledger-page-indicator')).toHaveTextContent('Page 1 of 3');
    expect(screen.getByTestId('ledger-pagination-prev')).toBeDisabled();
    // More pages exist, so the totals are labelled as this page's
    expect(screen.getByTestId('ledger-summary')).toHaveTextContent('Debits on this page');

    await user.click(screen.getByTestId('ledger-pagination-next'));
    expect(await screen.findByTestId('ledger-row-p50')).toBeInTheDocument();
    expect(screen.queryByTestId('ledger-row-p0')).not.toBeInTheDocument();
    expect(txQueries().at(-1)!.get('offset')).toBe('50');
    expect(screen.getByTestId('ledger-pagination-range')).toHaveTextContent('Rows 51–100 of 120');

    await user.click(screen.getByTestId('ledger-pagination-next'));
    expect(await screen.findByTestId('ledger-row-p119')).toBeInTheDocument();
    expect(txQueries().at(-1)!.get('offset')).toBe('100');
    expect(screen.getByTestId('ledger-pagination-range')).toHaveTextContent('Rows 101–120 of 120');
    expect(screen.getByTestId('ledger-page-indicator')).toHaveTextContent('Page 3 of 3');
    expect(screen.getByTestId('ledger-pagination-next')).toBeDisabled();

    await user.click(screen.getByTestId('ledger-pagination-prev'));
    expect(await screen.findByTestId('ledger-row-p50')).toBeInTheDocument();
  });

  it('changing the page size or a filter goes back to the first page', async () => {
    serveLedger(120);
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId('ledger-row-p0');
    await user.click(screen.getByTestId('ledger-pagination-next'));
    await screen.findByTestId('ledger-row-p50');

    await user.selectOptions(screen.getByTestId('ledger-page-size'), '25');
    await waitFor(() => {
      const last = txQueries().at(-1)!;
      expect(last.get('max')).toBe('25');
      expect(last.get('offset')).toBe('0');
    });
    expect(await screen.findByTestId('ledger-row-p0')).toBeInTheDocument();
    expect(screen.getByTestId('ledger-page-indicator')).toHaveTextContent('Page 1 of 5');

    await user.click(screen.getByTestId('ledger-pagination-next'));
    await screen.findByTestId('ledger-row-p25');
    fireEvent.change(screen.getByTestId('start-date-filter'), { target: { value: '2026-03-01' } });
    await waitFor(() => {
      const last = txQueries().at(-1)!;
      expect(last.get('from')).toBe('2026-03-01');
      expect(last.get('offset')).toBe('0');
    });
  });

  it('has no pager and no second page for a list that fits on one page', async () => {
    renderPage();
    await screen.findByTestId('ledger-table');
    // The fixture rows carry no totalCount: a short page means no next page
    expect(screen.getByTestId('ledger-pagination-next')).toBeDisabled();
    expect(screen.getByTestId('ledger-pagination-range')).toHaveTextContent('Rows 1–5');
  });

  it('pages through a ledger of 67,335 rows without loading them (overflow)', async () => {
    serveLedger(67_335);
    renderPage();
    await screen.findByTestId('ledger-row-p0');
    expect(screen.getByTestId('ledger-pagination-range')).toHaveTextContent('Rows 1–50 of 67,335');
    expect(screen.getByTestId('ledger-page-indicator')).toHaveTextContent('Page 1 of 1,347');
    expect(screen.getAllByTestId(/^ledger-row-/)).toHaveLength(50);
    expect(txQueries()).toHaveLength(1);
  });
});

// jsdom's Blob has no text(); FileReader is available.
const readBlob = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });

describe('LedgerTransactionsPage CSV export (SOUPFIN-163)', () => {
  let csvBlobs: Blob[];
  beforeEach(() => {
    csvBlobs = [];
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn((blob: Blob) => { csvBlobs.push(blob); return 'blob:mock'; }),
    });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: vi.fn() });
  });

  it('exports every filtered row across all server pages, not just the page on screen', async () => {
    serveLedger(2300, (i) => ({
      ...tx(`p${i}`, i % 2 === 0 ? 'DEBIT' : 'CREDIT', 10, i % 3 === 0 ? 'PENDING' : 'POSTED'),
      description: i === 2299 ? 'Rent, March "final"' : `Line p${i}`,
    }));
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId('ledger-row-p0');

    await user.click(screen.getByTestId('ledger-export-button'));

    await screen.findByText('Exported 2,300 transaction(s) to CSV.');
    const exportQueries = txQueries().filter((q) => q.get('max') === '1000');
    expect(exportQueries.map((q) => q.get('offset'))).toEqual(['0', '1000', '2000']);
    expect(csvBlobs).toHaveLength(1);
    const lines = (await readBlob(csvBlobs[0])).split('\n');
    expect(lines[0]).toBe('Date,Reference,Account #,Account Name,Description,Debit,Credit,Status');
    expect(lines).toHaveLength(2301);
    expect(lines[1]).toBe('2026-03-15,TX-p0,1001,Cash,Line p0,10.00,0.00,PENDING');
    // RFC 4180 quoting for a description holding a comma and quotes
    expect(lines[2300]).toContain('"Rent, March ""final"""');
  });

  it('sends the filters to every export request and applies the status filter to the result', async () => {
    serveLedger(1500);
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId('ledger-row-p0');
    await waitFor(() => expect(within(screen.getByTestId('account-filter')).getAllByRole('option')).toHaveLength(3));
    await user.selectOptions(screen.getByTestId('account-filter'), 'acc-cash');
    await user.selectOptions(screen.getByTestId('status-filter'), 'PENDING');
    await screen.findByTestId('ledger-row-p0');

    await user.click(screen.getByTestId('ledger-export-button'));

    // 1500 rows, every third PENDING: 500
    await screen.findByText('Exported 500 transaction(s) to CSV.');
    const exportQueries = txQueries().filter((q) => q.get('max') === '1000');
    expect(exportQueries).toHaveLength(2);
    for (const q of exportQueries) {
      expect(q.get('ledgerAccount')).toBe('acc-cash');
      expect(q.has('status')).toBe(false);
    }
    const body = await readBlob(csvBlobs[0]);
    expect(body.split('\n')).toHaveLength(501);
    expect(body).not.toContain(',POSTED');
  });

  it('warns and downloads nothing when no row matches (zero)', async () => {
    transactionsResponse = () => Promise.resolve({ data: [] });
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId('ledger-empty');

    await user.click(screen.getByTestId('ledger-export-button'));

    await screen.findByText('Nothing to export: no transactions match these filters.');
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('reports a failed export instead of saving a partial file', async () => {
    serveLedger(1500);
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId('ledger-row-p0');
    const ok = transactionsResponse;
    transactionsResponse = (q) => (q.get('offset') === '1000' ? Promise.reject(new Error('Network Error')) : ok(q));

    await user.click(screen.getByTestId('ledger-export-button'));

    await screen.findByText(/^Export failed:/);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});

describe('LedgerTransactionsPage account links (SOUPFIN-163)', () => {
  it('links each row\'s account to that account\'s ledger', async () => {
    renderPage();
    await screen.findByTestId('ledger-table');
    expect(screen.getByTestId('ledger-account-link-t1')).toHaveAttribute('href', '/ledger/accounts/acc-rent');
    expect(screen.getByTestId('ledger-account-link-t2')).toHaveAttribute('href', '/ledger/accounts/acc-cash');
  });
});
