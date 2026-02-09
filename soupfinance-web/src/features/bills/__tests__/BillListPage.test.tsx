/**
 * Unit tests for BillListPage component
 * Tests rendering, loading/error/empty states, data display, and navigation
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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
    status: 'DRAFT' as BillStatus,
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

      expect(await screen.findByTestId('bill-list-error')).toBeInTheDocument();
      expect(screen.getByText('Failed to load bills')).toBeInTheDocument();
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

      expect(await screen.findByText(/There was an error loading your bills/i)).toBeInTheDocument();
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

  describe('status badges', () => {
    it.each([
      ['PAID', 'bg-success'],
      ['PARTIAL', 'bg-info'],
      ['PENDING', 'bg-warning'],
      ['OVERDUE', 'bg-danger'],
      ['DRAFT', 'bg-subtle-text'],
      ['CANCELLED', 'bg-subtle-text'],
    ] as const)('renders %s status with correct styling', async (status, expectedClass) => {
      const mockBill = createMockBill({
        id: `bill-${status.toLowerCase()}`,
        status: status as BillStatus,
      });
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
});
