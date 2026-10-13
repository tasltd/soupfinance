/**
 * Payment allocation API (SOUPFIN-178) — one payment across many invoices or bills.
 *
 * Backend: soupbroker.finance.PaymentAllocationGroupController, whose save action
 * runs PaymentAllocationService.createAllocation (SOUP-4099). That creates the
 * group, one InvoicePayment/BillPayment per line (so every document's amountDue
 * and status move), and one voucher for the whole receipt.
 *
 * What the backend does NOT do, probed on the LXC backend 2026-10-13:
 *  - /rest/invoice/index.json ignores `accountServices.id`, and
 *    /rest/bill/index.json ignores `vendor.id`. The open-document lists below
 *    send the filter (so the server can take over when it learns it) and also
 *    filter here.
 *  - There is no outstandingInvoices / previewFIFO endpoint; FIFO runs in
 *    features/payments/allocation.ts.
 */
import apiClient, { getCsrfToken, csrfQueryString } from '../client';
import { listInvoices } from './invoices';
import { listBills } from './bills';
import { getClientPortfolio } from './clients';
import { isOpen } from '../../features/payments/allocation';
import type {
  Bill,
  Client,
  CreatePaymentAllocationRequest,
  Invoice,
  PaymentAllocationGroup,
} from '../../types';

const BASE_URL = '/paymentAllocationGroup';

/** The invoice / bill controllers' `max` cap. */
export const MAX_OPEN_DOCUMENT_SCAN = 1000;

export interface OpenDocuments<T> {
  documents: T[];
  /** True when the backend held more rows than one scan reads, so some may be missing. */
  truncated: boolean;
}

/**
 * Every AccountServices id a client owns (one per portfolio).
 *
 * The client list and show responses carry portfolio entries as bare refs
 * (SOUPFIN-27), so a portfolio without a nested accountServices is resolved
 * through /rest/clientPortfolio/show.
 */
export async function resolveClientAccountServicesIds(client: Client): Promise<string[]> {
  const portfolios = client.portfolioList ?? [];
  const ids = await Promise.all(
    portfolios.map(async (portfolio) => {
      if (portfolio.accountServices?.id) return portfolio.accountServices.id;
      const detail = await getClientPortfolio(portfolio.id);
      return detail.accountServices?.id ?? '';
    })
  );
  return [...new Set(ids.filter(Boolean))];
}

/**
 * Open invoices (balance due, not paid or cancelled) for any of the given
 * AccountServices ids.
 */
export async function listOpenInvoicesForAccountServices(
  accountServicesIds: string[]
): Promise<OpenDocuments<Invoice>> {
  if (accountServicesIds.length === 0) return { documents: [], truncated: false };
  const wanted = new Set(accountServicesIds);
  const rows = await listInvoices({
    max: MAX_OPEN_DOCUMENT_SCAN,
    offset: 0,
    sort: 'paymentDate',
    order: 'asc',
    ...(accountServicesIds.length === 1 && { 'accountServices.id': accountServicesIds[0] }),
  });
  const total = rows[0]?.totalCount ?? rows.length;
  return {
    documents: rows.filter((inv) => wanted.has(inv.accountServices?.id ?? '') && isOpen(inv)),
    truncated: total > rows.length,
  };
}

/** Open bills (balance due, not paid or cancelled) for one vendor. */
export async function listOpenBillsForVendor(vendorId: string): Promise<OpenDocuments<Bill>> {
  if (!vendorId) return { documents: [], truncated: false };
  const rows = await listBills({
    max: MAX_OPEN_DOCUMENT_SCAN,
    offset: 0,
    sort: 'paymentDate',
    order: 'asc',
    'vendor.id': vendorId,
  });
  const total = (rows[0] as Bill & { totalCount?: number })?.totalCount ?? rows.length;
  return {
    documents: rows.filter((bill) => bill.vendor?.id === vendorId && isOpen(bill)),
    truncated: total > rows.length,
  };
}

/**
 * Record one payment against several invoices or bills.
 * POST /rest/paymentAllocationGroup/save.json — JSON body, CSRF as query params.
 */
export async function createPaymentAllocation(
  request: CreatePaymentAllocationRequest
): Promise<PaymentAllocationGroup> {
  const csrf = await getCsrfToken('paymentAllocationGroup');
  const query = csrf.SYNCHRONIZER_TOKEN ? `?${csrfQueryString(csrf)}` : '';
  const response = await apiClient.post<PaymentAllocationGroup>(`${BASE_URL}/save.json${query}`, request);
  return response.data;
}

/** GET /rest/paymentAllocationGroup/show/:id.json */
export async function getPaymentAllocation(id: string): Promise<PaymentAllocationGroup> {
  const response = await apiClient.get<PaymentAllocationGroup>(`${BASE_URL}/show/${id}.json`);
  return response.data;
}
