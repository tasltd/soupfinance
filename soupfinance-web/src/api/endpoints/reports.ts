/**
 * Finance Reports API endpoints for SoupFinance
 * Maps to soupmarkets-web /rest/financeReports/* endpoints
 *
 * Provides access to:
 * - Trial Balance (debits/credits by account)
 * - Balance Sheet (assets, liabilities, equity)
 * - Income Statement / P&L (revenue, expenses, net income)
 * - Aging Reports (A/R and A/P by age buckets)
 * - Cash Flow Statement (operating, investing, financing)
 * - Export to PDF/Excel/CSV
 *
 * Added: Direct backend endpoint mappings for all report types
 */
import apiClient, { toQueryString } from '../client';
import {
  cashFlowStatementResponseSchema,
  type CashFlowActivityResponse,
  type CashFlowStatementResponse,
} from '../../schemas/reports';
import type {
  BalanceSheet,
  ProfitLoss,
  AgingReport,
  AgingItem,
  TrialBalance,
  TrialBalanceItem,
  CashFlowStatement,
  CashFlowActivity,
  BackendAgingItem,
} from '../../types';

// =============================================================================
// Types
// =============================================================================

/**
 * Report filter parameters
 */
export interface ReportFilters {
  /** Start date (ISO format: YYYY-MM-DD) */
  from: string;
  /** End date (ISO format: YYYY-MM-DD) */
  to: string;
  /** Optional ledger account ID to filter by */
  ledgerAccount?: string;
  /** If true, includes child accounts in parent account totals */
  isParentChecked?: boolean;
  /** Index signature for toQueryString compatibility */
  [key: string]: unknown;
}

/**
 * Export format options
 *
 * These are the values the UI uses. They are NOT what goes on the wire — see
 * toBackendExportFormat() below.
 */
export type ExportFormat = 'pdf' | 'xlsx' | 'csv';

/**
 * Fix (SOUPFIN-60): translate the UI's export format to the value the backend
 * actually understands.
 *
 * FinanceReportsController hands `params.f` straight to the Grails export
 * plugin (org.grails.plugins:export:2.0.0), which registers exactly six
 * exporters: excel, csv, xml, pdf, ods and rtf. There is no "xlsx". Sending
 * `f=xlsx` threw
 *
 *   grails.plugins.export.exporter.ExporterNotFoundException:
 *     No exporter found for type: xlsx
 *
 * so every Excel download on Trial Balance, Balance Sheet, Profit & Loss and
 * the two aging reports came back as an HTTP 500, not a spreadsheet.
 */
export function toBackendExportFormat(format: ExportFormat): string {
  return format === 'xlsx' ? 'excel' : format;
}

/**
 * Fix (SOUPFIN-60): file extension for a downloaded report.
 *
 * The backend's "excel" exporter is POI HSSF — the bytes start d0cf11e0 (OLE2
 * compound file), which is a legacy .xls, not a .xlsx ZIP. Naming the download
 * .xlsx makes Excel open it with a "format and extension don't match" warning,
 * so the extension follows the bytes.
 *
 * Previously duplicated verbatim in four report pages; kept here next to
 * ExportFormat so the mapping can never drift between them.
 */
export function getReportExtension(format: ExportFormat | null | undefined): string {
  if (format === 'xlsx') return 'xls';
  if (format === 'csv') return 'csv';
  return 'pdf';
}

/**
 * Account balance response from /financeReports/accountBalances
 */
export interface AccountBalanceEntry {
  id: string;
  name: string;
  number?: string;
  ledgerGroup: string;
  ledgerSubGroup?: string;
  balance: number;
  debitTotal: number;
  creditTotal: number;
  parentAccountId?: string;
  children?: AccountBalanceEntry[];
}

/**
 * Account transaction response from /financeReports/accountTransactions
 */
export interface AccountTransactionEntry {
  id: string;
  transactionDate: string;
  description: string;
  debitAmount: number;
  creditAmount: number;
  balance: number;
  ledgerAccountId: string;
  ledgerAccountName: string;
  reference?: string;
}

// =============================================================================
// API Functions
// =============================================================================

