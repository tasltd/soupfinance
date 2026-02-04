/**
 * API Client for SoupFinance
 *
 * Authentication:
 * 1. Api-Authorization: Injected by the PROXY (Vite/Apache), not the client
 *    - Identifies the app (ApiConsumer) to the backend
 *    - Keeps the API consumer secret out of the browser
 * 2. X-Auth-Token: JWT token - Identifies the logged-in user (set by this client)
 */
import axios, { type AxiosError, type InternalAxiosRequestConfig, type AxiosResponse } from 'axios';
import { logger } from '../utils/logger';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/rest';

// Extend axios config to include metadata for timing
declare module 'axios' {
  export interface InternalAxiosRequestConfig {
    metadata?: {
      startTime: number;
    };
  }
}

// Create axios instance with default config
// Note: Api-Authorization header is injected by the proxy (Vite dev server / Apache),
// NOT by the client. This allows the proxy to securely add credentials without
// exposing the API consumer secret to the browser.
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
  timeout: 30000,
});

// Request interceptor - attach user auth token and log request
// Note: Api-Authorization header is injected by the proxy, not here
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Attach user auth token (identifies the logged-in user)
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers['X-Auth-Token'] = token;
    }

    // Added: Add X-Api-Consumer header to identify this app in backend logs
    // This helps filter Sentry/backend logs by API consumer
    config.headers['X-Api-Consumer'] = 'SOUPFINANCE';

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
 * Helper to convert object to URLSearchParams for form-encoded POST/PUT requests
 * Handles nested objects with id (foreign key references) for Grails data binding
 *
 * For entities with foreign keys, Grails expects dot notation: vendor.id=123
 */
