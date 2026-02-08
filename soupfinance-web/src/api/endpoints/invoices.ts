/**
 * Invoice API endpoints
 * Maps to soupmarkets-web /rest/invoice/* endpoints
 *
 * ARCHITECTURE (2026-02-05 refactored):
 * The backend Invoice domain (soupbroker.finance.Invoice) uses:
 *   - `number` (int)         → invoice number
 *   - `accountServices` (FK) → recipient (not "client")
 *   - `invoiceDate`          → issue date
 *   - `paymentDate`          → due date
 *   - `invoiceItemList`      → line items (returned as FK references in list, full objects in item endpoint)
 *
 * The API layer adds computed fields (subtotal, totalAmount, status) by
 * fetching invoice items separately and computing totals.
 *
 * CSRF Token Pattern:
 * Changed: Only POST/save operations require CSRF token from create.json endpoint.
 * PUT (update) and DELETE operations do NOT require CSRF tokens.
 */
import apiClient, { toQueryString, getCsrfToken, csrfQueryString } from '../client';
import type { Invoice, InvoiceStatus, InvoiceItem, InvoicePayment, ListParams } from '../../types';

const BASE_URL = '/invoice';

// =============================================================================
// Response Transformation
// =============================================================================

/**
 * Parse a serialised InvoiceItem reference to extract quantity and unitPrice.
 * Format: "InvoiceItem(serviceDescription:ServiceDescription(...), quantity:1.0, unitPrice:1000.00, invoice:...)"
 */
function parseItemSerialisedForTotal(serialised: string): { quantity: number; unitPrice: number } {
  const qtyMatch = serialised.match(/quantity:([\d.]+)/);
  const priceMatch = serialised.match(/unitPrice:([\d.]+)/);
  return {
    quantity: qtyMatch ? parseFloat(qtyMatch[1]) : 0,
    unitPrice: priceMatch ? parseFloat(priceMatch[1]) : 0,
  };
}

/**
 * Compute totals from invoice item list.
 * Items on the invoice list response are FK references with serialised strings.
 * Items from /rest/invoiceItem/ have full quantity/unitPrice fields.
 */
function computeInvoiceTotals(items?: Array<{ quantity?: number; unitPrice?: number; serialised?: string }> | null): {
  subtotal: number;
  totalAmount: number;
} {
  if (!items || items.length === 0) {
    return { subtotal: 0, totalAmount: 0 };
  }

  let subtotal = 0;
  for (const item of items) {
    if (typeof item.quantity === 'number' && typeof item.unitPrice === 'number') {
      // Full item object
      subtotal += item.quantity * item.unitPrice;
    } else if (item.serialised) {
      // FK reference — parse from serialised string
      const parsed = parseItemSerialisedForTotal(item.serialised);
      subtotal += parsed.quantity * parsed.unitPrice;
    }
  }

  return { subtotal, totalAmount: subtotal };
}

/**
 * Format ISO datetime to date string for display.
 * "2025-11-17T00:00:00Z" → "2025-11-17"
 */
function formatDateField(isoDatetime?: string): string {
  if (!isoDatetime) return '';
  return isoDatetime.split('T')[0];
}

/**
 * Transform raw backend invoice response to add computed fields.
 * The backend doesn't provide status, subtotal, totalAmount, etc.
 * These are computed from invoiceItemList and invoicePaymentList.
 */
function transformInvoice(raw: Invoice): Invoice {
  const { subtotal, totalAmount } = computeInvoiceTotals(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    raw.invoiceItemList as any[]
  );

  // Compute amount paid from payments
  let amountPaid = 0;
  if (raw.invoicePaymentList && Array.isArray(raw.invoicePaymentList)) {
    for (const payment of raw.invoicePaymentList) {
      if (typeof payment.amount === 'number') {
        amountPaid += payment.amount;
      }
    }
  }

  const amountDue = totalAmount - amountPaid;

  // Derive status from computed values
  // Note: backend may return status as enum object {id, class, serialised}
  let status: InvoiceStatus = (typeof raw.status === 'string' ? raw.status : (raw.status && typeof raw.status === 'object' && 'serialised' in raw.status ? (raw.status as unknown as { serialised: string }).serialised : raw.status)) as InvoiceStatus;
  if (!status) {
    if (amountDue <= 0 && totalAmount > 0) {
      status = 'PAID';
    } else if (amountPaid > 0) {
      status = 'PARTIAL';
    } else {
      status = 'DRAFT';
    }
  }

  // Format date fields for display
  const invoiceDate = formatDateField(raw.invoiceDate) || raw.invoiceDate;
  const paymentDate = formatDateField(raw.paymentDate) || raw.paymentDate;

  return {
    ...raw,
    invoiceDate,
    paymentDate,
    status,
    subtotal,
    taxAmount: raw.taxAmount ?? 0,
    discountAmount: raw.discountAmount ?? 0,
    totalAmount,
    amountPaid,
    amountDue,
  };
}

// =============================================================================
// Invoice CRUD
// =============================================================================

/**
 * List invoices with pagination
 * GET /rest/invoice/index.json
 *
 * Transforms each invoice to add computed fields (totals, status).
 */
export async function listInvoices(params?: ListParams): Promise<Invoice[]> {
  const query = params ? `?${toQueryString(params)}` : '';
  const response = await apiClient.get<Invoice[]>(`${BASE_URL}/index.json${query}`);
  return (response.data || []).map(transformInvoice);
}

/**
 * Get single invoice by ID
 * GET /rest/invoice/show/:id.json
 *
 * Also fetches full invoice items from /rest/invoiceItem/index.json
 * since the invoice show response only contains item references.
 */
