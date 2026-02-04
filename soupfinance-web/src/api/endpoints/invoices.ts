/**
 * Invoice API endpoints
 * Maps to soupmarkets-web /rest/invoice/* endpoints
 *
 * CSRF Token Pattern:
 * POST/PUT/DELETE operations require CSRF token from create.json or edit.json endpoint.
 * The TokenWithFormInterceptor adds SYNCHRONIZER_TOKEN and SYNCHRONIZER_URI to these responses.
 */
import apiClient, { toQueryString, getCsrfToken, getCsrfTokenForEdit } from '../client';
import type { Invoice, InvoiceItem, InvoicePayment, ListParams } from '../../types';

const BASE_URL = '/invoice';

// =============================================================================
// Invoice CRUD
// =============================================================================

/**
 * List invoices with pagination
 * GET /rest/invoice/index.json
 */
export async function listInvoices(params?: ListParams): Promise<Invoice[]> {
  const query = params ? `?${toQueryString(params)}` : '';
  const response = await apiClient.get<Invoice[]>(`${BASE_URL}/index.json${query}`);
  return response.data;
}

/**
 * Get single invoice by ID
 * GET /rest/invoice/show/:id.json
 */
export async function getInvoice(id: string): Promise<Invoice> {
  const response = await apiClient.get<Invoice>(`${BASE_URL}/show/${id}.json`);
  return response.data;
}

/**
 * Create new invoice
 * POST /rest/invoice/save.json
 *
 * CSRF Token Required: Calls create.json first to get SYNCHRONIZER_TOKEN
 */
export async function createInvoice(data: Partial<Invoice>): Promise<Invoice> {
  // Step 1: Get CSRF token from create endpoint
  const csrf = await getCsrfToken('invoice');

  // Step 2: Include CSRF token in JSON body
  const response = await apiClient.post<Invoice>(`${BASE_URL}/save.json`, {
    ...data,
    SYNCHRONIZER_TOKEN: csrf.SYNCHRONIZER_TOKEN,
    SYNCHRONIZER_URI: csrf.SYNCHRONIZER_URI,
  });
  return response.data;
}

/**
 * Update existing invoice
 * PUT /rest/invoice/update/:id.json
 *
 * CSRF Token Required: Calls edit.json first to get SYNCHRONIZER_TOKEN
 */
export async function updateInvoice(id: string, data: Partial<Invoice>): Promise<Invoice> {
  // Step 1: Get CSRF token from edit endpoint
  const csrf = await getCsrfTokenForEdit('invoice', id);

  // Step 2: Include CSRF token in JSON body
  const response = await apiClient.put<Invoice>(`${BASE_URL}/update/${id}.json`, {
    ...data,
    id,
    SYNCHRONIZER_TOKEN: csrf.SYNCHRONIZER_TOKEN,
    SYNCHRONIZER_URI: csrf.SYNCHRONIZER_URI,
  });
  return response.data;
}

/**
 * Delete invoice (soft delete)
 * DELETE /rest/invoice/delete/:id.json
 */
export async function deleteInvoice(id: string): Promise<void> {
  await apiClient.delete(`${BASE_URL}/delete/${id}.json`);
}

// =============================================================================
// Invoice Actions
// =============================================================================

/**
 * Send invoice to client
 * POST /rest/invoice/send/:id.json
 */
export async function sendInvoice(id: string): Promise<Invoice> {
  const response = await apiClient.post<Invoice>(`${BASE_URL}/send/${id}.json`);
  return response.data;
}

/**
 * Mark invoice as viewed
 * POST /rest/invoice/markViewed/:id.json
 */
export async function markInvoiceViewed(id: string): Promise<Invoice> {
  const response = await apiClient.post<Invoice>(`${BASE_URL}/markViewed/${id}.json`);
  return response.data;
}

/**
 * Cancel invoice
 * POST /rest/invoice/cancel/:id.json
 */