export function toFormData(data: Record<string, unknown>): URLSearchParams {
  const params = new URLSearchParams();

  Object.entries(data).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      if (typeof value === 'object' && 'id' in value) {
        params.append(`${key}.id`, String((value as { id: string }).id));
      } else if (Array.isArray(value)) {
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

/**
 * CSRF Token interface returned by create.json endpoints
 */
export interface CsrfToken {
  SYNCHRONIZER_TOKEN: string;
  SYNCHRONIZER_URI: string;
}

/**
 * Get CSRF token from create.json endpoint for POST/PUT/DELETE operations
 *
 * The Grails backend uses withForm {} CSRF protection. The TokenWithFormInterceptor
 * adds SYNCHRONIZER_TOKEN and SYNCHRONIZER_URI to create.json responses.
 * These must be included in subsequent save/update requests.
 *
 * @param controller - The controller name (e.g., 'vendor', 'ledgerAccount', 'bill')
 * @returns CSRF token object to include in form data
 *
 * @example
 * const csrf = await getCsrfToken('vendor');
 * const formData = toFormData({ ...data, ...csrf });
 * await apiClient.post('/vendor/save.json', formData);
 */
export async function getCsrfToken(controller: string): Promise<CsrfToken> {
  const response = await apiClient.get<Record<string, unknown>>(`/${controller}/create.json`);

  // The token can be at the root level or nested under the controller name
  const data = response.data;
  const controllerData = data[controller] as Record<string, unknown> | undefined;

  // Try to find CSRF token in response - check both root and nested
  const token = (controllerData?.SYNCHRONIZER_TOKEN || data.SYNCHRONIZER_TOKEN) as string | undefined;
  const uri = (controllerData?.SYNCHRONIZER_URI || data.SYNCHRONIZER_URI) as string | undefined;

  if (!token || !uri) {
    logger.warn(`CSRF token not found in ${controller}/create.json response`, { data });
    // Return empty strings to allow the request to proceed
    // Backend may not require CSRF for all endpoints
    return { SYNCHRONIZER_TOKEN: '', SYNCHRONIZER_URI: '' };
  }

  return { SYNCHRONIZER_TOKEN: token, SYNCHRONIZER_URI: uri };
}

/**
 * Get CSRF token for edit operations
 * Similar to getCsrfToken but uses edit.json endpoint
 *
 * @param controller - The controller name
 * @param id - The entity ID to edit
 * @returns CSRF token object
 */
export async function getCsrfTokenForEdit(controller: string, id: string): Promise<CsrfToken> {
  const response = await apiClient.get<Record<string, unknown>>(`/${controller}/edit/${id}.json`);

  const data = response.data;
  const controllerData = data[controller] as Record<string, unknown> | undefined;

  const token = (controllerData?.SYNCHRONIZER_TOKEN || data.SYNCHRONIZER_TOKEN) as string | undefined;
  const uri = (controllerData?.SYNCHRONIZER_URI || data.SYNCHRONIZER_URI) as string | undefined;

  if (!token || !uri) {
    logger.warn(`CSRF token not found in ${controller}/edit/${id}.json response`, { data });
    return { SYNCHRONIZER_TOKEN: '', SYNCHRONIZER_URI: '' };
  }

  return { SYNCHRONIZER_TOKEN: token, SYNCHRONIZER_URI: uri };
}

// =============================================================================
// Backend Response Normalization Utilities
// =============================================================================

/**
 * Normalize a value to always be an array
 *
 * The soupmarkets backend can return certain fields (like accountServices, individual,
 * portfolioAccountServicesList) as either a single object or an array depending on
 * the number of items. This utility normalizes the response to always be an array
 * for consistent handling in the frontend.
 *
 * @param value - The value from the API response (could be object, array, null, or undefined)
 * @returns Always returns an array (empty if value is null/undefined)
 *
 * @example
 * // Backend returns single object
 * const services = normalizeToArray(response.accountServices);
 * // services is now [{ id: '123', ... }]
 *
 * @example
 * // Backend returns array
 * const services = normalizeToArray(response.accountServices);
 * // services is unchanged [{ id: '123', ... }, { id: '456', ... }]
 */
export function normalizeToArray<T>(value: T | T[] | null | undefined): T[] {
  if (value === null || value === undefined) {
    return [];
  }
  if (Array.isArray(value)) {
    return value;
  }
  return [value];
}

/**
 * Normalize a value to always be an object (first item if array)
 *
 * For fields that should be a single object but might come back as an array,
 * this returns the first item or null.
 *
 * @param value - The value from the API response (could be object, array, null, or undefined)
 * @returns The object or first array item, or null if empty/undefined
 *
 * @example
 * // Backend returns array with one item
 * const individual = normalizeToObject(response.individual);
 * // individual is now { id: '123', firstName: 'John', ... }
 */
export function normalizeToObject<T>(value: T | T[] | null | undefined): T | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (Array.isArray(value)) {
    return value.length > 0 ? value[0] : null;
  }
  return value;
}

/**
 * Normalize client account response fields
 *
 * Handles the common case where backend returns accountServices and individual
 * fields that can be either objects or arrays. This function normalizes the
 * entire response object to have consistent array types for these fields.
 *
 * @param data - The API response data containing accountServices/individual fields
 * @returns Normalized data with accountServices as array and individual as object
 *
 * @example
 * const response = await apiClient.get('/client/show/123.json');
 * const normalized = normalizeClientAccountResponse(response.data);
 * // normalized.accountServices is always an array
 * // normalized.individual is always an object or null
 */
export function normalizeClientAccountResponse<T extends Record<string, unknown>>(data: T): T {
  const normalized = { ...data };

  // Normalize accountServices to always be an array
  if ('accountServices' in normalized) {
    normalized.accountServices = normalizeToArray(normalized.accountServices);
  }

  // Normalize portfolioAccountServicesList to always be an array
  if ('portfolioAccountServicesList' in normalized) {
    normalized.portfolioAccountServicesList = normalizeToArray(normalized.portfolioAccountServicesList);
  }

  // Normalize individual to always be an object (or null)
  if ('individual' in normalized) {
    normalized.individual = normalizeToObject(normalized.individual);
  }

  return normalized;
}
