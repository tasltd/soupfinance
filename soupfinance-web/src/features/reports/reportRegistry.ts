/**
 * Added (SOUPFIN-103): the report catalogue.
 *
 * Every report the app offers is one entry here. The Reports hub, the shared
 * <ReportShell> and the generic report page all read from this list, so:
 *
 * - a report with its own layout (Profit & Loss, Balance Sheet) adds an entry
 *   and a page that renders inside <ReportShell>;
 * - a plain table report adds an entry with `source` and `columns` and nothing
 *   else. <RegistryReportPage> renders it at /reports/view/:reportId, with the
 *   same date range, export buttons and tenant currency as every other report.
 */
import type {
  ExportFormat,
  FinanceReportType,
  ReportRow,
  ReportRowSource,
} from '../../api/endpoints/reports';
import type { DefaultRangeKind } from './reportDates';
import type { HelpSection } from '../../components/help/helpSections';

// =============================================================================
// Types
// =============================================================================

export type ReportCategoryId =
  | 'business-overview'
  | 'who-owes-you'
  | 'what-you-owe'
  | 'for-my-accountant';

export interface ReportCategory {
  id: ReportCategoryId;
  title: string;
  description: string;
  icon: string;
}

/** data-testid overrides, for pages whose existing ids predate the shell. */
export interface ReportShellTestIds {
  toolbar?: string;
  from?: string;
  to?: string;
  asOf?: string;
  refresh?: string;
  reset?: string;
}

/**
 * How a report page looks and which filters its toolbar offers. Two registry
 * entries can share one page (A/R and A/P aging live on /reports/aging).
 */
export interface ReportPageConfig {
  title: string;
  /** Prefix for every data-testid the shell renders: `${prefix}-page`. */
  testIdPrefix: string;
  /** Section of the user guide the "Need Help?" link opens. */
  helpSection?: HelpSection;
  /** `range` = from/to dates; `asOf` = a single point-in-time date. */
  dateMode: 'range' | 'asOf';
  /** Starting range for `range` reports. Ignored for `asOf` (always today). */
  defaultRange?: DefaultRangeKind;
  /** Stop the date pickers at today (aging cannot be run for the future). */
  maxToday?: boolean;
  /** Offer a "Compare with" previous period / previous year selector. */
  comparison: boolean;
  /** Reserve the Class/Location filter slot in the toolbar. */
  classLocation: boolean;
  /** Labels for the refresh and reset buttons. */
  refreshLabel?: string;
  resetLabel?: string;
  testIds?: ReportShellTestIds;
  /** Element id overrides for the date inputs (labels and saved links rely on them). */
  inputIds?: { from?: string; to?: string; asOf?: string };
}

export type ReportColumnType = 'text' | 'currency' | 'number';

export interface ReportColumn {
  /** Field on the row. */
  key: string;
  header: string;
  type: ReportColumnType;
}

export interface ReportDefinition {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: ReportCategoryId;
  /** Where the hub links to. */
  path: string;
  /** Extra words the hub search matches on. */
  keywords?: string[];
  page: ReportPageConfig;
  export: {
    /** Backend report type for PDF/Excel/CSV. Omit when the backend has none. */
    backendType?: FinanceReportType;
    /** Download name: `${fileStem}-${from}-to-${to}.pdf` or `${fileStem}-${asOf}.pdf`. */
    fileStem: string;
  };
  /** Registry-only reports: where the rows come from. */
  source?: { endpoint: string; rows: ReportRowSource };
  /** Registry-only reports: the table columns. */
  columns?: ReportColumn[];
}

export const EXPORT_FORMATS: ExportFormat[] = ['pdf', 'xlsx', 'csv'];

// =============================================================================
// Categories
// =============================================================================

export const REPORT_CATEGORIES: ReportCategory[] = [
  {
    id: 'business-overview',
    title: 'Business overview',
    description: 'How the business is performing',
    icon: 'monitoring',
  },
  {
    id: 'who-owes-you',
    title: 'Who owes you',
    description: 'Customers and unpaid invoices',
    icon: 'call_received',
  },
  {
    id: 'what-you-owe',
    title: 'What you owe',
    description: 'Vendors and unpaid bills',
    icon: 'call_made',
  },
  {
    id: 'for-my-accountant',
    title: 'For my accountant',
    description: 'Ledger balances and checks',
    icon: 'calculate',
  },
];

