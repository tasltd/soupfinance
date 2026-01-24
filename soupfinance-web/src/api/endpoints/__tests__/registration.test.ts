/**
 * Unit tests for registration API module
 * Tests corporate registration with Grails nested field names (FormData)
 *
 * Note: axios is mocked globally in test/setup.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';

// Mock the module's internal axios instance
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

// Import after mocking
// Note: Functions are re-imported via vi.resetModules() in each test for fresh mocks
import { type CorporateRegistration } from '../registration';

describe('Registration API', () => {
  // Note: Individual tests create fresh mocks via vi.resetModules() and re-import

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('registerCorporate', () => {
    it('sends correct FormData with Grails nested field names', async () => {
      // Arrange
      const registration: CorporateRegistration = {
        phoneNumber: '+254700123456',
        email: 'john@acme.com',
        companyName: 'Acme Corporation',
        registrationNumber: 'REG-12345',
        taxIdentificationNumber: 'TIN-67890',
        countryOfIncorporation: 'Kenya',
        contactFirstName: 'John',
        contactLastName: 'Doe',
        contactPosition: 'CFO',
      };

      const mockResponse = {
        data: {
          client: { id: 'client-uuid-123', email: 'john@acme.com' },
          corporate: { id: 'corp-uuid-456', name: 'Acme Corporation' },
          message: 'Registration successful',
        },
      };

      // Re-create mock for this test
      const mockPost = vi.fn().mockResolvedValue(mockResponse);
      (axios.create as ReturnType<typeof vi.fn>).mockReturnValue({
        interceptors: {
          request: { use: vi.fn() },
          response: { use: vi.fn() },
        },
        post: mockPost,
        get: vi.fn(),
      });

      // Re-import to get fresh module with new mock
      vi.resetModules();
      const { registerCorporate: freshRegister } = await import('../registration');

      // Act
      const result = await freshRegister(registration);

      // Assert - verify POST was called
      expect(mockPost).toHaveBeenCalledWith(
        '/client/register.json',
        expect.any(URLSearchParams)
      );

      // Assert - verify FormData contains correct Grails nested fields
      const formData = mockPost.mock.calls[0][1] as URLSearchParams;

      // Client-level fields (flat)
      expect(formData.get('phoneNumber')).toBe('+254700123456');
      expect(formData.get('email')).toBe('john@acme.com');

      // Corporate-level fields (nested with corporate. prefix)
      expect(formData.get('corporate.name')).toBe('Acme Corporation');
      expect(formData.get('corporate.certificateOfIncorporationNumber')).toBe('REG-12345');
      expect(formData.get('corporate.taxIdentificationNumber')).toBe('TIN-67890');
      expect(formData.get('corporate.countryOfIncorporation')).toBe('Kenya');
      expect(formData.get('corporate.contactFirstName')).toBe('John');
      expect(formData.get('corporate.contactLastName')).toBe('Doe');
      expect(formData.get('corporate.contactPosition')).toBe('CFO');

      // Assert - verify response
      expect(result.client?.id).toBe('client-uuid-123');
      expect(result.corporate?.id).toBe('corp-uuid-456');
    });

    it('omits optional fields when not provided', async () => {
      // Arrange - minimal required fields only
      const registration: CorporateRegistration = {
        companyName: 'Minimal Corp',
        countryOfIncorporation: 'Tanzania',
        contactFirstName: 'Jane',
        contactLastName: 'Smith',
        contactPosition: 'CEO',
      };

      const mockResponse = {
        data: {
          corporate: { id: 'corp-uuid-789', name: 'Minimal Corp' },
        },
      };

      const mockPost = vi.fn().mockResolvedValue(mockResponse);
      (axios.create as ReturnType<typeof vi.fn>).mockReturnValue({
        interceptors: {
          request: { use: vi.fn() },
          response: { use: vi.fn() },
        },
        post: mockPost,
        get: vi.fn(),
      });

      vi.resetModules();
      const { registerCorporate: freshRegister } = await import('../registration');

      // Act
      await freshRegister(registration);

      // Assert - verify optional fields are not included
      const formData = mockPost.mock.calls[0][1] as URLSearchParams;

      expect(formData.has('phoneNumber')).toBe(false);
      expect(formData.has('email')).toBe(false);
      expect(formData.has('corporate.certificateOfIncorporationNumber')).toBe(false);
      expect(formData.has('corporate.taxIdentificationNumber')).toBe(false);

      // Required fields should still be present
      expect(formData.get('corporate.name')).toBe('Minimal Corp');
      expect(formData.get('corporate.countryOfIncorporation')).toBe('Tanzania');
    });

    it('throws error on registration failure', async () => {
      // Arrange
      const registration: CorporateRegistration = {
        companyName: 'Fail Corp',
        countryOfIncorporation: 'Uganda',
        contactFirstName: 'Test',
        contactLastName: 'User',
        contactPosition: 'Manager',
      };

      const mockError = {
        response: {
          status: 422,
          data: { message: 'Company name already exists' },
        },
      };

      const mockPost = vi.fn().mockRejectedValue(mockError);
      (axios.create as ReturnType<typeof vi.fn>).mockReturnValue({
        interceptors: {
          request: { use: vi.fn() },
          response: { use: vi.fn() },
        },
        post: mockPost,
        get: vi.fn(),
      });

      vi.resetModules();
      const { registerCorporate: freshRegister } = await import('../registration');

      // Act & Assert
      await expect(freshRegister(registration)).rejects.toEqual(mockError);
    });

    it('handles network errors gracefully', async () => {
      // Arrange
      const registration: CorporateRegistration = {
        companyName: 'Network Error Corp',
        countryOfIncorporation: 'Rwanda',
        contactFirstName: 'Network',
        contactLastName: 'Test',
        contactPosition: 'Admin',
      };

      const networkError = new Error('Network Error');
      const mockPost = vi.fn().mockRejectedValue(networkError);
      (axios.create as ReturnType<typeof vi.fn>).mockReturnValue({
        interceptors: {
          request: { use: vi.fn() },
          response: { use: vi.fn() },
        },
        post: mockPost,
        get: vi.fn(),
      });

      vi.resetModules();
      const { registerCorporate: freshRegister } = await import('../registration');

      // Act & Assert
      await expect(freshRegister(registration)).rejects.toThrow('Network Error');
    });
  });

  describe('checkPhoneExists', () => {
    it('returns true when phone number exists', async () => {
      // Arrange
      const mockGet = vi.fn().mockResolvedValue({ data: { exists: true } });
      (axios.create as ReturnType<typeof vi.fn>).mockReturnValue({
        interceptors: {
          request: { use: vi.fn() },
          response: { use: vi.fn() },
        },
        post: vi.fn(),
        get: mockGet,
      });

      vi.resetModules();
      const { checkPhoneExists: freshCheck } = await import('../registration');

      // Act
      const result = await freshCheck('+254700000000');

      // Assert
      expect(result).toBe(true);
      expect(mockGet).toHaveBeenCalledWith(
        '/client/checkPhone.json?phoneNumber=%2B254700000000'
      );
    });

    it('returns false when phone number does not exist', async () => {
      // Arrange
      const mockGet = vi.fn().mockResolvedValue({ data: { exists: false } });
      (axios.create as ReturnType<typeof vi.fn>).mockReturnValue({
        interceptors: {
          request: { use: vi.fn() },
          response: { use: vi.fn() },
        },
        post: vi.fn(),
        get: mockGet,
      });

      vi.resetModules();
      const { checkPhoneExists: freshCheck } = await import('../registration');

      // Act
      const result = await freshCheck('+254700000001');

      // Assert
      expect(result).toBe(false);
    });

    it('returns false on API error (allows registration attempt)', async () => {
      // Arrange
      const mockGet = vi.fn().mockRejectedValue(new Error('404 Not Found'));
      (axios.create as ReturnType<typeof vi.fn>).mockReturnValue({
        interceptors: {
          request: { use: vi.fn() },
          response: { use: vi.fn() },
        },
        post: vi.fn(),
        get: mockGet,
      });

      vi.resetModules();
      const { checkPhoneExists: freshCheck } = await import('../registration');

      // Act
      const result = await freshCheck('+254700000002');

      // Assert - should return false on error to allow registration attempt
      expect(result).toBe(false);
    });
  });

  describe('checkEmailExists', () => {
    it('returns true when email exists', async () => {
      // Arrange
      const mockGet = vi.fn().mockResolvedValue({ data: { exists: true } });
      (axios.create as ReturnType<typeof vi.fn>).mockReturnValue({
        interceptors: {
          request: { use: vi.fn() },
          response: { use: vi.fn() },
        },
        post: vi.fn(),
        get: mockGet,
      });

      vi.resetModules();
      const { checkEmailExists: freshCheck } = await import('../registration');

      // Act
      const result = await freshCheck('existing@example.com');

      // Assert
      expect(result).toBe(true);
      expect(mockGet).toHaveBeenCalledWith(
        '/client/checkEmail.json?email=existing%40example.com'
      );
    });

    it('returns false when email does not exist', async () => {
      // Arrange
      const mockGet = vi.fn().mockResolvedValue({ data: { exists: false } });
      (axios.create as ReturnType<typeof vi.fn>).mockReturnValue({
        interceptors: {
          request: { use: vi.fn() },
          response: { use: vi.fn() },
        },
        post: vi.fn(),
        get: mockGet,
      });

      vi.resetModules();
      const { checkEmailExists: freshCheck } = await import('../registration');

      // Act
      const result = await freshCheck('new@example.com');

      // Assert
      expect(result).toBe(false);
    });

    it('returns false on API error (allows registration attempt)', async () => {
      // Arrange
      const mockGet = vi.fn().mockRejectedValue(new Error('Server Error'));
      (axios.create as ReturnType<typeof vi.fn>).mockReturnValue({
        interceptors: {
          request: { use: vi.fn() },
          response: { use: vi.fn() },
        },
        post: vi.fn(),
        get: mockGet,
      });

      vi.resetModules();
      const { checkEmailExists: freshCheck } = await import('../registration');

      // Act
      const result = await freshCheck('error@example.com');

      // Assert - should return false on error to allow registration attempt
      expect(result).toBe(false);
    });
  });
});
