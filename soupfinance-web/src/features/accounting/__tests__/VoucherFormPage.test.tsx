/**
 * Added (SOUPFIN-161): page tests for creating a voucher.
 *
 * Only the HTTP client is mocked, so the ledger endpoint module, the
 * payment-method hook and the CSRF helper run for real and the tests check the
 * request the backend receives. Opening an existing voucher is covered by
 * VoucherFormPage.viewEdit.test.tsx (SOUPFIN-154).
 *
 * Covers: switching voucher type, which accounts each dropdown offers, the
 * backend field names in the save payload (transactionDate, notes,
 * paymentMethod), the validation messages, and the module-disabled banner on 403.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { VoucherFormPage } from '../VoucherFormPage';
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

// Raw backend rows. ledgerGroup is derived from the category's serialised
// string; Sales ends in REVENUE and Interest in INCOME, and both are income.
const RAW_ACCOUNTS = [
  { id: 'acc-cash', name: 'Cash', number: '1001', ledgerAccountCategory: { id: 'c1', serialised: 'Cash < ASSET' } },
  { id: 'acc-bank', name: 'Main Bank', number: '1010', ledgerAccountCategory: { id: 'c1', serialised: 'Cash < ASSET' } },
  { id: 'acc-ap', name: 'Accounts Payable', number: '2000', ledgerAccountCategory: { id: 'c4', serialised: 'Payables < LIABILITY' } },
  { id: 'acc-rent', name: 'Rent Expense', number: '5200', ledgerAccountCategory: { id: 'c2', serialised: 'Rent < EXPENSE' } },
  { id: 'acc-sales', name: 'Sales', number: '4000', ledgerAccountCategory: { id: 'c3', serialised: 'Sales < REVENUE' } },
  { id: 'acc-interest', name: 'Interest Income', number: '4200', ledgerAccountCategory: { id: 'c5', serialised: 'Other < INCOME' } },
];

const PAYMENT_METHODS = [
  { id: 'pm-bank', name: 'Bank Transfer' },
  { id: 'pm-cash', name: 'Cash' },
];

const CSRF = { SYNCHRONIZER_TOKEN: 'vtok-9', SYNCHRONIZER_URI: '/voucher/create' };

// Added (SOUPFIN-162): the party lists behind the vendor, client and staff selects.
const VENDORS = [
  { id: 'vendor-7', name: 'Acme Landlords' },
  { id: 'vendor-8', name: 'Office Depot' },
];
// The list response carries bare portfolio refs; the AccountServices id is only
// on /clientPortfolio/show (SOUPFIN-27).
const CLIENTS = [
  { id: 'client-3', name: 'Ada Ventures', portfolioList: [{ id: 'cp-3' }] },
  { id: 'client-4', firstName: 'Kofi', lastName: 'Mensah', portfolioList: [] },
];
const AGENTS = [{ id: 'agent-1', firstName: 'Ama', lastName: 'Owusu' }];

let accountsResponse: () => Promise<unknown>;
let vendorsResponse: () => Promise<unknown>;

function LocationProbe() {
  return <div data-testid="location">{useLocation().pathname}</div>;
}

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/accounting/vouchers/new" element={<VoucherFormPage />} />
          <Route path="/accounting/voucher/payment" element={<VoucherFormPage />} />
          <Route path="/accounting/voucher/receipt" element={<VoucherFormPage />} />
          <Route path="*" element={<div />} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const optionValues = (testId: string) =>
  within(screen.getByTestId(testId))
    .getAllByRole('option')
    .map((o) => (o as HTMLOptionElement).value)
    .filter(Boolean);

async function waitForAccounts() {
  await waitFor(() => expect(optionValues('voucher-cash-account-select').length).toBeGreaterThan(0));
}

beforeEach(() => {
  vi.clearAllMocks();
  accountsResponse = () => Promise.resolve({ data: RAW_ACCOUNTS });
  vendorsResponse = () => Promise.resolve({ data: VENDORS });
  http.get.mockImplementation((url: string) => {
    if (url.startsWith('/ledgerAccount/index.json')) return accountsResponse();
    if (url.startsWith('/trading/vendor/index.json')) return vendorsResponse();
    if (url.startsWith('/client/index.json')) return Promise.resolve({ data: CLIENTS });
    if (url.startsWith('/agent/index.json')) return Promise.resolve({ data: AGENTS });
    if (url === '/clientPortfolio/show/cp-3.json') {
      return Promise.resolve({ data: { id: 'cp-3', accountServices: { id: 'as-3' } } });
    }
    if (url.startsWith('/paymentMethod/index.json')) return Promise.resolve({ data: PAYMENT_METHODS });
    if (url === '/voucher/create.json') return Promise.resolve({ data: { voucher: CSRF } });
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
  http.post.mockResolvedValue({ data: { id: 'v-new' } });
});

describe('VoucherFormPage type switching', () => {
  it('a payment voucher shows the expense account, money out, and debits expense', async () => {
    renderAt('/accounting/vouchers/new');
    await waitForAccounts();

    expect(screen.getByTestId('voucher-form-heading')).toHaveTextContent('New Payment Voucher');
    expect(screen.getByTestId('voucher-expense-account-select')).toBeInTheDocument();
    expect(screen.queryByTestId('voucher-income-account-select')).not.toBeInTheDocument();
    expect(screen.getByTestId('voucher-amount-preview')).toHaveTextContent('Money Out');
    // Payment defaults to paying a vendor.
    expect(screen.getByTestId('voucher-vendor-select')).toBeInTheDocument();
    const rows = within(screen.getByTestId('voucher-journal-preview')).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Expense Account');
    expect(rows[2]).toHaveTextContent('Bank/Cash Account');
  });

  it('switching to receipt swaps in the income account and money in, and clears the expense account', async () => {
    const user = userEvent.setup();
    renderAt('/accounting/vouchers/new');
    await waitForAccounts();

    await user.selectOptions(screen.getByTestId('voucher-expense-account-select'), 'acc-rent');
    await user.click(screen.getByTestId('voucher-type-receipt'));

    expect(screen.getByTestId('voucher-form-heading')).toHaveTextContent('New Receipt Voucher');
    expect(screen.queryByTestId('voucher-expense-account-select')).not.toBeInTheDocument();
    expect(screen.getByTestId('voucher-income-account-select')).toBeInTheDocument();
    expect(screen.getByTestId('voucher-amount-preview')).toHaveTextContent('Money In');
    expect(screen.getByText('Payer Information')).toBeInTheDocument();
    const rows = within(screen.getByTestId('voucher-journal-preview')).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Bank/Cash Account');
    expect(rows[2]).toHaveTextContent('Income Account');

    // Back to payment: the expense account chosen earlier was cleared.
    await user.click(screen.getByTestId('voucher-type-payment'));
    expect(screen.getByTestId('voucher-expense-account-select')).toHaveValue('');
  });

  it('deposit behaves like a receipt', async () => {
    const user = userEvent.setup();
    renderAt('/accounting/vouchers/new');
    await waitForAccounts();

    await user.click(screen.getByTestId('voucher-type-deposit'));
    expect(screen.getByTestId('voucher-form-heading')).toHaveTextContent('New Deposit Voucher');
    expect(screen.getByTestId('voucher-income-account-select')).toBeInTheDocument();
    expect(screen.queryByTestId('voucher-expense-account-select')).not.toBeInTheDocument();
  });

  it('opens on the type named in the URL path or query', async () => {
    const { unmount } = renderAt('/accounting/voucher/receipt');
    expect(await screen.findByTestId('voucher-form-heading')).toHaveTextContent('New Receipt Voucher');
    // Receipts default to a client payer.
    expect(screen.getByTestId('voucher-client-select')).toBeInTheDocument();
    unmount();

    renderAt('/accounting/vouchers/new?type=deposit');
    expect(await screen.findByTestId('voucher-form-heading')).toHaveTextContent('New Deposit Voucher');
  });

  it('changing the beneficiary type swaps the party field and clears the previous party', async () => {
    const user = userEvent.setup();
    renderAt('/accounting/vouchers/new');
    await waitForAccounts();

    await waitFor(() => expect(optionValues('voucher-vendor-select')).toEqual(['vendor-7', 'vendor-8']));
    await user.selectOptions(screen.getByTestId('voucher-vendor-select'), 'vendor-8');
    await user.click(screen.getByLabelText('Staff'));
    expect(screen.queryByTestId('voucher-vendor-select')).not.toBeInTheDocument();
    expect(screen.getByTestId('voucher-staff-select')).toHaveValue('');

    await user.click(screen.getByLabelText('Vendor'));
    expect(screen.getByTestId('voucher-vendor-select')).toHaveValue('');

    await user.click(screen.getByLabelText('Other'));
    expect(screen.getByTestId('voucher-beneficiary-name-input')).toBeInTheDocument();
  });
});

describe('VoucherFormPage account filtering', () => {
  it('offers only asset accounts for bank/cash and only expense accounts for a payment', async () => {
    renderAt('/accounting/vouchers/new');
    await waitForAccounts();

    expect(optionValues('voucher-cash-account-select')).toEqual(['acc-cash', 'acc-bank']);
    expect(optionValues('voucher-expense-account-select')).toEqual(['acc-rent']);
    expect(within(screen.getByTestId('voucher-cash-account-select')).getByRole('option', { name: '1001 - Cash' })).toBeInTheDocument();
  });

  it('offers both INCOME and REVENUE accounts, and nothing else, for a receipt', async () => {
    const user = userEvent.setup();
    renderAt('/accounting/vouchers/new');
    await waitForAccounts();

    await user.click(screen.getByTestId('voucher-type-receipt'));
    expect(optionValues('voucher-income-account-select')).toEqual(['acc-sales', 'acc-interest']);
    expect(optionValues('voucher-cash-account-select')).toEqual(['acc-cash', 'acc-bank']);
  });

  it('leaves every account dropdown empty for a tenant with no accounts (zero)', async () => {
    accountsResponse = () => Promise.resolve({ data: [] });
    renderAt('/accounting/vouchers/new');

    await waitFor(() => expect(http.get).toHaveBeenCalledWith(expect.stringMatching(/^\/ledgerAccount\/index\.json/)));
    expect(optionValues('voucher-cash-account-select')).toEqual([]);
    expect(optionValues('voucher-expense-account-select')).toEqual([]);
    expect(screen.queryByTestId('voucher-form-module-disabled')).not.toBeInTheDocument();
  });

  it('keeps a large chart (500 accounts) partitioned by group (overflow)', async () => {
    const groups = ['ASSET', 'LIABILITY', 'EQUITY', 'EXPENSE', 'REVENUE'];
    accountsResponse = () =>
      Promise.resolve({
        data: Array.from({ length: 500 }, (_, i) => ({
          id: `acc-${i}`,
          name: `Account ${i}`,
          number: String(10000 + i),
          ledgerAccountCategory: { id: `c-${i % 5}`, serialised: `Cat < ${groups[i % 5]}` },
        })),
      });
    renderAt('/accounting/vouchers/new');

    await waitFor(() => expect(optionValues('voucher-cash-account-select')).toHaveLength(100));
    expect(optionValues('voucher-expense-account-select')).toHaveLength(100);
    expect(optionValues('voucher-cash-account-select').every((id) => Number(id.slice(4)) % 5 === 0)).toBe(true);
    expect(optionValues('voucher-expense-account-select').every((id) => Number(id.slice(4)) % 5 === 3)).toBe(true);
  });
});

describe('VoucherFormPage payload', () => {
  it('creates a payment with backend field names, nested FKs and the CSRF token in the URL', async () => {
    const user = userEvent.setup();
    renderAt('/accounting/vouchers/new');
    await waitForAccounts();
    await waitFor(() => expect(optionValues('voucher-payment-method-select')).toEqual(['pm-bank', 'pm-cash']));

    await user.clear(screen.getByTestId('voucher-date-input'));
    await user.type(screen.getByTestId('voucher-date-input'), '2026-04-02');
    await user.type(screen.getByTestId('voucher-reference-input'), 'PV-2026-014');
    await user.selectOptions(screen.getByTestId('voucher-payment-method-select'), 'pm-bank');
    await user.type(screen.getByTestId('voucher-notes-input'), 'April rent');
    await waitFor(() => expect(optionValues('voucher-vendor-select')).toContain('vendor-7'));
    await user.selectOptions(screen.getByTestId('voucher-vendor-select'), 'vendor-7');
    await user.selectOptions(screen.getByTestId('voucher-cash-account-select'), 'acc-bank');
    await user.selectOptions(screen.getByTestId('voucher-expense-account-select'), 'acc-rent');
    await user.clear(screen.getByTestId('voucher-amount-input'));
    await user.type(screen.getByTestId('voucher-amount-input'), '2500.50');
    await user.click(screen.getByTestId('voucher-form-approve-post-button'));

    await waitFor(() => expect(http.post).toHaveBeenCalledTimes(1));
    expect(http.get).toHaveBeenCalledWith('/voucher/create.json');
    const [url, body] = http.post.mock.calls[0];
    const [path, query] = (url as string).split('?');
    expect(path).toBe('/voucher/save.json');
    expect(new URLSearchParams(query).get('SYNCHRONIZER_TOKEN')).toBe('vtok-9');
    expect(new URLSearchParams(query).get('SYNCHRONIZER_URI')).toBe('/voucher/create');

    expect(body).toEqual({
      voucherType: 'PAYMENT',
      voucherTo: 'VENDOR',
      transactionDate: '2026-04-02',
      amount: 2500.5,
      notes: 'April rent',
      reference: 'PV-2026-014',
      beneficiaryName: '',
      vendor: { id: 'vendor-7' },
      cashAccount: { id: 'acc-bank' },
      expenseAccount: { id: 'acc-rent' },
      paymentMethod: { id: 'pm-bank' },
    });
    // The old frontend names must not leak back in.
    for (const stale of ['voucherDate', 'description', 'paymentMethodId', 'SYNCHRONIZER_TOKEN']) {
      expect(body).not.toHaveProperty(stale);
    }
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/accounting/transactions'));
  });

  it('creates a receipt with the income account and no expense account', async () => {
    const user = userEvent.setup();
    renderAt('/accounting/voucher/receipt');
    await waitForAccounts();

    await user.type(screen.getByTestId('voucher-notes-input'), 'Consulting fee');
    await waitFor(() => expect(optionValues('voucher-client-select')).toEqual(['client-3', 'client-4']));
    await user.selectOptions(screen.getByTestId('voucher-client-select'), 'client-3');
    await user.selectOptions(screen.getByTestId('voucher-cash-account-select'), 'acc-cash');
    await user.selectOptions(screen.getByTestId('voucher-income-account-select'), 'acc-sales');
    await user.clear(screen.getByTestId('voucher-amount-input'));
    await user.type(screen.getByTestId('voucher-amount-input'), '800');
    await user.click(screen.getByTestId('voucher-form-save-draft-button'));

    await waitFor(() => expect(http.post).toHaveBeenCalledTimes(1));
    const body = http.post.mock.calls[0][1];
    expect(body).toMatchObject({
      voucherType: 'RECEIPT',
      voucherTo: 'CLIENT',
      notes: 'Consulting fee',
      amount: 800,
      // Fix (SOUPFIN-162): the client's AccountServices, resolved through its
      // portfolio, not the Client id under a `client` key the backend ignores.
      accountServices: { id: 'as-3' },
      cashAccount: { id: 'acc-cash' },
      incomeAccount: { id: 'acc-sales' },
    });
    expect(body).not.toHaveProperty('expenseAccount');
    expect(body).not.toHaveProperty('paymentMethod');
    expect(body).not.toHaveProperty('client');
  });

  it('blocks an empty payment with the required-field messages and sends nothing', async () => {
    const user = userEvent.setup();
    renderAt('/accounting/vouchers/new');
    await waitForAccounts();

    await user.click(screen.getByTestId('voucher-form-save-draft-button'));

    expect(await screen.findByText('Description is required')).toBeInTheDocument();
    expect(screen.getByText('Bank/Cash account is required')).toBeInTheDocument();
    expect(screen.getByText('Expense account is required for payment vouchers')).toBeInTheDocument();
    expect(screen.getByText('Amount must be greater than 0')).toBeInTheDocument();
    expect(screen.getByText('Select a vendor')).toBeInTheDocument();
    expect(http.post).not.toHaveBeenCalled();
  });

  it('asks a receipt for an income account', async () => {
    const user = userEvent.setup();
    renderAt('/accounting/voucher/receipt');
    await waitForAccounts();

    await user.type(screen.getByTestId('voucher-notes-input'), 'Fee');
    await user.selectOptions(screen.getByTestId('voucher-cash-account-select'), 'acc-cash');
    await user.type(screen.getByTestId('voucher-amount-input'), '10');
    await user.click(screen.getByTestId('voucher-form-save-draft-button'));

    expect(await screen.findByText('Income account is required for receipt vouchers')).toBeInTheDocument();
    expect(screen.queryByText('Expense account is required for payment vouchers')).not.toBeInTheDocument();
    expect(http.post).not.toHaveBeenCalled();
  });
});

describe('VoucherFormPage module gating', () => {
  it('shows the module-disabled banner when the accounts query is refused with 403', async () => {
    accountsResponse = () => Promise.reject(moduleDisabled403('Ledger', '/rest/ledgerAccount/index.json'));
    renderAt('/accounting/vouchers/new');

    const banner = await screen.findByTestId('voucher-form-module-disabled');
    expect(banner).toHaveTextContent(/Ledger/i);
    expect(banner).toHaveTextContent('account dropdowns are unavailable until the module is enabled');
    // The form is still there, with nothing to pick.
    expect(screen.getByTestId('voucher-form-fields')).toBeInTheDocument();
    expect(optionValues('voucher-cash-account-select')).toEqual([]);
  });

  it('explains a 403 from the save instead of printing the axios message', async () => {
    http.post.mockRejectedValue(moduleDisabled403('Voucher', '/rest/voucher/save.json'));
    const user = userEvent.setup();
    renderAt('/accounting/vouchers/new');
    await waitForAccounts();

    await user.type(screen.getByTestId('voucher-notes-input'), 'Rent');
    await waitFor(() => expect(optionValues('voucher-vendor-select')).toContain('vendor-7'));
    await user.selectOptions(screen.getByTestId('voucher-vendor-select'), 'vendor-7');
    await user.selectOptions(screen.getByTestId('voucher-cash-account-select'), 'acc-cash');
    await user.selectOptions(screen.getByTestId('voucher-expense-account-select'), 'acc-rent');
    await user.type(screen.getByTestId('voucher-amount-input'), '10');
    await user.click(screen.getByTestId('voucher-form-save-draft-button'));

    const error = await screen.findByTestId('voucher-form-error');
    // parseApiError names the module from the URL: /voucher belongs to Accounting.
    expect(error).toHaveTextContent('Accounting module');
    expect(error).not.toHaveTextContent('Request failed with status code');
    expect(screen.getByTestId('location')).toHaveTextContent('/accounting/vouchers/new');
  });
});

// Added (SOUPFIN-162): the party fields were free-text inputs whose text was
// posted as the FK id. They are now selects over the real records.
describe('VoucherFormPage party selects (SOUPFIN-162)', () => {
  async function fillPaymentBasics(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByTestId('voucher-notes-input'), 'Rent');
    await user.selectOptions(screen.getByTestId('voucher-cash-account-select'), 'acc-bank');
    await user.selectOptions(screen.getByTestId('voucher-expense-account-select'), 'acc-rent');
    await user.type(screen.getByTestId('voucher-amount-input'), '100');
  }

  it('the vendor field is a select listing only the vendors the backend returned', async () => {
    renderAt('/accounting/vouchers/new');
    await waitForAccounts();

    const vendor = screen.getByTestId('voucher-vendor-select');
    expect(vendor.tagName).toBe('SELECT');
    await waitFor(() => expect(optionValues('voucher-vendor-select')).toEqual(['vendor-7', 'vendor-8']));
    expect(within(vendor).getByRole('option', { name: 'Acme Landlords' })).toBeInTheDocument();
    expect(http.get).toHaveBeenCalledWith(expect.stringMatching(/^\/trading\/vendor\/index\.json\?.*max=100/));
  });

  it('a payment to a vendor sends that vendor id and no other party', async () => {
    const user = userEvent.setup();
    renderAt('/accounting/vouchers/new');
    await waitForAccounts();
    await fillPaymentBasics(user);
    await waitFor(() => expect(optionValues('voucher-vendor-select')).toContain('vendor-8'));
    await user.selectOptions(screen.getByTestId('voucher-vendor-select'), 'vendor-8');
    await user.click(screen.getByTestId('voucher-form-save-draft-button'));

    await waitFor(() => expect(http.post).toHaveBeenCalledTimes(1));
    const body = http.post.mock.calls[0][1];
    expect(body.vendor).toEqual({ id: 'vendor-8' });
    for (const key of ['staff', 'accountServices', 'client']) expect(body).not.toHaveProperty(key);
  });

  it('a payment to staff sends the agent as staff', async () => {
    const user = userEvent.setup();
    renderAt('/accounting/vouchers/new');
    await waitForAccounts();
    await fillPaymentBasics(user);
    await user.click(screen.getByLabelText('Staff'));
    await waitFor(() => expect(optionValues('voucher-staff-select')).toEqual(['agent-1']));
    expect(within(screen.getByTestId('voucher-staff-select')).getByRole('option', { name: 'Ama Owusu' })).toBeInTheDocument();
    await user.selectOptions(screen.getByTestId('voucher-staff-select'), 'agent-1');
    await user.click(screen.getByTestId('voucher-form-save-draft-button'));

    await waitFor(() => expect(http.post).toHaveBeenCalledTimes(1));
    const body = http.post.mock.calls[0][1];
    expect(body).toMatchObject({ voucherTo: 'STAFF', staff: { id: 'agent-1' } });
    expect(body).not.toHaveProperty('vendor');
  });

  it('refuses a client with no account and sends nothing', async () => {
    const user = userEvent.setup();
    renderAt('/accounting/voucher/receipt');
    await waitForAccounts();
    await user.type(screen.getByTestId('voucher-notes-input'), 'Fee');
    await user.selectOptions(screen.getByTestId('voucher-cash-account-select'), 'acc-cash');
    await user.selectOptions(screen.getByTestId('voucher-income-account-select'), 'acc-sales');
    await user.type(screen.getByTestId('voucher-amount-input'), '10');
    await waitFor(() => expect(optionValues('voucher-client-select')).toContain('client-4'));
    await user.selectOptions(screen.getByTestId('voucher-client-select'), 'client-4');
    await user.click(screen.getByTestId('voucher-form-save-draft-button'));

    expect(await screen.findByText(/This client has no account/)).toBeInTheDocument();
    expect(http.post).not.toHaveBeenCalled();
  });

  it('a tenant with no vendors (zero) sees an empty list, a hint and the + button', async () => {
    vendorsResponse = () => Promise.resolve({ data: [] });
    const user = userEvent.setup();
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    renderAt('/accounting/vouchers/new');
    await waitForAccounts();

    expect(await screen.findByText('No vendors yet. Use + to add one.')).toBeInTheDocument();
    expect(optionValues('voucher-vendor-select')).toEqual([]);
    await user.click(screen.getByTestId('voucher-add-vendor-button'));
    expect(open).toHaveBeenCalledWith('/vendors/new', '_blank', 'noopener,noreferrer');

    await fillPaymentBasics(user);
    await user.click(screen.getByTestId('voucher-form-save-draft-button'));
    expect(await screen.findByText('Select a vendor')).toBeInTheDocument();
    expect(http.post).not.toHaveBeenCalled();
  });

  it('lists every vendor of a full page (100, overflow) and keeps them selectable', async () => {
    vendorsResponse = () =>
      Promise.resolve({ data: Array.from({ length: 100 }, (_, i) => ({ id: `v-${i}`, name: `Vendor ${i}` })) });
    const user = userEvent.setup();
    renderAt('/accounting/vouchers/new');
    await waitForAccounts();

    await waitFor(() => expect(optionValues('voucher-vendor-select')).toHaveLength(100));
    await fillPaymentBasics(user);
    await user.selectOptions(screen.getByTestId('voucher-vendor-select'), 'v-99');
    await user.click(screen.getByTestId('voucher-form-save-draft-button'));
    await waitFor(() => expect(http.post).toHaveBeenCalledTimes(1));
    expect(http.post.mock.calls[0][1].vendor).toEqual({ id: 'v-99' });
  });
});
