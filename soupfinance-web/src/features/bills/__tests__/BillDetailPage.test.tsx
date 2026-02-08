/**
 * Unit tests for BillDetailPage component
 * Tests rendering, loading/error states, data display, delete, and navigation
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BillDetailPage } from '../BillDetailPage';
import type { Bill, BillStatus, BillItem, BillPayment } from '../../../types';

// Mock the bills API - must match the import path in BillDetailPage
vi.mock('../../../api/endpoints/bills', () => ({
  getBill: vi.fn(),
  deleteBill: vi.fn(),
  listBillPayments: vi.fn(),
}));

// Mock the account store for currency formatting
vi.mock('../../../stores', () => ({
  useFormatCurrency: () => (amount: number | null | undefined) => {
    const value = amount ?? 0;
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  },
}));

// Mock the hooks
vi.mock('../../../hooks', () => ({
  usePdf: () => ({
    generateBill: vi.fn(),
    isGenerating: false,
  }),
  useEmailSend: () => ({
    sendBill: vi.fn().mockResolvedValue(true),
    isSending: false,
    error: null,
    success: false,
    reset: vi.fn(),
  }),
}));

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import { getBill, deleteBill, listBillPayments } from '../../../api/endpoints/bills';

// ============================================================================
// Test Helpers
// ============================================================================

function createMockLineItem(overrides: Partial<BillItem> = {}): BillItem {
  return {
    id: 'item-123',
    bill: { id: 'bill-123' },
    description: 'Consulting Services',
    quantity: 10,
    unitPrice: 150,
    taxRate: 10,
    amount: 1500,
    ...overrides,
  };
}

function createMockPayment(overrides: Partial<BillPayment> = {}): BillPayment {
  return {
    id: 'payment-123',
    bill: { id: 'bill-123' },
    amount: 500,
    paymentDate: '2024-02-01',
    // Changed: PaymentMethod is now a domain class FK object
    paymentMethod: { id: 'pm-bt', name: 'BANK_TRANSFER' },
    reference: 'PAY-001',
    notes: 'Partial payment',
    dateCreated: '2024-02-01T10:00:00Z',
    ...overrides,
  };
}

function createMockBill(overrides: Partial<Bill> = {}): Bill {
  return {
    id: 'bill-123',
    billNumber: 'BILL-2024-001',
    vendor: { id: 'vendor-1', name: 'Acme Supplies' },
    billDate: '2024-01-15',
    issueDate: '2024-01-15',
    paymentDate: '2024-02-15',
    dueDate: '2024-02-15',
    status: 'PENDING' as BillStatus,
    subtotal: 1500,
    taxAmount: 150,
    totalAmount: 1600,
    amountPaid: 500,
    amountDue: 1100,
    notes: 'Monthly supplies order',
    // Component uses 'items' not 'lineItems'
    items: [createMockLineItem()],
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

function renderBillDetailPage(billId: string = 'bill-123') {
  const queryClient = createQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/bills/${billId}`]}>
        <Routes>
          <Route path="/bills/:id" element={<BillDetailPage />} />
          <Route path="/bills" element={<div data-testid="bills-list">Bills List</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// ============================================================================
// Tests
// ============================================================================

describe('BillDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
  });

  describe('loading state', () => {
    it('displays loading indicator while fetching bill', () => {
      // Never resolves to keep loading state
      vi.mocked(getBill).mockImplementation(() => new Promise(() => {}));
      vi.mocked(listBillPayments).mockImplementation(() => new Promise(() => {}));

      renderBillDetailPage();

      expect(screen.getByTestId('bill-detail-loading')).toBeInTheDocument();
      expect(screen.getByText('Loading bill details...')).toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('displays error message when fetch fails', async () => {
      vi.mocked(getBill).mockRejectedValue(new Error('Network error'));
      vi.mocked(listBillPayments).mockResolvedValue([]);

      renderBillDetailPage();

      expect(await screen.findByTestId('bill-detail-error')).toBeInTheDocument();
      expect(screen.getByText('Failed to load bill')).toBeInTheDocument();
    });

    it('displays back to bills link in error state', async () => {
      vi.mocked(getBill).mockRejectedValue(new Error('Network error'));
      vi.mocked(listBillPayments).mockResolvedValue([]);

      renderBillDetailPage();

      const errorContainer = await screen.findByTestId('bill-detail-error');
      // The error state has a "Back to Bills" link inside it
      expect(within(errorContainer).getByText('Back to Bills')).toBeInTheDocument();
    });
  });

  describe('successful data display', () => {
    it('renders the page container with correct test id', async () => {
      vi.mocked(getBill).mockResolvedValue(createMockBill());
      vi.mocked(listBillPayments).mockResolvedValue([]);

      renderBillDetailPage();

      expect(await screen.findByTestId('bill-detail-page')).toBeInTheDocument();
    });

    it('renders the bill number as heading', async () => {
      const mockBill = createMockBill({ billNumber: 'BILL-2024-042' });
      vi.mocked(getBill).mockResolvedValue(mockBill);
      vi.mocked(listBillPayments).mockResolvedValue([]);

      renderBillDetailPage();

      const heading = await screen.findByTestId('bill-detail-heading');
      expect(heading).toHaveTextContent('BILL-2024-042');
    });

    it('renders the bill status badge', async () => {
      const mockBill = createMockBill({ status: 'PAID' });
      vi.mocked(getBill).mockResolvedValue(mockBill);
      vi.mocked(listBillPayments).mockResolvedValue([]);

      renderBillDetailPage();

      const statusBadge = await screen.findByTestId('bill-detail-status');
      expect(statusBadge).toHaveTextContent('PAID');
    });

    it('renders the bill info card with vendor details', async () => {
      const mockBill = createMockBill({
        vendor: { id: 'v-1', name: 'Premium Vendors Inc' },
        issueDate: '2024-03-01',
        dueDate: '2024-03-31',
      });
      vi.mocked(getBill).mockResolvedValue(mockBill);
      vi.mocked(listBillPayments).mockResolvedValue([]);

      renderBillDetailPage();

      const infoCard = await screen.findByTestId('bill-info-card');
      expect(infoCard).toBeInTheDocument();
      expect(within(infoCard).getByText('Premium Vendors Inc')).toBeInTheDocument();
      expect(within(infoCard).getByText('2024-03-01')).toBeInTheDocument();
      expect(within(infoCard).getByText('2024-03-31')).toBeInTheDocument();
    });

    it('renders the amount summary card', async () => {
      const mockBill = createMockBill({
        subtotal: 2000,
        taxAmount: 200,
        totalAmount: 2100,
        amountPaid: 500,
        amountDue: 1600,
      });
      vi.mocked(getBill).mockResolvedValue(mockBill);
      vi.mocked(listBillPayments).mockResolvedValue([]);

      renderBillDetailPage();

      const amountCard = await screen.findByTestId('bill-amount-card');
      expect(amountCard).toBeInTheDocument();
      expect(within(amountCard).getByText('$2,000.00')).toBeInTheDocument();
      expect(within(amountCard).getByText('$2,100.00')).toBeInTheDocument();
    });

    it('renders notes when present', async () => {
      const mockBill = createMockBill({ notes: 'Important delivery notes here' });
      vi.mocked(getBill).mockResolvedValue(mockBill);
      vi.mocked(listBillPayments).mockResolvedValue([]);

      renderBillDetailPage();

      const infoCard = await screen.findByTestId('bill-info-card');
      expect(within(infoCard).getByText('Important delivery notes here')).toBeInTheDocument();
    });
  });

  describe('line items display', () => {
    it('renders the line items card', async () => {
      vi.mocked(getBill).mockResolvedValue(createMockBill());
      vi.mocked(listBillPayments).mockResolvedValue([]);

      renderBillDetailPage();

      expect(await screen.findByTestId('bill-items-card')).toBeInTheDocument();
    });

    it('renders line items table when items exist', async () => {
      const mockBill = createMockBill({
        items: [
          createMockLineItem({ id: 'item-1', description: 'Service A', quantity: 5, unitPrice: 100, amount: 500 }),
          createMockLineItem({ id: 'item-2', description: 'Service B', quantity: 2, unitPrice: 250, amount: 500 }),
        ],
      });
      vi.mocked(getBill).mockResolvedValue(mockBill);
      vi.mocked(listBillPayments).mockResolvedValue([]);

      renderBillDetailPage();

      const table = await screen.findByTestId('bill-items-table');
      expect(table).toBeInTheDocument();
      expect(within(table).getByText('Service A')).toBeInTheDocument();
      expect(within(table).getByText('Service B')).toBeInTheDocument();
    });

    it('renders empty state when no line items', async () => {
      const mockBill = createMockBill({ items: [] });
      vi.mocked(getBill).mockResolvedValue(mockBill);
      vi.mocked(listBillPayments).mockResolvedValue([]);

      renderBillDetailPage();

      expect(await screen.findByTestId('bill-items-empty')).toBeInTheDocument();
      expect(screen.getByText(/no line items/i)).toBeInTheDocument();
    });
  });

  describe('payments display', () => {
    it('renders the payments card', async () => {
      vi.mocked(getBill).mockResolvedValue(createMockBill());
      vi.mocked(listBillPayments).mockResolvedValue([]);

      renderBillDetailPage();

      expect(await screen.findByTestId('bill-payments-card')).toBeInTheDocument();
    });

    it('renders payments table when payments exist', async () => {
      vi.mocked(getBill).mockResolvedValue(createMockBill());
      vi.mocked(listBillPayments).mockResolvedValue([
        createMockPayment({ id: 'pay-1', amount: 500, paymentDate: '2024-02-01' }),
        createMockPayment({ id: 'pay-2', amount: 300, paymentDate: '2024-02-15' }),
      ]);

      renderBillDetailPage();

      const table = await screen.findByTestId('bill-payments-table');
      expect(table).toBeInTheDocument();
      expect(within(table).getByText('$500.00')).toBeInTheDocument();
      expect(within(table).getByText('$300.00')).toBeInTheDocument();
    });

    it('renders empty state when no payments', async () => {
      vi.mocked(getBill).mockResolvedValue(createMockBill());
      vi.mocked(listBillPayments).mockResolvedValue([]);

      renderBillDetailPage();

      expect(await screen.findByTestId('bill-payments-empty')).toBeInTheDocument();
      expect(screen.getByText(/no payments recorded/i)).toBeInTheDocument();
    });

    it('renders record payment button', async () => {
      // amountDue must be > 0 for record payment button to show
      const mockBill = createMockBill({ amountDue: 1100 });
      vi.mocked(getBill).mockResolvedValue(mockBill);
      vi.mocked(listBillPayments).mockResolvedValue([]);

      renderBillDetailPage();

      const recordButton = await screen.findByTestId('record-payment-button');
      expect(recordButton).toBeInTheDocument();
      expect(recordButton).toHaveAttribute('href', '/payments/new?billId=bill-123');
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
      const mockBill = createMockBill({ status: status as BillStatus });
      vi.mocked(getBill).mockResolvedValue(mockBill);
      vi.mocked(listBillPayments).mockResolvedValue([]);

      renderBillDetailPage();

      const statusBadge = await screen.findByTestId('bill-detail-status');
      expect(statusBadge).toHaveTextContent(status);
      expect(statusBadge.className).toContain(expectedClass);
    });
  });

  describe('navigation', () => {
    it('renders edit button with correct link', async () => {
      const mockBill = createMockBill({ id: 'bill-456' });
      vi.mocked(getBill).mockResolvedValue(mockBill);
      vi.mocked(listBillPayments).mockResolvedValue([]);

      renderBillDetailPage('bill-456');

      const editButton = await screen.findByTestId('bill-edit-button');
      expect(editButton).toBeInTheDocument();
      expect(editButton).toHaveAttribute('href', '/bills/bill-456/edit');
    });

    it('renders back to bills link', async () => {
      vi.mocked(getBill).mockResolvedValue(createMockBill());
      vi.mocked(listBillPayments).mockResolvedValue([]);

      renderBillDetailPage();

      // Wait for bill content to load (heading shows bill number when loaded)
      await screen.findByTestId('bill-detail-heading');
      // The success state has "Back" link (not "Back to Bills")
      const backLink = screen.getByRole('link', { name: 'Back' });
      expect(backLink).toHaveAttribute('href', '/bills');
    });
  });

  describe('delete functionality', () => {
    it('renders delete button', async () => {
      vi.mocked(getBill).mockResolvedValue(createMockBill());
      vi.mocked(listBillPayments).mockResolvedValue([]);

      renderBillDetailPage();

      const deleteButton = await screen.findByTestId('bill-delete-button');
      expect(deleteButton).toBeInTheDocument();
    });

    it('shows confirmation dialog when delete is clicked', async () => {
      const user = userEvent.setup();
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

      vi.mocked(getBill).mockResolvedValue(createMockBill());
      vi.mocked(listBillPayments).mockResolvedValue([]);

      renderBillDetailPage();

      const deleteButton = await screen.findByTestId('bill-delete-button');
      await user.click(deleteButton);

      expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('delete'));
      confirmSpy.mockRestore();
    });

    it('calls deleteBill when confirmed', async () => {
      const user = userEvent.setup();
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

      vi.mocked(getBill).mockResolvedValue(createMockBill({ id: 'bill-to-delete' }));
      vi.mocked(listBillPayments).mockResolvedValue([]);
      vi.mocked(deleteBill).mockResolvedValue(undefined);

      renderBillDetailPage('bill-to-delete');

      const deleteButton = await screen.findByTestId('bill-delete-button');
      await user.click(deleteButton);

      await waitFor(() => {
        expect(deleteBill).toHaveBeenCalledWith('bill-to-delete');
      });

      confirmSpy.mockRestore();
    });

    it('navigates to bills list after successful delete', async () => {
      const user = userEvent.setup();
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

      vi.mocked(getBill).mockResolvedValue(createMockBill());
      vi.mocked(listBillPayments).mockResolvedValue([]);
      vi.mocked(deleteBill).mockResolvedValue(undefined);

      renderBillDetailPage();

      const deleteButton = await screen.findByTestId('bill-delete-button');
      await user.click(deleteButton);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/bills');
      });

      confirmSpy.mockRestore();
    });

    it('does not delete when confirmation is cancelled', async () => {
      const user = userEvent.setup();
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

      vi.mocked(getBill).mockResolvedValue(createMockBill());
      vi.mocked(listBillPayments).mockResolvedValue([]);

      renderBillDetailPage();

      const deleteButton = await screen.findByTestId('bill-delete-button');
      await user.click(deleteButton);

      expect(deleteBill).not.toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalled();

      confirmSpy.mockRestore();
    });
  });

  describe('API interaction', () => {
    it('calls getBill with correct ID on mount', async () => {
      vi.mocked(getBill).mockResolvedValue(createMockBill());
      vi.mocked(listBillPayments).mockResolvedValue([]);

      renderBillDetailPage('bill-abc-123');

      await screen.findByTestId('bill-detail-page');

      expect(getBill).toHaveBeenCalledWith('bill-abc-123');
    });

    it('calls listBillPayments with correct ID on mount', async () => {
      vi.mocked(getBill).mockResolvedValue(createMockBill());
      vi.mocked(listBillPayments).mockResolvedValue([]);

      renderBillDetailPage('bill-xyz-789');

      await screen.findByTestId('bill-detail-page');

      expect(listBillPayments).toHaveBeenCalledWith('bill-xyz-789');
    });

    it('only calls APIs once on initial render', async () => {
      vi.mocked(getBill).mockResolvedValue(createMockBill());
      vi.mocked(listBillPayments).mockResolvedValue([]);

      renderBillDetailPage();

      await screen.findByTestId('bill-detail-page');

      expect(getBill).toHaveBeenCalledTimes(1);
      expect(listBillPayments).toHaveBeenCalledTimes(1);
    });
  });

  describe('amount formatting', () => {
    it('formats currency values correctly', async () => {
      const mockBill = createMockBill({
        subtotal: 1234.56,
        taxAmount: 123.45,
        totalAmount: 1308.01,
        amountPaid: 308.01,
        amountDue: 1000,
      });
      vi.mocked(getBill).mockResolvedValue(mockBill);
      vi.mocked(listBillPayments).mockResolvedValue([]);

      renderBillDetailPage();

      const amountCard = await screen.findByTestId('bill-amount-card');
      expect(within(amountCard).getByText('$1,234.56')).toBeInTheDocument();
      expect(within(amountCard).getByText('$1,308.01')).toBeInTheDocument();
    });

    it('formats whole number amounts with .00', async () => {
      const mockBill = createMockBill({
        subtotal: 450,
        taxAmount: 50,
        totalAmount: 500,
        amountPaid: 0,
        amountDue: 500,
      });
      vi.mocked(getBill).mockResolvedValue(mockBill);
      vi.mocked(listBillPayments).mockResolvedValue([]);

      renderBillDetailPage();

      const amountCard = await screen.findByTestId('bill-amount-card');
      // Check that amounts are formatted with .00 suffix
      expect(within(amountCard).getByText('$450.00')).toBeInTheDocument();
      expect(within(amountCard).getByText('$50.00')).toBeInTheDocument();
    });
  });
});
