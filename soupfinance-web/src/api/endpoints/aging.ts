/**
 * Added (SOUPFIN-105): data for the A/R and A/P aging, Open Invoices and
 * Unpaid Bills reports.
 *
 * These reports bucket open documents in the browser (see
 * features/reports/aging/agingEngine.ts for why the backend's
 * /financeReports/agedReceivables and /agedPayables buckets are not used).
 * This module only fetches: every invoice/bill and every payment, page by
 * page, plus what the reconciliation and the click-through links need.
 *
 * Errors are never swallowed here. A failed page fails the whole report, so a
 * 403 or 500 shows as an error instead of a short, wrong total.
 */
import apiClient, { toQueryString } from '../client';
import type { Bill, BillPayment, Invoice, InvoicePayment, ListParams } from '../../types';
import type { AccountSettings } from '../../types/settings';
import { listInvoices, listAllInvoicePayments } from './invoices';
import { listBills, listAllBillPayments } from './bills';
import { accountSettingsApi } from './settings';

/** Grails caps `max` at 100 on most list actions. */
export const AGING_PAGE_SIZE = 100;
/** 50 pages of 100: 5,000 documents. Past that the report says it is incomplete. */
export const AGING_MAX_PAGES = 50;

export interface PagedResult<T> {
  rows: T[];
  /** True when the cap was hit and more rows may exist. */
  truncated: boolean;
}

/**
 * Read a list endpoint page by page until a short page comes back. Stops at
 * AGING_MAX_PAGES and reports `truncated` rather than looping forever.
 */
export async function fetchAllPages<T>(
  fetchPage: (params: ListParams) => Promise<T[]>,
  extraParams: ListParams = {}
): Promise<PagedResult<T>> {
  const rows: T[] = [];
  for (let page = 0; page < AGING_MAX_PAGES; page++) {
    const batch = await fetchPage({ ...extraParams, max: AGING_PAGE_SIZE, offset: page * AGING_PAGE_SIZE });
    if (!Array.isArray(batch)) {
      // A 302 to the login page resolves 200 with HTML: that is not "no rows".
      throw new Error('The server did not return a list. Your session may have expired; sign in again.');
    }
    rows.push(...batch);
    if (batch.length < AGING_PAGE_SIZE) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

export interface ReceivablesSource {
  invoices: Invoice[];
  payments: InvoicePayment[];
  truncated: boolean;
}

export interface PayablesSource {
  bills: Bill[];
  payments: BillPayment[];
  truncated: boolean;
}

/** Every invoice and every invoice payment. */
export async function fetchReceivablesSource(): Promise<ReceivablesSource> {
  const [invoices, payments] = await Promise.all([
    fetchAllPages(listInvoices),
    fetchAllPages(listAllInvoicePayments),
  ]);
  return {
    invoices: invoices.rows,
    payments: payments.rows,
    truncated: invoices.truncated || payments.truncated,
  };
}

/** Every bill and every bill payment. */
export async function fetchPayablesSource(): Promise<PayablesSource> {
  const [bills, payments] = await Promise.all([fetchAllPages(listBills), fetchAllPages(listAllBillPayments)]);
  return {
    bills: bills.rows,
    payments: payments.rows,
    truncated: bills.truncated || payments.truncated,
  };
}

interface ClientPortfolioRef {
  id: string;
  client?: { id?: string } | null;
  accountServices?: { id?: string } | null;
}

async function listClientPortfolios(params: ListParams): Promise<ClientPortfolioRef[]> {
  const response = await apiClient.get<ClientPortfolioRef[]>(`/clientPortfolio/index.json?${toQueryString(params)}`);
  return response.data;
}

/**
 * AccountServices id -> Client id, so an invoice's customer can link to
 * /clients/:id. Invoices carry only the AccountServices FK; ClientPortfolio
 * joins the two.
 */
export async function fetchClientIdsByAccountServices(): Promise<Record<string, string>> {
  const { rows } = await fetchAllPages(listClientPortfolios);
  const map: Record<string, string> = {};
  for (const portfolio of rows) {
    const accountServicesId = portfolio.accountServices?.id;
    const clientId = portfolio.client?.id;
    if (accountServicesId && clientId && !map[accountServicesId]) map[accountServicesId] = clientId;
  }
  return map;
}

/** One ledger account from /financeReports/balanceSheet.json. */
export interface BalanceSheetLedgerAccount {
  id: string;
  name: string;
  ledgerGroup: string;
  startingBalance?: number;
  calculatedBalance?: number;
}

export interface ControlAccountSource {
  account: Pick<AccountSettings, 'defaultReceivableAccount' | 'defaultPayableAccount'>;
  ledgerAccounts: BalanceSheetLedgerAccount[];
}

/**
 * The tenant's default receivable/payable account ids and the Balance Sheet
 * ledger balances on the as-of date.
 */
export async function fetchControlAccountSource(asOf: string): Promise<ControlAccountSource> {
  const [account, balanceSheet] = await Promise.all([
    accountSettingsApi.get(),
    apiClient.get<{ ledgerAccountList?: BalanceSheetLedgerAccount[] }>(
      `/financeReports/balanceSheet.json?to=${encodeURIComponent(asOf)}`
    ),
  ]);
  const ledgerAccounts = balanceSheet.data?.ledgerAccountList;
  if (!Array.isArray(ledgerAccounts)) {
    throw new Error('The Balance Sheet did not return any ledger accounts.');
  }
  return { account, ledgerAccounts };
}
