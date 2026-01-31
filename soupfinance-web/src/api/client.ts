/**
 * API Client for SoupFinance
 * Uses X-Auth-Token authentication with soupmarkets-web backend
 * Tokens are stored in localStorage and automatically attached to requests
 *
 * All requests include X-Api-Consumer header for backend log identification
 */
import axios, { type AxiosError, type InternalAxiosRequestConfig, type AxiosResponse } from 'axios';
import { logger } from '../utils/logger';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/rest';
const API_CONSUMER = 'SOUPFINANCE';

// Extend axios config to include metadata for timing
declare module 'axios' {
  export interface InternalAxiosRequestConfig {
    metadata?: {
      startTime: number;
    };
  }
}

// Create axios instance with default config
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-Api-Consumer': API_CONSUMER, // Identify this app in backend logs
  },
  timeout: 30000,
});

// Request interceptor - attach X-Auth-Token and log request
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Attach auth token
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers['X-Auth-Token'] = token;
    }

    // Record start time for duration calculation
    config.metadata = { startTime: Date.now() };

    // Log outgoing request
    const method = config.method?.toUpperCase() || 'GET';
    const url = config.url || '';
    logger.api(method, url);

    return config;
  },
  (error) => {
    logger.error('Request interceptor error', error);
    return Promise.reject(error);
  }
);

// Response interceptor - log response and handle errors
apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    // Calculate request duration
    const duration = response.config.metadata?.startTime
      ? Date.now() - response.config.metadata.startTime
      : undefined;

    // Log successful response
    const method = response.config.method?.toUpperCase() || 'GET';
    const url = response.config.url || '';
    logger.api(method, url, response.status, duration);

    return response;
  },
  (error: AxiosError) => {
    // Calculate request duration even for errors
    const duration = error.config?.metadata?.startTime
      ? Date.now() - error.config.metadata.startTime
      : undefined;

    // Log error response
    const method = error.config?.method?.toUpperCase() || 'GET';
    const url = error.config?.url || '';
    const status = error.response?.status;

    if (status) {
      logger.api(method, url, status, duration);
    }

    // Log error details
    logger.error(`API Error: ${method} ${url}`, {
      status,
      statusText: error.response?.statusText,
      data: error.response?.data,
    });

    // Handle 401 errors by redirecting to login
    if (status === 401) {
      logger.auth('session_expired');

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

/**
 * Helper to convert object to FormData for POST/PUT requests
 * Handles nested objects with id (foreign key references)
 */
export function toFormData(data: Record<string, unknown>): URLSearchParams {
  const params = new URLSearchParams();

  Object.entries(data).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      if (typeof value === 'object' && 'id' in value) {
        // Handle nested objects with id (foreign key references)
        params.append(`${key}.id`, String((value as { id: string }).id));
      } else if (Array.isArray(value)) {
        // Handle arrays (e.g., for multi-select roles)
        value.forEach((item, index) => {
          if (typeof item === 'object' && 'id' in item) {
            params.append(`${key}[${index}].id`, String((item as { id: string }).id));
          } else {
            params.append(`${key}[${index}]`, String(item));
          }
        });
      } else {
        params.append(key, String(value));
      }
    }
  });

  return params;
}

/**
 * Helper to convert object to query string for GET requests
 */
export function toQueryString(params: Record<string, unknown>): string {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      searchParams.append(key, String(value));
    }
  });

  return searchParams.toString();
}