/**
 * Get account balances for Balance Sheet report
 * GET /rest/financeReports/accountBalances.json
 *
 * Returns hierarchical account balances grouped by ledger group
 * (ASSET, LIABILITY, EQUITY with sub-groups)
 *
 * @param filters - Date range and optional account filter
 * @returns Account balance entries
 *
 * @example
 * ```ts
 * const balances = await getAccountBalances({
 *   from: '2026-01-01',
 *   to: '2026-12-31',
 * });
 * ```
 */
export async function getAccountBalances(
  filters: ReportFilters
): Promise<AccountBalanceEntry[]> {
  const query = toQueryString(filters);
  const response = await apiClient.get<AccountBalanceEntry[]>(
    `/financeReports/accountBalances.json?${query}`
  );
  return response.data;
}

/**
 * Get account transactions for P&L and transaction reports
 * GET /rest/financeReports/accountTransactions.json
 *
 * Returns detailed transaction list for the specified period
 *
 * @param filters - Date range and optional account filter
 * @returns Transaction entries
 */
export async function getAccountTransactions(
  filters: ReportFilters
): Promise<AccountTransactionEntry[]> {
  const query = toQueryString(filters);
  const response = await apiClient.get<unknown>(
    `/financeReports/accountTransactions.json?${query}`
  );
  // Fix(SOUPFIN-11): Backend may return either an array or a wrapper object.
  // Coerce both shapes into AccountTransactionEntry[] so callers can safely
  // iterate without crashing with "t is not iterable" in production builds.
  return normalizeTransactions(response.data);
}

/**
 * Normalize backend account-transactions responses into an iterable array.
 *
 * Accepts: direct arrays, wrapped objects like { resultList } / { ledgerTransactionList }
 * / { accountTransactionList } / { transactions }, or null/undefined.
 *
 * Fix(SOUPFIN-11): Cash Flow page was crashing with "t is not iterable" in
 * production whenever the backend returned a wrapper object instead of a bare
 * array. Centralising the normalisation here makes every consumer safe.
 */
export function normalizeTransactions(value: unknown): AccountTransactionEntry[] {
  if (Array.isArray(value)) {
    return value as AccountTransactionEntry[];
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const candidateKeys = [
      'resultList',
      'ledgerTransactionList',
      'accountTransactionList',
      'transactions',
      'transactionList',
      'data',
    ];
    for (const key of candidateKeys) {
      const candidate = obj[key];
      if (Array.isArray(candidate)) {
        return candidate as AccountTransactionEntry[];
      }
    }
  }
  return [];
}

/**
 * Export report to PDF, Excel, or CSV
 * GET /rest/financeReports/{reportType}.json?f={format}
 *
 * Returns blob data for the exported file
 *
 * @param reportType - Type of report to export
 * @param filters - Date range and optional account filter
 * @param format - Export format (pdf, xlsx, csv)
 * @returns Blob data for download
 *
 * @example
 * ```ts
 * const blob = await exportReport('accountBalances', filters, 'pdf');
 * const url = URL.createObjectURL(blob);
 * window.open(url);
 * ```
 */
export async function exportReport(
  reportType: 'accountBalances' | 'accountTransactions',
  filters: ReportFilters,
  format: ExportFormat
): Promise<Blob> {
  const query = toQueryString({ ...filters, f: toBackendExportFormat(format) });
  const response = await apiClient.get(
    `/financeReports/${reportType}.json?${query}`,
    { responseType: 'blob' }
  );
  return response.data;
}

// =============================================================================
// Report Builders
// =============================================================================

/**
 * Build Balance Sheet from account balances
 * Transforms flat account list into structured Balance Sheet
 *
 * @param entries - Account balance entries from API
 * @param asOf - Report date
 * @returns Structured Balance Sheet
 */
