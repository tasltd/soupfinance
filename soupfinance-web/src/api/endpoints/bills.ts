/**
 * Bill (Expenses) API endpoints
 * Maps to soupmarkets-web /rest/bill/* endpoints
 *
 * CSRF Token Pattern:
 * POST/PUT/DELETE operations require CSRF token from create.json or edit.json endpoint.
 * The TokenWithFormInterceptor adds SYNCHRONIZER_TOKEN and SYNCHRONIZER_URI to these responses.
 */
import apiClient, { toQueryString, getCsrfToken, getCsrfTokenForEdit } from '../client';
import type { Bill, BillItem, BillPayment, ListParams } from '../../types';

const BASE_URL = '/bill';

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

  // Step 2: Include CSRF token in JSON body
  const response = await apiClient.post<Bill>(`${BASE_URL}/save.json`, {
    ...data,
    SYNCHRONIZER_TOKEN: csrf.SYNCHRONIZER_TOKEN,
    SYNCHRONIZER_URI: csrf.SYNCHRONIZER_URI,
  });
  return response.data;
}

/**
 * Update existing bill
 * PUT /rest/bill/update/:id.json
 *
 * CSRF Token Required: Calls edit.json first to get SYNCHRONIZER_TOKEN
 */
export async function updateBill(id: string, data: Partial<Bill>): Promise<Bill> {
  // Step 1: Get CSRF token from edit endpoint
  const csrf = await getCsrfTokenForEdit('bill', id);

  // Step 2: Include CSRF token in JSON body
  const response = await apiClient.put<Bill>(`${BASE_URL}/update/${id}.json`, {
    ...data,
    id,
    SYNCHRONIZER_TOKEN: csrf.SYNCHRONIZER_TOKEN,
    SYNCHRONIZER_URI: csrf.SYNCHRONIZER_URI,
  });
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

  // Step 2: Include CSRF token in JSON body
  const response = await apiClient.post<BillItem>('/billItem/save.json', {
    ...data,
    SYNCHRONIZER_TOKEN: csrf.SYNCHRONIZER_TOKEN,
    SYNCHRONIZER_URI: csrf.SYNCHRONIZER_URI,
  });
  return response.data;
}

/**
 * Update bill item
 * PUT /rest/billItem/update/:id.json
 *
 * CSRF Token Required: Calls edit.json first to get SYNCHRONIZER_TOKEN
 */
export async function updateBillItem(id: string, data: Partial<BillItem>): Promise<BillItem> {
  // Step 1: Get CSRF token from edit endpoint
  const csrf = await getCsrfTokenForEdit('billItem', id);

  // Step 2: Include CSRF token in JSON body
  const response = await apiClient.put<BillItem>(`/billItem/update/${id}.json`, {
    ...data,
    id,
    SYNCHRONIZER_TOKEN: csrf.SYNCHRONIZER_TOKEN,
    SYNCHRONIZER_URI: csrf.SYNCHRONIZER_URI,
  });
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
  return response.data;
}

/**
 * List payments for a specific bill
 * GET /rest/billPayment/index.json?bill.id=:id
 */
export async function listBillPayments(billId: string): Promise<BillPayment[]> {
  const response = await apiClient.get<BillPayment[]>(
    `/billPayment/index.json?bill.id=${billId}`
  );
  return response.data;
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

  // Step 2: Include CSRF token in JSON body
  const response = await apiClient.post<BillPayment>('/billPayment/save.json', {
    ...data,
    SYNCHRONIZER_TOKEN: csrf.SYNCHRONIZER_TOKEN,
    SYNCHRONIZER_URI: csrf.SYNCHRONIZER_URI,
  });
  return response.data;
}

/**
 * Delete bill payment
 * DELETE /rest/billPayment/delete/:id.json
 */
export async function deleteBillPayment(id: string): Promise<void> {
  await apiClient.delete(`/billPayment/delete/${id}.json`);
}
