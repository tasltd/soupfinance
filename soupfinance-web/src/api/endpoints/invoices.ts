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
 * Extract the persisted tax amount from a TaxEntryInvoiceItem join row.
 *
 * The row may arrive as a full object (`taxAmount` present) or, when Grails
 * renders it as an FK reference, only as a serialised string of the form:
 *   TaxEntryInvoiceItem(InvoiceItem(...), NHIL-2.5%, 75.0, 3075.0)
 * where the last two numbers are taxAmount and totalAmount respectively.
 */
function parseJoinRowTaxAmount(row: { taxAmount?: number; serialised?: string }): number {
  if (typeof row?.taxAmount === 'number') {
    return row.taxAmount;
  }
  const match = row?.serialised?.match(/,\s*([\d.]+),\s*[\d.]+\)\s*$/);
  return match ? parseFloat(match[1]) : 0;
}

/**
 * Sum the tax percentages named in an item's serialised string.
 *
 * The list endpoint renders line items as bare FK references — only
 * `{class, id, serialised}` — so the exact per-row tax amounts are not
 * available there. The serialised form does embed each TaxEntry's toString(),
 * which is `"<abbreviation>-<rate>%"`:
 *   InvoiceItem(quantity:2.0, unitPrice:1500, taxEntries:[NHIL-2.5%, GETFL-2.5%], ...)
 *
 * Returns the summed percentage, or 0 when no tax is named.
 *
 * LIMITATION: this treats every tax as simple. For an invoice that combines a
 * compound tax with other taxes the backend charges the compound one on
 * (amount + simple taxes), so this can read a little low — under 1% of the
 * total in the typical Ghana NHIL+GETFund+VAT case. The detail page does not
 * approximate: getInvoice() fetches full line items, which carry the exact
 * stored taxAmount, and those take precedence in computeInvoiceTotals().
 * Showing a near-exact total is still far better than the previous behaviour
 * of omitting tax from list totals altogether.
 */
function parseTaxRatesFromItemSerialised(serialised?: string): number {
  const group = serialised?.match(/taxEntries:\[([^\]]*)\]/);
  if (!group || !group[1].trim()) return 0;

  let totalRate = 0;
  for (const match of group[1].matchAll(/-([\d.]+)%/g)) {
    totalRate += parseFloat(match[1]) || 0;
  }
  return totalRate;
}

/**
 * Compute totals from invoice item list.
 * Items on the invoice list response are FK references with serialised strings.
 * Items from /rest/invoiceItem/ have full quantity/unitPrice fields.
 *
 * Fix (SOUPFIN-37): the total now includes tax. It previously returned
 * `totalAmount: subtotal`, so every list row, detail page, dashboard KPI and
 * aging bucket understated a taxed invoice by exactly its tax — which is the
 * revenue understatement the ticket reports. This mirrors the backend:
 *   Invoice.getTotal()        = subTotal + totalTaxAmount
 *   Invoice.getTotalTaxAmount = sum(item.taxAmount)
 *   InvoiceItem.getTaxAmount  = sum(taxEntryInvoiceItemList.taxAmount)
 * Withholding-tax rows are excluded, matching InvoiceItem.getTaxAmount().
 */
