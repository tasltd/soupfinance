/**
 * SOUPFIN-102: a user on a custom role sees only what the role allows.
 *
 * Covers the four places the UI applies the role:
 *  - usePermission()/usePermissions() read the auth store;
 *  - RequirePermission blocks a page opened by URL with a "permission" card;
 *  - the side nav hides areas the role cannot view;
 *  - list pages hide create/edit actions, and a permission 403 from the API
 *    reads "You do not have permission", not the generic load failure.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { usePermission, usePermissions } from '../../hooks/usePermission';
import { RequirePermission } from '../../components/feedback/RequirePermission';
import { SideNav } from '../../components/layout/SideNav';
import { InvoiceListPage } from '../invoices/InvoiceListPage';
import { BillListPage } from '../bills/BillListPage';

vi.mock('../../api/endpoints/bills', () => ({ listBills: vi.fn() }));
vi.mock('../../api', async () => {
  const actual = await vi.importActual<typeof import('../../api')>('../../api');
  return { ...actual, listInvoices: vi.fn() };
});

import { listBills } from '../../api/endpoints/bills';
import { listInvoices } from '../../api';

const SALES = ['ROLE_USER', 'ROLE_PERM_INVOICES_VIEW', 'ROLE_PERM_INVOICES_CREATE'];

function signInAs(roles: string[]) {
  useAuthStore.setState({
    user: { username: 'sales.rep', email: 'sales@test.com', roles },
    isAuthenticated: true,
    isInitialized: true,
  });
}

function wrap(ui: ReactNode, path = '/') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

const invoice = {
  id: 'inv-1',
  number: 1,
  status: 'DRAFT',
  invoiceDate: '2026-10-01',
  paymentDate: '2026-10-31',
  totalAmount: 100,
  amountDue: 100,
  accountServices: { id: 'as-1', serialised: 'Acme' },
};

beforeEach(() => {
  vi.clearAllMocks();
  signInAs(['ROLE_ADMIN']);
});

describe('usePermission / usePermissions', () => {
  it('reflects the signed-in user and updates when the role changes', () => {
    signInAs(SALES);
    const { result, rerender } = renderHook(() => ({
      createInvoice: usePermission('invoices', 'create'),
      viewBills: usePermission('bills', 'view'),
      all: usePermissions(),
    }));
    expect(result.current.createInvoice).toBe(true);
    expect(result.current.viewBills).toBe(false);
    expect(result.current.all.isRestricted).toBe(true);

    signInAs(['ROLE_ADMIN']);
    rerender();
    expect(result.current.viewBills).toBe(true);
    expect(result.current.all.isRestricted).toBe(false);
  });

  it('treats a signed-out user (no roles) as unrestricted — the API decides', () => {
    useAuthStore.setState({ user: null, isAuthenticated: false });
    const { result } = renderHook(() => usePermission('settings', 'delete'));
    expect(result.current).toBe(true);
  });
});

describe('RequirePermission', () => {
  it('renders the page when the role allows it', () => {
    signInAs(SALES);
    wrap(
      <RequirePermission area="invoices" action="create">
        <p>invoice form</p>
      </RequirePermission>
    );
    expect(screen.getByText('invoice form')).toBeInTheDocument();
  });

  it('shows "You do not have permission", never "module", when the role does not', () => {
    signInAs(SALES);
    wrap(
      <RequirePermission area="bills" action="create">
        <p>bill form</p>
      </RequirePermission>
    );
    expect(screen.queryByText('bill form')).not.toBeInTheDocument();
    const card = screen.getByTestId('permission-forbidden');
    expect(card).toHaveAttribute('data-error-kind', 'forbidden');
    expect(screen.getByTestId('permission-forbidden-title')).toHaveTextContent('You do not have permission');
    expect(card).not.toHaveTextContent(/module/i);
  });
});

describe('SideNav hides areas the role cannot view', () => {
  it('shows only Dashboard and Invoices to a Sales user', () => {
    signInAs(SALES);
    wrap(<SideNav />, '/dashboard');
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Invoices' })).toBeInTheDocument();
    for (const hidden of ['Bills', 'Clients', 'Payments', 'Ledger', 'Accounting', 'Reports', 'Settings']) {
      expect(screen.queryByRole('link', { name: hidden })).not.toBeInTheDocument();
    }
  });

  it('shows everything, including Settings → Roles, to an admin', () => {
    wrap(<SideNav />, '/settings/roles');
    for (const shown of ['Invoices', 'Bills', 'Clients', 'Payments', 'Reports', 'Settings']) {
      expect(screen.getByRole('link', { name: shown })).toBeInTheDocument();
    }
    expect(screen.getByRole('link', { name: 'Roles' })).toHaveAttribute('href', '/settings/roles');
  });
});

describe('List pages hide actions the role does not grant', () => {
  it('Sales can create invoices but not edit them', async () => {
    signInAs(SALES);
    vi.mocked(listInvoices).mockResolvedValue([invoice] as never);
    wrap(<InvoiceListPage />);
    expect(await screen.findByTestId('invoice-new-button')).toBeInTheDocument();
    await screen.findByTestId('invoice-row-inv-1');
    expect(screen.queryByTestId('invoice-edit-inv-1')).not.toBeInTheDocument();
  });

  it('a view-only invoice role sees no create buttons, even in the empty state', async () => {
    signInAs(['ROLE_USER', 'ROLE_PERM_INVOICES_VIEW']);
    vi.mocked(listInvoices).mockResolvedValue([]);
    wrap(<InvoiceListPage />);
    expect(await screen.findByTestId('invoice-list-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('invoice-new-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('invoice-create-first-button')).not.toBeInTheDocument();
  });

  it('an admin still sees create and edit', async () => {
    vi.mocked(listInvoices).mockResolvedValue([invoice] as never);
    wrap(<InvoiceListPage />);
    expect(await screen.findByTestId('invoice-edit-inv-1')).toBeInTheDocument();
    expect(screen.getByTestId('invoice-new-button')).toBeInTheDocument();
  });

  it('a permission 403 on the bill list reads "You do not have permission"', async () => {
    vi.mocked(listBills).mockRejectedValue(
      Object.assign(new Error('Request failed with status code 403'), {
        isAxiosError: true,
        config: { url: '/bill/index.json' },
        response: { status: 403, data: { timestamp: 1, status: 403, error: 'Forbidden', path: '/rest/bill/index.json' } },
      })
    );
    wrap(<BillListPage />);
    const card = await screen.findByTestId('bill-list-forbidden');
    expect(card).toHaveAttribute('data-error-kind', 'forbidden');
    expect(card).toHaveTextContent('You do not have permission');
    expect(screen.queryByText('Failed to load bills')).not.toBeInTheDocument();
  });

  it('a non-403 bill list failure keeps the generic retry message', async () => {
    vi.mocked(listBills).mockRejectedValue(new Error('boom'));
    wrap(<BillListPage />);
    expect(await screen.findByText('Failed to load bills')).toBeInTheDocument();
    expect(screen.queryByTestId('bill-list-forbidden')).not.toBeInTheDocument();
  });
});
