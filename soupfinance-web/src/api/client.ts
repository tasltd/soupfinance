/**
 * API Client for SoupFinance
 * Uses X-Auth-Token authentication with soupmarkets-web backend
 * Tokens are stored in localStorage and automatically attached to requests
 */
import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/rest';

// Create axios instance with default config
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  timeout: 30000,
});

// Request interceptor - attach X-Auth-Token to all authenticated requests
// Changed (2026-01-21): Use X-Auth-Token header instead of Authorization: Bearer
// Backend config: grails.plugin.springsecurity.rest.token.validation.useBearerToken = false
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers['X-Auth-Token'] = token;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle 401 errors by redirecting to login
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      // Clear stored credentials
      localStorage.removeItem('access_token');
      localStorage.removeItem('user');

      // Redirect to login if not already there
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;

// Helper to convert object to FormData for POST/PUT requests
export function toFormData(data: Record<string, unknown>): URLSearchParams {
  const params = new URLSearchParams();

  Object.entries(data).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      if (typeof value === 'object' && 'id' in value) {
        // Handle nested objects with id (foreign key references)
        params.append(`${key}.id`, String((value as { id: string }).id));
      } else {
        params.append(key, String(value));
      }
    }
  });

  return params;
}

// Helper to convert object to query string for GET requests
export function toQueryString(params: Record<string, unknown>): string {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      searchParams.append(key, String(value));
    }
  });

  return searchParams.toString();
}
