/**
 * Added (SOUPFIN-158): the opening-balances wizard.
 *
 * Round trip: accounts load -> amounts typed -> grid must balance -> post ->
 * the exact lines reach the endpoint -> success links to the Trial Balance.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import OpeningBalancesPage from '../OpeningBalancesPage';
import { listAllLedgerAccounts } from '../../../api/endpoints/ledger';
import { listFinancialYears, postOpeningBalances } from '../../../api/endpoints/financialYears';
import type { LedgerAccount } from '../../../types';

vi.mock('../../../api/endpoints/ledger', () => ({ listAllLedgerAccounts: vi.fn() }));
vi.mock('../../../api/endpoints/financialYears', () => ({
  listFinancialYears: vi.fn(),
  postOpeningBalances: vi.fn(),
}));

const account = (id: string, code: string, name: string, ledgerGroup: LedgerAccount['ledgerGroup']): LedgerAccount => ({
  id, code, name, ledgerGroup, isActive: true, balance: 0,
});

const ACCOUNTS = [
  account('cash', '1000', 'Cash at Bank', 'ASSET'),
  account('ar', '1100', 'Accounts Receivable', 'ASSET'),
  account('ap', '2000', 'Accounts Payable', 'LIABILITY'),
  account('obe', '3200', 'Opening Balance Equity', 'EQUITY'),
  account('sales', '4000', 'Sales', 'REVENUE'),
];

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <OpeningBalancesPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const type = (testId: string, value: string) => fireEvent.change(screen.getByTestId(testId), { target: { value } });

beforeEach(() => {
  vi.mocked(listAllLedgerAccounts).mockResolvedValue(ACCOUNTS);
  vi.mocked(listFinancialYears).mockResolvedValue([
    { id: 'fy26', name: 'FY 2026', fromDate: '2026-01-01', toDate: '2026-12-31' },
    { id: 'fy25', name: 'FY 2025', fromDate: '2025-01-01', toDate: '2025-12-31' },
  ]);
});

describe('OpeningBalancesPage', () => {
  it('groups the chart of accounts and defaults the date to the day before the first year', async () => {
    renderPage();
    const grid = await screen.findByTestId('opening-balances-grid');
    expect(grid).toHaveTextContent('Assets');
    expect(grid).toHaveTextContent('Liabilities');
    expect(grid).toHaveTextContent('Income');
    await waitFor(() => expect(screen.getByTestId('opening-balances-date-input')).toHaveValue('2024-12-31'));
    expect(screen.getByTestId('opening-balances-submit')).toBeDisabled();
    expect(screen.getByTestId('opening-balances-balance-status')).toHaveTextContent('Enter at least one balance');
  });

  it('blocks an unbalanced grid, balances it into Opening Balance Equity, and posts the lines', async () => {
    vi.mocked(postOpeningBalances).mockResolvedValue({ asOfDate: '2024-12-31', lineCount: 3, totalDebit: 1500, totalCredit: 1500 });
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId('opening-balances-grid');
    await waitFor(() => expect(screen.getByTestId('opening-balances-date-input')).toHaveValue('2024-12-31'));

    type('opening-balance-debit-cash', '1,000');
    type('opening-balance-debit-ar', '500');
    type('opening-balance-credit-ap', '900');
    expect(screen.getByTestId('opening-balances-balance-status')).toHaveTextContent(/Out of balance by .*600\.00/);
    expect(screen.getByTestId('opening-balances-submit')).toBeDisabled();

    await user.click(screen.getByTestId('opening-balances-plug-button'));
    expect(screen.getByTestId('opening-balance-credit-obe')).toHaveValue('600.00');
    expect(screen.getByTestId('opening-balances-balance-status')).toHaveTextContent('Debits equal credits');
    expect(screen.getByTestId('opening-balances-total-debit')).toHaveTextContent('1,500.00');
    expect(screen.getByTestId('opening-balances-total-credit')).toHaveTextContent('1,500.00');

    await user.click(screen.getByTestId('opening-balances-submit'));
    await waitFor(() => expect(postOpeningBalances).toHaveBeenCalledTimes(1));
    expect(vi.mocked(postOpeningBalances).mock.calls[0][0]).toEqual({
      asOfDate: '2024-12-31',
      lines: [
        { ledgerAccount: { id: 'cash' }, debit: 1000, credit: 0 },
        { ledgerAccount: { id: 'ar' }, debit: 500, credit: 0 },
        { ledgerAccount: { id: 'ap' }, debit: 0, credit: 900 },
        { ledgerAccount: { id: 'obe' }, debit: 0, credit: 600 },
      ],
    });
    const success = await screen.findByTestId('opening-balances-success');
    expect(success).toHaveTextContent('Posted 3 opening balances as of December 31, 2024');
    expect(screen.getByTestId('opening-balances-trial-balance-link')).toHaveAttribute('href', '/reports/trial-balance');
  });

  it('marks a row with both a debit and a credit and blocks posting', async () => {
    renderPage();
    await screen.findByTestId('opening-balances-grid');
    type('opening-balance-debit-cash', '100');
    type('opening-balance-credit-cash', '100');
    expect(screen.getByTestId('opening-balance-row-error-cash')).toHaveTextContent('not both');
    expect(screen.getByTestId('opening-balances-submit')).toBeDisabled();
  });

  it('puts a locked-period rejection on the date field', async () => {
    vi.mocked(postOpeningBalances).mockRejectedValue(
      Object.assign(new Error('x'), {
        isAxiosError: true, config: { url: '/financialYear/openingBalances.json' },
        response: { status: 422, data: { code: 'PERIOD_LOCKED', lockDate: '2025-12-31' } },
      })
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId('opening-balances-grid');
    type('opening-balance-debit-cash', '250');
    type('opening-balance-credit-obe', '250');
    await user.click(screen.getByTestId('opening-balances-submit'));
    expect(await screen.findByTestId('opening-balances-date-error')).toHaveTextContent('closed up to December 31, 2025');
    expect(screen.queryByTestId('opening-balances-error')).not.toBeInTheDocument();
    expect(screen.getByTestId('opening-balances-date-input')).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows any other failure as a banner', async () => {
    vi.mocked(postOpeningBalances).mockRejectedValue(
      Object.assign(new Error('x'), {
        isAxiosError: true, config: { url: '/financialYear/openingBalances.json' }, response: { status: 404, data: {} },
      })
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId('opening-balances-grid');
    type('opening-balance-debit-cash', '250');
    type('opening-balance-credit-obe', '250');
    await user.click(screen.getByTestId('opening-balances-submit'));
    expect(await screen.findByTestId('opening-balances-error')).toBeInTheDocument();
  });

  it('shows an accounts failure as an error, and an empty chart as a set-up link', async () => {
    vi.mocked(listAllLedgerAccounts).mockRejectedValueOnce(new Error('down'));
    const { unmount } = renderPage();
    expect(await screen.findByTestId('opening-balances-accounts-error')).toBeInTheDocument();
    unmount();

    vi.mocked(listAllLedgerAccounts).mockResolvedValueOnce([]);
    renderPage();
    expect(await screen.findByTestId('opening-balances-no-accounts')).toHaveTextContent('chart of accounts is empty');
  });

  it('defaults to today when there are no financial years', async () => {
    vi.mocked(listFinancialYears).mockResolvedValue([]);
    renderPage();
    await screen.findByTestId('opening-balances-grid');
    expect(screen.getByTestId('opening-balances-date-input')).toHaveValue(new Date().toLocaleDateString('en-CA'));
  });
});