export async function cancelInvoice(id: string): Promise<Invoice> {
  const response = await apiClient.post<Invoice>(`${BASE_URL}/cancel/${id}.json`);
  return response.data;
}

// =============================================================================
// Invoice Items
// =============================================================================

/**
 * Add item to invoice
 * POST /rest/invoiceItem/save.json
 *
 * CSRF Token Required: Calls create.json first to get SYNCHRONIZER_TOKEN
 */
export async function addInvoiceItem(data: Partial<InvoiceItem>): Promise<InvoiceItem> {
  // Step 1: Get CSRF token from create endpoint
  const csrf = await getCsrfToken('invoiceItem');

  // Step 2: Include CSRF token in JSON body
  const response = await apiClient.post<InvoiceItem>('/invoiceItem/save.json', {
    ...data,
    SYNCHRONIZER_TOKEN: csrf.SYNCHRONIZER_TOKEN,
    SYNCHRONIZER_URI: csrf.SYNCHRONIZER_URI,
  });
  return response.data;
}

/**
 * Update invoice item
 * PUT /rest/invoiceItem/update/:id.json
 *
 * CSRF Token Required: Calls edit.json first to get SYNCHRONIZER_TOKEN
 */
export async function updateInvoiceItem(id: string, data: Partial<InvoiceItem>): Promise<InvoiceItem> {
  // Step 1: Get CSRF token from edit endpoint
  const csrf = await getCsrfTokenForEdit('invoiceItem', id);

  // Step 2: Include CSRF token in JSON body
  const response = await apiClient.put<InvoiceItem>(`/invoiceItem/update/${id}.json`, {
    ...data,
    id,
    SYNCHRONIZER_TOKEN: csrf.SYNCHRONIZER_TOKEN,
    SYNCHRONIZER_URI: csrf.SYNCHRONIZER_URI,
  });
  return response.data;
}

/**
 * Delete invoice item
 * DELETE /rest/invoiceItem/delete/:id.json
 */
export async function deleteInvoiceItem(id: string): Promise<void> {
  await apiClient.delete(`/invoiceItem/delete/${id}.json`);
}

// =============================================================================
// Invoice Payments
// =============================================================================

/**
 * List all invoice payments with pagination
 * GET /rest/invoicePayment/index.json
 * Added: Support for listing all payments without invoice filter
 */
export async function listAllInvoicePayments(params?: ListParams): Promise<InvoicePayment[]> {
  const query = params ? `?${toQueryString(params)}` : '';
  const response = await apiClient.get<InvoicePayment[]>(`/invoicePayment/index.json${query}`);
  return response.data;
}

/**
 * List payments for a specific invoice
 * GET /rest/invoicePayment/index.json?invoice.id=:id
 */
export async function listInvoicePayments(invoiceId: string): Promise<InvoicePayment[]> {
  const response = await apiClient.get<InvoicePayment[]>(
    `/invoicePayment/index.json?invoice.id=${invoiceId}`
  );
  return response.data;
}

/**
 * Record payment against invoice
 * POST /rest/invoicePayment/save.json
 *
 * CSRF Token Required: Calls create.json first to get SYNCHRONIZER_TOKEN
 */
export async function recordInvoicePayment(data: Partial<InvoicePayment>): Promise<InvoicePayment> {
  // Step 1: Get CSRF token from create endpoint
  const csrf = await getCsrfToken('invoicePayment');

  // Step 2: Include CSRF token in JSON body
  const response = await apiClient.post<InvoicePayment>('/invoicePayment/save.json', {
    ...data,
    SYNCHRONIZER_TOKEN: csrf.SYNCHRONIZER_TOKEN,
    SYNCHRONIZER_URI: csrf.SYNCHRONIZER_URI,
  });
  return response.data;
}

/**
 * Delete invoice payment
 * DELETE /rest/invoicePayment/delete/:id.json
 */
export async function deleteInvoicePayment(id: string): Promise<void> {
  await apiClient.delete(`/invoicePayment/delete/${id}.json`);
}
