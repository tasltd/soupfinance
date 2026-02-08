/**
 * Integration tests for bills API module
 * Tests Bill CRUD, Items, and Payments endpoints
 * with proper URL construction, query params, and JSON serialization
 *
 * Added: Integration test suite for bills.ts
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
  SYNCHRONIZER_URI: '/bill/save',
};

describe('Bills API Integration', () => {
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
  // Bill CRUD Operations
  // =============================================================================

  describe('listBills', () => {
    it('fetches bills without params', async () => {
      // Arrange
      const mockBills = [
        { id: 'bill-1', billNumber: 'BILL-001', status: 'PAID' },
        { id: 'bill-2', billNumber: 'BILL-002', status: 'PENDING' },
      ];
      mockAxiosInstance.get.mockResolvedValue({ data: mockBills });

      vi.resetModules();
      const { listBills } = await import('../../endpoints/bills');

      // Act
      const result = await listBills();

      // Assert
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/bill/index.json');
      expect(result).toHaveLength(2);
      expect(result[0].billNumber).toBe('BILL-001');
    });

    it('fetches bills with pagination params', async () => {
      // Arrange
      mockAxiosInstance.get.mockResolvedValue({ data: [] });

      vi.resetModules();
      const { listBills } = await import('../../endpoints/bills');

      // Act
      await listBills({ max: 10, offset: 20, sort: 'dueDate', order: 'asc' });

      // Assert
      const callUrl = mockAxiosInstance.get.mock.calls[0][0] as string;
      expect(callUrl).toContain('/bill/index.json?');
      expect(callUrl).toContain('max=10');
      expect(callUrl).toContain('offset=20');
      expect(callUrl).toContain('sort=dueDate');
      expect(callUrl).toContain('order=asc');
    });

    it('handles API errors', async () => {
      // Arrange
      const mockError = { response: { status: 500, data: { message: 'Server Error' } } };
      mockAxiosInstance.get.mockRejectedValue(mockError);

      vi.resetModules();
      const { listBills } = await import('../../endpoints/bills');

      // Act & Assert
      await expect(listBills()).rejects.toEqual(mockError);
    });
  });

  describe('getBill', () => {
    it('fetches single bill by UUID', async () => {
      // Arrange
      const mockBill = {
        id: 'bill-uuid-123',
        billNumber: 'BILL-001',
        totalAmount: 3500.00,
        status: 'PENDING',
        vendor: { id: 'vendor-uuid', name: 'Office Supplies Inc' },
      };
      mockAxiosInstance.get.mockResolvedValue({ data: mockBill });

      vi.resetModules();
      const { getBill } = await import('../../endpoints/bills');

      // Act
      const result = await getBill('bill-uuid-123');

      // Assert
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/bill/show/bill-uuid-123.json');
      expect(result.id).toBe('bill-uuid-123');
      expect(result.vendor.name).toBe('Office Supplies Inc');
    });

    it('handles 404 for non-existent bill', async () => {
      // Arrange
      const mockError = { response: { status: 404, data: { message: 'Bill not found' } } };
      mockAxiosInstance.get.mockRejectedValue(mockError);

      vi.resetModules();
      const { getBill } = await import('../../endpoints/bills');

      // Act & Assert
      await expect(getBill('non-existent-id')).rejects.toEqual(mockError);
    });
  });

  describe('createBill', () => {
    it('creates bill with JSON body and CSRF in URL query string', async () => {
      // Arrange
      const newBill = {
        billNumber: 'BILL-003',
        issueDate: '2026-01-15',
        dueDate: '2026-02-15',
        vendor: { id: 'vendor-uuid-456' },
        totalAmount: 5000.00,
        notes: 'Office equipment',
      };

      const mockResponse = {
        id: 'new-bill-uuid',
        ...newBill,
        status: 'DRAFT',
      };
      // Mock CSRF token fetch and POST response
      mockAxiosInstance.get.mockResolvedValueOnce({ data: { bill: mockCsrfToken } });
      mockAxiosInstance.post.mockResolvedValue({ data: mockResponse });

      vi.resetModules();
      const { createBill } = await import('../../endpoints/bills');

      // Act
      const result = await createBill(newBill);

      // Assert - verify CSRF token was fetched
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/bill/create.json');

      // Assert - verify POST URL includes CSRF token as query params
      const postUrl = mockAxiosInstance.post.mock.calls[0][0] as string;
      expect(postUrl).toContain('/bill/save.json?');
      expect(postUrl).toContain('SYNCHRONIZER_TOKEN=');
      expect(postUrl).toContain('SYNCHRONIZER_URI=');

      // Assert - verify JSON body contains entity data only (no CSRF in body)
      const postData = mockAxiosInstance.post.mock.calls[0][1] as Record<string, unknown>;
      expect(postData.billNumber).toBe('BILL-003');
      expect(postData.vendor).toEqual({ id: 'vendor-uuid-456' });
      expect(postData.totalAmount).toBe(5000.00);
      expect(postData.SYNCHRONIZER_TOKEN).toBeUndefined();
      expect(postData.SYNCHRONIZER_URI).toBeUndefined();

      expect(result.id).toBe('new-bill-uuid');
      expect(result.status).toBe('DRAFT');
    });

    it('handles validation errors', async () => {
      // Arrange
      mockAxiosInstance.get.mockResolvedValueOnce({ data: { bill: mockCsrfToken } });
      const mockError = {
        response: {
          status: 422,
          data: { errors: [{ field: 'vendor', message: 'Vendor is required' }] },
        },
      };
      mockAxiosInstance.post.mockRejectedValue(mockError);

      vi.resetModules();
      const { createBill } = await import('../../endpoints/bills');

      // Act & Assert
      await expect(createBill({ billNumber: 'BILL-004' })).rejects.toEqual(mockError);
    });
  });

  describe('updateBill', () => {
    it('updates bill with ID in JSON body (no CSRF)', async () => {
      // Arrange
      const billId = 'bill-uuid-789';
      const updateData = {
        notes: 'Updated bill notes',
        dueDate: '2026-03-01',
      };

      const mockResponse = { id: billId, ...updateData, status: 'PENDING' };
      // Changed: No CSRF token fetch needed for PUT/update operations
      mockAxiosInstance.put.mockResolvedValue({ data: mockResponse });

      vi.resetModules();
      const { updateBill } = await import('../../endpoints/bills');

      // Act
      const result = await updateBill(billId, updateData);

      // Assert - verify no CSRF token fetch (GET should not be called)
      expect(mockAxiosInstance.get).not.toHaveBeenCalled();

      // Assert - verify PUT with JSON body including ID but NO CSRF token
      expect(mockAxiosInstance.put).toHaveBeenCalledWith(
        `/bill/update/${billId}.json`,
        expect.objectContaining({
          id: billId,
          notes: 'Updated bill notes',
        })
      );

      // Assert - verify CSRF tokens are NOT in the request body
      const putData = mockAxiosInstance.put.mock.calls[0][1] as Record<string, unknown>;
      expect(putData.SYNCHRONIZER_TOKEN).toBeUndefined();
      expect(putData.SYNCHRONIZER_URI).toBeUndefined();

      expect(result.notes).toBe('Updated bill notes');
    });
  });

  describe('deleteBill', () => {
    it('soft deletes bill by ID', async () => {
      // Arrange
      mockAxiosInstance.delete.mockResolvedValue({});

      vi.resetModules();
      const { deleteBill } = await import('../../endpoints/bills');

      // Act
      await deleteBill('bill-to-delete-uuid');

      // Assert
      expect(mockAxiosInstance.delete).toHaveBeenCalledWith(
        '/bill/delete/bill-to-delete-uuid.json'
      );
    });
  });

  // =============================================================================
  // Bill Items
  // =============================================================================

  describe('addBillItem', () => {
    it('adds item to bill with JSON body and CSRF in URL', async () => {
      // Arrange
      const itemData = {
        bill: { id: 'bill-uuid' },
        description: 'Printer Cartridges',
        quantity: 5,
        unitPrice: 75.00,
        taxRate: 16,
      };

      const mockResponse = { id: 'bill-item-uuid', ...itemData, amount: 435.00 };
      // Mock CSRF token for billItem
      mockAxiosInstance.get.mockResolvedValueOnce({ data: { billItem: mockCsrfToken } });
      mockAxiosInstance.post.mockResolvedValue({ data: mockResponse });

      vi.resetModules();
      const { addBillItem } = await import('../../endpoints/bills');

      // Act
      const result = await addBillItem(itemData);

      // Assert - verify CSRF token was fetched
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/billItem/create.json');

      // Assert - verify POST URL includes CSRF token as query params
      const postUrl = mockAxiosInstance.post.mock.calls[0][0] as string;
      expect(postUrl).toContain('/billItem/save.json?');
      expect(postUrl).toContain('SYNCHRONIZER_TOKEN=');

      // Assert - verify JSON body contains entity data only (no CSRF in body)
      const postData = mockAxiosInstance.post.mock.calls[0][1] as Record<string, unknown>;
      expect(postData.bill).toEqual({ id: 'bill-uuid' });
      expect(postData.description).toBe('Printer Cartridges');
      expect(postData.quantity).toBe(5);
      expect(postData.unitPrice).toBe(75.00);
      expect(postData.SYNCHRONIZER_TOKEN).toBeUndefined();

      expect(result.amount).toBe(435.00);
    });
  });

  describe('updateBillItem', () => {
    it('updates bill item (no CSRF)', async () => {
      // Arrange
      const mockResponse = { id: 'bill-item-uuid', quantity: 10 };
      // Changed: No CSRF token fetch needed for PUT/update operations
      mockAxiosInstance.put.mockResolvedValue({ data: mockResponse });

      vi.resetModules();
      const { updateBillItem } = await import('../../endpoints/bills');

      // Act
      const result = await updateBillItem('bill-item-uuid', { quantity: 10 });

      // Assert - verify no CSRF token fetch (GET should not be called)
      expect(mockAxiosInstance.get).not.toHaveBeenCalled();
      // Assert - verify PUT with JSON body including ID but NO CSRF token
      expect(mockAxiosInstance.put).toHaveBeenCalledWith(
        '/billItem/update/bill-item-uuid.json',
        expect.objectContaining({
          id: 'bill-item-uuid',
          quantity: 10,
        })
      );

      // Assert - verify CSRF tokens are NOT in the request body
      const putData = mockAxiosInstance.put.mock.calls[0][1] as Record<string, unknown>;
      expect(putData.SYNCHRONIZER_TOKEN).toBeUndefined();

      expect(result.quantity).toBe(10);
    });
  });

  describe('deleteBillItem', () => {
    it('deletes bill item', async () => {
      // Arrange
      mockAxiosInstance.delete.mockResolvedValue({});

      vi.resetModules();
      const { deleteBillItem } = await import('../../endpoints/bills');

      // Act
      await deleteBillItem('bill-item-uuid-to-delete');

      // Assert
      expect(mockAxiosInstance.delete).toHaveBeenCalledWith(
        '/billItem/delete/bill-item-uuid-to-delete.json'
      );
    });
  });

  // =============================================================================
  // Bill Payments
  // =============================================================================

  describe('listBillPayments', () => {
    it('lists payments for specific bill', async () => {
      // Arrange
      const mockPayments = [
        { id: 'pay-1', amount: 1000, paymentDate: '2026-01-10' },
        { id: 'pay-2', amount: 2500, paymentDate: '2026-01-20' },
      ];
      mockAxiosInstance.get.mockResolvedValue({ data: mockPayments });

      vi.resetModules();
      const { listBillPayments } = await import('../../endpoints/bills');

      // Act
      const result = await listBillPayments('bill-uuid-123');

      // Assert
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/billPayment/index.json?bill.id=bill-uuid-123'
      );
      expect(result).toHaveLength(2);
      expect(result[0].amount).toBe(1000);
    });
  });

  describe('recordBillPayment', () => {
    it('records payment against bill with CSRF in URL', async () => {
      // Arrange
      const paymentData = {
        bill: { id: 'bill-uuid' },
        amount: 1500.00,
        paymentDate: '2026-01-25',
        // Changed: PaymentMethod is now a domain class FK object
        paymentMethod: { id: 'pm-cheque-uuid', name: 'CHEQUE' },
        reference: 'CHQ-98765',
      };

      const mockResponse = { id: 'payment-uuid', ...paymentData };
      mockAxiosInstance.get.mockResolvedValueOnce({ data: { billPayment: mockCsrfToken } });
      mockAxiosInstance.post.mockResolvedValue({ data: mockResponse });

      vi.resetModules();
      const { recordBillPayment } = await import('../../endpoints/bills');

      // Act
      const result = await recordBillPayment(paymentData);

      // Assert - verify CSRF token was fetched
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/billPayment/create.json');

      // Assert - verify POST URL includes CSRF token as query params
      const postUrl = mockAxiosInstance.post.mock.calls[0][0] as string;
      expect(postUrl).toContain('/billPayment/save.json?');
      expect(postUrl).toContain('SYNCHRONIZER_TOKEN=');

      // Assert - verify JSON body contains entity data only (no CSRF in body)
      const postData = mockAxiosInstance.post.mock.calls[0][1] as Record<string, unknown>;
      expect(postData.bill).toEqual({ id: 'bill-uuid' });
      expect(postData.amount).toBe(1500.00);
      expect(postData.paymentMethod).toEqual({ id: 'pm-cheque-uuid', name: 'CHEQUE' });
      expect(postData.reference).toBe('CHQ-98765');
      expect(postData.SYNCHRONIZER_TOKEN).toBeUndefined();

      expect(result.id).toBe('payment-uuid');
    });
  });

  describe('deleteBillPayment', () => {
    it('deletes bill payment', async () => {
      // Arrange
      mockAxiosInstance.delete.mockResolvedValue({});

      vi.resetModules();
      const { deleteBillPayment } = await import('../../endpoints/bills');

      // Act
      await deleteBillPayment('bill-payment-uuid');

      // Assert
      expect(mockAxiosInstance.delete).toHaveBeenCalledWith(
        '/billPayment/delete/bill-payment-uuid.json'
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
      const { listBills } = await import('../../endpoints/bills');

      // Act & Assert
      await expect(listBills()).rejects.toThrow('Network Error');
    });

    it('propagates 403 forbidden errors', async () => {
      // Arrange
      const forbiddenError = {
        response: { status: 403, data: { message: 'Access denied' } },
      };
      mockAxiosInstance.get.mockRejectedValue(forbiddenError);

      vi.resetModules();
      const { getBill } = await import('../../endpoints/bills');

      // Act & Assert
      await expect(getBill('restricted-bill')).rejects.toEqual(forbiddenError);
    });
  });
});