export function buildBalanceSheet(
  entries: AccountBalanceEntry[],
  asOf: string
): BalanceSheet {
  // Added: Group accounts by ledger group
  const assets = entries.filter(e => e.ledgerGroup === 'ASSET');
  const liabilities = entries.filter(e => e.ledgerGroup === 'LIABILITY');
  const equity = entries.filter(e =>
    e.ledgerGroup === 'EQUITY' &&
    !['INCOME', 'EXPENSE'].includes(e.ledgerSubGroup || '')
  );

  const sumBalance = (items: AccountBalanceEntry[]) =>
    items.reduce((sum, item) => sum + item.balance, 0);

  return {
    asOf,
    assets: assets.map(toBalanceSheetItem),
    liabilities: liabilities.map(toBalanceSheetItem),
    equity: equity.map(toBalanceSheetItem),
    totalAssets: sumBalance(assets),
    totalLiabilities: sumBalance(liabilities),
    totalEquity: sumBalance(equity),
  };
}

/**
 * Build Profit & Loss from account transactions
 * Filters to INCOME and EXPENSE accounts only
 *
 * @param entries - Account balance entries from API
 * @param periodStart - Report period start date
 * @param periodEnd - Report period end date
 * @returns Structured Profit & Loss
 */
export function buildProfitLoss(
  entries: AccountBalanceEntry[],
  periodStart: string,
  periodEnd: string
): ProfitLoss {
  // Added: Filter to income and expense accounts
  const income = entries.filter(e => e.ledgerSubGroup === 'INCOME');
  const expenses = entries.filter(e => e.ledgerSubGroup === 'EXPENSE');

  const sumBalance = (items: AccountBalanceEntry[]) =>
    items.reduce((sum, item) => sum + Math.abs(item.balance), 0);

  const totalIncome = sumBalance(income);
  const totalExpenses = sumBalance(expenses);

  return {
    periodStart,
    periodEnd,
    income: income.map(toProfitLossItem),
    expenses: expenses.map(toProfitLossItem),
    totalIncome,
    totalExpenses,
    netProfit: totalIncome - totalExpenses,
  };
}

// =============================================================================
// Helpers
// =============================================================================

function toBalanceSheetItem(entry: AccountBalanceEntry): { account: string; balance: number; children?: { account: string; balance: number }[] } {
  return {
    account: entry.name,
    balance: entry.balance,
    children: entry.children?.map(toBalanceSheetItem),
  };
}

function toProfitLossItem(entry: AccountBalanceEntry): { account: string; amount: number; children?: { account: string; amount: number }[] } {
  return {
    account: entry.name,
    amount: Math.abs(entry.balance),
    children: entry.children?.map(toProfitLossItem),
  };
}

// =============================================================================
// Added: Trial Balance Report
// =============================================================================

/**
 * Backend trial balance response structure
 */
interface BackendTrialBalanceResponse {
  resultList: {
    ASSET?: { accountList: BackendTrialBalanceAccount[] };
    LIABILITY?: { accountList: BackendTrialBalanceAccount[] };
    EQUITY?: { accountList: BackendTrialBalanceAccount[] };
    REVENUE?: { accountList: BackendTrialBalanceAccount[] };
    EXPENSE?: { accountList: BackendTrialBalanceAccount[] };
  };
  totalDebit: number;
  totalCredit: number;
}

interface BackendTrialBalanceAccount {
  id: string;
  name: string;
  currency: string;
  endingDebit: number;
  endingCredit: number;
}

/**
 * Get Trial Balance report
 * GET /rest/financeReports/trialBalance.json
 *
 * Shows all accounts with their debit/credit ending balances.
 * Total debits should equal total credits when books are balanced.
 *
 * @param filters - Date range filters (from, to)
 * @returns Trial Balance report
 */
/**
 * Type for trial balance ledger groups used in reports
 */
type TrialBalanceLedgerGroup = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';

export async function getTrialBalance(filters: ReportFilters): Promise<TrialBalance> {
  const query = toQueryString(filters);
  const response = await apiClient.get<BackendTrialBalanceResponse>(
    `/financeReports/trialBalance.json?${query}`
  );

  const data = response.data;
  const ledgerGroups: TrialBalanceLedgerGroup[] = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];

  // Added: Transform backend response to frontend TrialBalance type
  const accounts: TrialBalance['accounts'] = {
    ASSET: [],
    LIABILITY: [],
    EQUITY: [],
    REVENUE: [],
    EXPENSE: [],
  };

  for (const group of ledgerGroups) {
    const groupData = data.resultList[group];
    if (groupData?.accountList) {
      accounts[group] = groupData.accountList.map((acc): TrialBalanceItem => ({
        id: acc.id,
        name: acc.name,
        currency: acc.currency,
        ledgerGroup: group,
        endingDebit: acc.endingDebit || 0,
        endingCredit: acc.endingCredit || 0,
      }));
    }
  }

  return {
    asOf: filters.to,
    accounts,
    totalDebit: data.totalDebit || 0,
    totalCredit: data.totalCredit || 0,
  };
}

