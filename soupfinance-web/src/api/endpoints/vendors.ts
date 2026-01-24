/**
 * Vendor API endpoints
 * Maps to soupmarkets-web /rest/vendor/* endpoints
 */
import apiClient, { toFormData, toQueryString } from '../client';
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
 */
export async function createVendor(data: Partial<Vendor>): Promise<Vendor> {
  const formData = toFormData(data as Record<string, unknown>);
  const response = await apiClient.post<Vendor>(`${BASE_URL}/save.json`, formData);
  return response.data;
}

/**
 * Update existing vendor
 * PUT /rest/vendor/update/:id.json
 */
export async function updateVendor(id: string, data: Partial<Vendor>): Promise<Vendor> {
  const formData = toFormData({ ...data, id } as Record<string, unknown>);
  const response = await apiClient.put<Vendor>(`${BASE_URL}/update/${id}.json`, formData);
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
