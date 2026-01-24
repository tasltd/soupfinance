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
import type {
  BalanceSheet,
  ProfitLoss,
  AgingReport,
  AgingItem,
  TrialBalance,
  TrialBalanceItem,
  CashFlowStatement,
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
 */
export type ExportFormat = 'pdf' | 'xlsx' | 'csv';

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
  const response = await apiClient.get<AccountTransactionEntry[]>(
    `/financeReports/accountTransactions.json?${query}`
  );
  return response.data;
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
  const query = toQueryString({ ...filters, f: format });
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
 * Get Cash Flow Statement
 *
 * NOTE: The Soupmarkets backend has a generateCashFlowStatement service method
 * but it's not exposed via a REST endpoint. This function builds a basic
 * cash flow from account transactions as a fallback.
 *
 * For full cash flow, a backend endpoint would need to be created.
 *
 * @param filters - Date range filters (from, to)
 * @returns Cash Flow Statement
 */
export async function getCashFlowStatement(filters: ReportFilters): Promise<CashFlowStatement> {
  // Added: Build cash flow from account transactions
  // This is a simplified version - ideally backend would expose the full endpoint
  const transactions = await getAccountTransactions(filters);

  // Group transactions by type (simplified categorization)
  const operatingActivities: { description: string; amount: number }[] = [];
  const investingActivities: { description: string; amount: number }[] = [];
  const financingActivities: { description: string; amount: number }[] = [];

  // Added: Simple categorization based on transaction descriptions
  // In production, this would use account types from backend
  for (const tx of transactions) {
    const netAmount = tx.debitAmount - tx.creditAmount;
    const activity = {
      description: tx.description || tx.ledgerAccountName,
      amount: netAmount,
    };

    // Simple heuristic - real implementation would use ledgerGroup
    if (tx.ledgerAccountName.toLowerCase().includes('fixed asset') ||
        tx.ledgerAccountName.toLowerCase().includes('equipment')) {
      investingActivities.push(activity);
    } else if (tx.ledgerAccountName.toLowerCase().includes('loan') ||
               tx.ledgerAccountName.toLowerCase().includes('capital')) {
      financingActivities.push(activity);
    } else {
      operatingActivities.push(activity);
    }
  }

  const totalOperating = operatingActivities.reduce((sum, a) => sum + a.amount, 0);
  const totalInvesting = investingActivities.reduce((sum, a) => sum + a.amount, 0);
  const totalFinancing = financingActivities.reduce((sum, a) => sum + a.amount, 0);

  return {
    periodStart: filters.from,
    periodEnd: filters.to,
    operatingActivities,
    totalOperatingCashFlow: totalOperating,
    investingActivities,
    totalInvestingCashFlow: totalInvesting,
    financingActivities,
    totalFinancingCashFlow: totalFinancing,
    netCashFlow: totalOperating + totalInvesting + totalFinancing,
    beginningCashBalance: 0, // Would need opening balance from backend
    endingCashBalance: totalOperating + totalInvesting + totalFinancing,
  };
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
  reportType: 'trialBalance' | 'balanceSheet' | 'incomeStatement' | 'agedReceivables' | 'agedPayables' | 'accountBalances' | 'accountTransactions',
  filters: ReportFilters,
  format: ExportFormat
): Promise<Blob> {
  const query = toQueryString({ ...filters, f: format });
  const response = await apiClient.get(
    `/financeReports/${reportType}.json?${query}`,
    { responseType: 'blob' }
  );
  return response.data;
}
