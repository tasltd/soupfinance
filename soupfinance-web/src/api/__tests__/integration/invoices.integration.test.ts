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
      // NOTE: Backend domain uses `number` (int), not `invoiceNumber`
      const mockInvoices = [
        { id: 'inv-1', number: 1001, status: 'PAID' },
        { id: 'inv-2', number: 1002, status: 'DRAFT' },
      ];
      mockAxiosInstance.get.mockResolvedValue({ data: mockInvoices });

      vi.resetModules();
      const { listInvoices } = await import('../../endpoints/invoices');

      // Act
      const result = await listInvoices();

      // Assert
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/invoice/index.json');
      expect(result).toHaveLength(2);
      // Changed: number is an int field on the backend Invoice domain
      expect(result[0].number).toBe(1001);
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
    it('fetches single invoice by UUID and computes totals from items', async () => {
      // Arrange
      // NOTE: getInvoice calls transformInvoice which computes totalAmount from invoiceItemList
      const mockInvoice = {
        id: 'uuid-123-456',
        number: 1001,
        status: 'SENT',
      };
      // Mock the show endpoint and the subsequent items fetch
      mockAxiosInstance.get
        .mockResolvedValueOnce({ data: mockInvoice })  // /invoice/show/uuid-123-456.json
        .mockResolvedValueOnce({                        // /invoiceItem/index.json?invoice.id=...
          data: [
            { id: 'item-1', quantity: 10, unitPrice: 100.00 },  // 1000.00
            { id: 'item-2', quantity: 5, unitPrice: 100.00 },   // 500.00
          ],
        });

      vi.resetModules();
      const { getInvoice } = await import('../../endpoints/invoices');

      // Act
      const result = await getInvoice('uuid-123-456');

      // Assert
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/invoice/show/uuid-123-456.json');
      expect(result.id).toBe('uuid-123-456');
      // Changed: totalAmount is computed from invoiceItemList by transformInvoice
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
    it('creates invoice with JSON body and CSRF in URL query string', async () => {
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

      // Assert - verify POST URL includes CSRF token as query params
      const postUrl = mockAxiosInstance.post.mock.calls[0][0] as string;
      expect(postUrl).toContain('/invoice/save.json?');
      expect(postUrl).toContain('SYNCHRONIZER_TOKEN=');
      expect(postUrl).toContain('SYNCHRONIZER_URI=');

      // Assert - verify JSON body contains entity data only (no CSRF in body)
      const postData = mockAxiosInstance.post.mock.calls[0][1] as Record<string, unknown>;
      expect(postData.invoiceNumber).toBe('INV-003');
      expect(postData.client).toEqual({ id: 'client-uuid-123' });
      expect(postData.totalAmount).toBe(2500.00);
      expect(postData.notes).toBe('Test invoice');
      expect(postData.SYNCHRONIZER_TOKEN).toBeUndefined();
      expect(postData.SYNCHRONIZER_URI).toBeUndefined();

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
      // Changed: invoiceNumber → number (matches backend domain field)
      await expect(createInvoice({ number: 2024004 })).rejects.toEqual(mockError);
    });
  });

  describe('updateInvoice', () => {
    it('updates invoice with ID in JSON body (no CSRF)', async () => {
      // Arrange
      const invoiceId = 'invoice-uuid-789';
      const updateData = {
        notes: 'Updated notes',
        dueDate: '2026-03-15',
      };

      const mockResponse = { id: invoiceId, ...updateData, status: 'DRAFT' };
      // Changed: No CSRF token fetch needed for PUT/update operations
      mockAxiosInstance.put.mockResolvedValue({ data: mockResponse });

      vi.resetModules();
      const { updateInvoice } = await import('../../endpoints/invoices');

      // Act
      const result = await updateInvoice(invoiceId, updateData);

      // Assert - verify no CSRF token fetch (GET should not be called)
      expect(mockAxiosInstance.get).not.toHaveBeenCalled();

      // Assert - verify PUT with JSON body including ID but NO CSRF token
      expect(mockAxiosInstance.put).toHaveBeenCalledWith(
        `/invoice/update/${invoiceId}.json`,
        expect.objectContaining({
          id: invoiceId,
          notes: 'Updated notes',
        })
      );

      // Assert - verify CSRF tokens are NOT in the request body
      const putData = mockAxiosInstance.put.mock.calls[0][1] as Record<string, unknown>;
      expect(putData.SYNCHRONIZER_TOKEN).toBeUndefined();
      expect(putData.SYNCHRONIZER_URI).toBeUndefined();

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
    it('adds item to invoice with JSON body and CSRF in URL', async () => {
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

      // Assert - verify CSRF token was fetched
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/invoiceItem/create.json');

      // Assert - verify POST URL includes CSRF token as query params
      const postUrl = mockAxiosInstance.post.mock.calls[0][0] as string;
      expect(postUrl).toContain('/invoiceItem/save.json?');
      expect(postUrl).toContain('SYNCHRONIZER_TOKEN=');

      // Assert - verify JSON body contains entity data only (no CSRF in body)
      const postData = mockAxiosInstance.post.mock.calls[0][1] as Record<string, unknown>;
      expect(postData.invoice).toEqual({ id: 'invoice-uuid' });
      expect(postData.description).toBe('Consulting Services');
      expect(postData.quantity).toBe(10);
      expect(postData.unitPrice).toBe(150.00);
      expect(postData.SYNCHRONIZER_TOKEN).toBeUndefined();

      expect(result.amount).toBe(1740.00);
    });
  });

  describe('updateInvoiceItem', () => {
    it('updates invoice item (no CSRF)', async () => {
      // Arrange
      const mockResponse = { id: 'item-uuid', quantity: 15 };
      // Changed: No CSRF token fetch needed for PUT/update operations
      mockAxiosInstance.put.mockResolvedValue({ data: mockResponse });

      vi.resetModules();
      const { updateInvoiceItem } = await import('../../endpoints/invoices');

      // Act
      const result = await updateInvoiceItem('item-uuid', { quantity: 15 });

      // Assert - verify no CSRF token fetch (GET should not be called)
      expect(mockAxiosInstance.get).not.toHaveBeenCalled();
      // Assert - verify PUT with JSON body including ID but NO CSRF token
      expect(mockAxiosInstance.put).toHaveBeenCalledWith(
        '/invoiceItem/update/item-uuid.json',
        expect.objectContaining({
          id: 'item-uuid',
          quantity: 15,
        })
      );

      // Assert - verify CSRF tokens are NOT in the request body
      const putData = mockAxiosInstance.put.mock.calls[0][1] as Record<string, unknown>;
      expect(putData.SYNCHRONIZER_TOKEN).toBeUndefined();

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
    it('records payment against invoice with CSRF in URL', async () => {
      // Arrange
      const paymentData = {
        invoice: { id: 'invoice-uuid' },
        amount: 750.00,
        paymentDate: '2026-01-25',
        // Changed: PaymentMethod is now a domain class FK object
        paymentMethod: { id: 'pm-bt-uuid', name: 'BANK_TRANSFER' },
        reference: 'TXN-12345',
      };

      const mockResponse = { id: 'payment-uuid', ...paymentData };
      mockAxiosInstance.get.mockResolvedValueOnce({ data: { invoicePayment: mockCsrfToken } });
      mockAxiosInstance.post.mockResolvedValue({ data: mockResponse });

      vi.resetModules();
      const { recordInvoicePayment } = await import('../../endpoints/invoices');

      // Act
      const result = await recordInvoicePayment(paymentData);

      // Assert - verify CSRF token was fetched
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/invoicePayment/create.json');

      // Assert - verify POST URL includes CSRF token as query params
      const postUrl = mockAxiosInstance.post.mock.calls[0][0] as string;
      expect(postUrl).toContain('/invoicePayment/save.json?');
      expect(postUrl).toContain('SYNCHRONIZER_TOKEN=');

      // Assert - verify JSON body contains entity data only (no CSRF in body)
      const postData = mockAxiosInstance.post.mock.calls[0][1] as Record<string, unknown>;
      expect(postData.invoice).toEqual({ id: 'invoice-uuid' });
      expect(postData.amount).toBe(750.00);
      expect(postData.paymentMethod).toEqual({ id: 'pm-bt-uuid', name: 'BANK_TRANSFER' });
      expect(postData.SYNCHRONIZER_TOKEN).toBeUndefined();

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
