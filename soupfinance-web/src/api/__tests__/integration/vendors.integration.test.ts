/**
 * Integration tests for vendors API module
 * Tests Vendor CRUD and Reports endpoints
 * with proper URL construction, query params, and FormData serialization
 *
 * Added: Integration test suite for vendors.ts
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

describe('Vendors API Integration', () => {
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
  // Vendor CRUD Operations
  // =============================================================================

  describe('listVendors', () => {
    it('fetches vendors without params', async () => {
      // Arrange
      const mockVendors = [
        { id: 'vendor-1', name: 'Office Supplies Inc', email: 'contact@officesupplies.com' },
        { id: 'vendor-2', name: 'Tech Hardware Ltd', email: 'sales@techhardware.com' },
      ];
      mockAxiosInstance.get.mockResolvedValue({ data: mockVendors });

      vi.resetModules();
      const { listVendors } = await import('../../endpoints/vendors');

      // Act
      const result = await listVendors();

      // Assert
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/vendor/index.json');
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Office Supplies Inc');
    });

    it('fetches vendors with pagination params', async () => {
      // Arrange
      mockAxiosInstance.get.mockResolvedValue({ data: [] });

      vi.resetModules();
      const { listVendors } = await import('../../endpoints/vendors');

      // Act
      await listVendors({ max: 25, offset: 50, sort: 'name', order: 'asc' });

      // Assert
      const callUrl = mockAxiosInstance.get.mock.calls[0][0] as string;
      expect(callUrl).toContain('/vendor/index.json?');
      expect(callUrl).toContain('max=25');
      expect(callUrl).toContain('offset=50');
      expect(callUrl).toContain('sort=name');
      expect(callUrl).toContain('order=asc');
    });

    it('fetches vendors with search filter', async () => {
      // Arrange
      mockAxiosInstance.get.mockResolvedValue({ data: [] });

      vi.resetModules();
      const { listVendors } = await import('../../endpoints/vendors');

      // Act
      await listVendors({ search: 'office' });

      // Assert
      const callUrl = mockAxiosInstance.get.mock.calls[0][0] as string;
      expect(callUrl).toContain('search=office');
    });

    it('handles API errors', async () => {
      // Arrange
      const mockError = { response: { status: 500, data: { message: 'Server Error' } } };
      mockAxiosInstance.get.mockRejectedValue(mockError);

      vi.resetModules();
      const { listVendors } = await import('../../endpoints/vendors');

      // Act & Assert
      await expect(listVendors()).rejects.toEqual(mockError);
    });
  });

  describe('getVendor', () => {
    it('fetches single vendor by UUID', async () => {
      // Arrange
      const mockVendor = {
        id: 'vendor-uuid-123',
        name: 'Office Supplies Inc',
        email: 'contact@officesupplies.com',
        phoneNumber: '+254700123456',
        address: '123 Business Street, Nairobi',
        taxIdentificationNumber: 'TIN-123456',
        paymentTerms: 30,
        notes: 'Preferred vendor for office supplies',
      };
      mockAxiosInstance.get.mockResolvedValue({ data: mockVendor });

      vi.resetModules();
      const { getVendor } = await import('../../endpoints/vendors');

      // Act
      const result = await getVendor('vendor-uuid-123');

      // Assert
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/vendor/show/vendor-uuid-123.json');
      expect(result.id).toBe('vendor-uuid-123');
      expect(result.paymentTerms).toBe(30);
    });

    it('handles 404 for non-existent vendor', async () => {
      // Arrange
      const mockError = { response: { status: 404, data: { message: 'Vendor not found' } } };
      mockAxiosInstance.get.mockRejectedValue(mockError);

      vi.resetModules();
      const { getVendor } = await import('../../endpoints/vendors');

      // Act & Assert
      await expect(getVendor('non-existent-id')).rejects.toEqual(mockError);
    });
  });

  describe('createVendor', () => {
    it('creates vendor with FormData serialization', async () => {
      // Arrange
      const newVendor = {
        name: 'New Supplier Co',
        email: 'info@newsupplier.com',
        phoneNumber: '+254711223344',
        address: '456 Commerce Ave, Mombasa',
        taxIdentificationNumber: 'TIN-999888',
        paymentTerms: 45,
        notes: 'New supplier for electronics',
      };

      const mockResponse = { id: 'new-vendor-uuid', ...newVendor };
      mockAxiosInstance.post.mockResolvedValue({ data: mockResponse });

      vi.resetModules();
      const { createVendor } = await import('../../endpoints/vendors');

      // Act
      const result = await createVendor(newVendor);

      // Assert
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/vendor/save.json',
        expect.any(URLSearchParams)
      );

      // Verify FormData contains correct fields
      const formData = mockAxiosInstance.post.mock.calls[0][1] as URLSearchParams;
      expect(formData.get('name')).toBe('New Supplier Co');
      expect(formData.get('email')).toBe('info@newsupplier.com');
      expect(formData.get('phoneNumber')).toBe('+254711223344');
      expect(formData.get('paymentTerms')).toBe('45');
      expect(formData.get('taxIdentificationNumber')).toBe('TIN-999888');

      expect(result.id).toBe('new-vendor-uuid');
    });

    it('creates vendor with minimal required fields', async () => {
      // Arrange
      const minimalVendor = { name: 'Minimal Vendor' };
      mockAxiosInstance.post.mockResolvedValue({ data: { id: 'uuid', ...minimalVendor } });

      vi.resetModules();
      const { createVendor } = await import('../../endpoints/vendors');

      // Act
      await createVendor(minimalVendor);

      // Assert
      const formData = mockAxiosInstance.post.mock.calls[0][1] as URLSearchParams;
      expect(formData.get('name')).toBe('Minimal Vendor');
      // Optional fields should not be present
      expect(formData.has('email')).toBe(false);
      expect(formData.has('phoneNumber')).toBe(false);
    });

    it('handles validation errors', async () => {
      // Arrange
      const mockError = {
        response: {
          status: 422,
          data: { errors: [{ field: 'name', message: 'Name is required' }] },
        },
      };
      mockAxiosInstance.post.mockRejectedValue(mockError);

      vi.resetModules();
      const { createVendor } = await import('../../endpoints/vendors');

      // Act & Assert
      await expect(createVendor({})).rejects.toEqual(mockError);
    });
  });

  describe('updateVendor', () => {
    it('updates vendor with ID in FormData', async () => {
      // Arrange
      const vendorId = 'vendor-uuid-456';
      const updateData = {
        name: 'Updated Vendor Name',
        email: 'updated@vendor.com',
        paymentTerms: 60,
      };

      const mockResponse = { id: vendorId, ...updateData };
      mockAxiosInstance.put.mockResolvedValue({ data: mockResponse });

      vi.resetModules();
      const { updateVendor } = await import('../../endpoints/vendors');

      // Act
      const result = await updateVendor(vendorId, updateData);

      // Assert
      expect(mockAxiosInstance.put).toHaveBeenCalledWith(
        `/vendor/update/${vendorId}.json`,
        expect.any(URLSearchParams)
      );

      // Verify ID is included in FormData
      const formData = mockAxiosInstance.put.mock.calls[0][1] as URLSearchParams;
      expect(formData.get('id')).toBe(vendorId);
      expect(formData.get('name')).toBe('Updated Vendor Name');
      expect(formData.get('paymentTerms')).toBe('60');

      expect(result.name).toBe('Updated Vendor Name');
    });

    it('partial update preserves existing fields', async () => {
      // Arrange
      const vendorId = 'vendor-uuid-789';
      const partialUpdate = { notes: 'Updated notes only' };

      mockAxiosInstance.put.mockResolvedValue({ data: { id: vendorId, ...partialUpdate } });

      vi.resetModules();
      const { updateVendor } = await import('../../endpoints/vendors');

      // Act
      await updateVendor(vendorId, partialUpdate);

      // Assert
      const formData = mockAxiosInstance.put.mock.calls[0][1] as URLSearchParams;
      expect(formData.get('id')).toBe(vendorId);
      expect(formData.get('notes')).toBe('Updated notes only');
      // Other fields should not be in FormData
      expect(formData.has('name')).toBe(false);
      expect(formData.has('email')).toBe(false);
    });
  });

  describe('deleteVendor', () => {
    it('soft deletes vendor by ID', async () => {
      // Arrange
      mockAxiosInstance.delete.mockResolvedValue({});

      vi.resetModules();
      const { deleteVendor } = await import('../../endpoints/vendors');

      // Act
      await deleteVendor('vendor-to-delete-uuid');

      // Assert
      expect(mockAxiosInstance.delete).toHaveBeenCalledWith(
        '/vendor/delete/vendor-to-delete-uuid.json'
      );
    });
  });

  // =============================================================================
  // Vendor Reports
  // =============================================================================

  describe('getVendorPaymentSummary', () => {
    it('fetches payment summary for vendor', async () => {
      // Arrange
      const mockSummary = {
        vendor: { id: 'vendor-uuid', name: 'Office Supplies Inc' },
        totalBilled: 50000,
        totalPaid: 35000,
        totalOutstanding: 15000,
        bills: [
          { id: 'bill-1', billNumber: 'BILL-001', amount: 10000, status: 'PAID' },
          { id: 'bill-2', billNumber: 'BILL-002', amount: 25000, status: 'PAID' },
          { id: 'bill-3', billNumber: 'BILL-003', amount: 15000, status: 'PENDING' },
        ],
      };
      mockAxiosInstance.get.mockResolvedValue({ data: mockSummary });

      vi.resetModules();
      const { getVendorPaymentSummary } = await import('../../endpoints/vendors');

      // Act
      const result = await getVendorPaymentSummary('vendor-uuid');

      // Assert
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/vendor/paymentSummary/vendor-uuid.json');
      expect(result.totalBilled).toBe(50000);
      expect(result.totalPaid).toBe(35000);
      expect(result.totalOutstanding).toBe(15000);
      expect(result.bills).toHaveLength(3);
    });

    it('handles vendor with no bills', async () => {
      // Arrange
      const mockSummary = {
        vendor: { id: 'new-vendor', name: 'New Vendor' },
        totalBilled: 0,
        totalPaid: 0,
        totalOutstanding: 0,
        bills: [],
      };
      mockAxiosInstance.get.mockResolvedValue({ data: mockSummary });

      vi.resetModules();
      const { getVendorPaymentSummary } = await import('../../endpoints/vendors');

      // Act
      const result = await getVendorPaymentSummary('new-vendor');

      // Assert
      expect(result.totalBilled).toBe(0);
      expect(result.bills).toHaveLength(0);
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
      const { listVendors } = await import('../../endpoints/vendors');

      // Act & Assert
      await expect(listVendors()).rejects.toThrow('Network Error');
    });

    it('propagates duplicate name validation error', async () => {
      // Arrange
      const mockError = {
        response: {
          status: 422,
          data: { errors: [{ field: 'name', message: 'Vendor with this name already exists' }] },
        },
      };
      mockAxiosInstance.post.mockRejectedValue(mockError);

      vi.resetModules();
      const { createVendor } = await import('../../endpoints/vendors');

      // Act & Assert
      await expect(createVendor({ name: 'Duplicate Vendor' })).rejects.toEqual(mockError);
    });

    it('handles 403 forbidden for restricted vendor', async () => {
      // Arrange
      const forbiddenError = {
        response: { status: 403, data: { message: 'Access denied to this vendor' } },
      };
      mockAxiosInstance.get.mockRejectedValue(forbiddenError);

      vi.resetModules();
      const { getVendor } = await import('../../endpoints/vendors');

      // Act & Assert
      await expect(getVendor('restricted-vendor')).rejects.toEqual(forbiddenError);
    });

    it('handles vendor with outstanding bills cannot be deleted', async () => {
      // Arrange
      const mockError = {
        response: {
          status: 400,
          data: { message: 'Cannot delete vendor with outstanding bills' },
        },
      };
      mockAxiosInstance.delete.mockRejectedValue(mockError);

      vi.resetModules();
      const { deleteVendor } = await import('../../endpoints/vendors');

      // Act & Assert
      await expect(deleteVendor('vendor-with-bills')).rejects.toEqual(mockError);
    });
  });
});
