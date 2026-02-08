/**
 * Vendor API endpoints
 * Maps to soupmarkets-web /rest/vendor/* endpoints
 *
 * CSRF Token Pattern:
 * Changed: Only POST/save operations require CSRF token from create.json endpoint.
 * PUT (update) and DELETE operations do NOT require CSRF tokens.
 */
// Changed: Removed unused getCsrfTokenForEdit import (will be used when edit is implemented)
import apiClient, { toQueryString, getCsrfToken, csrfQueryString } from '../client';
import type { Vendor, ListParams } from '../../types';

const BASE_URL = '/vendor';

// =============================================================================
// Vendor CRUD
// =============================================================================

/**
 * List vendors with pagination
 * GET /rest/vendor/index.json
 */
export async function listVendors(params?: ListParams & { search?: string }): Promise<Vendor[]> {
  const query = params ? `?${toQueryString(params)}` : '';
  const response = await apiClient.get<Vendor[]>(`${BASE_URL}/index.json${query}`);
  return response.data;
}

/**
 * Get single vendor by ID
 * GET /rest/vendor/show/:id.json
 */
export async function getVendor(id: string): Promise<Vendor> {
  const response = await apiClient.get<Vendor>(`${BASE_URL}/show/${id}.json`);
  return response.data;
}

/**
 * Create new vendor
 * POST /rest/vendor/save.json
 *
 * CSRF Token Required: Calls create.json first to get SYNCHRONIZER_TOKEN
 */
export async function createVendor(data: Partial<Vendor>): Promise<Vendor> {
  // Step 1: Get CSRF token from create endpoint
  const csrf = await getCsrfToken('vendor');

  // Step 2: Pass CSRF token as URL query params (Grails withForm reads from request params, not JSON body)
  // NOTE: This requires the Vite proxy to forward session cookies (JSESSIONID) properly.
  // Without cookies, Grails creates separate Hibernate sessions causing PaymentMethod proxy conflicts.
  // The cookieDomainRewrite config in vite.config.ts ensures cookies are forwarded correctly.
  const response = await apiClient.post<Vendor>(
    `${BASE_URL}/save.json?${csrfQueryString(csrf)}`,
    data
  );
  return response.data;
}

/**
 * Update existing vendor
 * PUT /rest/vendor/update/:id.json
 *
 * Changed: Updates do not require CSRF tokens
 */
export async function updateVendor(id: string, data: Partial<Vendor>): Promise<Vendor> {
  const response = await apiClient.put<Vendor>(
    `${BASE_URL}/update/${id}.json`,
    { ...data, id }
  );
  return response.data;
}

/**
 * Delete vendor (soft delete)
 * DELETE /rest/vendor/delete/:id.json
 */
export async function deleteVendor(id: string): Promise<void> {
  await apiClient.delete(`${BASE_URL}/delete/${id}.json`);
}

// =============================================================================
// Vendor Reports
// =============================================================================

/**
 * Get vendor payment summary
 * GET /rest/vendor/paymentSummary/:id.json
 */
export async function getVendorPaymentSummary(vendorId: string): Promise<{
  vendor: Vendor;
  totalBilled: number;
  totalPaid: number;
  totalOutstanding: number;
  bills: Array<{ id: string; billNumber: string; amount: number; status: string }>;
}> {
  const response = await apiClient.get(`${BASE_URL}/paymentSummary/${vendorId}.json`);
  return response.data;
}
