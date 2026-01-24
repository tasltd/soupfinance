/**
 * Unit tests for 2FA authentication flow
 * Tests requestOTP and verifyOTP functions with localStorage token storage
 *
 * Note: axios is mocked globally in test/setup.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  requestOTP,
  verifyOTP,
  isAuthenticated,
  getCurrentUser,
  getAccessToken,
  logout,
  type AuthUser,
} from '../auth';
import apiClient from '../client';

// Mock the apiClient module
vi.mock('../client', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
  },
  toFormData: vi.fn((data: Record<string, unknown>) => {
    const params = new URLSearchParams();
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, String(value));
      }
    });
    return params;
  }),
}));

describe('2FA Authentication Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('requestOTP', () => {
    it('sends OTP request with email contact', async () => {
      // Arrange
      const contact = 'user@company.com';
      const mockResponse = {
        data: { message: 'OTP sent to your email' },
      };
      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      // Act
      const result = await requestOTP(contact);

      // Assert
      expect(apiClient.post).toHaveBeenCalledWith(
        '/client/authenticate.json',
        expect.any(URLSearchParams)
      );

      // Verify FormData contains contact
      const formData = (apiClient.post as ReturnType<typeof vi.fn>).mock.calls[0][1] as URLSearchParams;
      expect(formData.get('contact')).toBe('user@company.com');

      expect(result.message).toBe('OTP sent to your email');
    });

    it('sends OTP request with phone contact', async () => {
      // Arrange
      const contact = '+254700123456';
      const mockResponse = {
        data: { message: 'OTP sent via SMS' },
      };
      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      // Act
      const result = await requestOTP(contact);

      // Assert
      const formData = (apiClient.post as ReturnType<typeof vi.fn>).mock.calls[0][1] as URLSearchParams;
      expect(formData.get('contact')).toBe('+254700123456');
      expect(result.message).toBe('OTP sent via SMS');
    });

    it('throws error when OTP request fails', async () => {
      // Arrange
      const contact = 'invalid@company.com';
      const mockError = {
        response: {
          status: 404,
          data: { message: 'Contact not found' },
        },
      };
      (apiClient.post as ReturnType<typeof vi.fn>).mockRejectedValue(mockError);

      // Act & Assert
      await expect(requestOTP(contact)).rejects.toEqual(mockError);
    });

    it('handles rate limiting errors', async () => {
      // Arrange
      const contact = 'user@company.com';
      const mockError = {
        response: {
          status: 429,
          data: { message: 'Too many OTP requests. Please try again later.' },
        },
      };
      (apiClient.post as ReturnType<typeof vi.fn>).mockRejectedValue(mockError);

      // Act & Assert
      await expect(requestOTP(contact)).rejects.toEqual(mockError);
      expect(mockError.response.status).toBe(429);
    });
  });

  describe('verifyOTP', () => {
    it('verifies OTP code and stores token in localStorage', async () => {
      // Arrange
      const code = '12345';
      const mockResponse = {
        data: {
          access_token: 'jwt-token-abc123',
          token_type: 'Bearer',
          username: 'john.doe',
          email: 'john@company.com',
          roles: ['ROLE_CORPORATE_USER'],
          tenantId: 'tenant-uuid-123',
          corporateId: 'corp-uuid-456',
        },
      };
      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      // Act
      const result = await verifyOTP(code);

      // Assert - verify POST was called correctly
      expect(apiClient.post).toHaveBeenCalledWith(
        '/client/verifyCode.json',
        expect.any(URLSearchParams)
      );

      const formData = (apiClient.post as ReturnType<typeof vi.fn>).mock.calls[0][1] as URLSearchParams;
      expect(formData.get('code')).toBe('12345');

      // Assert - verify token stored in localStorage
      expect(localStorage.getItem('access_token')).toBe('jwt-token-abc123');

      // Assert - verify user stored in localStorage
      const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
      expect(storedUser.username).toBe('john.doe');
      expect(storedUser.email).toBe('john@company.com');
      expect(storedUser.roles).toContain('ROLE_CORPORATE_USER');
      expect(storedUser.tenantId).toBe('tenant-uuid-123');
      expect(storedUser.corporateId).toBe('corp-uuid-456');

      // Assert - verify returned user object
      expect(result.username).toBe('john.doe');
      expect(result.email).toBe('john@company.com');
      expect(result.corporateId).toBe('corp-uuid-456');
    });

    it('uses username as email when email is not provided', async () => {
      // Arrange
      const code = '54321';
      const mockResponse = {
        data: {
          access_token: 'jwt-token-xyz789',
          token_type: 'Bearer',
          username: 'user@example.com',
          // Note: email field is missing
          roles: ['ROLE_USER'],
        },
      };
      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      // Act
      const result = await verifyOTP(code);

      // Assert - email should fall back to username
      expect(result.email).toBe('user@example.com');
      expect(result.username).toBe('user@example.com');
    });

    it('handles empty roles array', async () => {
      // Arrange
      const code = '11111';
      const mockResponse = {
        data: {
          access_token: 'jwt-token-noroles',
          token_type: 'Bearer',
          username: 'noroles@company.com',
          // Note: roles is undefined
        },
      };
      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      // Act
      const result = await verifyOTP(code);

      // Assert - roles should default to empty array
      expect(result.roles).toEqual([]);
    });

    it('throws error on invalid OTP code', async () => {
      // Arrange
      const code = '00000';
      const mockError = {
        response: {
          status: 401,
          data: { message: 'Invalid OTP code' },
        },
      };
      (apiClient.post as ReturnType<typeof vi.fn>).mockRejectedValue(mockError);

      // Act & Assert
      await expect(verifyOTP(code)).rejects.toEqual(mockError);

      // Verify token was NOT stored
      expect(localStorage.getItem('access_token')).toBeNull();
      expect(localStorage.getItem('user')).toBeNull();
    });

    it('throws error on expired OTP code', async () => {
      // Arrange
      const code = '99999';
      const mockError = {
        response: {
          status: 410,
          data: { message: 'OTP code has expired' },
        },
      };
      (apiClient.post as ReturnType<typeof vi.fn>).mockRejectedValue(mockError);

      // Act & Assert
      await expect(verifyOTP(code)).rejects.toEqual(mockError);
    });
  });

  describe('isAuthenticated', () => {
    it('returns true when access_token exists in localStorage', () => {
      // Arrange
      localStorage.setItem('access_token', 'some-valid-token');

      // Act
      const result = isAuthenticated();

      // Assert
      expect(result).toBe(true);
    });

    it('returns false when access_token does not exist', () => {
      // Act
      const result = isAuthenticated();

      // Assert
      expect(result).toBe(false);
    });

    it('returns false when access_token is empty string', () => {
      // Arrange
      localStorage.setItem('access_token', '');

      // Act
      const result = isAuthenticated();

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('getCurrentUser', () => {
    it('returns user object when stored in localStorage', () => {
      // Arrange
      const user: AuthUser = {
        username: 'testuser',
        email: 'test@company.com',
        roles: ['ROLE_USER', 'ROLE_ADMIN'],
        tenantId: 'tenant-123',
        corporateId: 'corp-456',
      };
      localStorage.setItem('user', JSON.stringify(user));

      // Act
      const result = getCurrentUser();

      // Assert
      expect(result).toEqual(user);
      expect(result?.username).toBe('testuser');
      expect(result?.roles).toContain('ROLE_ADMIN');
    });

    it('returns null when no user in localStorage', () => {
      // Act
      const result = getCurrentUser();

      // Assert
      expect(result).toBeNull();
    });

    it('returns null when user JSON is invalid', () => {
      // Arrange
      localStorage.setItem('user', 'invalid-json-{not-valid}');

      // Act
      const result = getCurrentUser();

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('getAccessToken', () => {
    it('returns token when stored in localStorage', () => {
      // Arrange
      const token = 'jwt-token-abc123';
      localStorage.setItem('access_token', token);

      // Act
      const result = getAccessToken();

      // Assert
      expect(result).toBe(token);
    });

    it('returns null when no token in localStorage', () => {
      // Act
      const result = getAccessToken();

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('logout', () => {
    it('clears localStorage and redirects to login', () => {
      // Arrange
      localStorage.setItem('access_token', 'some-token');
      localStorage.setItem('user', JSON.stringify({ username: 'test' }));

      // Act
      logout();

      // Assert - localStorage cleared
      expect(localStorage.getItem('access_token')).toBeNull();
      expect(localStorage.getItem('user')).toBeNull();

      // Assert - redirect to login
      expect(window.location.href).toBe('/login');
    });
  });

  describe('Full 2FA Flow Integration', () => {
    it('completes full OTP flow: request -> verify -> authenticated', async () => {
      // Step 1: Request OTP
      const requestResponse = { data: { message: 'OTP sent' } };
      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce(requestResponse);

      const otpMessage = await requestOTP('user@company.com');
      expect(otpMessage.message).toBe('OTP sent');

      // Step 2: Verify OTP
      const verifyResponse = {
        data: {
          access_token: 'authenticated-token-123',
          token_type: 'Bearer',
          username: 'user@company.com',
          email: 'user@company.com',
          roles: ['ROLE_CORPORATE_USER'],
          corporateId: 'corp-id-789',
        },
      };
      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce(verifyResponse);

      const user = await verifyOTP('12345');
      expect(user.username).toBe('user@company.com');

      // Step 3: Verify authenticated state
      expect(isAuthenticated()).toBe(true);
      expect(getAccessToken()).toBe('authenticated-token-123');

      const currentUser = getCurrentUser();
      expect(currentUser?.corporateId).toBe('corp-id-789');

      // Step 4: Logout
      logout();
      expect(isAuthenticated()).toBe(false);
      expect(getCurrentUser()).toBeNull();
    });
  });
});