// =============================================================================
// Added: Income Statement (P&L) Direct Endpoint
// =============================================================================

/**
 * Backend income statement response structure
 */
interface BackendIncomeStatementResponse {
  ledgerAccountList: BackendIncomeStatementAccount[];
}

interface BackendIncomeStatementAccount {
  id: string;
  name: string;
  currency: string;
  calculatedBalance: number;
  ledgerGroup: 'REVENUE' | 'EXPENSE';
}

/**
 * Get Income Statement (Profit & Loss) report directly from backend
 * GET /rest/financeReports/incomeStatement.json
 *
 * Shows revenue and expenses for a period, calculating net income.
 *
 * @param filters - Date range filters (from, to)
 * @returns Profit & Loss report
 */
export async function getIncomeStatement(filters: ReportFilters): Promise<ProfitLoss> {
  const query = toQueryString(filters);
  const response = await apiClient.get<BackendIncomeStatementResponse>(
    `/financeReports/incomeStatement.json?${query}`
  );

  const data = response.data;

  // Added: Separate revenue and expense accounts
  const revenueAccounts = data.ledgerAccountList.filter(a => a.ledgerGroup === 'REVENUE');
  const expenseAccounts = data.ledgerAccountList.filter(a => a.ledgerGroup === 'EXPENSE');

  const totalIncome = revenueAccounts.reduce((sum, a) => sum + Math.abs(a.calculatedBalance), 0);
  const totalExpenses = expenseAccounts.reduce((sum, a) => sum + Math.abs(a.calculatedBalance), 0);

  return {
    periodStart: filters.from,
    periodEnd: filters.to,
    income: revenueAccounts.map(a => ({ account: a.name, amount: Math.abs(a.calculatedBalance) })),
    expenses: expenseAccounts.map(a => ({ account: a.name, amount: Math.abs(a.calculatedBalance) })),
    totalIncome,
    totalExpenses,
    netProfit: totalIncome - totalExpenses,
  };
}

// =============================================================================
// Added: Balance Sheet Direct Endpoint
// =============================================================================

/**
 * Backend balance sheet response structure
 */
interface BackendBalanceSheetResponse {
  ledgerAccountList: BackendBalanceSheetAccount[];
}

interface BackendBalanceSheetAccount {
  id: string;
  name: string;
  currency: string;
  startingBalance: number;
  calculatedBalance: number;
  ledgerGroup: 'ASSET' | 'LIABILITY' | 'EQUITY';
}

/**
 * Get Balance Sheet report directly from backend
 * GET /rest/financeReports/balanceSheet.json
 *
 * Shows assets, liabilities, and equity as of a specific date.
 *
 * @param asOf - As-of date (YYYY-MM-DD)
 * @returns Balance Sheet report
 */
export async function getBalanceSheetDirect(asOf: string): Promise<BalanceSheet> {
  const response = await apiClient.get<BackendBalanceSheetResponse>(
    `/financeReports/balanceSheet.json?to=${asOf}`
  );

  const data = response.data;

  // Added: Group by ledger group
  const assetAccounts = data.ledgerAccountList.filter(a => a.ledgerGroup === 'ASSET');
  const liabilityAccounts = data.ledgerAccountList.filter(a => a.ledgerGroup === 'LIABILITY');
  const equityAccounts = data.ledgerAccountList.filter(a => a.ledgerGroup === 'EQUITY');

  const totalAssets = assetAccounts.reduce((sum, a) => sum + (a.calculatedBalance || a.startingBalance), 0);
  const totalLiabilities = liabilityAccounts.reduce((sum, a) => sum + Math.abs(a.calculatedBalance || a.startingBalance), 0);
  const totalEquity = equityAccounts.reduce((sum, a) => sum + (a.calculatedBalance || a.startingBalance), 0);

  return {
    asOf,
    assets: assetAccounts.map(a => ({ account: a.name, balance: a.calculatedBalance || a.startingBalance })),
    liabilities: liabilityAccounts.map(a => ({ account: a.name, balance: Math.abs(a.calculatedBalance || a.startingBalance) })),
    equity: equityAccounts.map(a => ({ account: a.name, balance: a.calculatedBalance || a.startingBalance })),
    totalAssets,
    totalLiabilities,
    totalEquity,
  };
}

