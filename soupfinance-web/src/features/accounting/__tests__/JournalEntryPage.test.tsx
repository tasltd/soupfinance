/**
 * Added (SOUPFIN-161): page tests for the Journal Entry form.
 *
 * Only the HTTP client is mocked. The page, the ledger endpoint module and the
 * CSRF helper all run for real, so each test checks the request the backend
 * would actually receive: URL, query string and JSON body.
 *
 * Covers: the balance indicator, the validation messages, the create payload
 * (saveMultiple.json with the CSRF token in the query string), the update
 * payload (PUT with no CSRF token), read-only POSTED entries, and the
 * module-disabled banner on a 403.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { JournalEntryPage } from '../JournalEntryPage';
import { moduleDisabled403 } from '../../../test/apiErrorFixtures';

// One shared client for every axios.create() call, so the test can route and
// inspect every request the page makes.
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

// Raw backend rows: the endpoint derives code and ledgerGroup from these.
const RAW_ACCOUNTS = [
  { id: 'acc-cash', name: 'Cash', number: '1001', ledgerAccountCategory: { id: 'c1', serialised: 'Cash < ASSET' } },
  { id: 'acc-rent', name: 'Rent Expense', number: '5200', ledgerAccountCategory: { id: 'c2', serialised: 'Rent < EXPENSE' } },
  { id: 'acc-sales', name: 'Sales', number: '4000', ledgerAccountCategory: { id: 'c3', serialised: 'Sales < REVENUE' } },
];

const CSRF = { SYNCHRONIZER_TOKEN: 'tok-123', SYNCHRONIZER_URI: '/ledgerTransaction/create' };

const pendingGroup = (status: 'PENDING' | 'POSTED' | 'REVERSED' = 'PENDING') => ({
  id: 'jg-1',
  groupDate: '2026-03-15',
  description: 'March rent',
  reference: 'JE-2026-007',
  status,
  balanced: true,
  totalDebit: 1200,
  totalCredit: 1200,
  ledgerTransactionList: [
    { id: 't1', ledgerAccount: { id: 'acc-rent', name: 'Rent Expense' }, amount: 1200, transactionState: 'DEBIT', description: 'Rent' },
    { id: 't2', ledgerAccount: { id: 'acc-cash', name: 'Cash' }, amount: 1200, transactionState: 'CREDIT', description: '' },
  ],
});

let accountsResponse: () => Promise<unknown>;
let groupResponse: () => Promise<unknown>;

function routeGets() {
  http.get.mockImplementation((url: string) => {
    if (url.startsWith('/ledgerAccount/index.json')) return accountsResponse();
    if (url === '/ledgerTransaction/create.json') return Promise.resolve({ data: { ledgerTransaction: CSRF } });
    if (url === '/ledgerTransactionGroup/show/jg-1.json') return groupResponse();
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

function LocationProbe() {
  return <div data-testid="location">{useLocation().pathname}</div>;
}

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/accounting/journal-entry/new" element={<JournalEntryPage />} />
          <Route path="/accounting/journal-entry/:id/edit" element={<JournalEntryPage />} />
          <Route path="*" element={<div />} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

async function waitForAccounts() {
  await waitFor(() =>
    expect(within(screen.getByTestId('journal-entry-line-0-account')).getAllByRole('option').length).toBe(
      RAW_ACCOUNTS.length + 1
    )
  );
}

type User = ReturnType<typeof userEvent.setup>;

async function fillLine(user: User, index: number, accountId: string, debit: string, credit: string) {
  await user.selectOptions(screen.getByTestId(`journal-entry-line-${index}-account`), accountId);
  if (debit) {
    await user.clear(screen.getByTestId(`journal-entry-line-${index}-debit`));
    await user.type(screen.getByTestId(`journal-entry-line-${index}-debit`), debit);
  }
  if (credit) {
    await user.clear(screen.getByTestId(`journal-entry-line-${index}-credit`));
    await user.type(screen.getByTestId(`journal-entry-line-${index}-credit`), credit);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  accountsResponse = () => Promise.resolve({ data: RAW_ACCOUNTS });
  groupResponse = () => Promise.resolve({ data: pendingGroup() });
  routeGets();
  http.post.mockResolvedValue({ data: { id: 'jg-new' } });
  http.put.mockResolvedValue({ data: { id: 'jg-1' } });
});

describe('JournalEntryPage balance indicator', () => {
  it('starts balanced at zero with Save & Post enabled', async () => {
    renderAt('/accounting/journal-entry/new');
    await waitForAccounts();

    expect(screen.getByTestId('journal-entry-balance-indicator')).toHaveTextContent('Balanced');
    expect(screen.getByTestId('journal-entry-balance-indicator')).not.toHaveTextContent('Out of Balance');
    expect(screen.getByTestId('journal-entry-save-post-button')).toBeEnabled();
  });

  it('goes out of balance with the difference, then balances again', async () => {
    const user = userEvent.setup();
    renderAt('/accounting/journal-entry/new');
    await waitForAccounts();

    await fillLine(user, 0, 'acc-rent', '1200', '');
    const indicator = screen.getByTestId('journal-entry-balance-indicator');
    expect(indicator).toHaveTextContent('Out of Balance');
    expect(indicator).toHaveTextContent(/Difference: \D*1,200\.00/);
    expect(screen.getByTestId('journal-entry-total-debit')).toHaveTextContent(/1,200\.00/);
    expect(screen.getByTestId('journal-entry-total-credit')).toHaveTextContent(/0\.00/);
    expect(screen.getByTestId('journal-entry-save-post-button')).toBeDisabled();

    await fillLine(user, 1, 'acc-cash', '', '1200');
    expect(indicator).toHaveTextContent('Balanced');
    expect(indicator).not.toHaveTextContent('Difference');
    expect(screen.getByTestId('journal-entry-total-credit')).toHaveTextContent(/1,200\.00/);
    expect(screen.getByTestId('journal-entry-save-post-button')).toBeEnabled();
  });

  it('keeps seven-figure totals across many lines exact (overflow)', async () => {
    const user = userEvent.setup();
    renderAt('/accounting/journal-entry/new');
    await waitForAccounts();

    // 10 debit lines of 1,234,567.89 against one credit of 12,345,678.90.
    for (let i = 0; i < 9; i++) {
      await user.click(screen.getByTestId('journal-entry-add-line-button'));
    }
    expect(screen.getAllByTestId(/^journal-entry-line-\d+$/)).toHaveLength(11);
    for (let i = 0; i < 10; i++) {
      await fillLine(user, i, 'acc-rent', '1234567.89', '');
    }
    await fillLine(user, 10, 'acc-cash', '', '12345678.90');

    expect(screen.getByTestId('journal-entry-total-debit')).toHaveTextContent(/12,345,678\.90/);
    expect(screen.getByTestId('journal-entry-total-credit')).toHaveTextContent(/12,345,678\.90/);
    expect(screen.getByTestId('journal-entry-balance-indicator')).toHaveTextContent('Balanced');
  }, 30000);
});

describe('JournalEntryPage validation', () => {
  it('blocks an empty entry with the field and line messages, and sends nothing', async () => {
    const user = userEvent.setup();
    renderAt('/accounting/journal-entry/new');
    await waitForAccounts();

    await user.click(screen.getByTestId('journal-entry-save-draft-button'));

    expect(await screen.findByText('Description is required')).toBeInTheDocument();
    expect(screen.getAllByText('Account is required')).toHaveLength(2);
    expect(
      screen.getByText('Each line must have either a debit or credit amount (not both)')
    ).toBeInTheDocument();
    expect(http.post).not.toHaveBeenCalled();
    expect(http.put).not.toHaveBeenCalled();
  });

  it('rejects a line that carries both a debit and a credit', async () => {
    const user = userEvent.setup();
    renderAt('/accounting/journal-entry/new');
    await waitForAccounts();

    await user.type(screen.getByTestId('journal-entry-description-input'), 'Bad line');
    await fillLine(user, 0, 'acc-rent', '50', '50');
    await fillLine(user, 1, 'acc-cash', '', '50');
    await user.click(screen.getByTestId('journal-entry-save-draft-button'));

    expect(
      await screen.findByText('Each line must have either a debit or credit amount (not both)')
    ).toBeInTheDocument();
    expect(http.post).not.toHaveBeenCalled();
  });

  it('rejects an unbalanced draft with the totals message', async () => {
    const user = userEvent.setup();
    renderAt('/accounting/journal-entry/new');
    await waitForAccounts();

    await user.type(screen.getByTestId('journal-entry-description-input'), 'Unbalanced');
    await fillLine(user, 0, 'acc-rent', '100', '');
    await fillLine(user, 1, 'acc-cash', '', '99.98');
    await user.click(screen.getByTestId('journal-entry-save-draft-button'));

    expect(await screen.findByText('Total debits must equal total credits')).toBeInTheDocument();
    expect(http.post).not.toHaveBeenCalled();
  });

  it('never drops below two lines', async () => {
    const user = userEvent.setup();
    renderAt('/accounting/journal-entry/new');
    await waitForAccounts();

    expect(screen.getByTestId('journal-entry-line-0-remove')).toBeDisabled();
    await user.click(screen.getByTestId('journal-entry-add-line-button'));
    expect(screen.getByTestId('journal-entry-line-2-remove')).toBeEnabled();
    await user.click(screen.getByTestId('journal-entry-line-2-remove'));
    expect(screen.queryByTestId('journal-entry-line-2')).not.toBeInTheDocument();
    expect(screen.getByTestId('journal-entry-line-1-remove')).toBeDisabled();
  });
});

describe('JournalEntryPage payloads', () => {
  it('creates through saveMultiple.json with the CSRF token in the query string', async () => {
    const user = userEvent.setup();
    renderAt('/accounting/journal-entry/new');
    await waitForAccounts();

    await user.clear(screen.getByTestId('journal-entry-date-input'));
    await user.type(screen.getByTestId('journal-entry-date-input'), '2026-03-15');
    await user.type(screen.getByTestId('journal-entry-reference-input'), 'JE-2026-007');
    await user.type(screen.getByTestId('journal-entry-description-input'), 'March rent');
    await fillLine(user, 0, 'acc-rent', '1200', '');
    await user.type(screen.getByTestId('journal-entry-line-0-description'), 'Rent');
    await fillLine(user, 1, 'acc-cash', '', '1200');
    await user.click(screen.getByTestId('journal-entry-save-post-button'));

    await waitFor(() => expect(http.post).toHaveBeenCalledTimes(1));
    expect(http.get).toHaveBeenCalledWith('/ledgerTransaction/create.json');

    const [url, body] = http.post.mock.calls[0];
    const [path, query] = (url as string).split('?');
    expect(path).toBe('/ledgerTransaction/saveMultiple.json');
    const params = new URLSearchParams(query);
    expect(params.get('SYNCHRONIZER_TOKEN')).toBe('tok-123');
    expect(params.get('SYNCHRONIZER_URI')).toBe('/ledgerTransaction/create');

    expect(body).toEqual({
      groupDate: '2026-03-15',
      description: 'March rent',
      reference: 'JE-2026-007',
      ledgerTransactionList: [
        {
          ledgerAccount: { id: 'acc-rent' },
          transactionDate: '2026-03-15',
          description: 'Rent',
          amount: 1200,
          transactionState: 'DEBIT',
          journalEntryType: 'SINGLE_ENTRY',
        },
        {
          ledgerAccount: { id: 'acc-cash' },
          transactionDate: '2026-03-15',
          // A line without its own description takes the entry's.
          description: 'March rent',
          amount: 1200,
          transactionState: 'CREDIT',
          journalEntryType: 'SINGLE_ENTRY',
        },
      ],
    });
    // The token travels in the URL only, never in the JSON body.
    expect(JSON.stringify(body)).not.toContain('SYNCHRONIZER');
    expect(http.put).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/accounting/transactions'));
  });

  it('updates a pending entry with a PUT and no CSRF token', async () => {
    const user = userEvent.setup();
    renderAt('/accounting/journal-entry/jg-1/edit');

    expect(await screen.findByTestId('journal-entry-heading')).toHaveTextContent('Edit Journal Entry');
    const description = screen.getByTestId('journal-entry-description-input');
    await waitFor(() => expect(description).toHaveValue('March rent'));
    await waitForAccounts();
    await waitFor(() => expect(screen.getByTestId('journal-entry-line-0-account')).toHaveValue('acc-rent'));
    expect(screen.getByTestId('journal-entry-line-1-account')).toHaveValue('acc-cash');
    expect(screen.getByTestId('journal-entry-reference-input')).toHaveValue('JE-2026-007');

    await user.clear(description);
    await user.type(description, 'March rent, corrected');
    await user.click(screen.getByTestId('journal-entry-save-post-button'));

    await waitFor(() => expect(http.put).toHaveBeenCalledTimes(1));
    const [url, body] = http.put.mock.calls[0];
    expect(url).toBe('/ledgerTransactionGroup/update/jg-1.json');
    expect(body).toMatchObject({
      id: 'jg-1',
      groupDate: '2026-03-15',
      description: 'March rent, corrected',
      reference: 'JE-2026-007',
      ledgerTransactionList: [
        { ledgerAccount: { id: 'acc-rent' }, amount: 1200, transactionState: 'DEBIT', description: 'Rent' },
        { ledgerAccount: { id: 'acc-cash' }, amount: 1200, transactionState: 'CREDIT', description: 'March rent, corrected' },
      ],
    });
    expect(JSON.stringify(body)).not.toContain('SYNCHRONIZER');
    expect(http.get).not.toHaveBeenCalledWith('/ledgerTransaction/create.json');
    expect(http.post).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/accounting/transactions'));
  });

  it('keeps the user on the form and explains a 403 on save', async () => {
    http.post.mockRejectedValue(moduleDisabled403('Ledger', '/rest/ledgerTransaction/saveMultiple.json'));
    const user = userEvent.setup();
    renderAt('/accounting/journal-entry/new');
    await waitForAccounts();

    await user.type(screen.getByTestId('journal-entry-description-input'), 'Rent');
    await fillLine(user, 0, 'acc-rent', '10', '');
    await fillLine(user, 1, 'acc-cash', '', '10');
    await user.click(screen.getByTestId('journal-entry-save-post-button'));

    const error = await screen.findByTestId('journal-entry-error');
    expect(error).toHaveTextContent(/Ledger/i);
    expect(error).not.toHaveTextContent('Request failed with status code');
    expect(screen.getByTestId('location')).toHaveTextContent('/accounting/journal-entry/new');
  });
});

describe('JournalEntryPage read-only and module states', () => {
  it.each(['POSTED', 'REVERSED'] as const)('a %s entry opens read-only with no save buttons', async (status) => {
    groupResponse = () => Promise.resolve({ data: pendingGroup(status) });
    renderAt('/accounting/journal-entry/jg-1/edit');

    expect(await screen.findByTestId('journal-entry-heading')).toHaveTextContent(/^Journal Entry$/);
    expect(screen.getByTestId('journal-entry-readonly-banner')).toHaveTextContent(status.toLowerCase());
    await waitFor(() => expect(screen.getByTestId('journal-entry-description-input')).toHaveValue('March rent'));
    expect(screen.getByTestId('journal-entry-description-input')).toBeDisabled();
    expect(screen.getByTestId('journal-entry-date-input')).toBeDisabled();
    expect(screen.getByTestId('journal-entry-line-0-debit')).toBeDisabled();
    expect(screen.getByTestId('journal-entry-line-0-account')).toBeDisabled();
    expect(screen.queryByTestId('journal-entry-save-draft-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('journal-entry-save-post-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('journal-entry-add-line-button')).not.toBeInTheDocument();
    expect(screen.getByTestId('journal-entry-cancel-button')).toHaveTextContent('Back');
  });

  it('shows the module-disabled banner when the accounts query is refused with 403', async () => {
    accountsResponse = () =>
      Promise.reject(moduleDisabled403('Ledger', '/rest/ledgerAccount/index.json'));
    renderAt('/accounting/journal-entry/new');

    const banner = await screen.findByTestId('journal-entry-module-disabled');
    expect(banner).toHaveTextContent(/Ledger/i);
    expect(banner).toHaveTextContent('Account selection is unavailable until the module is enabled.');
    // The form still renders so the user can see what is missing.
    expect(screen.getByTestId('journal-entry-lines-table')).toBeInTheDocument();
    expect(within(screen.getByTestId('journal-entry-line-0-account')).getAllByRole('option')).toHaveLength(1);
  });

  it('shows no banner when the tenant has the module but no accounts (zero)', async () => {
    accountsResponse = () => Promise.resolve({ data: [] });
    renderAt('/accounting/journal-entry/new');

    await waitFor(() => expect(http.get).toHaveBeenCalledWith(expect.stringMatching(/^\/ledgerAccount\/index\.json/)));
    expect(screen.queryByTestId('journal-entry-module-disabled')).not.toBeInTheDocument();
    expect(within(screen.getByTestId('journal-entry-line-0-account')).getAllByRole('option')).toHaveLength(1);
  });
});