export async function getInvoice(id: string): Promise<Invoice> {
  const response = await apiClient.get<Invoice>(`${BASE_URL}/show/${id}.json`);
  const invoice = response.data;

  // Fetch full invoice items separately (invoice response has only FK references)
  try {
    const itemsResponse = await apiClient.get<InvoiceItem[]>(
      `/invoiceItem/index.json?invoice.id=${id}&max=100`
    );
    if (itemsResponse.data && Array.isArray(itemsResponse.data)) {
      invoice.invoiceItemList = itemsResponse.data;
    }
  } catch {
    // If items fetch fails, keep whatever the invoice response had
    console.warn('Failed to fetch invoice items separately');
  }

  return transformInvoice(invoice);
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

  // Step 2: Pass CSRF token as URL query params (Grails withForm reads from request params, not JSON body)
  const response = await apiClient.post<Invoice>(
    `${BASE_URL}/save.json?${csrfQueryString(csrf)}`,
    data
  );
  return transformInvoice(response.data);
}

/**
 * Update existing invoice
 * PUT /rest/invoice/update/:id.json
 *
 * Changed: Updates do not require CSRF tokens
 */
export async function updateInvoice(id: string, data: Partial<Invoice>): Promise<Invoice> {
  const response = await apiClient.put<Invoice>(
    `${BASE_URL}/update/${id}.json`,
    { ...data, id }
  );
  return transformInvoice(response.data);
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
  return transformInvoice(response.data);
}

/**
 * Mark invoice as viewed
 * POST /rest/invoice/markViewed/:id.json
 */
export async function markInvoiceViewed(id: string): Promise<Invoice> {
  const response = await apiClient.post<Invoice>(`${BASE_URL}/markViewed/${id}.json`);
  return transformInvoice(response.data);
}

/**
 * Cancel invoice
 * POST /rest/invoice/cancel/:id.json
 */
export async function cancelInvoice(id: string): Promise<Invoice> {
  const response = await apiClient.post<Invoice>(`${BASE_URL}/cancel/${id}.json`);
  return transformInvoice(response.data);
}

// =============================================================================
// Invoice Items
// =============================================================================

/**
 * List items for a specific invoice
 * GET /rest/invoiceItem/index.json?invoice.id=:id
 */
export async function listInvoiceItems(invoiceId: string, params?: ListParams): Promise<InvoiceItem[]> {
  const query = params ? `&${toQueryString(params)}` : '';
  const response = await apiClient.get<InvoiceItem[]>(
    `/invoiceItem/index.json?invoice.id=${invoiceId}${query}`
  );
  return response.data || [];
}

/**
 * Add item to invoice
 * POST /rest/invoiceItem/save.json
 *
 * CSRF Token Required: Calls create.json first to get SYNCHRONIZER_TOKEN
 */
export async function addInvoiceItem(data: Partial<InvoiceItem>): Promise<InvoiceItem> {
  // Step 1: Get CSRF token from create endpoint
  const csrf = await getCsrfToken('invoiceItem');

  // Step 2: Pass CSRF token as URL query params (Grails withForm reads from request params, not JSON body)
  const response = await apiClient.post<InvoiceItem>(
    `/invoiceItem/save.json?${csrfQueryString(csrf)}`,
    data
  );
  return response.data;
}

/**
 * Update invoice item
 * PUT /rest/invoiceItem/update/:id.json
 *
 * Changed: Updates do not require CSRF tokens
 */
export async function updateInvoiceItem(id: string, data: Partial<InvoiceItem>): Promise<InvoiceItem> {
  const response = await apiClient.put<InvoiceItem>(
    `/invoiceItem/update/${id}.json`,
    { ...data, id }
  );
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
 * Transform raw payment response to ensure fields are correct types.
 * Changed: paymentMethod is now a domain class FK object (not coerced to string)
 */
function transformPayment(raw: InvoicePayment): InvoicePayment {
  return {
    ...raw,
    paymentDate: formatDateField(raw.paymentDate) || raw.paymentDate,
    reference: raw.reference ? safeString(raw.reference) : raw.reference,
    notes: raw.notes ? safeString(raw.notes) : raw.notes,
  };
}

/**
 * List all invoice payments with pagination
 * GET /rest/invoicePayment/index.json
 * Added: Support for listing all payments without invoice filter
 */
export async function listAllInvoicePayments(params?: ListParams): Promise<InvoicePayment[]> {
  const query = params ? `?${toQueryString(params)}` : '';
  const response = await apiClient.get<InvoicePayment[]>(`/invoicePayment/index.json${query}`);
  return (response.data || []).map(transformPayment);
}

/**
 * List payments for a specific invoice
 * GET /rest/invoicePayment/index.json?invoice.id=:id
 */
export async function listInvoicePayments(invoiceId: string): Promise<InvoicePayment[]> {
  const response = await apiClient.get<InvoicePayment[]>(
    `/invoicePayment/index.json?invoice.id=${invoiceId}`
  );
  return (response.data || []).map(transformPayment);
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

  // Step 2: Pass CSRF token as URL query params (Grails withForm reads from request params, not JSON body)
  const response = await apiClient.post<InvoicePayment>(
    `/invoicePayment/save.json?${csrfQueryString(csrf)}`,
    data
  );
  return response.data;
}

/**
 * Delete invoice payment
 * DELETE /rest/invoicePayment/delete/:id.json
 */
export async function deleteInvoicePayment(id: string): Promise<void> {
  await apiClient.delete(`/invoicePayment/delete/${id}.json`);
}