// =============================================================================
// Added: Aging Reports (Correct Backend Endpoints)
// =============================================================================

/**
 * Backend aged receivables response structure
 */
interface BackendAgedReceivablesResponse {
  agedReceivablesList: BackendAgingItem[];
}

/**
 * Backend aged payables response structure
 */
interface BackendAgedPayablesResponse {
  agedPayablesList: BackendAgingItem[];
}

/**
 * Transform backend aging item to frontend AgingItem format
 */
function transformAgingItem(item: BackendAgingItem): AgingItem {
  return {
    entity: { id: item.name, name: item.name }, // Backend doesn't return ID, use name
    current: item.notYetOverdue || 0,
    days30: item.thirtyOrLess || 0,
    days60: item.thirtyOneToSixty || 0,
    days90: item.sixtyOneToNinety || 0,
    over90: item.ninetyOneOrMore || 0,
    total: item.totalUnpaid || 0,
  };
}

/**
 * Get Accounts Receivable aging report
 * GET /rest/financeReports/agedReceivables.json
 *
 * Changed: Uses correct Soupmarkets backend endpoint instead of /invoice/aging
 *
 * @param asOf - Report date (YYYY-MM-DD)
 * @returns AR Aging Report with age buckets
 */
export async function getARAgingReport(asOf: string): Promise<AgingReport> {
  const response = await apiClient.get<BackendAgedReceivablesResponse>(
    `/financeReports/agedReceivables.json?to=${asOf}`
  );

  const items = (response.data.agedReceivablesList || []).map(transformAgingItem);

  // Added: Calculate totals from items
  const totals = items.reduce(
    (acc, item) => ({
      current: acc.current + item.current,
      days30: acc.days30 + item.days30,
      days60: acc.days60 + item.days60,
      days90: acc.days90 + item.days90,
      over90: acc.over90 + item.over90,
      total: acc.total + item.total,
    }),
    { current: 0, days30: 0, days60: 0, days90: 0, over90: 0, total: 0 }
  );

  return { asOf, items, totals };
}

/**
 * Get Accounts Payable aging report
 * GET /rest/financeReports/agedPayables.json
 *
 * Changed: Uses correct Soupmarkets backend endpoint instead of /bill/aging
 *
 * @param asOf - Report date (YYYY-MM-DD)
 * @returns AP Aging Report with age buckets
 */
export async function getAPAgingReport(asOf: string): Promise<AgingReport> {
  const response = await apiClient.get<BackendAgedPayablesResponse>(
    `/financeReports/agedPayables.json?to=${asOf}`
  );

  const items = (response.data.agedPayablesList || []).map(transformAgingItem);

  // Added: Calculate totals from items
  const totals = items.reduce(
    (acc, item) => ({
      current: acc.current + item.current,
      days30: acc.days30 + item.days30,
      days60: acc.days60 + item.days60,
      days90: acc.days90 + item.days90,
      over90: acc.over90 + item.over90,
      total: acc.total + item.total,
    }),
    { current: 0, days30: 0, days60: 0, days90: 0, over90: 0, total: 0 }
  );

  return { asOf, items, totals };
}

// =============================================================================
// Added: Cash Flow Statement
// =============================================================================

/**
 * Changed (SOUPFIN-190): the cash flow statement now comes from the backend.
 *
 * It used to be built here from /financeReports/accountTransactions.json by
 * matching words in the account NAME ("loan", "equipment") and it always showed
 * an opening cash balance of 0, so the figures were not a cash flow statement.
 * The backend classifies by ledger group and computes opening and closing cash
 * from the cash accounts (plans/soupfin-190-cash-flow-statement-backend.md).
 */
