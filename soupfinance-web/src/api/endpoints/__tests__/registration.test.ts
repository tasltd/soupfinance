/**
 * Unit tests for registration API module
 * Tests corporate registration with minimal fields (simplified registration flow)
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
    it('sends correct FormData with minimal required fields', async () => {
      // Arrange - minimal registration with all fields
      const registration: CorporateRegistration = {
        name: 'Acme Corporation',
        contactFirstName: 'John',
        contactLastName: 'Doe',
        phoneNumber: '+254700123456',
        email: 'john@acme.com',
        contactPosition: 'CFO',
        certificateOfIncorporationNumber: 'REG-12345',
        businessCategory: 'LIMITED_LIABILITY',
      };

      const mockResponse = {
        data: {
          client: {
            id: 'client-uuid-123',
            name: 'Acme Corporation',
            phoneContacts: [{ phone: '+254700123456', priority: 'PRIMARY' }],
            emailContacts: [{ email: 'john@acme.com', priority: 'PRIMARY' }],
          },
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
      expect(mockPost).toHaveBeenCalledWith('/client/register.json', expect.any(URLSearchParams));

      // Assert - verify FormData contains correct flat field names
      const formData = mockPost.mock.calls[0][1] as URLSearchParams;

      // Type field
      expect(formData.get('type')).toBe('CORPORATE');

      // Required fields
      expect(formData.get('name')).toBe('Acme Corporation');
      expect(formData.get('contactFirstName')).toBe('John');
      expect(formData.get('contactLastName')).toBe('Doe');

      // Contact methods
      expect(formData.get('phoneNumber')).toBe('+254700123456');
      expect(formData.get('email')).toBe('john@acme.com');

      // Optional fields
      expect(formData.get('contactPosition')).toBe('CFO');
      expect(formData.get('certificateOfIncorporationNumber')).toBe('REG-12345');
      expect(formData.get('businessCategory')).toBe('LIMITED_LIABILITY');

      // Assert - verify response
      expect(result.client?.id).toBe('client-uuid-123');
      expect(result.client?.name).toBe('Acme Corporation');
    });

    it('omits optional fields when not provided', async () => {
      // Arrange - minimal required fields only
      const registration: CorporateRegistration = {
        name: 'Minimal Corp',
        contactFirstName: 'Jane',
        contactLastName: 'Smith',
        email: 'jane@minimal.com',
      };

      const mockResponse = {
        data: {
          client: { id: 'corp-uuid-789', name: 'Minimal Corp' },
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

      // Optional fields should NOT be present
      expect(formData.has('phoneNumber')).toBe(false);
      expect(formData.has('contactPosition')).toBe(false);
      expect(formData.has('certificateOfIncorporationNumber')).toBe(false);
      expect(formData.has('businessCategory')).toBe(false);

      // Required fields should still be present
      expect(formData.get('type')).toBe('CORPORATE');
      expect(formData.get('name')).toBe('Minimal Corp');
      expect(formData.get('contactFirstName')).toBe('Jane');
      expect(formData.get('contactLastName')).toBe('Smith');
      expect(formData.get('email')).toBe('jane@minimal.com');
    });

    it('works with phone number only (no email)', async () => {
      // Arrange
      const registration: CorporateRegistration = {
        name: 'Phone Only Corp',
        contactFirstName: 'Phone',
        contactLastName: 'User',
        phoneNumber: '+233244123456',
      };

      const mockResponse = {
        data: {
          client: { id: 'corp-phone-only', name: 'Phone Only Corp' },
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

      // Assert
      const formData = mockPost.mock.calls[0][1] as URLSearchParams;
      expect(formData.get('phoneNumber')).toBe('+233244123456');
      expect(formData.has('email')).toBe(false);
    });

    it('throws error on registration failure', async () => {
      // Arrange
      const registration: CorporateRegistration = {
        name: 'Fail Corp',
        contactFirstName: 'Test',
        contactLastName: 'User',
        email: 'test@fail.com',
      };

      const mockError = {
        response: {
          status: 422,
          data: { message: 'Company name already exists', error: 1006 },
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
        name: 'Network Error Corp',
        contactFirstName: 'Network',
        contactLastName: 'Test',
        email: 'network@test.com',
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
      expect(mockGet).toHaveBeenCalledWith('/client/checkPhone.json?phoneNumber=%2B254700000000');
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
      expect(mockGet).toHaveBeenCalledWith('/client/checkEmail.json?email=existing%40example.com');
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
