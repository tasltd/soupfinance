/**
 * Integration tests for API client
 * Tests axios instance creation, interceptors, and helper functions
 * working together in request/response flow
 *
 * Added: Integration test suite for client.ts
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

describe('API Client Integration', () => {
  let mockAxiosInstance: {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
    put: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    interceptors: {
      request: { use: ReturnType<typeof vi.fn> };
      response: { use: ReturnType<typeof vi.fn> };
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    // Create fresh mock instance
    mockAxiosInstance = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
    };

    (axios.create as ReturnType<typeof vi.fn>).mockReturnValue(mockAxiosInstance);
  });

  describe('Axios instance configuration', () => {
    it('creates axios instance with correct base config', async () => {
      // Act - import fresh module
      vi.resetModules();
      await import('../../client');

      // Assert - migrated from FormData to JSON content type
      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          }),
          timeout: 30000,
        })
      );
    });

    it('registers request interceptor on creation', async () => {
      // Act
      vi.resetModules();
      await import('../../client');

      // Assert - interceptor should be registered
      expect(mockAxiosInstance.interceptors.request.use).toHaveBeenCalled();
    });

    it('registers response interceptor on creation', async () => {
      // Act
      vi.resetModules();
      await import('../../client');

      // Assert
      expect(mockAxiosInstance.interceptors.response.use).toHaveBeenCalled();
    });
  });

  describe('Request interceptor behavior', () => {
    // Changed (2026-01-21): Updated to test X-Auth-Token header instead of Authorization: Bearer
    // Backend uses grails.plugin.springsecurity.rest.token.validation.useBearerToken = false
    it('attaches X-Auth-Token when present in localStorage', async () => {
      // Arrange
      localStorage.setItem('access_token', 'test-jwt-token-123');

      // Capture the request interceptor
      // Fix: Initialize with placeholder to satisfy TypeScript
      let requestInterceptor: (config: { headers: Record<string, string> }) => { headers: Record<string, string> } =
        () => { throw new Error('Interceptor not initialized'); };
      mockAxiosInstance.interceptors.request.use.mockImplementation(
        (onFulfilled: typeof requestInterceptor) => {
          requestInterceptor = onFulfilled;
        }
      );

      vi.resetModules();
      await import('../../client');

      // Act - simulate request
      const config = { headers: {} as Record<string, string> };
      const result = requestInterceptor(config);

      // Assert - X-Auth-Token contains just the token value
      expect(result.headers['X-Auth-Token']).toBe('test-jwt-token-123');
    });

    it('does not attach X-Auth-Token header when no token', async () => {
      // Arrange - no token in localStorage
      // Fix: Initialize with placeholder to satisfy TypeScript
      let requestInterceptor: (config: { headers: Record<string, string> }) => { headers: Record<string, string> } =
        () => { throw new Error('Interceptor not initialized'); };
      mockAxiosInstance.interceptors.request.use.mockImplementation(
        (onFulfilled: typeof requestInterceptor) => {
          requestInterceptor = onFulfilled;
        }
      );

      vi.resetModules();
      await import('../../client');

      // Act
      const config = { headers: {} as Record<string, string> };
      const result = requestInterceptor(config);

      // Assert
      expect(result.headers['X-Auth-Token']).toBeUndefined();
    });
  });

  describe('Response interceptor - 401 handling', () => {
    it('clears credentials on 401 response', async () => {
      // Arrange
      localStorage.setItem('access_token', 'expired-token');
      localStorage.setItem('user', JSON.stringify({ id: 'user-1' }));

      // Fix: Initialize with placeholder to satisfy TypeScript
      let responseInterceptorError: (error: { response?: { status: number } }) => Promise<never> =
        () => Promise.reject(new Error('Interceptor not initialized'));
      mockAxiosInstance.interceptors.response.use.mockImplementation(
        (_onFulfilled: unknown, onRejected: typeof responseInterceptorError) => {
          responseInterceptorError = onRejected;
        }
      );

      vi.resetModules();
      await import('../../client');

      // Act - simulate 401 error
      const error = { response: { status: 401 } };
      try {
        await responseInterceptorError(error);
      } catch {
        // Expected to throw
      }

      // Assert - credentials should be cleared
      expect(localStorage.getItem('access_token')).toBeNull();
      expect(localStorage.getItem('user')).toBeNull();
    });

    it('redirects to login on 401 when not already on login page', async () => {
      // Arrange
      window.location.pathname = '/dashboard';

      // Fix: Initialize with placeholder to satisfy TypeScript
      let responseInterceptorError: (error: { response?: { status: number } }) => Promise<never> =
        () => Promise.reject(new Error('Interceptor not initialized'));
      mockAxiosInstance.interceptors.response.use.mockImplementation(
        (_onFulfilled: unknown, onRejected: typeof responseInterceptorError) => {
          responseInterceptorError = onRejected;
        }
      );

      vi.resetModules();
      await import('../../client');

      // Act
      const error = { response: { status: 401 } };
      try {
        await responseInterceptorError(error);
      } catch {
        // Expected to throw
      }

      // Assert - should redirect to login
      expect(window.location.href).toBe('/login');
    });

    it('does not redirect when already on login page', async () => {
      // Arrange
      window.location.pathname = '/login';
      const originalHref = window.location.href;

      // Fix: Initialize with placeholder to satisfy TypeScript
      let responseInterceptorError: (error: { response?: { status: number } }) => Promise<never> =
        () => Promise.reject(new Error('Interceptor not initialized'));
      mockAxiosInstance.interceptors.response.use.mockImplementation(
        (_onFulfilled: unknown, onRejected: typeof responseInterceptorError) => {
          responseInterceptorError = onRejected;
        }
      );

      vi.resetModules();
      await import('../../client');

      // Act
      const error = { response: { status: 401 } };
      try {
        await responseInterceptorError(error);
      } catch {
        // Expected to throw
      }

      // Assert - should not change href
      expect(window.location.href).toBe(originalHref);
    });

    it('passes through non-401 errors without credential clearing', async () => {
      // Arrange
      localStorage.setItem('access_token', 'valid-token');

      // Fix: Initialize with placeholder to satisfy TypeScript
      let responseInterceptorError: (error: { response?: { status: number } }) => Promise<never> =
        () => Promise.reject(new Error('Interceptor not initialized'));
      mockAxiosInstance.interceptors.response.use.mockImplementation(
        (_onFulfilled: unknown, onRejected: typeof responseInterceptorError) => {
          responseInterceptorError = onRejected;
        }
      );

      vi.resetModules();
      await import('../../client');

      // Act - simulate 500 error
      const error = { response: { status: 500 } };
      try {
        await responseInterceptorError(error);
      } catch {
        // Expected to throw
      }

      // Assert - credentials should remain
      expect(localStorage.getItem('access_token')).toBe('valid-token');
    });
  });

  describe('Helper function integration with requests', () => {
    it('toFormData correctly serializes data for POST requests', async () => {
      // Arrange
      vi.resetModules();
      const { toFormData } = await import('../../client');

      const data = {
        name: 'Test Invoice',
        amount: 1500.50,
        client: { id: 'client-uuid-123' },
        active: true,
      };

      // Act
      const formData = toFormData(data);

      // Assert - verify FormData structure
      expect(formData.get('name')).toBe('Test Invoice');
      expect(formData.get('amount')).toBe('1500.5');
      expect(formData.get('client.id')).toBe('client-uuid-123');
      expect(formData.get('active')).toBe('true');
    });

    it('toQueryString correctly builds URL params for GET requests', async () => {
      // Arrange
      vi.resetModules();
      const { toQueryString } = await import('../../client');

      const params = {
        page: 1,
        size: 20,
        search: 'test query',
        status: 'PAID',
        archived: null,
      };

      // Act
      const queryString = toQueryString(params);

      // Assert
      expect(queryString).toContain('page=1');
      expect(queryString).toContain('size=20');
      expect(queryString).toContain('search=test+query');
      expect(queryString).toContain('status=PAID');
      expect(queryString).not.toContain('archived');
    });
  });

  describe('Full request/response cycle simulation', () => {
    it('simulates successful authenticated GET request', async () => {
      // Arrange
      localStorage.setItem('access_token', 'valid-jwt-token');

      const mockResponse = {
        data: [{ id: '1', name: 'Invoice 1' }, { id: '2', name: 'Invoice 2' }],
      };
      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      vi.resetModules();
      const clientModule = await import('../../client');
      const apiClient = clientModule.default;

      // Act - simulate what an endpoint would do
      const result = await apiClient.get('/invoice/index.json?page=1&size=20');

      // Assert
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/invoice/index.json?page=1&size=20');
      expect(result.data).toHaveLength(2);
    });

    it('simulates successful POST with FormData', async () => {
      // Arrange
      const mockResponse = {
        data: { id: 'new-uuid', name: 'New Invoice', status: 'DRAFT' },
      };
      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      vi.resetModules();
      const { default: apiClient, toFormData } = await import('../../client');

      const invoiceData = {
        invoiceNumber: 'INV-001',
        amount: 1000,
        client: { id: 'client-123' },
      };
      const formData = toFormData(invoiceData);

      // Act
      const result = await apiClient.post('/invoice/save.json', formData);

      // Assert
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/invoice/save.json', formData);
      expect(result.data.id).toBe('new-uuid');
    });

    it('simulates error response handling', async () => {
      // Arrange
      const mockError = {
        response: { status: 422, data: { message: 'Validation failed' } },
      };
      mockAxiosInstance.post.mockRejectedValue(mockError);

      vi.resetModules();
      const { default: apiClient, toFormData } = await import('../../client');

      // Act & Assert
      await expect(
        apiClient.post('/invoice/save.json', toFormData({ invalid: true }))
      ).rejects.toEqual(mockError);
    });
  });
});
