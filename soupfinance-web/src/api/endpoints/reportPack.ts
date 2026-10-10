/**
 * Added (SOUPFIN-104): the data the core report pack reads.
 *
 * Two kinds of source:
 *
 * - FinanceReportsController actions no page used before: clientIncome,
 *   vendorPurchases, salesTax and accountTransactions (the general ledger).
 * - Paged Grails list endpoints (invoices, bills, their items and payments,
 *   ledger accounts and transactions), read to the end by fetchAllPages so a
 *   report never silently stops at the first 100 rows.
 *
 * Errors propagate (SOUPFIN-30): a failed request must reach React Query as an
 * error, never render as an empty report.
 */
import apiClient, { toQueryString } from '../client';
import type { ListParams } from '../../types';
import type { ReportFilters } from './reports';

/** Rows the list endpoints return per request. Grails caps `max` at 100. */
export const REPORT_PAGE_SIZE = 100;

export interface AllPages<T> {
  items: T[];
  /** True when the source still had rows after `limit` was reached. */
  truncated: boolean;
}

/**
 * Read a paged list endpoint until it runs out, or until `limit` rows.
 * A short page (fewer than `pageSize` rows) is the end of the list.
 */
export async function fetchAllPages<T>(
  fetchPage: (params: ListParams) => Promise<T[]>,
  limit: number,
  pageSize: number = REPORT_PAGE_SIZE
): Promise<AllPages<T>> {
  const items: T[] = [];
  let offset = 0;
  while (items.length < limit) {
    const page = (await fetchPage({ max: pageSize, offset })) ?? [];
    items.push(...page);
    if (page.length < pageSize) {
      return { items: items.slice(0, limit), truncated: items.length > limit };
    }
    offset += pageSize;
  }
  return { items: items.slice(0, limit), truncated: true };
}

/** A Grails FK reference: `{ id, serialised }`, sometimes with `name`. */
export interface ReportRef {
  id?: string;
  name?: string;
  serialised?: string;
}

/** A raw list row from the generic JSON template: fields vary by domain. */
export type RawRecord = Record<string, unknown>;

async function getList(path: string, params: ListParams): Promise<RawRecord[]> {
  const response = await apiClient.get<RawRecord[]>(`${path}?${toQueryString(params)}`);
  return Array.isArray(response.data) ? response.data : [];
}

/** GET /rest/invoiceItem/index.json, one page. Items carry an `invoice` reference. */
export function listInvoiceItemsPage(params: ListParams): Promise<RawRecord[]> {
  return getList('/invoiceItem/index.json', params);
}

/** GET /rest/billItem/index.json, one page. Items carry a `bill` reference. */
export function listBillItemsPage(params: ListParams): Promise<RawRecord[]> {
  return getList('/billItem/index.json', params);
}

/** GET /rest/ledgerTransaction/index.json, one page, raw (enum and FK objects kept). */
export function listLedgerTransactionsPage(params: ListParams): Promise<RawRecord[]> {
  return getList('/ledgerTransaction/index.json', params);
}

// =============================================================================
// FinanceReportsController actions
// =============================================================================

export interface ClientIncomeItem {
  name?: string;
  income?: number;
  paidIncome?: number;
}

/**
 * GET /rest/financeReports/clientIncome.json?from&to
 * FinanceClientReportsService.clientIncome: `{ clientList: [...] }`, one entry
 * per customer account with income or paid income in the period.
 */
export async function getClientIncome(filters: ReportFilters): Promise<ClientIncomeItem[]> {
  const response = await apiClient.get<{ clientList?: ClientIncomeItem[] }>(
    `/financeReports/clientIncome.json?${toQueryString(filters)}`
  );
  return Array.isArray(response.data?.clientList) ? response.data.clientList : [];
}

export interface VendorPurchaseItem {
  id?: string;
  name?: string;
  purchases?: number;
  paidPurchases?: number;
}

/**
 * GET /rest/financeReports/vendorPurchases.json?from&to
 * FinanceVendorReportsService.vendorExpense: `{ vendorList: [...] }`.
 */
export async function getVendorPurchases(filters: ReportFilters): Promise<VendorPurchaseItem[]> {
  const response = await apiClient.get<{ vendorList?: VendorPurchaseItem[] }>(
    `/financeReports/vendorPurchases.json?${toQueryString(filters)}`
  );
  return Array.isArray(response.data?.vendorList) ? response.data.vendorList : [];
}

export interface SalesTaxItem {
  invoiceDate?: string;
  clientName?: string;
  invoiceNumber?: string | number;
  currency?: string;
  salesAmount?: number;
  taxAmount?: number;
  totalAmount?: number;
  taxBreakdown?: { taxName?: string; taxRate?: number; taxAmount?: number }[];
}

export interface SalesTaxReport {
  salesTaxList: SalesTaxItem[];
  totalSalesAmount: number;
  totalTaxAmount: number;
}

/**
 * GET /rest/financeReports/salesTax.json?from&to
 * FinanceOtherReportsService.salesTax: one entry per invoice dated in the
 * period, with its tax broken down by tax entry.
 */
export async function getSalesTax(filters: ReportFilters): Promise<SalesTaxReport> {
  const response = await apiClient.get<Partial<SalesTaxReport>>(
    `/financeReports/salesTax.json?${toQueryString(filters)}`
  );
  const data = response.data ?? {};
  return {
    salesTaxList: Array.isArray(data.salesTaxList) ? data.salesTaxList : [],
    totalSalesAmount: Number(data.totalSalesAmount) || 0,
    totalTaxAmount: Number(data.totalTaxAmount) || 0,
  };
}

export interface GeneralLedgerAccount {
  account?: ReportRef & { number?: string };
  startingBalance?: number;
  endingBalance?: number;
  transactionList?: RawRecord[];
  totalDebit?: number;
  totalCredit?: number;
}

/** Most ledger accounts one General Ledger request asks for. */
export const GENERAL_LEDGER_ACCOUNT_LIMIT = 1000;

/**
 * GET /rest/financeReports/accountTransactions.json?from&to&max
 *
 * FinanceOtherReportsService.accountTransactions: one entry per ledger account
 * with activity or a balance in the period, each with its opening balance and
 * its transactions carrying a running `balance`. The controller defaults `max`
 * to 20 accounts, so the request asks for GENERAL_LEDGER_ACCOUNT_LIMIT.
 */
export async function getGeneralLedger(filters: ReportFilters): Promise<GeneralLedgerAccount[]> {
  const response = await apiClient.get<{ resultList?: GeneralLedgerAccount[] }>(
    `/financeReports/accountTransactions.json?${toQueryString({
      ...filters,
      max: GENERAL_LEDGER_ACCOUNT_LIMIT,
    })}`
  );
  return Array.isArray(response.data?.resultList) ? response.data.resultList : [];
}