export const CASH_FLOW_UNAVAILABLE_MESSAGE =
  'Cash flow statements are not available on this server yet. Ask your administrator to update the finance service.';

export const CASH_FLOW_UNREADABLE_MESSAGE =
  'The server sent a cash flow statement this page cannot read.';

/**
 * HTTP status of a failed request. Duck-typed like api/errors.ts so it also
 * works where axios is mocked.
 */
function httpStatusOf(err: unknown): number | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const status = (err as { response?: { status?: unknown } }).response?.status;
  return typeof status === 'number' ? status : undefined;
}

/** Sums a list of amounts, rounded to the cent so float noise never shows. */
function sumAmounts(amounts: number[]): number {
  return roundCents(amounts.reduce((sum, amount) => sum + amount, 0));
}

function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

function toActivities(list: CashFlowActivityResponse[] | null | undefined): CashFlowActivity[] {
  return (list ?? []).map((item) => ({
    description: item.description || item.ledgerAccountName || 'Cash movement',
    amount: item.amount,
  }));
}

/**
 * Turn a validated backend response into the page's CashFlowStatement.
 *
 * - Missing lists become [].
 * - A missing section total is the sum of its rows.
 * - Net cash flow is ALWAYS the sum of the three sections, so the summary can
 *   never disagree with the sections above it.
 * - Ending cash is the backend's figure (the real ledger balance). If it is
 *   absent it is opening + net.
 */
export function normalizeCashFlowStatement(
  data: CashFlowStatementResponse,
  filters: Pick<ReportFilters, 'from' | 'to'>
): CashFlowStatement {
  const operatingActivities = toActivities(data.operatingActivities);
  const investingActivities = toActivities(data.investingActivities);
  const financingActivities = toActivities(data.financingActivities);

  const total = (backendTotal: number | null | undefined, rows: CashFlowActivity[]) =>
    backendTotal ?? sumAmounts(rows.map((row) => row.amount));

  const totalOperatingCashFlow = total(data.totalOperatingCashFlow, operatingActivities);
  const totalInvestingCashFlow = total(data.totalInvestingCashFlow, investingActivities);
  const totalFinancingCashFlow = total(data.totalFinancingCashFlow, financingActivities);
  const netCashFlow = sumAmounts([totalOperatingCashFlow, totalInvestingCashFlow, totalFinancingCashFlow]);

  if (data.netCashFlow != null && Math.abs(data.netCashFlow - netCashFlow) >= 0.005) {
    console.warn(
      `[cashFlowStatement] backend netCashFlow ${data.netCashFlow} is not the sum of its sections (${netCashFlow}); showing the sum.`
    );
  }

  const beginningCashBalance = data.beginningCashBalance;
  const endingCashBalance = data.endingCashBalance ?? roundCents(beginningCashBalance + netCashFlow);

  return {
    periodStart: data.periodStart || filters.from,
    periodEnd: data.periodEnd || filters.to,
    operatingActivities,
    totalOperatingCashFlow,
    investingActivities,
    totalInvestingCashFlow,
    financingActivities,
    totalFinancingCashFlow,
    netCashFlow,
    beginningCashBalance,
    endingCashBalance,
  };
}

/**
 * Get Cash Flow Statement
 * GET /rest/financeReports/cashFlowStatement.json?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Errors propagate (SOUPFIN-30) so the page shows its error state, never an
 * empty statement. A 404 means the backend predates the endpoint; it gets a
 * message a person can act on instead of "Request failed with status code 404".
 *
 * @param filters - Date range filters (from, to)
 * @returns Cash Flow Statement
 */
