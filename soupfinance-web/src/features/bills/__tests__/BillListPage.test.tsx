/**
 * Unit tests for BillListPage component
 * Tests rendering, loading/error/empty states, data display, and navigation
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BillListPage } from '../BillListPage';
import type { Bill, BillStatus } from '../../../types';

// Mock the bills API - must match the import path in BillListPage
vi.mock('../../../api/endpoints/bills', () => ({
  listBills: vi.fn(),
}));

// Mock the account store for currency formatting
vi.mock('../../../stores', () => ({
  useFormatCurrency: () => (amount: number | null | undefined) => {
    const value = amount ?? 0;
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  },
}));

import { listBills } from '../../../api/endpoints/bills';
// Added (SOUPFIN-160): Axios-shaped 403/500 errors
import { moduleDisabled403, roleDenied403, serverError500 } from '../../../test/apiErrorFixtures';

// ============================================================================
// Test Helpers
// ============================================================================

function createMockBill(overrides: Partial<Bill> = {}): Bill {
  return {
    id: 'bill-123',
    billNumber: 'BILL-2024-001',
    vendor: { id: 'vendor-1', name: 'Acme Supplies' },
    billDate: '2024-01-15',
    paymentDate: '2024-02-15',
    status: 'PENDING' as BillStatus,
    subtotal: 1000,
    taxAmount: 100,
    totalAmount: 1050,
    amountPaid: 0,
    amountDue: 1050,
    dateCreated: '2024-01-15T10:00:00Z',
    lastUpdated: '2024-01-15T10:00:00Z',
    ...overrides,
  } as Bill;
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
}

function renderBillListPage() {
  const queryClient = createQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <BillListPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// ============================================================================
// Tests
// ============================================================================

describe('BillListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders the page container with correct test id', async () => {
      vi.mocked(listBills).mockResolvedValue([]);

      renderBillListPage();

      expect(await screen.findByTestId('bill-list-page')).toBeInTheDocument();
    });

    it('renders the page heading', async () => {
      vi.mocked(listBills).mockResolvedValue([]);

      renderBillListPage();

      expect(await screen.findByTestId('bill-list-heading')).toHaveTextContent('Bills');
    });

    it('renders the page description', async () => {
      vi.mocked(listBills).mockResolvedValue([]);

      renderBillListPage();

      expect(await screen.findByText('Manage your expenses and bills')).toBeInTheDocument();
    });

    it('renders the New Bill button', async () => {
      vi.mocked(listBills).mockResolvedValue([]);

      renderBillListPage();

      const newButton = await screen.findByTestId('bill-new-button');
      expect(newButton).toBeInTheDocument();
      expect(newButton).toHaveTextContent('New Bill');
      expect(newButton).toHaveAttribute('href', '/bills/new');
    });
  });

  describe('loading state', () => {
    it('displays loading message while fetching bills', () => {
      // Never resolves to keep loading state
      vi.mocked(listBills).mockImplementation(() => new Promise(() => {}));

      renderBillListPage();

      expect(screen.getByTestId('bill-list-loading')).toBeInTheDocument();
      expect(screen.getByText('Loading bills...')).toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('displays error message when fetch fails', async () => {
      vi.mocked(listBills).mockRejectedValue(new Error('Network error'));

      renderBillListPage();

      // Changed (SOUPFIN-160): ApiErrorState shows the error's own message
      expect(await screen.findByTestId('bill-list-error')).toBeInTheDocument();
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    it('displays retry button in error state', async () => {
      vi.mocked(listBills).mockRejectedValue(new Error('Network error'));

      renderBillListPage();

      const retryButton = await screen.findByRole('button', { name: /retry/i });
      expect(retryButton).toBeInTheDocument();
    });

    it('displays helpful error description', async () => {
      vi.mocked(listBills).mockRejectedValue(new Error('Network error'));

      renderBillListPage();

      expect(await screen.findByTestId('bill-list-error-message')).toHaveTextContent('Network error');
    });
  });

  describe('empty state', () => {
    it('displays empty state when no bills exist', async () => {
      vi.mocked(listBills).mockResolvedValue([]);

      renderBillListPage();

      expect(await screen.findByTestId('bill-list-empty')).toBeInTheDocument();
    });

    it('displays helpful empty state message', async () => {
      vi.mocked(listBills).mockResolvedValue([]);

      renderBillListPage();

      expect(await screen.findByText('No bills yet')).toBeInTheDocument();
      expect(screen.getByText(/Track your expenses by adding bills/i)).toBeInTheDocument();
    });

    it('displays create bill button in empty state', async () => {
      vi.mocked(listBills).mockResolvedValue([]);

      renderBillListPage();

      const createButton = await screen.findByTestId('bill-create-first-button');
      expect(createButton).toBeInTheDocument();
      expect(createButton).toHaveTextContent('Create Bill');
      expect(createButton).toHaveAttribute('href', '/bills/new');
    });
  });

  describe('data display', () => {
    it('renders bill table when bills exist', async () => {
      const mockBills = [createMockBill()];
      vi.mocked(listBills).mockResolvedValue(mockBills);

      renderBillListPage();

      expect(await screen.findByTestId('bill-list-table')).toBeInTheDocument();
    });

    it('renders table headers correctly', async () => {
      const mockBills = [createMockBill()];
      vi.mocked(listBills).mockResolvedValue(mockBills);

      renderBillListPage();

      await screen.findByTestId('bill-list-table');

      expect(screen.getByText('Bill #')).toBeInTheDocument();
      expect(screen.getByText('Vendor')).toBeInTheDocument();
      expect(screen.getByText('Issue Date')).toBeInTheDocument();
      expect(screen.getByText('Due Date')).toBeInTheDocument();
      expect(screen.getByText('Amount')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
      expect(screen.getByText('Actions')).toBeInTheDocument();
    });

    it('renders bill row with correct data', async () => {
      const mockBill = createMockBill({
        id: 'bill-456',
        billNumber: 'BILL-2024-042',
        vendor: { id: 'vendor-2', name: 'Office Supplies Co' },
        billDate: '2024-03-01',
        paymentDate: '2024-03-31',
        totalAmount: 2500.50,
        status: 'PENDING',
      });
      vi.mocked(listBills).mockResolvedValue([mockBill]);

      renderBillListPage();

      const row = await screen.findByTestId('bill-row-bill-456');
      expect(row).toBeInTheDocument();

      // Check bill number link
      const billLink = within(row).getByTestId('bill-link-bill-456');
      expect(billLink).toHaveTextContent('BILL-2024-042');
      expect(billLink).toHaveAttribute('href', '/bills/bill-456');

      // Check vendor name
      expect(within(row).getByText('Office Supplies Co')).toBeInTheDocument();

      // Check dates
      expect(within(row).getByText('2024-03-01')).toBeInTheDocument();
      expect(within(row).getByText('2024-03-31')).toBeInTheDocument();

      // Check amount - formatted with $ and .00 (with thousands separator)
      expect(within(row).getByText('$2,500.50')).toBeInTheDocument();
    });

    it('renders multiple bills', async () => {
      const mockBills = [
        createMockBill({ id: 'bill-1', billNumber: 'BILL-001' }),
        createMockBill({ id: 'bill-2', billNumber: 'BILL-002' }),
        createMockBill({ id: 'bill-3', billNumber: 'BILL-003' }),
      ];
      vi.mocked(listBills).mockResolvedValue(mockBills);

      renderBillListPage();

      expect(await screen.findByTestId('bill-row-bill-1')).toBeInTheDocument();
      expect(screen.getByTestId('bill-row-bill-2')).toBeInTheDocument();
      expect(screen.getByTestId('bill-row-bill-3')).toBeInTheDocument();
    });

    it('renders edit link for each bill', async () => {
      const mockBill = createMockBill({ id: 'bill-789' });
      vi.mocked(listBills).mockResolvedValue([mockBill]);

      renderBillListPage();

      const editLink = await screen.findByTestId('bill-edit-bill-789');
      expect(editLink).toBeInTheDocument();
      expect(editLink).toHaveTextContent('Edit');
      expect(editLink).toHaveAttribute('href', '/bills/bill-789/edit');
    });
  });

  // Added (SOUPFIN-184): a closed bill's row links to the bill, not its edit form
  describe('row action by lifecycle', () => {
    it.each([
      ['PAID', { status: 'PAID', amountPaid: 1050, amountDue: 0 }],
      ['CANCELLED', { status: 'PENDING', postingStatus: 'CANCELLED' }],
    ] as const)('offers View instead of Edit on a %s bill', async (_label, overrides) => {
      vi.mocked(listBills).mockResolvedValue([createMockBill({ id: 'closed-1', ...(overrides as Partial<Bill>) })]);

      renderBillListPage();

      const view = await screen.findByTestId('bill-view-closed-1');
      expect(view).toHaveAttribute('href', '/bills/closed-1');
      expect(screen.queryByTestId('bill-edit-closed-1')).not.toBeInTheDocument();
    });

    it('keeps Edit on a draft and on an overdue bill', async () => {
      vi.mocked(listBills).mockResolvedValue([
        createMockBill({ id: 'd-1', status: null, postingStatus: 'DRAFT' }),
        createMockBill({ id: 'o-1', status: 'PENDING', paymentDate: '2020-01-01' }),
      ]);

      renderBillListPage();

      expect(await screen.findByTestId('bill-edit-d-1')).toHaveAttribute('href', '/bills/d-1/edit');
      expect(screen.getByTestId('bill-edit-o-1')).toBeInTheDocument();
      expect(screen.getByTestId('bill-status-o-1')).toHaveTextContent('OVERDUE');
    });
  });

  describe('status badges', () => {
    // Changed (SOUPFIN-184): each case is a bill the backend could actually send.
    // `status` is a derived PaymentStatus; DRAFT and CANCELLED come from the
    // planned `postingStatus`; OVERDUE is an unpaid balance past its due date.
    it.each([
      ['PAID', { status: 'PAID', amountPaid: 1050, amountDue: 0 }, 'bg-success'],
      ['PARTIAL', { status: 'PARTIAL', paymentDate: '2999-12-31' }, 'bg-info'],
      ['PENDING', { status: 'PENDING', paymentDate: '2999-12-31' }, 'bg-warning'],
      ['OVERDUE', { status: 'PENDING', paymentDate: '2024-02-15', amountDue: 1050 }, 'bg-danger'],
      ['DRAFT', { status: null, postingStatus: 'DRAFT' }, 'bg-subtle-text'],
      ['CANCELLED', { status: 'PENDING', postingStatus: 'CANCELLED' }, 'bg-subtle-text'],
    ] as const)('renders %s status with correct styling', async (status, overrides, expectedClass) => {
      const mockBill = createMockBill({ id: `bill-${status.toLowerCase()}`, ...(overrides as Partial<Bill>) });
      vi.mocked(listBills).mockResolvedValue([mockBill]);

      renderBillListPage();

      const statusBadge = await screen.findByTestId(`bill-status-bill-${status.toLowerCase()}`);
      expect(statusBadge).toHaveTextContent(status);
      expect(statusBadge.className).toContain(expectedClass);
    });

    it('displays status text correctly', async () => {
      const mockBill = createMockBill({ id: 'bill-test', status: 'PAID' });
      vi.mocked(listBills).mockResolvedValue([mockBill]);

      renderBillListPage();

      const statusBadge = await screen.findByTestId('bill-status-bill-test');
      expect(statusBadge).toHaveTextContent('PAID');
    });
  });

  describe('navigation', () => {
    it('New Bill button links to create page', async () => {
      vi.mocked(listBills).mockResolvedValue([]);

      renderBillListPage();

      const newButton = await screen.findByTestId('bill-new-button');
      expect(newButton).toHaveAttribute('href', '/bills/new');
    });

    it('bill number links to detail page', async () => {
      const mockBill = createMockBill({ id: 'bill-detail-test' });
      vi.mocked(listBills).mockResolvedValue([mockBill]);

      renderBillListPage();

      const billLink = await screen.findByTestId('bill-link-bill-detail-test');
      expect(billLink).toHaveAttribute('href', '/bills/bill-detail-test');
    });

    it('edit link navigates to edit page', async () => {
      const mockBill = createMockBill({ id: 'bill-edit-test' });
      vi.mocked(listBills).mockResolvedValue([mockBill]);

      renderBillListPage();

      const editLink = await screen.findByTestId('bill-edit-bill-edit-test');
      expect(editLink).toHaveAttribute('href', '/bills/bill-edit-test/edit');
    });
  });

  describe('API interaction', () => {
    it('calls listBills with correct params on mount', async () => {
      vi.mocked(listBills).mockResolvedValue([]);

      renderBillListPage();

      await screen.findByTestId('bill-list-page');

      expect(listBills).toHaveBeenCalledWith({
        max: 20,
        sort: 'dateCreated',
        order: 'desc',
      });
    });

    it('only calls listBills once on initial render', async () => {
      vi.mocked(listBills).mockResolvedValue([]);

      renderBillListPage();

      await screen.findByTestId('bill-list-page');

      expect(listBills).toHaveBeenCalledTimes(1);
    });
  });

  describe('table container', () => {
    it('renders table container with correct test id', async () => {
      vi.mocked(listBills).mockResolvedValue([createMockBill()]);

      renderBillListPage();

      expect(await screen.findByTestId('bill-table-container')).toBeInTheDocument();
    });

    it('table container has proper styling classes', async () => {
      vi.mocked(listBills).mockResolvedValue([createMockBill()]);

      renderBillListPage();

      const container = await screen.findByTestId('bill-table-container');
      expect(container.className).toContain('rounded-xl');
      expect(container.className).toContain('border');
    });
  });

  describe('amount formatting', () => {
    it('formats amounts with dollar sign and two decimal places', async () => {
      const mockBill = createMockBill({
        id: 'bill-format',
        totalAmount: 1234.56,
      });
      vi.mocked(listBills).mockResolvedValue([mockBill]);

      renderBillListPage();

      const row = await screen.findByTestId('bill-row-bill-format');
      expect(within(row).getByText('$1,234.56')).toBeInTheDocument();
    });

    it('formats whole number amounts correctly', async () => {
      const mockBill = createMockBill({
        id: 'bill-whole',
        totalAmount: 500,
      });
      vi.mocked(listBills).mockResolvedValue([mockBill]);

      renderBillListPage();

      const row = await screen.findByTestId('bill-row-bill-whole');
      expect(within(row).getByText('$500.00')).toBeInTheDocument();
    });
  });

  // Added (SOUPFIN-160): the error card names the cause and never shows HTTP text
  describe('module-aware errors (SOUPFIN-160)', () => {
    it.each([
      ['a disabled Finance module', () => moduleDisabled403('Finance', '/bill/index.json'), 'module_disabled', 'Finance module is not available'],
      ['a missing role', () => roleDenied403('/bill/index.json'), 'forbidden', 'You do not have permission'],
      ['a server fault', () => serverError500('/bill/index.json'), 'server_error', 'Server error'],
    ])('explains %s', async (_cause, makeError, kind, title) => {
      vi.mocked(listBills).mockRejectedValue(makeError());

      renderBillListPage();

      const card = await screen.findByTestId('bill-list-error');
      expect(card).toHaveAttribute('data-error-kind', kind);
      expect(within(card).getByText(title)).toBeInTheDocument();
      expect(document.body.textContent).not.toMatch(/status code/i);
    });

    it('offers no Retry when the module is disabled', async () => {
      vi.mocked(listBills).mockRejectedValue(moduleDisabled403('Finance', '/bill/index.json'));

      renderBillListPage();

      const card = await screen.findByTestId('bill-list-error');
      expect(within(card).queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
      expect(within(card).getByText(/contact your administrator to enable this module/i)).toBeInTheDocument();
    });

    it('Retry after a server fault refetches and shows the data', async () => {
      vi.mocked(listBills).mockRejectedValueOnce(serverError500('/bill/index.json'));

      renderBillListPage();

      const card = await screen.findByTestId('bill-list-error');
      vi.mocked(listBills).mockResolvedValue([]);
      within(card).getByRole('button', { name: /retry/i }).click();

      await waitFor(() => expect(screen.queryByTestId('bill-list-error')).not.toBeInTheDocument());
      expect(vi.mocked(listBills)).toHaveBeenCalledTimes(2);
    });
  });
});
