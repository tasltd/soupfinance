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
import {
  parseJoinRowTaxAmount,
  resolveTaxEntryIdFromRows,
  resolveTaxRateFromRows,
  type TaxEntryJoinRow,
} from './taxEntryJoins';

const BASE_URL = '/bill';

/**
 * Resolve which TaxEntry a saved bill line carries, so the edit form can
 * re-select it.
 *
 * Fix (SOUPFIN-38): `BillItem` has no `taxRate` column — tax is carried by
 * `taxEntryBillItemList`, which Grails routinely renders as a bare FK
 * reference. Note the bill join serialises with ONE trailing number where the
 * invoice join has two (`TaxEntryBillItem(BillItem(...), CST-5.0%, 0.0)`),
 * which `resolveTaxEntryIdFromRows` handles.
 */
export function resolveBillItemTaxEntryId(
  item: { taxEntryBillItemList?: TaxEntryJoinRow[] | null },
  catalogue?: Array<{ id: string; serialised?: string }>
): string {
  return resolveTaxEntryIdFromRows(item?.taxEntryBillItemList, catalogue);
}

/**
 * Resolve the tax RATE a saved bill line carries, for read-only display.
 *
 * Fix (SOUPFIN-44): the detail page used to look the rate up by
 * `resolveBillItemTaxEntryId`, which returns `''` for an unresolvable line —
 * the same id NO_TAX_OPTION carries — so the Tax Rate column claimed `0%` for a
 * taxed line. `resolveTaxRateFromRows` returns `null` for that case instead, so
 * the caller can render the dash it always intended.
 */
export function resolveBillItemTaxRate(
  item: { taxEntryBillItemList?: TaxEntryJoinRow[] | null },
  catalogue?: Array<{ id: string; rate?: number; serialised?: string }>
): number | null {
  return resolveTaxRateFromRows(item?.taxEntryBillItemList, catalogue);
}

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
 * Fix (SOUPFIN-30 #1): Resolve a vendor's display name from its Grails FK
 * reference. The backend does NOT send `vendor.name` on the bill list/detail
 * response — only `vendor.serialised`, which uses Vendor.getSimpleID():
 * "SYMBOL (Name)[VendorType]" (e.g. "(Ayawaso West Municipal Assembly)" when
 * the symbol is blank). We extract the text inside the first parentheses; if
 * there are no parentheses we fall back to the trimmed serialised string.
 */
export function extractVendorName(vendor?: { name?: string; serialised?: string } | null): string {
  if (!vendor) return '';
  if (vendor.name) return vendor.name;
  const serialised = vendor.serialised?.trim();
  if (!serialised) return '';
  const match = serialised.match(/\(([^)]*)\)/);
  return (match ? match[1] : serialised).trim();
}

/** Money rounded to 2dp, so repeated float addition cannot surface as 1724.9999999999998. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * First argument that is a real, finite number — `undefined` when none is.
 *
 * `?? 0` is NOT good enough here: it cannot tell "the backend sent 0" from "the
 * backend did not send this field", and that distinction is the whole bug.
 */
function firstNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return undefined;
}

/**
 * Sum the line items, mirroring the backend getters:
 *   Bill.getSubTotal()       = sum(billItem.amount)
 *   Bill.getTotalTaxAmount() = sum(billItem.taxAmount)
 *   BillItem.getTaxAmount()  = sum(taxEntryBillItemList.taxAmount)
 *
 * Only used as a fall-back — see `transformBill`.
 */
function computeBillTotalsFromItems(
  items?: Array<{
    quantity?: number;
    unitPrice?: number;
    amount?: number;
    taxEntryBillItemList?: Array<{ taxAmount?: number; serialised?: string }> | null;
  }> | null
): { subtotal: number; taxAmount: number } {
  if (!items || items.length === 0) return { subtotal: 0, taxAmount: 0 };

  let subtotal = 0;
  let taxAmount = 0;

  for (const item of items) {
    subtotal +=
      firstNumber(item?.amount) ??
      (firstNumber(item?.quantity) ?? 0) * (firstNumber(item?.unitPrice) ?? 0);

    for (const row of item?.taxEntryBillItemList || []) {
      taxAmount += parseJoinRowTaxAmount(row);
    }
  }

  return { subtotal: round2(subtotal), taxAmount: round2(taxAmount) };
}