// =============================================================================
// Pages
// =============================================================================

/**
 * The /reports/aging overview: A/R and A/P side by side on one page. It is not
 * a hub entry of its own (the hub lists the Summary, Detail and Open reports
 * below); the side navigation's "Aging Reports" link opens it.
 */
export const AGING_OVERVIEW_PAGE: ReportPageConfig = {
  title: 'Aging Reports',
  testIdPrefix: 'aging-reports',
  helpSection: 'aging',
  dateMode: 'asOf',
  maxToday: true,
  comparison: false,
  classLocation: true,
  resetLabel: 'Today',
  testIds: {
    asOf: 'aging-reports-date-picker',
    reset: 'aging-reports-reset-date',
  },
  inputIds: { asOf: 'aging-as-of-date' },
};

// =============================================================================
// Reports
// =============================================================================

export const REPORTS: ReportDefinition[] = [
  {
    id: 'profit-loss',
    title: 'Profit & Loss',
    description: 'Revenue, expenses, and net income',
    icon: 'trending_up',
    category: 'business-overview',
    path: '/reports/pnl',
    keywords: ['income statement', 'p&l', 'pnl', 'revenue', 'expenses', 'net profit'],
    page: {
      title: 'Profit & Loss',
      testIdPrefix: 'profit-loss',
      helpSection: 'profit-loss',
      dateMode: 'range',
      defaultRange: 'monthToDate',
      comparison: true,
      classLocation: true,
    },
    export: { backendType: 'incomeStatement', fileStem: 'profit-loss' },
  },
  {
    id: 'balance-sheet',
    title: 'Balance Sheet',
    description: 'Assets, liabilities, and equity',
    icon: 'account_balance',
    category: 'business-overview',
    path: '/reports/balance-sheet',
    keywords: ['assets', 'liabilities', 'equity', 'financial position'],
    page: {
      title: 'Balance Sheet',
      testIdPrefix: 'balance-sheet',
      helpSection: 'balance-sheet',
      dateMode: 'asOf',
      comparison: true,
      classLocation: true,
    },
    export: { backendType: 'balanceSheet', fileStem: 'balance-sheet' },
  },
  {
    id: 'cash-flow',
    title: 'Cash Flow',
    description: 'Cash movements and liquidity',
    icon: 'water_drop',
    category: 'business-overview',
    path: '/reports/cash-flow',
    keywords: ['cash flow statement', 'liquidity', 'operating', 'investing', 'financing'],
    page: {
      title: 'Cash Flow Statement',
      testIdPrefix: 'cash-flow',
      helpSection: 'cash-flow',
      dateMode: 'range',
      defaultRange: 'monthToDate',
      comparison: false,
      classLocation: true,
    },
    // No backend export yet; the page builds its CSV in the browser.
    export: { fileStem: 'cash-flow' },
  },
  // Changed (SOUPFIN-105): A/R and A/P each have a Summary (one row per
  // customer/vendor) and a Detail (one row per document, grouped by aging
  // period), plus the Open Invoices and Unpaid Bills lists. All six are bucketed
  // in the browser from the open documents (aging/agingEngine.ts), so they agree
  // with each other. Exports are CSV built from the rows on screen: the backend
  // agedReceivables/agedPayables export uses the backend's broken buckets.
  {
    id: 'ar-aging',
    title: 'A/R Aging Summary',
    description: 'What each customer owes, by how overdue it is',
    icon: 'receipt_long',
    category: 'who-owes-you',
    path: '/reports/aging/receivables',
    keywords: ['accounts receivable', 'receivables', 'aging', 'ageing', 'overdue', 'customers', 'summary'],
    page: {
      title: 'A/R Aging Summary',
      testIdPrefix: 'ar-aging-summary',
      helpSection: 'aging',
      dateMode: 'asOf',
      maxToday: true,
      comparison: false,
      classLocation: true,
      resetLabel: 'Today',
    },
    export: { fileStem: 'ar-aging-summary' },
  },
  {
    id: 'ar-aging-detail',
    title: 'A/R Aging Detail',
    description: 'Each unpaid invoice, grouped by how overdue it is',
    icon: 'format_list_bulleted',
    category: 'who-owes-you',
    path: '/reports/aging/receivables/detail',
    keywords: ['accounts receivable', 'receivables', 'aging', 'ageing', 'overdue', 'invoices', 'detail'],
    page: {
      title: 'A/R Aging Detail',
      testIdPrefix: 'ar-aging-detail',
      helpSection: 'aging',
      dateMode: 'asOf',
      maxToday: true,
      comparison: false,
      classLocation: true,
      resetLabel: 'Today',
    },
    export: { fileStem: 'ar-aging-detail' },
  },
  {
    id: 'open-invoices',
    title: 'Open Invoices',
    description: 'Every invoice with a balance still to collect',
    icon: 'request_quote',
    category: 'who-owes-you',
    path: '/reports/open-invoices',
    keywords: ['unpaid invoices', 'outstanding', 'receivables', 'customers', 'balance due'],
    page: {
      title: 'Open Invoices',
      testIdPrefix: 'open-invoices',
      helpSection: 'aging',
      dateMode: 'asOf',
      maxToday: true,
      comparison: false,
      classLocation: true,
      resetLabel: 'Today',
    },
    export: { fileStem: 'open-invoices' },
  },
  {
    id: 'ap-aging',
    title: 'A/P Aging Summary',
    description: 'What you owe each vendor, by how overdue it is',
    icon: 'payments',
    category: 'what-you-owe',
    path: '/reports/aging/payables',
    keywords: ['accounts payable', 'payables', 'aging', 'ageing', 'overdue', 'vendors', 'bills', 'summary'],
    page: {
      title: 'A/P Aging Summary',
      testIdPrefix: 'ap-aging-summary',
      helpSection: 'aging',
      dateMode: 'asOf',
      maxToday: true,
      comparison: false,
      classLocation: true,
      resetLabel: 'Today',
    },
    export: { fileStem: 'ap-aging-summary' },
  },
  {
    id: 'ap-aging-detail',
    title: 'A/P Aging Detail',
    description: 'Each unpaid bill, grouped by how overdue it is',
    icon: 'format_list_bulleted',
    category: 'what-you-owe',
    path: '/reports/aging/payables/detail',
    keywords: ['accounts payable', 'payables', 'aging', 'ageing', 'overdue', 'bills', 'detail'],
    page: {
      title: 'A/P Aging Detail',
      testIdPrefix: 'ap-aging-detail',
      helpSection: 'aging',
      dateMode: 'asOf',
      maxToday: true,
      comparison: false,
      classLocation: true,
      resetLabel: 'Today',
    },
    export: { fileStem: 'ap-aging-detail' },
  },
  {
    id: 'unpaid-bills',
    title: 'Unpaid Bills',
    description: 'Every bill with a balance still to pay',
    icon: 'receipt',
    category: 'what-you-owe',
    path: '/reports/unpaid-bills',
    keywords: ['open bills', 'outstanding', 'payables', 'vendors', 'balance due'],
    page: {
      title: 'Unpaid Bills',
      testIdPrefix: 'unpaid-bills',
      helpSection: 'aging',
      dateMode: 'asOf',
      maxToday: true,
      comparison: false,
      classLocation: true,
      resetLabel: 'Today',
    },
    export: { fileStem: 'unpaid-bills' },
  },
  {
    id: 'trial-balance',
    title: 'Trial Balance',
    description: 'Debit and credit balances for all accounts',
    icon: 'balance',
    category: 'for-my-accountant',
    path: '/reports/trial-balance',
    keywords: ['debits', 'credits', 'ledger', 'balanced'],
    page: {
      title: 'Trial Balance',
      testIdPrefix: 'trial-balance',
      helpSection: 'trial-balance',
      dateMode: 'range',
      defaultRange: 'month',
      comparison: false,
      classLocation: true,
      refreshLabel: 'Generate Report',
      testIds: {
        toolbar: 'trial-balance-filters',
        from: 'trial-balance-filter-from',
        to: 'trial-balance-filter-to',
        refresh: 'trial-balance-filter-apply',
        reset: 'trial-balance-filter-reset',
      },
    },
    export: { backendType: 'trialBalance', fileStem: 'trial-balance' },
  },
  // A registry-only report: no page component, just a source and columns.
  // FinanceReportsController.accountBalances returns the same grouped shape as
  // trialBalance, with these fields per account.
  {
    id: 'account-balances',
    title: 'Account Balances',
    description: 'Opening balance, movement, and closing balance per account',
    icon: 'account_tree',
    category: 'for-my-accountant',
    path: '/reports/view/account-balances',
    keywords: ['ledger', 'opening balance', 'closing balance', 'movement', 'chart of accounts'],
    page: {
      title: 'Account Balances',
      testIdPrefix: 'account-balances',
      helpSection: 'report-basics',
      dateMode: 'range',
      defaultRange: 'month',
      comparison: false,
      classLocation: true,
    },
    export: { backendType: 'accountBalances', fileStem: 'account-balances' },
    source: { endpoint: '/financeReports/accountBalances.json', rows: 'groupedAccountList' },
    columns: [
      { key: 'name', header: 'Account', type: 'text' },
      { key: 'ledgerGroup', header: 'Group', type: 'text' },
      { key: 'startingBalance', header: 'Opening', type: 'currency' },
      { key: 'calculatedDebitBalance', header: 'Debits', type: 'currency' },
      { key: 'calculatedCreditBalance', header: 'Credits', type: 'currency' },
      { key: 'netMovement', header: 'Net movement', type: 'currency' },
      { key: 'endingBalance', header: 'Closing', type: 'currency' },
    ],
  },
];

