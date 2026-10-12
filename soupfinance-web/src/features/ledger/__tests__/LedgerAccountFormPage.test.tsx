/**
 * Unit tests for LedgerAccountFormPage (SOUPFIN-149).
 *
 * Verifies:
 *  - create: required fields, then createLedgerAccount with the domain payload
 *  - edit: form loads the account, save calls updateLedgerAccount (PUT, no CSRF)
 *  - parent dropdown: same group only, never the account itself, can be cleared
 *  - system / editable=false accounts open read-only with save disabled
 *  - a failed save shows the backend message and keeps the user on the form
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LedgerAccountFormPage } from '../LedgerAccountFormPage';
import { toLedgerAccountPayload } from '../ledgerAccountForm';
import type { LedgerAccount, LedgerAccountCategory } from '../../../types';

vi.mock('../../../api/endpoints/ledger', async () => {
  const actual = await vi.importActual<typeof import('../../../api/endpoints/ledger')>(
    '../../../api/endpoints/ledger'
  );
  return {
    ...actual,
    getLedgerAccount: vi.fn(),
    createLedgerAccount: vi.fn(),
    updateLedgerAccount: vi.fn(),
    listLedgerAccounts: vi.fn(),
    listLedgerAccountCategories: vi.fn(),
  };
});

import {
  getLedgerAccount,
  createLedgerAccount,
  updateLedgerAccount,
  listLedgerAccounts,
  listLedgerAccountCategories,
} from '../../../api/endpoints/ledger';

const categories: LedgerAccountCategory[] = [
  { id: 'cat-cash', name: 'Cash and Bank', ledgerGroup: 'ASSET' },
  { id: 'cat-sales', name: 'Sales', ledgerGroup: 'INCOME' },
];

const account = (over: Partial<LedgerAccount> = {}): LedgerAccount => ({
  id: 'acc-1',
  code: '1000',
  number: '1000',
  name: 'Main Bank',
  ledgerGroup: 'ASSET',
  ledgerAccountCategory: { id: 'cat-cash' },
  currency: 'GHS',
  cashFlow: true,
  isActive: true,
  balance: 0,
  ...over,
});

const accounts: LedgerAccount[] = [
  account(),
  account({ id: 'acc-2', code: '1100', number: '1100', name: 'Petty Cash' }),
  account({ id: 'acc-3', code: '4000', number: '4000', name: 'Consulting Revenue', ledgerGroup: 'INCOME', ledgerAccountCategory: { id: 'cat-sales' } }),
];

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/ledger/accounts" element={<div data-testid="coa-route">COA</div>} />
          <Route path="/ledger/accounts/new" element={<LedgerAccountFormPage />} />
          <Route path="/ledger/accounts/:id/edit" element={<LedgerAccountFormPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

async function waitForCategories() {
  const select = await screen.findByTestId('ledger-account-form-category');
  await waitFor(() => expect(within(select).getByRole('option', { name: /Cash and Bank/ })).toBeInTheDocument());
  return select;
}

describe('toLedgerAccountPayload', () => {
  it('maps form fields to domain names with nested FKs', () => {
    expect(
      toLedgerAccountPayload({
        number: ' 1015 ',
        name: ' Petty Cash ',
        ledgerAccountCategoryId: 'cat-cash',
        parentAccountId: 'acc-1',
        currency: 'USD',
        cashFlow: true,
        description: 'Float',
      })
    ).toEqual({
      number: '1015',
      name: 'Petty Cash',
      description: 'Float',
      ledgerAccountCategory: { id: 'cat-cash' },
      parentAccount: { id: 'acc-1' },
      currency: 'USD',
      cashFlow: true,
    });
  });

  it('sends parentAccount null and drops empty optionals', () => {
    const payload = toLedgerAccountPayload({
      number: '',
      name: 'X',
      ledgerAccountCategoryId: 'cat-cash',
      parentAccountId: '',
      currency: 'GHS',
      cashFlow: false,
      description: '   ',
    });
    expect(payload.parentAccount).toBeNull();
    expect(payload.number).toBeUndefined();
    expect(payload.description).toBeUndefined();
    expect(payload).not.toHaveProperty('code');
  });
});

describe('LedgerAccountFormPage (SOUPFIN-149)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listLedgerAccountCategories).mockResolvedValue(categories);
    vi.mocked(listLedgerAccounts).mockResolvedValue(accounts);
  });

  it('blocks submit until name and category are filled', async () => {
    const user = userEvent.setup();
    renderAt('/ledger/accounts/new');
    await waitForCategories();

    await user.click(screen.getByTestId('ledger-account-form-save'));

    expect(await screen.findByText('Account name is required')).toBeInTheDocument();
    expect(screen.getByText('Category is required')).toBeInTheDocument();
    expect(createLedgerAccount).not.toHaveBeenCalled();
  });

  it('creates an account with the domain payload and returns to the chart', async () => {
    const user = userEvent.setup();
    vi.mocked(createLedgerAccount).mockResolvedValue(account({ id: 'new-1', name: 'Mobile Money' }));
    renderAt('/ledger/accounts/new');
    const category = await waitForCategories();

    await user.type(screen.getByTestId('ledger-account-form-code'), '1020');
    await user.type(screen.getByTestId('ledger-account-form-name'), 'Mobile Money');
    await user.selectOptions(category, 'cat-cash');
    await user.selectOptions(screen.getByTestId('ledger-account-form-parent'), 'acc-1');
    await user.selectOptions(screen.getByTestId('ledger-account-form-currency'), 'USD');
    await user.click(screen.getByTestId('ledger-account-form-cash-flow'));
    await user.click(screen.getByTestId('ledger-account-form-save'));

    await waitFor(() => expect(createLedgerAccount).toHaveBeenCalledTimes(1));
    expect(vi.mocked(createLedgerAccount).mock.calls[0][0]).toEqual({
      number: '1020',
      name: 'Mobile Money',
      description: undefined,
      ledgerAccountCategory: { id: 'cat-cash' },
      parentAccount: { id: 'acc-1' },
      currency: 'USD',
      cashFlow: true,
    });
    expect(await screen.findByTestId('coa-route')).toBeInTheDocument();
  });

  it('offers only same-group parents and lists "None" first', async () => {
    const user = userEvent.setup();
    renderAt('/ledger/accounts/new');
    const category = await waitForCategories();
    await waitFor(() =>
      expect(within(screen.getByTestId('ledger-account-form-parent')).getAllByRole('option')).toHaveLength(4)
    );

    await user.selectOptions(category, 'cat-sales');

    const parentOptions = within(screen.getByTestId('ledger-account-form-parent')).getAllByRole('option');
    expect(parentOptions.map((o) => o.textContent)).toEqual(['None (top level)', '4000 - Consulting Revenue']);
  });

  it('loads an account for edit, excludes it from parents and saves with update (PUT)', async () => {
    const user = userEvent.setup();
    vi.mocked(getLedgerAccount).mockResolvedValue(
      account({ id: 'acc-2', number: '1100', name: 'Petty Cash', parentAccount: { id: 'acc-1' } })
    );
    vi.mocked(updateLedgerAccount).mockResolvedValue(account({ id: 'acc-2', name: 'Petty Cash Float' }));
    renderAt('/ledger/accounts/acc-2/edit');

    const name = await screen.findByTestId('ledger-account-form-name');
    await waitFor(() => expect(name).toHaveValue('Petty Cash'));
    expect(screen.getByTestId('ledger-account-form-heading')).toHaveTextContent('Edit Account');
    await waitFor(() => expect(screen.getByTestId('ledger-account-form-parent')).toHaveValue('acc-1'));
    const parentLabels = within(screen.getByTestId('ledger-account-form-parent'))
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(parentLabels).not.toContain('1100 - Petty Cash');

    await user.clear(name);
    await user.type(name, 'Petty Cash Float');
    // Clearing the parent must reach the backend as null so the FK detaches.
    await user.selectOptions(screen.getByTestId('ledger-account-form-parent'), '');
    await user.click(screen.getByTestId('ledger-account-form-save'));

    await waitFor(() => expect(updateLedgerAccount).toHaveBeenCalledTimes(1));
    const [id, payload] = vi.mocked(updateLedgerAccount).mock.calls[0];
    expect(id).toBe('acc-2');
    expect(payload).toMatchObject({ name: 'Petty Cash Float', parentAccount: null, number: '1100', cashFlow: true });
    expect(createLedgerAccount).not.toHaveBeenCalled();
    expect(await screen.findByTestId('coa-route')).toBeInTheDocument();
  });

  it('opens a system account read-only with save disabled', async () => {
    vi.mocked(getLedgerAccount).mockResolvedValue(account({ systemAccount: true }));
    renderAt('/ledger/accounts/acc-1/edit');

    expect(await screen.findByTestId('ledger-account-form-readonly')).toHaveTextContent('system account');
    expect(screen.getByTestId('ledger-account-form-save')).toBeDisabled();
    expect(screen.getByTestId('ledger-account-form-name')).toBeDisabled();
  });

  it('opens an editable=false account read-only', async () => {
    vi.mocked(getLedgerAccount).mockResolvedValue(account({ editable: false }));
    renderAt('/ledger/accounts/acc-1/edit');

    expect(await screen.findByTestId('ledger-account-form-readonly')).toHaveTextContent('Editing is turned off');
    expect(screen.getByTestId('ledger-account-form-save')).toBeDisabled();
  });

  it('shows the backend error and stays on the form when save fails', async () => {
    const user = userEvent.setup();
    vi.mocked(createLedgerAccount).mockRejectedValue(
      Object.assign(new Error('Request failed'), {
        isAxiosError: true,
        response: { status: 422, data: { message: 'Property [name] must be unique' } },
      })
    );
    renderAt('/ledger/accounts/new');
    const category = await waitForCategories();

    await user.type(screen.getByTestId('ledger-account-form-name'), 'Main Bank');
    await user.selectOptions(category, 'cat-cash');
    await user.click(screen.getByTestId('ledger-account-form-save'));

    expect(await screen.findByTestId('ledger-account-form-error')).toBeInTheDocument();
    expect(screen.queryByTestId('coa-route')).not.toBeInTheDocument();
  });

  it('explains an empty category list instead of rendering a silent empty dropdown', async () => {
    vi.mocked(listLedgerAccountCategories).mockRejectedValue(
      Object.assign(new Error('Forbidden'), { isAxiosError: true, response: { status: 403, data: {} } })
    );
    renderAt('/ledger/accounts/new');

    expect(await screen.findByTestId('ledger-account-form-categories-error')).toBeInTheDocument();
  });
});