export async function getCashFlowStatement(filters: ReportFilters): Promise<CashFlowStatement> {
  const query = toQueryString(filters);
  let data: unknown;
  try {
    const response = await apiClient.get<unknown>(`/financeReports/cashFlowStatement.json?${query}`);
    data = response.data;
  } catch (err) {
    if (httpStatusOf(err) === 404) {
      throw new Error(CASH_FLOW_UNAVAILABLE_MESSAGE);
    }
    throw err;
  }

  // A 200 that carries an error message is still an error.
  if (data && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string') {
    throw new Error((data as { error: string }).error);
  }

  const parsed = cashFlowStatementResponseSchema.safeParse(data);
  if (!parsed.success) {
    console.error('[cashFlowStatement] unexpected response', parsed.error.issues, data);
    throw new Error(CASH_FLOW_UNREADABLE_MESSAGE);
  }
  return normalizeCashFlowStatement(parsed.data, filters);
}

// =============================================================================
// Added: Report Export with More Types
// =============================================================================

/**
 * Export any report type to PDF, Excel, or CSV
 * GET /rest/financeReports/{reportType}.json?f={format}
 *
 * @param reportType - Type of report to export
 * @param filters - Date range and optional filters
 * @param format - Export format (pdf, xlsx, csv)
 * @returns Blob data for download
 */
export async function exportFinanceReport(
  reportType:
    | 'trialBalance'
    | 'balanceSheet'
    | 'incomeStatement'
    | 'cashFlowStatement'
    | 'agedReceivables'
    | 'agedPayables'
    | 'accountBalances'
    | 'accountTransactions',
  filters: ReportFilters,
  format: ExportFormat
): Promise<Blob> {
  const query = toQueryString({ ...filters, f: toBackendExportFormat(format) });
  const response = await apiClient.get(
    `/financeReports/${reportType}.json?${query}`,
    { responseType: 'blob' }
  );
  return response.data;
}

// =============================================================================
// Added (SOUPFIN-103): Rows for registry-only reports
// =============================================================================

/**
 * The response shapes a registry-only report can read rows from.
 *
 * - `array`: the body is the row list (or a wrapper normalizeTransactions knows).
 * - `groupedAccountList`: the FinanceOtherReportsService.accountBalances shape
 *   that trialBalance and accountBalances both return:
 *   `{ resultList: { ASSET: { accountList: [...] }, ... } }`. Each row gets a
 *   readable `ledgerGroup` label added so a column can show it.
 */
export type ReportRowSource = 'array' | 'groupedAccountList';

export type ReportRow = Record<string, unknown>;

const LEDGER_GROUP_LABELS: Record<string, string> = {
  ASSET: 'Assets',
  LIABILITY: 'Liabilities',
  EQUITY: 'Equity',
  REVENUE: 'Revenue',
  INCOME: 'Revenue',
  EXPENSE: 'Expenses',
};

/** Pull the row list out of a report response. Unknown shapes become []. */
export function extractReportRows(data: unknown, source: ReportRowSource): ReportRow[] {
  if (source === 'array') {
    return normalizeTransactions(data) as unknown as ReportRow[];
  }

  if (!data || typeof data !== 'object') return [];
  const resultList = (data as { resultList?: unknown }).resultList;
  if (!resultList || typeof resultList !== 'object') return [];

  const rows: ReportRow[] = [];
  for (const [group, value] of Object.entries(resultList as Record<string, unknown>)) {
    const accountList = (value as { accountList?: unknown } | null)?.accountList;
    if (!Array.isArray(accountList)) continue;
    for (const account of accountList) {
      if (account && typeof account === 'object') {
        rows.push({ ...(account as ReportRow), ledgerGroup: LEDGER_GROUP_LABELS[group] ?? group });
      }
    }
  }
  return rows;
}

/**
 * Fetch the rows of a registry-only report.
 * GET /rest{endpoint}?from=...&to=...
 *
 * Errors propagate (SOUPFIN-30): a failed request must reach React Query as an
 * error, not render as an empty report.
 */
export async function fetchReportRows(
  endpoint: string,
  filters: ReportFilters,
  source: ReportRowSource
): Promise<ReportRow[]> {
  const query = toQueryString(filters);
  const response = await apiClient.get<unknown>(`${endpoint}?${query}`);
  return extractReportRows(response.data, source);
}

/** The backend report types the export endpoint accepts. */
export type FinanceReportType = Parameters<typeof exportFinanceReport>[0];
