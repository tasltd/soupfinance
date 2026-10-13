/**
 * Added (SOUPFIN-163): Account Ledger page.
 *
 * Only the HTTP client is mocked, so the endpoint module builds the real
 * query strings and the page does the real running-balance maths.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AccountLedgerPage } from '../AccountLedgerPage';
import { getTodayIsoDate } from '../../../utils/date';
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

const ACCOUNTS: Record<string, unknown> = {
  'acc-cash': { id: 'acc-cash', name: 'Cash', number: '1001', currency: 'GHS', ledgerAccountCategory: { id: 'c1', serialised: 'Cash < ASSET' } },
  'acc-sales': { id: 'acc-sales', name: 'Sales', number: '4000', ledgerAccountCategory: { id: 'c2', serialised: 'Sales < INCOME' } },
};

// Raw index rows in the backend's shape: notes, quickReference, shallow ledgerAccount
const row = (id: string, state: 'DEBIT' | 'CREDIT', amount: number, date: string, accountId = 'acc-cash') => ({
  id,
  transactionDate: `${date}T00:00:00Z`,
  dateCreated: `${date}T09:00:00Z`,
  transactionState: state,
  amount,
  notes: `Note ${id}`,
  quickReference: `QR-${id}`,
  status: 'PENDING',
  ledgerAccount: { id: accountId, serialised: 'Cash (1001)[ Bank < ASSET ] - GHS' },
});

const YEAR = getTodayIsoDate().slice(0, 4);

let lines: unknown[];
let totals: { debit: number; credit: number };

const queries = (path: string) =>
  http.get.mock.calls
    .map(([url]) => url as string)
    .filter((url) => url.startsWith(path))
    .map((url) => new URLSearchParams(url.split('?')[1] ?? ''));

function renderPage(id = 'acc-cash') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/ledger/accounts/${id}`]}>
        <Routes>
          <Route path="/ledger/accounts/:id" element={<AccountLedgerPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  lines = [
    row('t1', 'DEBIT', 500, `${YEAR}-01-05`),
    row('t2', 'CREDIT', 120.5, `${YEAR}-01-06`),
    row('t3', 'DEBIT', 20, `${YEAR}-01-07`),
  ];
  totals = { debit: 1500, credit: 500 };
  http.get.mockImplementation((url: string) => {
    const show = url.match(/^\/ledgerAccount\/show\/([^.]+)\.json/);
    if (show) {
      return ACCOUNTS[show[1]] ? Promise.resolve({ data: ACCOUNTS[show[1]] }) : Promise.reject(new Error('not found'));
    }
    if (url.startsWith('/ledgerAccount/balance/')) return Promise.resolve({ data: { debit: totals.debit, credit: totals.credit, endingBalance: 0 } });
    if (url.startsWith('/ledgerTransaction/index.json')) {
      const q = new URLSearchParams(url.split('?')[1] ?? '');
      const max = Number(q.get('max'));
      const offset = Number(q.get('offset'));
      const data = (lines as Record<string, unknown>[]).slice(offset, offset + max).map((r) => ({ ...r, totalCount: lines.length }));
      return Promise.resolve({ data });
    }
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
});

describe('AccountLedgerPage', () => {
  it('opens on this year with the opening balance from everything before it', async () => {
    renderPage();
    await screen.findByTestId('account-ledger-row-t1');
    expect(screen.getByTestId('account-ledger-heading')).toHaveTextContent('1001 · Cash');

    const [balance] = queries('/ledgerAccount/balance/acc-cash.json');
    expect(balance.get('from')).toBe('1900-01-01');
    expect(balance.get('to')).toBe(`${Number(YEAR) - 1}-12-31`);

    const [index] = queries('/ledgerTransaction/index.json');
    expect(index.get('ledgerAccount')).toBe('acc-cash');
    expect(index.get('from')).toBe(`${YEAR}-01-01`);
    expect(index.has('to')).toBe(false);
    expect(index.get('order')).toBe('asc');

    // Asset: opening = debits − credits before the period = 1,000
    expect(screen.getByTestId('account-ledger-opening')).toHaveTextContent('1,000.00');
    expect(screen.getByTestId('account-ledger-brought-forward')).toHaveTextContent('Opening balance');
  });

  it('shows the balance after every line and the closing balance', async () => {
    renderPage();
    await screen.findByTestId('account-ledger-row-t1');
    expect(screen.getByTestId('account-ledger-balance-t1')).toHaveTextContent('1,500.00');
    expect(screen.getByTestId('account-ledger-balance-t2')).toHaveTextContent('1,379.50');
    expect(screen.getByTestId('account-ledger-balance-t3')).toHaveTextContent('1,399.50');
    expect(screen.getByTestId('account-ledger-total-debit')).toHaveTextContent('520.00');
    expect(screen.getByTestId('account-ledger-total-credit')).toHaveTextContent('120.50');
    expect(screen.getByTestId('account-ledger-closing')).toHaveTextContent('1,399.50');
    // Display fields come from notes / quickReference
    expect(screen.getByTestId('account-ledger-row-t1')).toHaveTextContent('QR-t1');
    expect(screen.getByTestId('account-ledger-row-t1')).toHaveTextContent('Note t1');
  });

  it('runs a credit-normal account the other way', async () => {
    lines = [row('s1', 'CREDIT', 300, `${YEAR}-02-01`, 'acc-sales'), row('s2', 'DEBIT', 50, `${YEAR}-02-02`, 'acc-sales')];
    totals = { debit: 100, credit: 1100 };
    renderPage('acc-sales');
    await screen.findByTestId('account-ledger-row-s1');
    expect(screen.getByTestId('account-ledger-opening')).toHaveTextContent('1,000.00');
    expect(screen.getByTestId('account-ledger-balance-s1')).toHaveTextContent('1,300.00');
    expect(screen.getByTestId('account-ledger-balance-s2')).toHaveTextContent('1,250.00');
    expect(screen.getByText(/credit-balance account/)).toBeInTheDocument();
  });

  it('with no From date shows the whole history from a zero opening and skips the balance call', async () => {
    renderPage();
    await screen.findByTestId('account-ledger-row-t1');
    fireEvent.change(screen.getByTestId('account-ledger-start-date'), { target: { value: '' } });

    await waitFor(() => expect(queries('/ledgerTransaction/index.json').at(-1)!.has('from')).toBe(false));
    expect(await screen.findByTestId('account-ledger-opening')).toHaveTextContent('0.00');
    expect(screen.getByTestId('account-ledger-closing')).toHaveTextContent('399.50');
    expect(queries('/ledgerAccount/balance/')).toHaveLength(1);
    expect(screen.getByTestId('account-ledger-period')).toHaveTextContent('All dates to today');
  });

  it('says so when the period has no transactions (zero)', async () => {
    lines = [];
    renderPage();
    expect(await screen.findByTestId('account-ledger-empty')).toBeInTheDocument();
    expect(screen.getByTestId('account-ledger-closing')).toHaveTextContent('1,000.00');
  });

  it('pages 1,200 lines on screen and carries the balance forward (overflow)', async () => {
    lines = Array.from({ length: 1200 }, (_, i) =>
      row(`n${i}`, 'DEBIT', 1_000_000.01, `${YEAR}-03-${String((i % 28) + 1).padStart(2, '0')}`)
    ).map((r, i) => ({ ...r, dateCreated: `${YEAR}-03-01T${String(i).padStart(6, '0')}` }));
    totals = { debit: 0, credit: 0 };
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId('account-ledger-table');

    // Two server pages of 1000
    expect(queries('/ledgerTransaction/index.json').map((q) => q.get('offset'))).toEqual(['0', '1000']);
    expect(screen.getAllByTestId(/^account-ledger-row-/)).toHaveLength(50);
    expect(screen.getByTestId('account-ledger-closing')).toHaveTextContent('1,200,000,012.00');

    await user.click(screen.getByTestId('account-ledger-next'));
    const bf = screen.getByTestId('account-ledger-brought-forward');
    expect(bf).toHaveTextContent('Balance brought forward');
    // 50 lines of 1,000,000.01 brought forward
    expect(bf).toHaveTextContent('50,000,000.50');
  });

  it('shows the module-disabled state when the ledger is off', async () => {
    http.get.mockImplementation((url: string) =>
      Promise.reject(moduleDisabled403('Ledger', `/rest${url.split('?')[0]}`))
    );
    renderPage();
    const error = await screen.findByTestId('account-ledger-error');
    expect(error).toHaveTextContent(/Ledger/i);
  });

  it('links back to the Chart of Accounts', async () => {
    renderPage();
    expect(await screen.findByTestId('account-ledger-back')).toHaveAttribute('href', '/ledger/accounts');
  });
});
