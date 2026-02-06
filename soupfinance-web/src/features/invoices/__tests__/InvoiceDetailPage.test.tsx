/**
 * Unit tests for InvoiceDetailPage component
 * Tests rendering, loading/error states, data display, conditional actions, and mutations
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InvoiceDetailPage } from '../InvoiceDetailPage';
import type { Invoice, InvoicePayment, InvoiceStatus, InvoiceItem } from '../../../types';

// Mock the invoices API
vi.mock('../../../api/endpoints/invoices', () => ({
  getInvoice: vi.fn(),
  deleteInvoice: vi.fn(),
  listInvoicePayments: vi.fn(),
  cancelInvoice: vi.fn(),
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
    generateInvoice: vi.fn(),
    isGenerating: false,
  }),
  useEmailSend: () => ({
    sendInvoice: vi.fn().mockResolvedValue(true),
    isSending: false,
    error: null,
    success: false,
    reset: vi.fn(),
  }),
}));

import {
  getInvoice,
  deleteInvoice,
  listInvoicePayments,
  cancelInvoice,
} from '../../../api/endpoints/invoices';

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// ============================================================================
// Test Helpers
// ============================================================================

function createMockInvoiceItem(overrides: Partial<InvoiceItem> = {}): InvoiceItem {
  return {
    id: 'item-1',
    invoice: { id: 'inv-123' },
    description: 'Consulting Services',
    quantity: 10,
    unitPrice: 100,
    taxRate: 10,
    discountPercent: 5,
    amount: 950,
    ...overrides,
  };
}

function createMockInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv-123',
    // Changed: invoiceNumber → number (integer, matches backend domain)
    number: 2024001,
    // Changed: client → accountServices (matches backend FK)
    accountServices: { id: 'client-1', serialised: 'Acme Corp' },
    // Changed: issueDate → invoiceDate, dueDate → paymentDate (backend field names)
    invoiceDate: '2024-01-15',
    paymentDate: '2024-02-15',
    currency: 'USD',
    status: 'DRAFT' as InvoiceStatus,
    subtotal: 1000,
    taxAmount: 100,
    discountAmount: 50,
    totalAmount: 1050,
    amountPaid: 0,
    amountDue: 1050,
    dateCreated: '2024-01-15T10:00:00Z',
    lastUpdated: '2024-01-15T10:00:00Z',
    // Changed: items → invoiceItemList (backend field name)
    invoiceItemList: [createMockInvoiceItem()],
    ...overrides,
  };
}

function createMockPayment(overrides: Partial<InvoicePayment> = {}): InvoicePayment {
  return {
    id: 'pay-1',
    paymentDate: '2024-02-01',
    amount: 500,
    paymentMethod: 'BANK_TRANSFER',
    reference: 'REF-001',
    invoice: { id: 'inv-123' },
    dateCreated: '2024-02-01T10:00:00Z',
    lastUpdated: '2024-02-01T10:00:00Z',
    ...overrides,
  };
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

function renderInvoiceDetailPage(invoiceId = 'inv-123') {
  const queryClient = createQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/invoices/${invoiceId}`]}>
        <Routes>
          <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// ============================================================================
// Tests
// ============================================================================

describe('InvoiceDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
  });

  describe('loading state', () => {
    it('displays loading message while fetching invoice', () => {
      // Never resolves to keep loading state
      vi.mocked(getInvoice).mockImplementation(() => new Promise(() => {}));
      vi.mocked(listInvoicePayments).mockImplementation(() => new Promise(() => {}));

      renderInvoiceDetailPage();

      expect(screen.getByTestId('invoice-detail-page')).toBeInTheDocument();
      expect(screen.getByTestId('invoice-detail-loading')).toBeInTheDocument();
      expect(screen.getByText('Loading invoice details...')).toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('displays error message when fetch fails', async () => {
      vi.mocked(getInvoice).mockRejectedValue(new Error('Network error'));
      vi.mocked(listInvoicePayments).mockResolvedValue([]);

      renderInvoiceDetailPage();

      expect(await screen.findByTestId('invoice-detail-error')).toBeInTheDocument();
      expect(screen.getByText('Failed to load invoice')).toBeInTheDocument();
      expect(screen.getByText(/could not be found or there was an error/i)).toBeInTheDocument();
    });

    it('displays error when invoice is null', async () => {
      vi.mocked(getInvoice).mockResolvedValue(null as unknown as Invoice);
      vi.mocked(listInvoicePayments).mockResolvedValue([]);

      renderInvoiceDetailPage();

      expect(await screen.findByTestId('invoice-detail-error')).toBeInTheDocument();
    });

    it('shows back to invoices link in error state', async () => {
      vi.mocked(getInvoice).mockRejectedValue(new Error('Network error'));
      vi.mocked(listInvoicePayments).mockResolvedValue([]);

      renderInvoiceDetailPage();

      await screen.findByTestId('invoice-detail-error');
      const backLinks = screen.getAllByText('Back to Invoices');
      expect(backLinks.length).toBeGreaterThan(0);
      expect(backLinks[0].closest('a')).toHaveAttribute('href', '/invoices');
    });
  });

  describe('rendering invoice details', () => {
    it('renders page with correct test id', async () => {
      const mockInvoice = createMockInvoice();
      vi.mocked(getInvoice).mockResolvedValue(mockInvoice);
      vi.mocked(listInvoicePayments).mockResolvedValue([]);

      renderInvoiceDetailPage();

      expect(await screen.findByTestId('invoice-detail-page')).toBeInTheDocument();
    });

    it('renders page heading with invoice number', async () => {
      // Changed: number is an integer, component displays it via String()
      const mockInvoice = createMockInvoice({ number: 2024042 });
      vi.mocked(getInvoice).mockResolvedValue(mockInvoice);
      vi.mocked(listInvoicePayments).mockResolvedValue([]);

      renderInvoiceDetailPage();

      const heading = await screen.findByTestId('invoice-detail-heading');
      expect(heading).toHaveTextContent('Invoice 2024042');
    });

    it('renders invoice status badge', async () => {
      const mockInvoice = createMockInvoice({ status: 'SENT' });
      vi.mocked(getInvoice).mockResolvedValue(mockInvoice);
      vi.mocked(listInvoicePayments).mockResolvedValue([]);

      renderInvoiceDetailPage();

      const statusBadge = await screen.findByTestId('invoice-detail-status');
      expect(statusBadge).toHaveTextContent('SENT');
    });

    it('renders invoice info card with correct data', async () => {
      // Changed: field names match backend domain model
      const mockInvoice = createMockInvoice({
        number: 2024100,
        accountServices: { id: 'c1', serialised: 'Test Client Inc' },
        invoiceDate: '2024-03-01',
        paymentDate: '2024-03-31',
      });
      vi.mocked(getInvoice).mockResolvedValue(mockInvoice);
      vi.mocked(listInvoicePayments).mockResolvedValue([]);

      renderInvoiceDetailPage();

      expect(await screen.findByTestId('invoice-info-card')).toBeInTheDocument();
      expect(screen.getByTestId('invoice-number')).toHaveTextContent('2024100');
      // Changed: invoice-account → invoice-client (component shows client label)
      expect(screen.getByTestId('invoice-client')).toHaveTextContent('Test Client Inc');
      // Changed: invoice-issue-date → invoice-date (component uses invoiceDate)
      expect(screen.getByTestId('invoice-date')).toHaveTextContent('2024-03-01');
      expect(screen.getByTestId('invoice-due-date')).toHaveTextContent('2024-03-31');
    });

    it('shows N/A when account services is missing', async () => {
      // Changed: client → accountServices (component renders accountServices.serialised)
      const mockInvoice = createMockInvoice({ accountServices: undefined as unknown as Invoice['accountServices'] });
      vi.mocked(getInvoice).mockResolvedValue(mockInvoice);
      vi.mocked(listInvoicePayments).mockResolvedValue([]);

      renderInvoiceDetailPage();

      // Changed: invoice-account → invoice-client
      expect(await screen.findByTestId('invoice-client')).toHaveTextContent('N/A');
    });

    it('renders amount summary card with correct values', async () => {
      const mockInvoice = createMockInvoice({
        subtotal: 2000,
        taxAmount: 200,
        discountAmount: 100,
        totalAmount: 2100,
        amountPaid: 500,
        amountDue: 1600,
      });
      vi.mocked(getInvoice).mockResolvedValue(mockInvoice);
      vi.mocked(listInvoicePayments).mockResolvedValue([]);

      renderInvoiceDetailPage();

      expect(await screen.findByTestId('invoice-amount-card')).toBeInTheDocument();
      expect(screen.getByTestId('invoice-subtotal')).toHaveTextContent('$2,000.00');
      expect(screen.getByTestId('invoice-discount')).toHaveTextContent('-$100.00');
      expect(screen.getByTestId('invoice-tax')).toHaveTextContent('$200.00');
      expect(screen.getByTestId('invoice-total')).toHaveTextContent('$2,100.00');
      expect(screen.getByTestId('invoice-paid')).toHaveTextContent('$500.00');
      expect(screen.getByTestId('invoice-balance-due')).toHaveTextContent('$1,600.00');
    });

    it('hides discount row when discount is zero', async () => {
      const mockInvoice = createMockInvoice({ discountAmount: 0 });
      vi.mocked(getInvoice).mockResolvedValue(mockInvoice);
      vi.mocked(listInvoicePayments).mockResolvedValue([]);

      renderInvoiceDetailPage();

      await screen.findByTestId('invoice-amount-card');
      expect(screen.queryByTestId('invoice-discount')).not.toBeInTheDocument();
    });
  });

  describe('line items display', () => {
    it('renders line items table when items exist', async () => {
      // Changed: items → invoiceItemList (backend field name)
      const mockInvoice = createMockInvoice({
        invoiceItemList: [
          createMockInvoiceItem({
            id: 'item-1',
            description: 'Consulting',
            quantity: 5,
            unitPrice: 200,
            taxRate: 10,
            discountPercent: 5,
            amount: 950,
          }),
        ],
      });
      vi.mocked(getInvoice).mockResolvedValue(mockInvoice);
      vi.mocked(listInvoicePayments).mockResolvedValue([]);

      renderInvoiceDetailPage();

      expect(await screen.findByTestId('invoice-items-card')).toBeInTheDocument();
      expect(screen.getByTestId('invoice-items-table')).toBeInTheDocument();
    });

    // Changed: Detail page table only shows Description, Qty, Unit Price, Amount columns
    // Tax rate and discount percent are NOT displayed in the detail page line items table
    it('displays line item details correctly', async () => {
      const mockInvoice = createMockInvoice({
        invoiceItemList: [
          createMockInvoiceItem({
            id: 'item-1',
            description: 'Web Development',
            quantity: 10,
            unitPrice: 150,
            taxRate: 8,
            discountPercent: 10,
            amount: 1350,
          }),
        ],
      });
      vi.mocked(getInvoice).mockResolvedValue(mockInvoice);
      vi.mocked(listInvoicePayments).mockResolvedValue([]);

      renderInvoiceDetailPage();

      const table = await screen.findByTestId('invoice-items-table');
      expect(within(table).getByText('Web Development')).toBeInTheDocument();
      expect(within(table).getByText('10')).toBeInTheDocument();
      expect(within(table).getByText('$150.00')).toBeInTheDocument();
      // NOTE: Amount column shows quantity * unitPrice = 10 * 150 = $1,500.00
      // The detail page renders item.quantity * item.unitPrice, not the pre-computed item.amount
      expect(within(table).getByText('$1,500.00')).toBeInTheDocument();
    });

    it('shows empty state when no line items', async () => {
      // Changed: items → invoiceItemList (backend field name)
      const mockInvoice = createMockInvoice({ invoiceItemList: [] });
      vi.mocked(getInvoice).mockResolvedValue(mockInvoice);
      vi.mocked(listInvoicePayments).mockResolvedValue([]);

      renderInvoiceDetailPage();

      expect(await screen.findByTestId('invoice-items-empty')).toBeInTheDocument();
      expect(screen.getByText('No line items')).toBeInTheDocument();
    });

    it('renders multiple line items', async () => {
      // Changed: items → invoiceItemList (backend field name)
      const mockInvoice = createMockInvoice({
        invoiceItemList: [
          createMockInvoiceItem({ id: 'i1', description: 'Item 1', quantity: 1, unitPrice: 100, taxRate: 0, discountPercent: 0, amount: 100 }),
          createMockInvoiceItem({ id: 'i2', description: 'Item 2', quantity: 2, unitPrice: 200, taxRate: 0, discountPercent: 0, amount: 400 }),
          createMockInvoiceItem({ id: 'i3', description: 'Item 3', quantity: 3, unitPrice: 300, taxRate: 0, discountPercent: 0, amount: 900 }),
        ],
      });
      vi.mocked(getInvoice).mockResolvedValue(mockInvoice);
      vi.mocked(listInvoicePayments).mockResolvedValue([]);

      renderInvoiceDetailPage();

      const table = await screen.findByTestId('invoice-items-table');
      expect(within(table).getByText('Item 1')).toBeInTheDocument();
      expect(within(table).getByText('Item 2')).toBeInTheDocument();
      expect(within(table).getByText('Item 3')).toBeInTheDocument();
    });
  });

  describe('payment history display', () => {
    it('renders payment history card', async () => {
      const mockInvoice = createMockInvoice();
      vi.mocked(getInvoice).mockResolvedValue(mockInvoice);
      vi.mocked(listInvoicePayments).mockResolvedValue([]);

      renderInvoiceDetailPage();

      expect(await screen.findByTestId('invoice-payments-card')).toBeInTheDocument();
    });

    it('shows empty state when no payments', async () => {
      const mockInvoice = createMockInvoice();
      vi.mocked(getInvoice).mockResolvedValue(mockInvoice);
      vi.mocked(listInvoicePayments).mockResolvedValue([]);

      renderInvoiceDetailPage();

      expect(await screen.findByTestId('invoice-payments-empty')).toBeInTheDocument();
      expect(screen.getByText('No payments recorded yet')).toBeInTheDocument();
    });

    it('displays payment history when payments exist', async () => {
      const mockInvoice = createMockInvoice();
      const mockPayments = [
        createMockPayment({
          id: 'pay-1',
          paymentDate: '2024-02-01',
          amount: 500,
          paymentMethod: 'BANK_TRANSFER',
          reference: 'TRX-001',
        }),
      ];
      vi.mocked(getInvoice).mockResolvedValue(mockInvoice);
      vi.mocked(listInvoicePayments).mockResolvedValue(mockPayments);

      renderInvoiceDetailPage();

      const table = await screen.findByTestId('invoice-payments-table');
      expect(within(table).getByText('2024-02-01')).toBeInTheDocument();
      expect(within(table).getByText('Bank Transfer')).toBeInTheDocument();
      expect(within(table).getByText('TRX-001')).toBeInTheDocument();
      expect(within(table).getByText('$500.00')).toBeInTheDocument();
    });

    it('renders multiple payments', async () => {
      const mockInvoice = createMockInvoice();
      const mockPayments = [
        createMockPayment({ id: 'pay-1', paymentDate: '2024-02-01', amount: 300, paymentMethod: 'CASH' }),
        createMockPayment({ id: 'pay-2', paymentDate: '2024-02-15', amount: 200, paymentMethod: 'CARD' }),
      ];
      vi.mocked(getInvoice).mockResolvedValue(mockInvoice);
      vi.mocked(listInvoicePayments).mockResolvedValue(mockPayments);

      renderInvoiceDetailPage();

      const table = await screen.findByTestId('invoice-payments-table');
      expect(within(table).getByText('Cash')).toBeInTheDocument();
      expect(within(table).getByText('Card')).toBeInTheDocument();
      expect(within(table).getByText('$300.00')).toBeInTheDocument();
      expect(within(table).getByText('$200.00')).toBeInTheDocument();
    });

    it('shows dash when payment reference is empty', async () => {
      const mockInvoice = createMockInvoice();
      const mockPayments = [
        createMockPayment({ reference: undefined }),
      ];
      vi.mocked(getInvoice).mockResolvedValue(mockInvoice);
      vi.mocked(listInvoicePayments).mockResolvedValue(mockPayments);

      renderInvoiceDetailPage();

      const table = await screen.findByTestId('invoice-payments-table');
      expect(within(table).getByText('-')).toBeInTheDocument();
    });
  });

  describe('conditional action buttons - DRAFT status', () => {
    it('shows Edit, Send, Cancel, and Delete buttons for DRAFT invoice', async () => {
      const mockInvoice = createMockInvoice({ status: 'DRAFT', amountDue: 1000 });
      vi.mocked(getInvoice).mockResolvedValue(mockInvoice);
      vi.mocked(listInvoicePayments).mockResolvedValue([]);

      renderInvoiceDetailPage();

      // Wait for content to load (invoice-detail-heading only appears after data loads)
      await screen.findByTestId('invoice-detail-heading');
      expect(screen.getByTestId('invoice-edit-button')).toBeInTheDocument();
      expect(screen.getByTestId('invoice-send-button')).toBeInTheDocument();
      expect(screen.getByTestId('invoice-cancel-button')).toBeInTheDocument();
      expect(screen.getByTestId('invoice-delete-button')).toBeInTheDocument();
    });

    it('Edit button links to edit page', async () => {
      const mockInvoice = createMockInvoice({ id: 'inv-456', status: 'DRAFT' });
      vi.mocked(getInvoice).mockResolvedValue(mockInvoice);
      vi.mocked(listInvoicePayments).mockResolvedValue([]);

      renderInvoiceDetailPage('inv-456');

      const editButton = await screen.findByTestId('invoice-edit-button');
      expect(editButton).toHaveAttribute('href', '/invoices/inv-456/edit');
    });

    it('shows Record Payment button for DRAFT with amount due', async () => {
      const mockInvoice = createMockInvoice({ status: 'DRAFT', amountDue: 500 });
      vi.mocked(getInvoice).mockResolvedValue(mockInvoice);
      vi.mocked(listInvoicePayments).mockResolvedValue([]);

      renderInvoiceDetailPage();

      expect(await screen.findByTestId('record-payment-button')).toBeInTheDocument();
    });
  });

  describe('conditional action buttons - SENT status', () => {
    it('hides Edit, Send, Delete buttons for SENT invoice', async () => {
      const mockInvoice = createMockInvoice({ status: 'SENT', amountDue: 1000 });
      vi.mocked(getInvoice).mockResolvedValue(mockInvoice);
      vi.mocked(listInvoicePayments).mockResolvedValue([]);

      renderInvoiceDetailPage();

      await screen.findByTestId('invoice-detail-page');
      expect(screen.queryByTestId('invoice-edit-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('invoice-send-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('invoice-delete-button')).not.toBeInTheDocument();
    });

    it('shows Cancel button for SENT invoice', async () => {
      const mockInvoice = createMockInvoice({ status: 'SENT', amountDue: 1000 });
      vi.mocked(getInvoice).mockResolvedValue(mockInvoice);
      vi.mocked(listInvoicePayments).mockResolvedValue([]);

      renderInvoiceDetailPage();

      expect(await screen.findByTestId('invoice-cancel-button')).toBeInTheDocument();
    });

    it('shows Record Payment button for SENT invoice with amount due', async () => {
      const mockInvoice = createMockInvoice({ status: 'SENT', amountDue: 500 });
      vi.mocked(getInvoice).mockResolvedValue(mockInvoice);
      vi.mocked(listInvoicePayments).mockResolvedValue([]);

      renderInvoiceDetailPage('inv-123');

      const button = await screen.findByTestId('record-payment-button');
      expect(button).toHaveAttribute('href', '/payments/new?invoiceId=inv-123');
    });
  });

  describe('conditional action buttons - PAID status', () => {
    it('hides all action buttons for PAID invoice', async () => {
      const mockInvoice = createMockInvoice({ status: 'PAID', amountDue: 0 });
      vi.mocked(getInvoice).mockResolvedValue(mockInvoice);
      vi.mocked(listInvoicePayments).mockResolvedValue([]);

      renderInvoiceDetailPage();

      await screen.findByTestId('invoice-detail-page');
      expect(screen.queryByTestId('invoice-edit-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('invoice-send-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('invoice-cancel-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('invoice-delete-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('record-payment-button')).not.toBeInTheDocument();
    });
  });

  describe('conditional action buttons - CANCELLED status', () => {
    it('hides all action buttons for CANCELLED invoice', async () => {
      const mockInvoice = createMockInvoice({ status: 'CANCELLED', amountDue: 1000 });
      vi.mocked(getInvoice).mockResolvedValue(mockInvoice);
      vi.mocked(listInvoicePayments).mockResolvedValue([]);

      renderInvoiceDetailPage();

      await screen.findByTestId('invoice-detail-page');
      expect(screen.queryByTestId('invoice-edit-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('invoice-send-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('invoice-cancel-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('invoice-delete-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('record-payment-button')).not.toBeInTheDocument();
    });
  });

  describe('conditional action buttons - OVERDUE status', () => {
    it('shows Cancel and Record Payment buttons for OVERDUE invoice', async () => {
      const mockInvoice = createMockInvoice({ status: 'OVERDUE', amountDue: 1000 });
      vi.mocked(getInvoice).mockResolvedValue(mockInvoice);
      vi.mocked(listInvoicePayments).mockResolvedValue([]);

      renderInvoiceDetailPage();

      // Wait for content to load (invoice-detail-heading only appears after data loads)
      await screen.findByTestId('invoice-detail-heading');
      expect(screen.getByTestId('invoice-cancel-button')).toBeInTheDocument();
      expect(screen.getByTestId('record-payment-button')).toBeInTheDocument();
      // Should not show Edit/Send/Delete
      expect(screen.queryByTestId('invoice-edit-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('invoice-send-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('invoice-delete-button')).not.toBeInTheDocument();
    });
  });

  describe('delete mutation', () => {
    it('calls deleteInvoice when delete button clicked and confirmed', async () => {
      const user = userEvent.setup();
      const mockInvoice = createMockInvoice({ id: 'inv-to-delete', status: 'DRAFT' });
      vi.mocked(getInvoice).mockResolvedValue(mockInvoice);
      vi.mocked(listInvoicePayments).mockResolvedValue([]);
      vi.mocked(deleteInvoice).mockResolvedValue(undefined);
      vi.spyOn(window, 'confirm').mockReturnValue(true);

      renderInvoiceDetailPage('inv-to-delete');

      const deleteButton = await screen.findByTestId('invoice-delete-button');
      await user.click(deleteButton);

      expect(window.confirm).toHaveBeenCalledWith(
        'Are you sure you want to delete this invoice? This action cannot be undone.'
      );
      await waitFor(() => {
        expect(deleteInvoice).toHaveBeenCalledWith('inv-to-delete');
      });
    });

    it('does not call deleteInvoice when delete is cancelled', async () => {
      const user = userEvent.setup();
      const mockInvoice = createMockInvoice({ status: 'DRAFT' });
      vi.mocked(getInvoice).mockResolvedValue(mockInvoice);
      vi.mocked(listInvoicePayments).mockResolvedValue([]);
      vi.spyOn(window, 'confirm').mockReturnValue(false);

      renderInvoiceDetailPage();

      const deleteButton = await screen.findByTestId('invoice-delete-button');
      await user.click(deleteButton);

      expect(deleteInvoice).not.toHaveBeenCalled();
    });

    it('navigates to invoice list after successful delete', async () => {
      const user = userEvent.setup();
      const mockInvoice = createMockInvoice({ id: 'inv-123', status: 'DRAFT' });
      vi.mocked(getInvoice).mockResolvedValue(mockInvoice);
      vi.mocked(listInvoicePayments).mockResolvedValue([]);
      vi.mocked(deleteInvoice).mockResolvedValue(undefined);
      vi.spyOn(window, 'confirm').mockReturnValue(true);

      renderInvoiceDetailPage('inv-123');

      const deleteButton = await screen.findByTestId('invoice-delete-button');
      await user.click(deleteButton);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/invoices');
      });
    });

    it('shows loading state while deleting', async () => {
      const user = userEvent.setup();
      const mockInvoice = createMockInvoice({ status: 'DRAFT' });
      vi.mocked(getInvoice).mockResolvedValue(mockInvoice);
      vi.mocked(listInvoicePayments).mockResolvedValue([]);
      vi.mocked(deleteInvoice).mockImplementation(() => new Promise(() => {})); // Never resolves
      vi.spyOn(window, 'confirm').mockReturnValue(true);

      renderInvoiceDetailPage();

      const deleteButton = await screen.findByTestId('invoice-delete-button');
      await user.click(deleteButton);

      await waitFor(() => {
        expect(screen.getByText('Deleting...')).toBeInTheDocument();
      });
    });
  });

  describe('send invoice dialog', () => {
    it('opens send dialog when send button is clicked', async () => {
      const user = userEvent.setup();
      const mockInvoice = createMockInvoice({ id: 'inv-to-send', status: 'DRAFT' });
      vi.mocked(getInvoice).mockResolvedValue(mockInvoice);
      vi.mocked(listInvoicePayments).mockResolvedValue([]);

      renderInvoiceDetailPage('inv-to-send');

      const sendButton = await screen.findByTestId('invoice-send-button');
      await user.click(sendButton);

      // Dialog should open
      expect(await screen.findByTestId('send-invoice-dialog')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /Send Invoice/i })).toBeInTheDocument();
    });

    it('closes dialog when cancel is clicked', async () => {
      const user = userEvent.setup();
      const mockInvoice = createMockInvoice({ status: 'DRAFT' });
      vi.mocked(getInvoice).mockResolvedValue(mockInvoice);
      vi.mocked(listInvoicePayments).mockResolvedValue([]);

      renderInvoiceDetailPage();

      const sendButton = await screen.findByTestId('invoice-send-button');
      await user.click(sendButton);

      // Dialog should be open
      expect(await screen.findByTestId('send-invoice-dialog')).toBeInTheDocument();

      // Click cancel
      const cancelButton = screen.getByRole('button', { name: 'Cancel' });
      await user.click(cancelButton);

      // Dialog should close
      expect(screen.queryByTestId('send-invoice-dialog')).not.toBeInTheDocument();
    });

    it('has recipient email input field', async () => {
      const user = userEvent.setup();
      const mockInvoice = createMockInvoice({ status: 'DRAFT' });
      vi.mocked(getInvoice).mockResolvedValue(mockInvoice);
      vi.mocked(listInvoicePayments).mockResolvedValue([]);

      renderInvoiceDetailPage();

      const sendButton = await screen.findByTestId('invoice-send-button');
      await user.click(sendButton);

      expect(await screen.findByTestId('send-recipient-email')).toBeInTheDocument();
    });

    it('disables send button when email is empty', async () => {
      const user = userEvent.setup();
      const mockInvoice = createMockInvoice({ status: 'DRAFT' });
      vi.mocked(getInvoice).mockResolvedValue(mockInvoice);
      vi.mocked(listInvoicePayments).mockResolvedValue([]);

      renderInvoiceDetailPage();

      const sendButton = await screen.findByTestId('invoice-send-button');
      await user.click(sendButton);

      const confirmButton = await screen.findByTestId('send-confirm-button');
      expect(confirmButton).toBeDisabled();
    });
  });

  describe('cancel mutation', () => {
    it('calls cancelInvoice when cancel button clicked and confirmed', async () => {
      const user = userEvent.setup();
      const mockInvoice = createMockInvoice({ id: 'inv-to-cancel', status: 'SENT' });
      const cancelledInvoice = createMockInvoice({ id: 'inv-to-cancel', status: 'CANCELLED' });
      vi.mocked(getInvoice).mockResolvedValue(mockInvoice);
      vi.mocked(listInvoicePayments).mockResolvedValue([]);
      vi.mocked(cancelInvoice).mockResolvedValue(cancelledInvoice);
      vi.spyOn(window, 'confirm').mockReturnValue(true);

      renderInvoiceDetailPage('inv-to-cancel');

      const cancelButton = await screen.findByTestId('invoice-cancel-button');
      await user.click(cancelButton);

      expect(window.confirm).toHaveBeenCalledWith('Are you sure you want to cancel this invoice?');
      await waitFor(() => {
        expect(cancelInvoice).toHaveBeenCalledWith('inv-to-cancel');
      });
    });

    it('does not call cancelInvoice when cancel is rejected', async () => {
      const user = userEvent.setup();
      const mockInvoice = createMockInvoice({ status: 'SENT' });
      vi.mocked(getInvoice).mockResolvedValue(mockInvoice);
      vi.mocked(listInvoicePayments).mockResolvedValue([]);
      vi.spyOn(window, 'confirm').mockReturnValue(false);

      renderInvoiceDetailPage();

      const cancelButton = await screen.findByTestId('invoice-cancel-button');
      await user.click(cancelButton);

      expect(cancelInvoice).not.toHaveBeenCalled();
    });

    it('shows loading state while cancelling', async () => {
      const user = userEvent.setup();
      const mockInvoice = createMockInvoice({ status: 'SENT' });
      vi.mocked(getInvoice).mockResolvedValue(mockInvoice);
      vi.mocked(listInvoicePayments).mockResolvedValue([]);
      vi.mocked(cancelInvoice).mockImplementation(() => new Promise(() => {})); // Never resolves
      vi.spyOn(window, 'confirm').mockReturnValue(true);

      renderInvoiceDetailPage();

      const cancelButton = await screen.findByTestId('invoice-cancel-button');
      await user.click(cancelButton);

      await waitFor(() => {
        expect(screen.getByText('Cancelling...')).toBeInTheDocument();
      });
    });
  });

  describe('API interaction', () => {
    it('calls getInvoice with correct id', async () => {
      vi.mocked(getInvoice).mockResolvedValue(createMockInvoice());
      vi.mocked(listInvoicePayments).mockResolvedValue([]);

      renderInvoiceDetailPage('inv-test-123');

      await screen.findByTestId('invoice-detail-page');

      expect(getInvoice).toHaveBeenCalledWith('inv-test-123');
    });

    it('calls listInvoicePayments with correct invoice id', async () => {
      vi.mocked(getInvoice).mockResolvedValue(createMockInvoice());
      vi.mocked(listInvoicePayments).mockResolvedValue([]);

      renderInvoiceDetailPage('inv-test-456');

      await screen.findByTestId('invoice-detail-page');

      expect(listInvoicePayments).toHaveBeenCalledWith('inv-test-456');
    });
  });

  describe('status styling', () => {
    it.each([
      ['PAID', 'bg-success'],
      ['SENT', 'bg-info'],
      ['DRAFT', 'bg-subtle-text'],
      ['OVERDUE', 'bg-danger'],
      ['CANCELLED', 'bg-subtle-text'],
    ] as const)('applies correct styling for %s status', async (status, expectedClass) => {
      const mockInvoice = createMockInvoice({ status: status as InvoiceStatus });
      vi.mocked(getInvoice).mockResolvedValue(mockInvoice);
      vi.mocked(listInvoicePayments).mockResolvedValue([]);

      renderInvoiceDetailPage();

      const statusBadge = await screen.findByTestId('invoice-detail-status');
      expect(statusBadge.className).toContain(expectedClass);
    });
  });

  describe('navigation', () => {
    it('renders back button that links to invoice list', async () => {
      const mockInvoice = createMockInvoice();
      vi.mocked(getInvoice).mockResolvedValue(mockInvoice);
      vi.mocked(listInvoicePayments).mockResolvedValue([]);

      renderInvoiceDetailPage();

      // Wait for content to load (invoice-detail-heading only appears after data loads)
      await screen.findByTestId('invoice-detail-heading');
      const backButton = screen.getByRole('link', { name: 'Back' });
      expect(backButton).toHaveAttribute('href', '/invoices');
    });
  });
});
