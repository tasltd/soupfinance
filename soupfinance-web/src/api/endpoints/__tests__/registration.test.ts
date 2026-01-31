/**
 * Unit tests for registration API module
 * Tests tenant registration with the new /account/register.json endpoint
 *
 * API ARCHITECTURE (2026-01-30):
 * - Registration creates a NEW TENANT (Account) with isolated data
 * - Uses JSON format (not FormData)
 * - Endpoint: POST /account/register.json
 * - No password during registration - set during email confirmation
 *
 * Note: axios is mocked globally
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

// Import types
import type { TenantRegistration, CorporateRegistration } from '../registration';

describe('Registration API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('registerTenant (new API)', () => {
    it('sends correct JSON body to /account/register.json', async () => {
      // Arrange
      const registration: TenantRegistration = {
        companyName: 'Acme Trading Ltd',
        businessType: 'TRADING',
        adminFirstName: 'John',
        adminLastName: 'Doe',
        email: 'john@acmetrading.com',
      };

      const mockResponse = {
        data: {
          success: true,
          message: 'Registration successful',
          accountId: 'account-uuid-123',
          agentId: 'agent-uuid-456',
          email: 'john@acmetrading.com',
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
      const { registerTenant: freshRegister } = await import('../registration');

      // Act
      const result = await freshRegister(registration);

      // Assert - verify POST was called with JSON body
      expect(mockPost).toHaveBeenCalledWith('/account/register.json', registration);

      // Assert - verify response
      expect(result.success).toBe(true);
      expect(result.accountId).toBe('account-uuid-123');
      expect(result.email).toBe('john@acmetrading.com');
    });

    it('supports SERVICES business type', async () => {
      const registration: TenantRegistration = {
        companyName: 'Consulting Services Ltd',
        businessType: 'SERVICES',
        adminFirstName: 'Jane',
        adminLastName: 'Smith',
        email: 'jane@consulting.com',
      };

      const mockResponse = {
        data: {
          success: true,
          message: 'Registration successful',
          accountId: 'services-account-123',
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
      const { registerTenant: freshRegister } = await import('../registration');

      // Act
      const result = await freshRegister(registration);

      // Assert
      expect(mockPost).toHaveBeenCalledWith('/account/register.json', expect.objectContaining({
        businessType: 'SERVICES',
      }));
      expect(result.success).toBe(true);
    });

    it('includes optional currency field when provided', async () => {
      const registration: TenantRegistration = {
        companyName: 'Ghana Trading Co',
        businessType: 'TRADING',
        adminFirstName: 'Kofi',
        adminLastName: 'Asante',
        email: 'kofi@ghantrading.com',
        currency: 'GHS',
      };

      const mockPost = vi.fn().mockResolvedValue({ data: { success: true } });
      (axios.create as ReturnType<typeof vi.fn>).mockReturnValue({
        interceptors: {
          request: { use: vi.fn() },
          response: { use: vi.fn() },
        },
        post: mockPost,
        get: vi.fn(),
      });

      vi.resetModules();
      const { registerTenant: freshRegister } = await import('../registration');

      // Act
      await freshRegister(registration);

      // Assert
      expect(mockPost).toHaveBeenCalledWith('/account/register.json', expect.objectContaining({
        currency: 'GHS',
      }));
    });

    it('throws error on registration failure', async () => {
      const registration: TenantRegistration = {
        companyName: 'Fail Corp',
        businessType: 'SERVICES',
        adminFirstName: 'Test',
        adminLastName: 'User',
        email: 'test@fail.com',
      };

      const mockError = {
        response: {
          status: 422,
          data: {
            success: false,
            message: 'Email already registered',
            error: 'email_exists',
          },
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
      const { registerTenant: freshRegister } = await import('../registration');

      // Act & Assert
      await expect(freshRegister(registration)).rejects.toEqual(mockError);
    });

    it('handles network errors gracefully', async () => {
      const registration: TenantRegistration = {
        companyName: 'Network Error Corp',
        businessType: 'TRADING',
        adminFirstName: 'Network',
        adminLastName: 'Test',
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
      const { registerTenant: freshRegister } = await import('../registration');

      // Act & Assert
      await expect(freshRegister(registration)).rejects.toThrow('Network Error');
    });
  });

  describe('registerCorporate (legacy wrapper)', () => {
    it('maps legacy format to new tenant format', async () => {
      // The legacy registerCorporate maps to registerTenant internally
      const legacyRegistration: CorporateRegistration = {
        name: 'Legacy Corp',
        contactFirstName: 'John',
        contactLastName: 'Doe',
        email: 'john@legacy.com',
      };

      const mockResponse = {
        data: {
          success: true,
          message: 'Registration successful',
          accountId: 'legacy-account-123',
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
      const result = await freshRegister(legacyRegistration);

      // Assert - should map to new format
      expect(mockPost).toHaveBeenCalledWith('/account/register.json', expect.objectContaining({
        companyName: 'Legacy Corp',
        adminFirstName: 'John',
        adminLastName: 'Doe',
        email: 'john@legacy.com',
        businessType: 'SERVICES', // Default for legacy calls
      }));
      expect(result.success).toBe(true);
    });
  });

  describe('confirmEmail', () => {
    it('sends token and password to /account/confirmEmail.json', async () => {
      const confirmData = {
        token: 'confirmation-token-abc123',
        password: 'SecurePass123!',
        confirmPassword: 'SecurePass123!',
      };

      const mockResponse = {
        data: {
          success: true,
          message: 'Email confirmed successfully',
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
      const { confirmEmail: freshConfirm } = await import('../registration');

      // Act
      const result = await freshConfirm(confirmData);

      // Assert
      expect(mockPost).toHaveBeenCalledWith('/account/confirmEmail.json', confirmData);
      expect(result.success).toBe(true);
    });
  });

  describe('resendConfirmation', () => {
    it('sends email to /account/resendConfirmation.json', async () => {
      const mockResponse = {
        data: {
          success: true,
          message: 'Confirmation email resent',
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
      const { resendConfirmation: freshResend } = await import('../registration');

      // Act
      const result = await freshResend('user@example.com');

      // Assert
      expect(mockPost).toHaveBeenCalledWith('/account/resendConfirmation.json', {
        email: 'user@example.com',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('checkPhoneExists (deprecated)', () => {
    it('always returns false (deprecated function)', async () => {
      // These functions are deprecated and no longer call the API
      vi.resetModules();
      const { checkPhoneExists: freshCheck } = await import('../registration');

      // Act
      const result = await freshCheck('+254700000000');

      // Assert - always returns false as function is deprecated
      expect(result).toBe(false);
    });
  });

  describe('checkEmailExists (deprecated)', () => {
    it('always returns false (deprecated function)', async () => {
      // These functions are deprecated and no longer call the API
      vi.resetModules();
      const { checkEmailExists: freshCheck } = await import('../registration');

      // Act
      const result = await freshCheck('existing@example.com');

      // Assert - always returns false as function is deprecated
      expect(result).toBe(false);
    });
  });
});
