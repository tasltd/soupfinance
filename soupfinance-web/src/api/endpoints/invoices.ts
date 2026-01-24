/**
 * Invoice API endpoints
 * Maps to soupmarkets-web /rest/invoice/* endpoints
 */
import apiClient, { toFormData, toQueryString } from '../client';
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
 */
export async function createInvoice(data: Partial<Invoice>): Promise<Invoice> {
  const formData = toFormData(data as Record<string, unknown>);
  const response = await apiClient.post<Invoice>(`${BASE_URL}/save.json`, formData);
  return response.data;
}

/**
 * Update existing invoice
 * PUT /rest/invoice/update/:id.json
 */
export async function updateInvoice(id: string, data: Partial<Invoice>): Promise<Invoice> {
  const formData = toFormData({ ...data, id } as Record<string, unknown>);
  const response = await apiClient.put<Invoice>(`${BASE_URL}/update/${id}.json`, formData);
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
 */
export async function addInvoiceItem(data: Partial<InvoiceItem>): Promise<InvoiceItem> {
  const formData = toFormData(data as Record<string, unknown>);
  const response = await apiClient.post<InvoiceItem>('/invoiceItem/save.json', formData);
  return response.data;
}

/**
 * Update invoice item
 * PUT /rest/invoiceItem/update/:id.json
 */
export async function updateInvoiceItem(id: string, data: Partial<InvoiceItem>): Promise<InvoiceItem> {
  const formData = toFormData({ ...data, id } as Record<string, unknown>);
  const response = await apiClient.put<InvoiceItem>(`/invoiceItem/update/${id}.json`, formData);
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
 */
export async function recordInvoicePayment(data: Partial<InvoicePayment>): Promise<InvoicePayment> {
  const formData = toFormData(data as Record<string, unknown>);
  const response = await apiClient.post<InvoicePayment>('/invoicePayment/save.json', formData);
  return response.data;
}

/**
 * Delete invoice payment
 * DELETE /rest/invoicePayment/delete/:id.json
 */
export async function deleteInvoicePayment(id: string): Promise<void> {
  await apiClient.delete(`/invoicePayment/delete/${id}.json`);
}