function computeInvoiceTotals(
  items?: Array<{
    quantity?: number;
    unitPrice?: number;
    serialised?: string;
    taxEntryInvoiceItemList?: Array<{
      taxAmount?: number;
      serialised?: string;
      taxEntry?: { isWithholdingTax?: boolean | null };
    }> | null;
  }> | null
): {
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
} {
  if (!items || items.length === 0) {
    return { subtotal: 0, taxAmount: 0, totalAmount: 0 };
  }

  let subtotal = 0;
  let taxAmount = 0;

  for (const item of items) {
    let lineAmount = 0;
    if (typeof item.quantity === 'number' && typeof item.unitPrice === 'number') {
      // Full item object
      lineAmount = item.quantity * item.unitPrice;
    } else if (item.serialised) {
      // FK reference — parse from serialised string
      const parsed = parseItemSerialisedForTotal(item.serialised);
      lineAmount = parsed.quantity * parsed.unitPrice;
    }
    subtotal += lineAmount;

    const joinRows = item.taxEntryInvoiceItemList || [];
    if (joinRows.length > 0) {
      // Preferred: the exact amounts the backend computed and stored.
      for (const row of joinRows) {
        if (row?.taxEntry?.isWithholdingTax) continue;
        taxAmount += parseJoinRowTaxAmount(row);
      }
    } else {
      // Fallback for list responses, where items are FK references only.
      const rate = parseTaxRatesFromItemSerialised(item.serialised);
      if (rate > 0) {
        taxAmount += (lineAmount * rate) / 100;
      }
    }
  }

  // Money: keep two decimals so repeated float addition cannot surface as
  // 3449.9999999999995 in the UI.
  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  const roundedSubtotal = round2(subtotal);
  const roundedTax = round2(taxAmount);

  return {
    subtotal: roundedSubtotal,
    taxAmount: roundedTax,
    totalAmount: round2(roundedSubtotal + roundedTax),
  };
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
  const { subtotal, taxAmount, totalAmount } = computeInvoiceTotals(
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
    // Fix (SOUPFIN-37): report the tax computed from the item's TaxEntry join
    // rows. `raw.taxAmount` does not exist on the backend Invoice domain, so
    // this always fell back to 0 and the UI showed "Tax 0.00" on taxed invoices.
    taxAmount,
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
 * A line item to persist against an invoice.
 * `taxEntryIds` are real backend `TaxEntry` UUIDs (see listTaxRates).
 */
export interface InvoiceItemInput {
  description: string;
  quantity: number;
  unitPrice: number;
  /** Real TaxEntry UUIDs. Empty/omitted means an untaxed line. */
  taxEntryIds?: string[];
}

/**
 * Create a single invoice line item, including its tax.
 * POST /rest/invoiceItem/save.json
 *
 * Fix (SOUPFIN-37): line items must be created through THIS endpoint, not via
 * `invoiceItemList[N].*` params on /rest/invoice/save.json.
 *
 * Why: InvoiceService.applyItemFields() copies only description, quantity,
 * unitPrice and serviceDescription off those indexed params — every other
 * field, tax included, is silently dropped, so the invoice persisted with
 * zero tax while the form displayed a taxed total.
 *
 * InvoiceItemController.save() instead binds `taxEntries` (a comma-separated
 * list of TaxEntry ids), creates the TaxEntryInvoiceItem + InvoiceTaxEntry
 * rows, then refreshes and computes `taxAmount = amount * taxRate/100`.
 * Verified against the backend: a 3,000 line with NHIL 2.5% + GETFund 2.5%
 * stores taxAmount 75.00 on each join row.
 *
 * NOTE: the equivalent update action does NOT refresh before computing, so
 * tax added to an EXISTING item lands at 0. That is a backend defect; until
 * it is fixed, changed tax is applied by recreating the line item.
 */
export async function createInvoiceItem(
  invoiceId: string,
  item: InvoiceItemInput
): Promise<InvoiceItem> {
  const csrf = await getCsrfToken('invoiceItem');

  const payload: Record<string, unknown> = {
    invoice: { id: invoiceId },
    description: item.description,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
  };

  // Grails @BindUsing on InvoiceItem.taxEntries tokenises a comma-separated
  // string of ids. Omit the key entirely for an untaxed line — sending an
  // empty string would bind an empty Set and trip the controller's iteration.
  const taxEntryIds = (item.taxEntryIds || []).filter(Boolean);
  if (taxEntryIds.length > 0) {
    payload.taxEntries = taxEntryIds.join(',');
  }

  const response = await apiClient.post<InvoiceItem>(
    `/invoiceItem/save.json?${csrfQueryString(csrf)}`,
    payload
  );
  return response.data;
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
