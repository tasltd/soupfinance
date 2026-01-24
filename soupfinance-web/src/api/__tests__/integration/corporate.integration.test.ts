/**
 * Integration tests for corporate API module
 * Tests Corporate KYC CRUD, Directors, Documents, and KYC submission endpoints
 * with proper URL construction, query params, and FormData serialization
 *
 * Added: Integration test suite for corporate.ts
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

describe('Corporate API Integration', () => {
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
  // Corporate CRUD Operations
  // =============================================================================

  describe('createCorporate', () => {
    it('creates corporate with FormData serialization', async () => {
      // Arrange
      const newCorporate = {
        name: 'Acme Corporation Ltd',
        certificateOfIncorporationNumber: 'COI-12345',
        registrationDate: '2020-01-15',
        businessCategory: 'LIMITED_LIABILITY' as const,
        taxIdentificationNumber: 'TIN-67890',
        email: 'info@acmecorp.com',
        phoneNumber: '+254700123456',
        address: '123 Corporate Lane, Nairobi',
      };

      const mockResponse = { id: 'corp-uuid-123', ...newCorporate, kycStatus: 'PENDING' };
      mockAxiosInstance.post.mockResolvedValue({ data: mockResponse });

      vi.resetModules();
      const { createCorporate } = await import('../../endpoints/corporate');

      // Act
      const result = await createCorporate(newCorporate);

      // Assert
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/corporate/save.json',
        expect.any(URLSearchParams)
      );

      // Verify FormData contains correct fields
      const formData = mockAxiosInstance.post.mock.calls[0][1] as URLSearchParams;
      expect(formData.get('name')).toBe('Acme Corporation Ltd');
      expect(formData.get('certificateOfIncorporationNumber')).toBe('COI-12345');
      expect(formData.get('businessCategory')).toBe('LIMITED_LIABILITY');
      expect(formData.get('email')).toBe('info@acmecorp.com');

      expect(result.id).toBe('corp-uuid-123');
      expect(result.kycStatus).toBe('PENDING');
    });

    it('handles validation errors for missing required fields', async () => {
      // Arrange
      const mockError = {
        response: {
          status: 422,
          data: { errors: [{ field: 'name', message: 'Company name is required' }] },
        },
      };
      mockAxiosInstance.post.mockRejectedValue(mockError);

      vi.resetModules();
      const { createCorporate } = await import('../../endpoints/corporate');

      // Act & Assert
      await expect(createCorporate({})).rejects.toEqual(mockError);
    });
  });

  describe('getCorporate', () => {
    it('fetches single corporate by UUID', async () => {
      // Arrange
      const mockCorporate = {
        id: 'corp-uuid-456',
        name: 'Test Corporation',
        certificateOfIncorporationNumber: 'COI-99999',
        businessCategory: 'PUBLIC_LIMITED',
        kycStatus: 'APPROVED',
      };
      mockAxiosInstance.get.mockResolvedValue({ data: mockCorporate });

      vi.resetModules();
      const { getCorporate } = await import('../../endpoints/corporate');

      // Act
      const result = await getCorporate('corp-uuid-456');

      // Assert
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/corporate/show/corp-uuid-456.json');
      expect(result.name).toBe('Test Corporation');
      expect(result.kycStatus).toBe('APPROVED');
    });

    it('handles 404 for non-existent corporate', async () => {
      // Arrange
      const mockError = { response: { status: 404, data: { message: 'Corporate not found' } } };
      mockAxiosInstance.get.mockRejectedValue(mockError);

      vi.resetModules();
      const { getCorporate } = await import('../../endpoints/corporate');

      // Act & Assert
      await expect(getCorporate('non-existent')).rejects.toEqual(mockError);
    });
  });

  describe('updateCorporate', () => {
    it('updates corporate with ID in FormData', async () => {
      // Arrange
      const corpId = 'corp-uuid-789';
      const updateData = {
        address: 'Updated Address, Mombasa',
        phoneNumber: '+254711999888',
      };

      const mockResponse = { id: corpId, ...updateData };
      mockAxiosInstance.put.mockResolvedValue({ data: mockResponse });

      vi.resetModules();
      const { updateCorporate } = await import('../../endpoints/corporate');

      // Act
      const result = await updateCorporate(corpId, updateData);

      // Assert
      expect(mockAxiosInstance.put).toHaveBeenCalledWith(
        `/corporate/update/${corpId}.json`,
        expect.any(URLSearchParams)
      );

      const formData = mockAxiosInstance.put.mock.calls[0][1] as URLSearchParams;
      expect(formData.get('id')).toBe(corpId);
      expect(formData.get('address')).toBe('Updated Address, Mombasa');

      expect(result.address).toBe('Updated Address, Mombasa');
    });
  });

  describe('getCurrentCorporate', () => {
    it('fetches current users corporate', async () => {
      // Arrange
      const mockCorporate = {
        id: 'my-corp-uuid',
        name: 'My Company Ltd',
        kycStatus: 'PENDING',
      };
      mockAxiosInstance.get.mockResolvedValue({ data: mockCorporate });

      vi.resetModules();
      const { getCurrentCorporate } = await import('../../endpoints/corporate');

      // Act
      const result = await getCurrentCorporate();

      // Assert
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/corporate/current.json');
      expect(result?.name).toBe('My Company Ltd');
    });

    it('returns null when no corporate found for user', async () => {
      // Arrange
      mockAxiosInstance.get.mockRejectedValue({ response: { status: 404 } });

      vi.resetModules();
      const { getCurrentCorporate } = await import('../../endpoints/corporate');

      // Act
      const result = await getCurrentCorporate();

      // Assert
      expect(result).toBeNull();
    });
  });

  // =============================================================================
  // Corporate Account Persons (Directors/Signatories)
  // =============================================================================

  describe('listDirectors', () => {
    it('lists directors for a corporate', async () => {
      // Arrange
      const mockDirectors = [
        { id: 'dir-1', firstName: 'John', lastName: 'Doe', role: 'DIRECTOR' },
        { id: 'dir-2', firstName: 'Jane', lastName: 'Smith', role: 'SIGNATORY' },
      ];
      mockAxiosInstance.get.mockResolvedValue({ data: mockDirectors });

      vi.resetModules();
      const { listDirectors } = await import('../../endpoints/corporate');

      // Act
      const result = await listDirectors('corp-uuid-123');

      // Assert
      const callUrl = mockAxiosInstance.get.mock.calls[0][0] as string;
      expect(callUrl).toContain('/corporateAccountPerson/index.json?');
      expect(callUrl).toContain('corporate.id=corp-uuid-123');
      expect(result).toHaveLength(2);
    });

    it('lists directors with pagination params', async () => {
      // Arrange
      mockAxiosInstance.get.mockResolvedValue({ data: [] });

      vi.resetModules();
      const { listDirectors } = await import('../../endpoints/corporate');

      // Act
      await listDirectors('corp-uuid', { max: 10, offset: 0 });

      // Assert
      const callUrl = mockAxiosInstance.get.mock.calls[0][0] as string;
      expect(callUrl).toContain('corporate.id=corp-uuid');
      expect(callUrl).toContain('max=10');
    });
  });

  describe('getDirector', () => {
    it('fetches single director by UUID', async () => {
      // Arrange
      const mockDirector = {
        id: 'dir-uuid-123',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@acme.com',
        phoneNumber: '+254700111222',
        role: 'DIRECTOR',
        corporate: { id: 'corp-uuid' },
      };
      mockAxiosInstance.get.mockResolvedValue({ data: mockDirector });

      vi.resetModules();
      const { getDirector } = await import('../../endpoints/corporate');

      // Act
      const result = await getDirector('dir-uuid-123');

      // Assert
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/corporateAccountPerson/show/dir-uuid-123.json'
      );
      expect(result.firstName).toBe('John');
      expect(result.role).toBe('DIRECTOR');
    });
  });

  describe('addDirector', () => {
    it('adds director with FormData serialization', async () => {
      // Arrange
      const newDirector = {
        firstName: 'Robert',
        lastName: 'Johnson',
        email: 'robert@acme.com',
        phoneNumber: '+254700333444',
        role: 'BENEFICIAL_OWNER' as const,
        corporate: { id: 'corp-uuid-456' },
      };

      const mockResponse = { id: 'new-dir-uuid', ...newDirector };
      mockAxiosInstance.post.mockResolvedValue({ data: mockResponse });

      vi.resetModules();
      const { addDirector } = await import('../../endpoints/corporate');

      // Act
      const result = await addDirector(newDirector);

      // Assert
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/corporateAccountPerson/save.json',
        expect.any(URLSearchParams)
      );

      const formData = mockAxiosInstance.post.mock.calls[0][1] as URLSearchParams;
      expect(formData.get('firstName')).toBe('Robert');
      expect(formData.get('lastName')).toBe('Johnson');
      expect(formData.get('role')).toBe('BENEFICIAL_OWNER');
      expect(formData.get('corporate.id')).toBe('corp-uuid-456');

      expect(result.id).toBe('new-dir-uuid');
    });
  });

  describe('updateDirector', () => {
    it('updates director with ID in FormData', async () => {
      // Arrange
      const directorId = 'dir-uuid-789';
      const updateData = { phoneNumber: '+254700555666', role: 'SIGNATORY' as const };

      const mockResponse = { id: directorId, ...updateData };
      mockAxiosInstance.put.mockResolvedValue({ data: mockResponse });

      vi.resetModules();
      const { updateDirector } = await import('../../endpoints/corporate');

      // Act
      const result = await updateDirector(directorId, updateData);

      // Assert
      expect(mockAxiosInstance.put).toHaveBeenCalledWith(
        `/corporateAccountPerson/update/${directorId}.json`,
        expect.any(URLSearchParams)
      );

      const formData = mockAxiosInstance.put.mock.calls[0][1] as URLSearchParams;
      expect(formData.get('id')).toBe(directorId);
      expect(formData.get('role')).toBe('SIGNATORY');

      expect(result.role).toBe('SIGNATORY');
    });
  });

  describe('deleteDirector', () => {
    it('soft deletes director by ID', async () => {
      // Arrange
      mockAxiosInstance.delete.mockResolvedValue({});

      vi.resetModules();
      const { deleteDirector } = await import('../../endpoints/corporate');

      // Act
      await deleteDirector('dir-to-delete');

      // Assert
      expect(mockAxiosInstance.delete).toHaveBeenCalledWith(
        '/corporateAccountPerson/delete/dir-to-delete.json'
      );
    });
  });

  // =============================================================================
  // Corporate Documents
  // =============================================================================

  describe('listDocuments', () => {
    it('lists documents for a corporate', async () => {
      // Arrange
      const mockDocs = [
        { id: 'doc-1', documentType: 'CERTIFICATE_OF_INCORPORATION', fileName: 'coi.pdf' },
        { id: 'doc-2', documentType: 'BOARD_RESOLUTION', fileName: 'resolution.pdf' },
      ];
      mockAxiosInstance.get.mockResolvedValue({ data: mockDocs });

      vi.resetModules();
      const { listDocuments } = await import('../../endpoints/corporate');

      // Act
      const result = await listDocuments('corp-uuid-123');

      // Assert
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/corporateDocuments/index.json?corporate.id=corp-uuid-123'
      );
      expect(result).toHaveLength(2);
      expect(result[0].documentType).toBe('CERTIFICATE_OF_INCORPORATION');
    });
  });

  describe('uploadDocument', () => {
    it('uploads document with multipart/form-data', async () => {
      // Arrange
      const corporateId = 'corp-uuid-456';
      const mockFile = new File(['test content'], 'test-document.pdf', { type: 'application/pdf' });
      const documentType = 'MEMORANDUM' as const;

      const mockResponse = {
        id: 'doc-uuid',
        documentType: 'MEMORANDUM',
        fileName: 'test-document.pdf',
        fileUrl: '/documents/test-document.pdf',
        corporate: { id: corporateId },
      };
      mockAxiosInstance.post.mockResolvedValue({ data: mockResponse });

      vi.resetModules();
      const { uploadDocument } = await import('../../endpoints/corporate');

      // Act
      const result = await uploadDocument(corporateId, mockFile, documentType);

      // Assert
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/corporateDocuments/save.json',
        expect.any(FormData),
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );

      // Verify FormData contains correct fields
      const formData = mockAxiosInstance.post.mock.calls[0][1] as FormData;
      expect(formData.get('corporate.id')).toBe(corporateId);
      expect(formData.get('documentType')).toBe('MEMORANDUM');
      expect(formData.get('fileName')).toBe('test-document.pdf');
      expect(formData.get('file')).toBeInstanceOf(File);

      expect(result.id).toBe('doc-uuid');
    });

    it('uploads CERTIFICATE_OF_INCORPORATION document', async () => {
      // Arrange
      const mockFile = new File(['content'], 'coi.pdf', { type: 'application/pdf' });
      mockAxiosInstance.post.mockResolvedValue({ data: { id: 'doc-1' } });

      vi.resetModules();
      const { uploadDocument } = await import('../../endpoints/corporate');

      // Act
      await uploadDocument('corp-id', mockFile, 'CERTIFICATE_OF_INCORPORATION');

      // Assert
      const formData = mockAxiosInstance.post.mock.calls[0][1] as FormData;
      expect(formData.get('documentType')).toBe('CERTIFICATE_OF_INCORPORATION');
    });

    it('handles upload errors', async () => {
      // Arrange
      const mockFile = new File(['content'], 'large.pdf', { type: 'application/pdf' });
      const mockError = {
        response: { status: 413, data: { message: 'File too large' } },
      };
      mockAxiosInstance.post.mockRejectedValue(mockError);

      vi.resetModules();
      const { uploadDocument } = await import('../../endpoints/corporate');

      // Act & Assert
      await expect(uploadDocument('corp-id', mockFile, 'MEMORANDUM')).rejects.toEqual(mockError);
    });
  });

  describe('deleteDocument', () => {
    it('soft deletes document by ID', async () => {
      // Arrange
      mockAxiosInstance.delete.mockResolvedValue({});

      vi.resetModules();
      const { deleteDocument } = await import('../../endpoints/corporate');

      // Act
      await deleteDocument('doc-to-delete');

      // Assert
      expect(mockAxiosInstance.delete).toHaveBeenCalledWith(
        '/corporateDocuments/delete/doc-to-delete.json'
      );
    });
  });

  // =============================================================================
  // KYC Status & Actions
  // =============================================================================

  describe('submitKyc', () => {
    it('submits corporate KYC for review', async () => {
      // Arrange
      const mockResponse = {
        id: 'corp-uuid',
        name: 'Acme Corp',
        kycStatus: 'PENDING', // Changed: from draft to pending review
      };
      mockAxiosInstance.post.mockResolvedValue({ data: mockResponse });

      vi.resetModules();
      const { submitKyc } = await import('../../endpoints/corporate');

      // Act
      const result = await submitKyc('corp-uuid');

      // Assert
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/corporate/submitKyc/corp-uuid.json');
      expect(result.kycStatus).toBe('PENDING');
    });

    it('handles KYC submission validation errors', async () => {
      // Arrange
      const mockError = {
        response: {
          status: 400,
          data: { message: 'Missing required documents for KYC submission' },
        },
      };
      mockAxiosInstance.post.mockRejectedValue(mockError);

      vi.resetModules();
      const { submitKyc } = await import('../../endpoints/corporate');

      // Act & Assert
      await expect(submitKyc('incomplete-corp')).rejects.toEqual(mockError);
    });

    it('handles already submitted KYC error', async () => {
      // Arrange
      const mockError = {
        response: {
          status: 400,
          data: { message: 'KYC already submitted for review' },
        },
      };
      mockAxiosInstance.post.mockRejectedValue(mockError);

      vi.resetModules();
      const { submitKyc } = await import('../../endpoints/corporate');

      // Act & Assert
      await expect(submitKyc('already-submitted')).rejects.toEqual(mockError);
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
      const { getCorporate } = await import('../../endpoints/corporate');

      // Act & Assert
      await expect(getCorporate('any-id')).rejects.toThrow('Network Error');
    });

    it('handles duplicate registration number error', async () => {
      // Arrange
      const mockError = {
        response: {
          status: 422,
          data: {
            errors: [
              { field: 'certificateOfIncorporationNumber', message: 'Registration number already exists' },
            ],
          },
        },
      };
      mockAxiosInstance.post.mockRejectedValue(mockError);

      vi.resetModules();
      const { createCorporate } = await import('../../endpoints/corporate');

      // Act & Assert
      await expect(
        createCorporate({ certificateOfIncorporationNumber: 'DUPLICATE-123' })
      ).rejects.toEqual(mockError);
    });

    it('handles 403 access denied for other corporate', async () => {
      // Arrange
      const forbiddenError = {
        response: { status: 403, data: { message: 'Access denied to this corporate' } },
      };
      mockAxiosInstance.get.mockRejectedValue(forbiddenError);

      vi.resetModules();
      const { getCorporate } = await import('../../endpoints/corporate');

      // Act & Assert
      await expect(getCorporate('other-corp-id')).rejects.toEqual(forbiddenError);
    });
  });
});
