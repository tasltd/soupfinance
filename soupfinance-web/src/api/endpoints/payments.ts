/**
 * Payments list API — one page of invoice (incoming) or bill (outgoing) payments.
 *
 * Added (SOUPFIN-177). What the backend supports, probed on the LXC backend:
 *  - `max` / `offset` page the list, and every row repeats the filtered total
 *    as `totalCount`, so the page count is known without a second request.
 *  - `from` / `to` (yyyy-MM-dd) filter on `dateCreated` — the day the payment
 *    was RECORDED, not its `paymentDate`.
 *  - `paymentMethod.id` is NOT a criteria in InvoicePayment/BillPayment.searchList
 *    and is ignored. Backend plan: plans/soupfin-177-payment-filters-backend.md.
 *
 * Until the backend honours the method filter, a method-filtered request asks
 * for up to MAX_FILTER_SCAN rows (the controller's cap) and filters and pages
 * them here, so counts and pages stay correct. The parameter is still sent so
 * the server can take over the moment it supports it.
 */
import { listAllInvoicePayments } from './invoices';
import { listAllBillPayments } from './bills';
import type { InvoicePayment, BillPayment, ListParams } from '../../types';

/** Which side of the ledger a payment belongs to. Matches the route segment. */
export type PaymentType = 'invoice' | 'bill';

/** The InvoicePaymentController / BillPaymentController `max` cap. */
export const MAX_FILTER_SCAN = 1000;

export interface PaymentListFilters {
  /** yyyy-MM-dd, inclusive — compared against the payment's record date. */
  from?: string;
  /** yyyy-MM-dd, inclusive (the backend extends it to 23:59:59). */
  to?: string;
  /** PaymentMethod domain id. */
  paymentMethodId?: string;
}

export interface PaymentPageRequest extends PaymentListFilters {
  page: number; // 1-based
  pageSize: number;
}

export interface PaymentPage<T> {
  payments: T[];
  /** Total rows matching the filters, across every page. */
  total: number;
  /**
   * True when a method filter was applied client-side and the backend held more
   * than MAX_FILTER_SCAN rows, so older matches may be missing.
   */
  truncated: boolean;
}

function fetchRaw(type: PaymentType, params: ListParams): Promise<Array<InvoicePayment | BillPayment>> {
  return type === 'invoice' ? listAllInvoicePayments(params) : listAllBillPayments(params);
}

/**
 * Fetch one page of payments with the given filters.
 */
export async function listPaymentsPage(
  type: 'invoice',
  request: PaymentPageRequest
): Promise<PaymentPage<InvoicePayment>>;
export async function listPaymentsPage(
  type: 'bill',
  request: PaymentPageRequest
): Promise<PaymentPage<BillPayment>>;
export async function listPaymentsPage(
  type: PaymentType,
  request: PaymentPageRequest
): Promise<PaymentPage<InvoicePayment | BillPayment>>;
export async function listPaymentsPage(
  type: PaymentType,
  { page, pageSize, from, to, paymentMethodId }: PaymentPageRequest
): Promise<PaymentPage<InvoicePayment | BillPayment>> {
  const safePage = Math.max(1, Math.floor(page) || 1);
  const params: ListParams = { sort: 'paymentDate', order: 'desc' };
  if (from) params.from = from;
  if (to) params.to = to;

  if (paymentMethodId) {
    params['paymentMethod.id'] = paymentMethodId;
    params.max = MAX_FILTER_SCAN;
    params.offset = 0;
    const rows = await fetchRaw(type, params);
    const serverTotal = rows[0]?.totalCount ?? rows.length;
    const matching = rows.filter((p) => p.paymentMethod?.id === paymentMethodId);
    const start = (safePage - 1) * pageSize;
    return {
      payments: matching.slice(start, start + pageSize),
      total: matching.length,
      truncated: serverTotal > rows.length,
    };
  }

  params.max = pageSize;
  params.offset = (safePage - 1) * pageSize;
  const rows = await fetchRaw(type, params);
  // An offset past the end returns [] with no row to read totalCount from;
  // report what is known so the caller can step back a page.
  const total = rows[0]?.totalCount ?? (rows.length > 0 ? params.offset + rows.length : 0);
  return { payments: rows, total, truncated: false };
}
