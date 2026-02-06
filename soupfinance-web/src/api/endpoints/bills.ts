/**
 * Bill (Expenses) API endpoints
 * Maps to soupmarkets-web /rest/bill/* endpoints
 *
 * CSRF Token Pattern:
 * Changed: Only POST/save operations require CSRF token from create.json endpoint.
 * PUT (update) and DELETE operations do NOT require CSRF tokens.
 */
// Changed: Removed unused getCsrfTokenForEdit import (will be used when edit is implemented)
import apiClient, { toQueryString, getCsrfToken, csrfQueryString } from '../client';
import type { Bill, BillItem, BillPayment, ListParams } from '../../types';

const BASE_URL = '/bill';

// =============================================================================
// Response Transformation
// =============================================================================

/**
 * Format ISO datetime to date string for display.
 * "2025-11-17T00:00:00Z" → "2025-11-17"
 */
function formatDateField(isoDatetime?: string): string {
  if (!isoDatetime) return '';
  return isoDatetime.split('T')[0];
}

/**
 * Safely extract a string from a value that may be a Grails FK/enum reference object.
 * Grails serializes enums and FKs as { id, class, serialised } objects.
 * This helper returns the serialised string or the value itself if it's already a string.
 */
function safeString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'object' && value !== null) {
    // Grails FK reference: { id, class, serialised }
    if ('serialised' in value) return String((value as { serialised: string }).serialised);
    // Enum object: { name: "BANK_TRANSFER" }
    if ('name' in value) return String((value as { name: string }).name);
  }
  return String(value ?? '');
}

/**
 * Transform raw payment response to ensure all fields are primitive values.
 * The backend may return paymentMethod as a Grails enum object {id, class, serialised}
 * instead of a plain string.
 */
function transformPayment(raw: BillPayment): BillPayment {
  return {
    ...raw,
    paymentMethod: safeString(raw.paymentMethod) as BillPayment['paymentMethod'],
    paymentDate: formatDateField(raw.paymentDate) || raw.paymentDate,
    reference: raw.reference ? safeString(raw.reference) : raw.reference,
    notes: raw.notes ? safeString(raw.notes) : raw.notes,
  };
}

// =============================================================================
// Bill CRUD
// =============================================================================

/**
 * List bills with pagination
 * GET /rest/bill/index.json
 */
export async function listBills(params?: ListParams): Promise<Bill[]> {
  const query = params ? `?${toQueryString(params)}` : '';
  const response = await apiClient.get<Bill[]>(`${BASE_URL}/index.json${query}`);
  return response.data;
}

/**
 * Get single bill by ID
 * GET /rest/bill/show/:id.json
 */
export async function getBill(id: string): Promise<Bill> {
  const response = await apiClient.get<Bill>(`${BASE_URL}/show/${id}.json`);
  return response.data;
}

/**
 * Create new bill
 * POST /rest/bill/save.json
 *
 * CSRF Token Required: Calls create.json first to get SYNCHRONIZER_TOKEN
 */
export async function createBill(data: Partial<Bill>): Promise<Bill> {
  // Step 1: Get CSRF token from create endpoint
  const csrf = await getCsrfToken('bill');

  // Step 2: Pass CSRF token as URL query params (Grails withForm reads from request params, not JSON body)
  const response = await apiClient.post<Bill>(
    `${BASE_URL}/save.json?${csrfQueryString(csrf)}`,
    data
  );
  return response.data;
}

/**
 * Update existing bill
 * PUT /rest/bill/update/:id.json
 *
 * Changed: Updates do not require CSRF tokens
 */
export async function updateBill(id: string, data: Partial<Bill>): Promise<Bill> {
  const response = await apiClient.put<Bill>(
    `${BASE_URL}/update/${id}.json`,
    { ...data, id }
  );
  return response.data;
}

/**
 * Delete bill (soft delete)
 * DELETE /rest/bill/delete/:id.json
 */
export async function deleteBill(id: string): Promise<void> {
  await apiClient.delete(`${BASE_URL}/delete/${id}.json`);
}

// =============================================================================
// Bill Items
// =============================================================================

/**
 * Add item to bill
 * POST /rest/billItem/save.json
 *
 * CSRF Token Required: Calls create.json first to get SYNCHRONIZER_TOKEN
 */
export async function addBillItem(data: Partial<BillItem>): Promise<BillItem> {
  // Step 1: Get CSRF token from create endpoint
  const csrf = await getCsrfToken('billItem');

  // Step 2: Pass CSRF token as URL query params (Grails withForm reads from request params, not JSON body)
  const response = await apiClient.post<BillItem>(
    `/billItem/save.json?${csrfQueryString(csrf)}`,
    data
  );
  return response.data;
}

/**
 * Update bill item
 * PUT /rest/billItem/update/:id.json
 *
 * Changed: Updates do not require CSRF tokens
 */
export async function updateBillItem(id: string, data: Partial<BillItem>): Promise<BillItem> {
  const response = await apiClient.put<BillItem>(
    `/billItem/update/${id}.json`,
    { ...data, id }
  );
  return response.data;
}

/**
 * Delete bill item
 * DELETE /rest/billItem/delete/:id.json
 */
export async function deleteBillItem(id: string): Promise<void> {
  await apiClient.delete(`/billItem/delete/${id}.json`);
}

// =============================================================================
// Bill Payments
// =============================================================================

/**
 * List all bill payments with pagination
 * GET /rest/billPayment/index.json
 * Added: Support for listing all payments without bill filter
 */
export async function listAllBillPayments(params?: ListParams): Promise<BillPayment[]> {
  const query = params ? `?${toQueryString(params)}` : '';
  const response = await apiClient.get<BillPayment[]>(`/billPayment/index.json${query}`);
  return (response.data || []).map(transformPayment);
}

/**
 * List payments for a specific bill
 * GET /rest/billPayment/index.json?bill.id=:id
 */
export async function listBillPayments(billId: string): Promise<BillPayment[]> {
  const response = await apiClient.get<BillPayment[]>(
    `/billPayment/index.json?bill.id=${billId}`
  );
  return (response.data || []).map(transformPayment);
}

/**
 * Record payment against bill
 * POST /rest/billPayment/save.json
 *
 * CSRF Token Required: Calls create.json first to get SYNCHRONIZER_TOKEN
 */
export async function recordBillPayment(data: Partial<BillPayment>): Promise<BillPayment> {
  // Step 1: Get CSRF token from create endpoint
  const csrf = await getCsrfToken('billPayment');

  // Step 2: Pass CSRF token as URL query params (Grails withForm reads from request params, not JSON body)
  const response = await apiClient.post<BillPayment>(
    `/billPayment/save.json?${csrfQueryString(csrf)}`,
    data
  );
  return response.data;
}

/**
 * Delete bill payment
 * DELETE /rest/billPayment/delete/:id.json
 */
export async function deleteBillPayment(id: string): Promise<void> {
  await apiClient.delete(`/billPayment/delete/${id}.json`);
}
