/**
 * Unit tests for the SOUPFIN-142 Chart of Accounts fixes.
 *
 * 1. The page lists accounts through listAllLedgerAccounts (every page), not
 *    listLedgerAccounts() — which got the backend default of 10 newest rows.
 * 2. Accounts whose ledger group cannot be derived go in an "Uncategorised"
 *    group (SOUPFIN-148). Before, they were dropped; if every account was
 *    affected the page rendered nothing at all, not even the empty state.
 * 3. The empty state explains where a chart comes from and offers a refresh.
 * 4. A role denial on the ledger renders as "access restricted", not
 *    "module not available" (SOUPFIN-150).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { LedgerAccount } from '../../../types';

vi.mock('../../../api/endpoints/ledger', async () => {
  const actual = await vi.importActual<typeof import('../../../api/endpoints/ledger')>(
    '../../../api/endpoints/ledger'
  );
  return { ...actual, listAllLedgerAccounts: vi.fn(), listLedgerAccounts: vi.fn() };
});

import { listAllLedgerAccounts, listLedgerAccounts } from '../../../api/endpoints/ledger';
import { ChartOfAccountsPage } from '../ChartOfAccountsPage';

const account = (over: Partial<LedgerAccount>): LedgerAccount =>
  ({
    id: 'x',
    code: '0000',
    name: 'Account',
    ledgerGroup: 'ASSET',
    balance: 0,
    isActive: true,
    ...over,
  }) as LedgerAccount;

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ChartOfAccountsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function axios403(url: string, data: unknown) {
  return Object.assign(new Error('Request failed with status code 403'), {
    isAxiosError: true,
    config: { url },
    response: { status: 403, data },
  });
}

describe('ChartOfAccountsPage (SOUPFIN-142)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads every account through listAllLedgerAccounts, never the 10-row default', async () => {
    // 32 accounts = the SERVICES template seeded at registration
    const seeded = Array.from({ length: 32 }, (_, i) =>
      account({ id: `s${i}`, code: String(1000 + i * 10), name: `Seeded ${i}`, ledgerGroup: i < 12 ? 'ASSET' : 'EXPENSE' })
    );
    vi.mocked(listAllLedgerAccounts).mockResolvedValue(seeded);
    renderPage();

    expect(await screen.findByTestId('coa-group-asset')).toHaveTextContent('12 accounts');
    expect(screen.getByTestId('coa-group-expense')).toHaveTextContent('20 accounts');
    expect(screen.getAllByTestId(/^coa-account-/)).toHaveLength(32);
    expect(listAllLedgerAccounts).toHaveBeenCalledTimes(1);
    expect(listLedgerAccounts).not.toHaveBeenCalled();
  });

  it('shows accounts with no derivable group under Uncategorised, after the known groups', async () => {
    vi.mocked(listAllLedgerAccounts).mockResolvedValue([
      account({ id: 'cash', code: '1000', name: 'Cash', ledgerGroup: 'ASSET' }),
      account({ id: 'odd', code: '9000', name: 'Mystery', ledgerGroup: undefined as unknown as LedgerAccount['ledgerGroup'] }),
      account({ id: 'bad', code: '9100', name: 'Typo group', ledgerGroup: 'ASSETS' as LedgerAccount['ledgerGroup'] }),
    ]);
    renderPage();

    const group = await screen.findByTestId('coa-group-uncategorised');
    expect(within(group).getByText('Uncategorised')).toBeInTheDocument();
    expect(within(group).getByText('2 accounts')).toBeInTheDocument();
    expect(screen.getByTestId('coa-group-note-uncategorised')).toHaveTextContent(
      'Give these accounts a category to include them in reports.'
    );
    expect(within(group).getByTestId('coa-account-odd')).toBeInTheDocument();
    expect(within(group).getByTestId('coa-account-bad')).toBeInTheDocument();
    // Known groups render first and keep their own accounts
    const groups = screen.getAllByTestId(/^coa-group-(asset|uncategorised)$/);
    expect(groups.map((g) => g.dataset.testid)).toEqual(['coa-group-asset', 'coa-group-uncategorised']);
  });

  it('renders the groups instead of a blank page when NO account has a known group', async () => {
    vi.mocked(listAllLedgerAccounts).mockResolvedValue(
      Array.from({ length: 5 }, (_, i) =>
        account({ id: `u${i}`, code: `${i}`, ledgerGroup: undefined as unknown as LedgerAccount['ledgerGroup'] })
      )
    );
    renderPage();

    expect(await screen.findByTestId('coa-group-uncategorised')).toHaveTextContent('5 accounts');
    expect(screen.queryByTestId('coa-empty')).not.toBeInTheDocument();
  });

  it('sorts accounts with a missing code without throwing', async () => {
    vi.mocked(listAllLedgerAccounts).mockResolvedValue([
      account({ id: 'b', code: '2000', name: 'B' }),
      account({ id: 'n', code: undefined as unknown as string, name: 'No code' }),
      account({ id: 'a', code: '1000', name: 'A' }),
    ]);
    renderPage();

    await screen.findByTestId('coa-table-asset');
    const rows = screen.getAllByTestId(/^coa-account-/).map((r) => r.dataset.testid);
    expect(rows).toEqual(['coa-account-n', 'coa-account-a', 'coa-account-b']);
  });

  it('empty state explains the starter chart and refreshes on click', async () => {
    vi.mocked(listAllLedgerAccounts).mockResolvedValueOnce([]).mockResolvedValueOnce([
      account({ id: 'cash', code: '1000', name: 'Cash' }),
    ]);
    renderPage();

    expect(await screen.findByTestId('coa-empty')).toHaveTextContent('No accounts found');
    expect(screen.getByTestId('coa-empty-hint')).toHaveTextContent(
      'A starter chart is normally added when your company signs up.'
    );
    await userEvent.click(screen.getByRole('button', { name: /Refresh accounts/ }));

    expect(await screen.findByTestId('coa-account-cash')).toBeInTheDocument();
    expect(listAllLedgerAccounts).toHaveBeenCalledTimes(2);
  });

  it('labels a role denial as access restricted, not module unavailable', async () => {
    vi.mocked(listAllLedgerAccounts).mockRejectedValue(
      axios403('/ledgerAccount/index.json', { error: 'Forbidden' })
    );
    renderPage();

    const card = await screen.findByTestId('coa-error');
    expect(card).toHaveAttribute('data-error-kind', 'forbidden');
    expect(card).toHaveTextContent('Ledger access restricted');
    expect(card).toHaveTextContent('Your role does not include access to the Ledger.');
    expect(card).not.toHaveTextContent('module is not available');
  });

  it('still labels the interceptor 403 as module disabled', async () => {
    vi.mocked(listAllLedgerAccounts).mockRejectedValue(
      axios403('/ledgerAccount/index.json', { error: 'Finance module is not enabled for this tenant' })
    );
    renderPage();

    await waitFor(() => expect(screen.getByTestId('coa-error')).toHaveAttribute('data-error-kind', 'module_disabled'));
    expect(screen.getByTestId('coa-error')).toHaveTextContent('Ledger module is not available');
  });
});