// =============================================================================
// Lookups
// =============================================================================

/** The definition for a report id. Throws for an id that is not registered. */
export function getReportDefinition(id: string): ReportDefinition {
  const definition = REPORTS.find((report) => report.id === id);
  if (!definition) {
    throw new Error(`Unknown report: ${id}`);
  }
  return definition;
}

/** Like getReportDefinition, but undefined for an unknown id (route params). */
export function findReportDefinition(id: string | undefined): ReportDefinition | undefined {
  return id ? REPORTS.find((report) => report.id === id) : undefined;
}

/** True for entries the generic page can render without their own component. */
export function isRegistryOnlyReport(definition: ReportDefinition): boolean {
  return Boolean(definition.source && definition.columns && definition.columns.length > 0);
}

/**
 * Reports matching every word of the query, in title, description, category
 * or keywords. An empty query returns everything.
 */
export function searchReports(query: string, reports: ReportDefinition[] = REPORTS): ReportDefinition[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return reports;

  return reports.filter((report) => {
    const category = REPORT_CATEGORIES.find((c) => c.id === report.category);
    const haystack = [
      report.title,
      report.description,
      category?.title ?? '',
      ...(report.keywords ?? []),
    ]
      .join(' ')
      .toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

/** Categories in display order, each with its reports. Empty categories are dropped. */
export function groupReportsByCategory(
  reports: ReportDefinition[]
): { category: ReportCategory; reports: ReportDefinition[] }[] {
  return REPORT_CATEGORIES.map((category) => ({
    category,
    reports: reports.filter((report) => report.category === category.id),
  })).filter((group) => group.reports.length > 0);
}

/** A cell value as a number; blanks and non-numbers count as 0. */
export function toReportNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Sum of each currency and number column, keyed by column key. */
export function totalReportColumns(rows: ReportRow[], columns: ReportColumn[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const column of columns) {
    if (column.type === 'text') continue;
    totals[column.key] = rows.reduce((sum, row) => sum + toReportNumber(row[column.key]), 0);
  }
  return totals;
}