/**
 * Fix (SOUPFIN-30 #1, #2): Normalise a raw bill from the backend so the list,
 * detail, and edit views render correctly:
 *   - vendor.name is resolved from vendor.serialised (backend omits `name`)
 *   - billDate / paymentDate are stripped of their ISO time component
 *     (e.g. "2023-07-10T00:00:00Z" → "2023-07-10")
 *
 * Fix (SOUPFIN-43): map the header amount fields, which the backend spells
 * DIFFERENTLY from this codebase. `grails-app/views/bill/_bill.gson` emits
 *
 *   subTotal · total · totalTaxAmount · paidAmount · amountDue
 *
 * while `Bill` here declares `subtotal · totalAmount · taxAmount · amountPaid ·
 * amountDue`. Only `amountDue` collided, so every other amount arrived as
 * `undefined` and `formatCurrency(undefined)` rendered it as 0.00 — the
 * reported "Amount Summary is all zeros while Balance Due is right". The same
 * template serves index.json, so the Bills list Total column and the bill PDF
 * were understated identically.
 *
 * The header is authoritative when present. The fall-back exists because
 * `_bill.gson` catches LazyInitializationException and degrades EVERY amount to
 * 0 (its own comment says so); `getBill()` fetches the line items separately,
 * so when the header reads 0 against non-zero items the items are the truth.
 */
function transformBill(raw: Bill): Bill {
  const header = {
    // Backend spelling first, then this codebase's spelling — so an
    // already-normalised bill (mock, cache, re-transform) survives the round trip.
    subtotal: firstNumber(raw.subTotal, raw.subtotal),
    taxAmount: firstNumber(raw.totalTaxAmount, raw.taxAmount),
    totalAmount: firstNumber(raw.total, raw.totalAmount),
    amountPaid: firstNumber(raw.paidAmount, raw.amountPaid),
    amountDue: firstNumber(raw.amountDue),
  };
  const computed = computeBillTotalsFromItems(raw.billItemList);

  // The header is degraded only when it claims ZERO against non-zero line items —
  // the LazyInitializationException signature. A header that merely omits some
  // fields is NOT degraded: each missing field falls back on its own, so a
  // response carrying `total` and `amountDue` but no `subTotal` keeps both.
  const headerDegraded = computed.subtotal > 0 && (header.subtotal ?? 0) === 0;

  const subtotal = headerDegraded ? computed.subtotal : header.subtotal ?? computed.subtotal;
  const taxAmount = headerDegraded ? computed.taxAmount : header.taxAmount ?? computed.taxAmount;
  const totalAmount = headerDegraded
    ? round2(subtotal + taxAmount)
    : header.totalAmount ?? round2(subtotal + taxAmount);
  const amountPaid = header.amountPaid ?? 0;
  const amountDue = headerDegraded
    ? round2(totalAmount - amountPaid)
    : header.amountDue ?? round2(totalAmount - amountPaid);

  return {
    ...raw,
    vendor: raw.vendor
      ? { ...raw.vendor, name: extractVendorName(raw.vendor) }
      : raw.vendor,
    billDate: formatDateField(raw.billDate) || raw.billDate,
    paymentDate: formatDateField(raw.paymentDate) || raw.paymentDate,
    subtotal,
    taxAmount,
    totalAmount,
    amountPaid,
    amountDue,
  };
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
 * Transform raw payment response to ensure fields are correct types.
 * Changed: paymentMethod is now a domain class FK object (not coerced to string)
 */
function transformPayment(raw: BillPayment): BillPayment {
  return {
    ...raw,
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
  // Fix (SOUPFIN-30 #1, #2): resolve vendor name + format dates for display.
  return (response.data || []).map(transformBill);
}

/**
 * Get single bill by ID
 * GET /rest/bill/show/:id.json
 *
 * Fix (SOUPFIN-30 #3): The bill show response returns `billItemList: null`
 * (line items are only FK references there), so — mirroring getInvoice() — we
 * fetch the full line items separately from /rest/billItem/index.json. Without
 * this, the edit form's line-item rows populated blank/zero.
 */
export async function getBill(id: string): Promise<Bill> {
  const response = await apiClient.get<Bill>(`${BASE_URL}/show/${id}.json`);
  const bill = response.data;

  // Fetch full bill items separately (bill response has only FK references / null)
  try {
    const itemsResponse = await apiClient.get<BillItem[]>(
      `/billItem/index.json?bill.id=${id}&max=100`
    );
    if (itemsResponse.data && Array.isArray(itemsResponse.data)) {
      // Normalise each item — backend omits taxRate/amount on the list response.
      bill.billItemList = itemsResponse.data.map((item) => ({
        ...item,
        quantity: Number(item.quantity) || 0,
        unitPrice: Number(item.unitPrice) || 0,
        taxRate: Number(item.taxRate) || 0,
        amount: item.amount != null ? Number(item.amount) : (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0),
      }));
    }
  } catch {
    // If items fetch fails, keep whatever the bill response had
    console.warn('Failed to fetch bill items separately');
  }

  return transformBill(bill);
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
