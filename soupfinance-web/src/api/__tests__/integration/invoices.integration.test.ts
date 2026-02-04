/**
 * Integration tests for invoices API module
 * Tests Invoice CRUD, Items, Payments, and Actions endpoints
 * with proper URL construction, query params, and JSON serialization
 *
 * Added: Integration test suite for invoices.ts
 * Updated: Jan 2026 - Migrated from FormData to JSON serialization
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';

// Mock axios at module level
vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    })),
  },
}));

// Mock CSRF token response
const mockCsrfToken = {
  SYNCHRONIZER_TOKEN: 'test-csrf-token-123',
  SYNCHRONIZER_URI: '/invoice/save',
};

describe('Invoices API Integration', () => {
  let mockAxiosInstance: {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
    put: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    mockAxiosInstance = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    };

    (axios.create as ReturnType<typeof vi.fn>).mockReturnValue({
      ...mockAxiosInstance,
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
    });
  });

  // =============================================================================
  // Invoice CRUD Operations
  // =============================================================================

  describe('listInvoices', () => {
    it('fetches invoices without params', async () => {
      // Arrange
      const mockInvoices = [
        { id: 'inv-1', invoiceNumber: 'INV-001', status: 'PAID' },
        { id: 'inv-2', invoiceNumber: 'INV-002', status: 'DRAFT' },
      ];
      mockAxiosInstance.get.mockResolvedValue({ data: mockInvoices });

      vi.resetModules();
      const { listInvoices } = await import('../../endpoints/invoices');

      // Act
      const result = await listInvoices();

      // Assert
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/invoice/index.json');
      expect(result).toHaveLength(2);
      expect(result[0].invoiceNumber).toBe('INV-001');
    });

    it('fetches invoices with pagination params', async () => {
      // Arrange
      mockAxiosInstance.get.mockResolvedValue({ data: [] });

      vi.resetModules();
      const { listInvoices } = await import('../../endpoints/invoices');

      // Act
      await listInvoices({ max: 20, offset: 40, sort: 'dateCreated', order: 'desc' });

      // Assert
      const callUrl = mockAxiosInstance.get.mock.calls[0][0] as string;
      expect(callUrl).toContain('/invoice/index.json?');
      expect(callUrl).toContain('max=20');
      expect(callUrl).toContain('offset=40');
      expect(callUrl).toContain('sort=dateCreated');
      expect(callUrl).toContain('order=desc');
    });

    it('handles API errors', async () => {
      // Arrange
      const mockError = { response: { status: 500, data: { message: 'Server Error' } } };
      mockAxiosInstance.get.mockRejectedValue(mockError);

      vi.resetModules();
      const { listInvoices } = await import('../../endpoints/invoices');

      // Act & Assert
      await expect(listInvoices()).rejects.toEqual(mockError);
    });
  });

  describe('getInvoice', () => {
    it('fetches single invoice by UUID', async () => {
      // Arrange
      const mockInvoice = {
        id: 'uuid-123-456',
        invoiceNumber: 'INV-001',
        totalAmount: 1500.00,
        status: 'SENT',
      };
      mockAxiosInstance.get.mockResolvedValue({ data: mockInvoice });

      vi.resetModules();
      const { getInvoice } = await import('../../endpoints/invoices');

      // Act
      const result = await getInvoice('uuid-123-456');

      // Assert
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/invoice/show/uuid-123-456.json');
      expect(result.id).toBe('uuid-123-456');
      expect(result.totalAmount).toBe(1500.00);
    });

    it('handles 404 for non-existent invoice', async () => {
      // Arrange
      const mockError = { response: { status: 404, data: { message: 'Invoice not found' } } };
      mockAxiosInstance.get.mockRejectedValue(mockError);

      vi.resetModules();
      const { getInvoice } = await import('../../endpoints/invoices');

      // Act & Assert
      await expect(getInvoice('non-existent-id')).rejects.toEqual(mockError);
    });
  });

  describe('createInvoice', () => {
    it('creates invoice with JSON serialization', async () => {
      // Arrange
      const newInvoice = {
        invoiceNumber: 'INV-003',
        issueDate: '2026-01-20',
        dueDate: '2026-02-20',
        client: { id: 'client-uuid-123' },
        totalAmount: 2500.00,
        notes: 'Test invoice',
      };

      const mockResponse = {
        id: 'new-invoice-uuid',
        ...newInvoice,
        status: 'DRAFT',
      };
      // Mock CSRF token fetch and POST response
      mockAxiosInstance.get.mockResolvedValueOnce({ data: { invoice: mockCsrfToken } });
      mockAxiosInstance.post.mockResolvedValue({ data: mockResponse });

      vi.resetModules();
      const { createInvoice } = await import('../../endpoints/invoices');

      // Act
      const result = await createInvoice(newInvoice);

      // Assert - verify CSRF token was fetched
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/invoice/create.json');

      // Assert - verify POST with JSON body including CSRF token
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/invoice/save.json',
        expect.objectContaining({
          invoiceNumber: 'INV-003',
          client: { id: 'client-uuid-123' },
          totalAmount: 2500.00,
          notes: 'Test invoice',
          SYNCHRONIZER_TOKEN: mockCsrfToken.SYNCHRONIZER_TOKEN,
          SYNCHRONIZER_URI: mockCsrfToken.SYNCHRONIZER_URI,
        })
      );

      expect(result.id).toBe('new-invoice-uuid');
    });

    it('handles validation errors', async () => {
      // Arrange
      mockAxiosInstance.get.mockResolvedValueOnce({ data: { invoice: mockCsrfToken } });
      const mockError = {
        response: {
          status: 422,
          data: { errors: [{ field: 'client', message: 'Client is required' }] },
        },
      };
      mockAxiosInstance.post.mockRejectedValue(mockError);

      vi.resetModules();
      const { createInvoice } = await import('../../endpoints/invoices');

      // Act & Assert
      await expect(createInvoice({ invoiceNumber: 'INV-004' })).rejects.toEqual(mockError);
    });
  });

  describe('updateInvoice', () => {
    it('updates invoice with ID in JSON body', async () => {
      // Arrange
      const invoiceId = 'invoice-uuid-789';
      const updateData = {
        notes: 'Updated notes',
        dueDate: '2026-03-15',
      };

      const mockResponse = { id: invoiceId, ...updateData, status: 'DRAFT' };
      // Mock CSRF token fetch from edit endpoint
      mockAxiosInstance.get.mockResolvedValueOnce({ data: { invoice: mockCsrfToken } });
      mockAxiosInstance.put.mockResolvedValue({ data: mockResponse });

      vi.resetModules();
      const { updateInvoice } = await import('../../endpoints/invoices');

      // Act
      const result = await updateInvoice(invoiceId, updateData);

      // Assert - verify CSRF token was fetched from edit endpoint
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(`/invoice/edit/${invoiceId}.json`);

      // Assert - verify PUT with JSON body including ID and CSRF token
      expect(mockAxiosInstance.put).toHaveBeenCalledWith(
        `/invoice/update/${invoiceId}.json`,
        expect.objectContaining({
          id: invoiceId,
          notes: 'Updated notes',
          SYNCHRONIZER_TOKEN: mockCsrfToken.SYNCHRONIZER_TOKEN,
          SYNCHRONIZER_URI: mockCsrfToken.SYNCHRONIZER_URI,
        })
      );

      expect(result.notes).toBe('Updated notes');
    });
  });

  describe('deleteInvoice', () => {
    it('soft deletes invoice by ID', async () => {
      // Arrange
      mockAxiosInstance.delete.mockResolvedValue({});

      vi.resetModules();
      const { deleteInvoice } = await import('../../endpoints/invoices');

      // Act
      await deleteInvoice('invoice-to-delete-uuid');

      // Assert
      expect(mockAxiosInstance.delete).toHaveBeenCalledWith(
        '/invoice/delete/invoice-to-delete-uuid.json'
      );
    });
  });

  // =============================================================================
  // Invoice Actions
  // =============================================================================

  describe('sendInvoice', () => {
    it('sends invoice to client', async () => {
      // Arrange
      const mockResponse = { id: 'inv-uuid', status: 'SENT' };
      mockAxiosInstance.post.mockResolvedValue({ data: mockResponse });

      vi.resetModules();
      const { sendInvoice } = await import('../../endpoints/invoices');

      // Act
      const result = await sendInvoice('inv-uuid');

      // Assert
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/invoice/send/inv-uuid.json');
      expect(result.status).toBe('SENT');
    });
  });

  describe('markInvoiceViewed', () => {
    it('marks invoice as viewed', async () => {
      // Arrange
      const mockResponse = { id: 'inv-uuid', status: 'VIEWED' };
      mockAxiosInstance.post.mockResolvedValue({ data: mockResponse });

      vi.resetModules();
      const { markInvoiceViewed } = await import('../../endpoints/invoices');

      // Act
      const result = await markInvoiceViewed('inv-uuid');

      // Assert
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/invoice/markViewed/inv-uuid.json');
      expect(result.status).toBe('VIEWED');
    });
  });

  describe('cancelInvoice', () => {
    it('cancels invoice', async () => {
      // Arrange
      const mockResponse = { id: 'inv-uuid', status: 'CANCELLED' };
      mockAxiosInstance.post.mockResolvedValue({ data: mockResponse });

      vi.resetModules();
      const { cancelInvoice } = await import('../../endpoints/invoices');

      // Act
      const result = await cancelInvoice('inv-uuid');

      // Assert
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/invoice/cancel/inv-uuid.json');
      expect(result.status).toBe('CANCELLED');
    });
  });

  // =============================================================================
  // Invoice Items
  // =============================================================================

  describe('addInvoiceItem', () => {
    it('adds item to invoice with JSON', async () => {
      // Arrange
      const itemData = {
        invoice: { id: 'invoice-uuid' },
        description: 'Consulting Services',
        quantity: 10,
        unitPrice: 150.00,
        taxRate: 16,
      };

      const mockResponse = { id: 'item-uuid', ...itemData, amount: 1740.00 };
      // Mock CSRF token for invoiceItem
      mockAxiosInstance.get.mockResolvedValueOnce({ data: { invoiceItem: mockCsrfToken } });
      mockAxiosInstance.post.mockResolvedValue({ data: mockResponse });

      vi.resetModules();
      const { addInvoiceItem } = await import('../../endpoints/invoices');

      // Act
      const result = await addInvoiceItem(itemData);

      // Assert
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/invoiceItem/create.json');
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/invoiceItem/save.json',
        expect.objectContaining({
          invoice: { id: 'invoice-uuid' },
          description: 'Consulting Services',
          quantity: 10,
          unitPrice: 150.00,
          SYNCHRONIZER_TOKEN: mockCsrfToken.SYNCHRONIZER_TOKEN,
        })
      );

      expect(result.amount).toBe(1740.00);
    });
  });

  describe('updateInvoiceItem', () => {
    it('updates invoice item', async () => {
      // Arrange
      const mockResponse = { id: 'item-uuid', quantity: 15 };
      mockAxiosInstance.get.mockResolvedValueOnce({ data: { invoiceItem: mockCsrfToken } });
      mockAxiosInstance.put.mockResolvedValue({ data: mockResponse });

      vi.resetModules();
      const { updateInvoiceItem } = await import('../../endpoints/invoices');

      // Act
      const result = await updateInvoiceItem('item-uuid', { quantity: 15 });

      // Assert
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/invoiceItem/edit/item-uuid.json');
      expect(mockAxiosInstance.put).toHaveBeenCalledWith(
        '/invoiceItem/update/item-uuid.json',
        expect.objectContaining({
          id: 'item-uuid',
          quantity: 15,
          SYNCHRONIZER_TOKEN: mockCsrfToken.SYNCHRONIZER_TOKEN,
        })
      );

      expect(result.quantity).toBe(15);
    });
  });

  describe('deleteInvoiceItem', () => {
    it('deletes invoice item', async () => {
      // Arrange
      mockAxiosInstance.delete.mockResolvedValue({});

      vi.resetModules();
      const { deleteInvoiceItem } = await import('../../endpoints/invoices');

      // Act
      await deleteInvoiceItem('item-uuid-to-delete');

      // Assert
      expect(mockAxiosInstance.delete).toHaveBeenCalledWith(
        '/invoiceItem/delete/item-uuid-to-delete.json'
      );
    });
  });

  // =============================================================================
  // Invoice Payments
  // =============================================================================

  describe('listInvoicePayments', () => {
    it('lists payments for specific invoice', async () => {
      // Arrange
      const mockPayments = [
        { id: 'pay-1', amount: 500, paymentDate: '2026-01-15' },
        { id: 'pay-2', amount: 1000, paymentDate: '2026-01-20' },
      ];
      mockAxiosInstance.get.mockResolvedValue({ data: mockPayments });

      vi.resetModules();
      const { listInvoicePayments } = await import('../../endpoints/invoices');

      // Act
      const result = await listInvoicePayments('invoice-uuid-123');

      // Assert
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/invoicePayment/index.json?invoice.id=invoice-uuid-123'
      );
      expect(result).toHaveLength(2);
    });
  });

  describe('recordInvoicePayment', () => {
    it('records payment against invoice', async () => {
      // Arrange
      const paymentData = {
        invoice: { id: 'invoice-uuid' },
        amount: 750.00,
        paymentDate: '2026-01-25',
        paymentMethod: 'BANK_TRANSFER' as const,
        reference: 'TXN-12345',
      };

      const mockResponse = { id: 'payment-uuid', ...paymentData };
      mockAxiosInstance.get.mockResolvedValueOnce({ data: { invoicePayment: mockCsrfToken } });
      mockAxiosInstance.post.mockResolvedValue({ data: mockResponse });

      vi.resetModules();
      const { recordInvoicePayment } = await import('../../endpoints/invoices');

      // Act
      const result = await recordInvoicePayment(paymentData);

      // Assert
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/invoicePayment/create.json');
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/invoicePayment/save.json',
        expect.objectContaining({
          invoice: { id: 'invoice-uuid' },
          amount: 750.00,
          paymentMethod: 'BANK_TRANSFER',
          SYNCHRONIZER_TOKEN: mockCsrfToken.SYNCHRONIZER_TOKEN,
        })
      );

      expect(result.id).toBe('payment-uuid');
    });
  });

  describe('deleteInvoicePayment', () => {
    it('deletes invoice payment', async () => {
      // Arrange
      mockAxiosInstance.delete.mockResolvedValue({});

      vi.resetModules();
      const { deleteInvoicePayment } = await import('../../endpoints/invoices');

      // Act
      await deleteInvoicePayment('payment-uuid');

      // Assert
      expect(mockAxiosInstance.delete).toHaveBeenCalledWith(
        '/invoicePayment/delete/payment-uuid.json'
      );
    });
  });

  // =============================================================================
  // Error Handling Scenarios
  // =============================================================================

  describe('Error handling', () => {
    it('propagates network errors', async () => {
      // Arrange
      const networkError = new Error('Network Error');
      mockAxiosInstance.get.mockRejectedValue(networkError);

      vi.resetModules();
      const { listInvoices } = await import('../../endpoints/invoices');

      // Act & Assert
      await expect(listInvoices()).rejects.toThrow('Network Error');
    });

    it('propagates timeout errors', async () => {
      // Arrange
      const timeoutError = { code: 'ECONNABORTED', message: 'timeout of 30000ms exceeded' };
      mockAxiosInstance.get.mockRejectedValue(timeoutError);

      vi.resetModules();
      const { getInvoice } = await import('../../endpoints/invoices');

      // Act & Assert
      await expect(getInvoice('any-id')).rejects.toEqual(timeoutError);
    });
  });
});
