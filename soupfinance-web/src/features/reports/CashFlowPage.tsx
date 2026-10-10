/**
 * Cash Flow Statement Report Page
 * Reference: soupfinance-designs/cash-flow-statement-report/
 *
 * Displays Operating, Investing, and Financing activities with:
 * - Date range filter (from/to) defaulting to current month
 * - Three sections for activity types with amounts
 * - Section subtotals and net cash flow calculation
 * - Beginning/Ending cash balance summary
 *
 * Changed (SOUPFIN-103): renders inside the shared <ReportShell>. Amounts were
 * hardcoded to USD; they now follow the tenant's currency. The backend has no
 * cash flow export yet, so PDF and Excel stay disabled and CSV is built here.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getCashFlowStatement } from '../../api/endpoints/reports';
import type { CashFlowStatement, CashFlowActivity } from '../../types';
import { useCurrencyConfig, useFormatCurrency } from '../../stores';
import { formatDisplayDate } from '../../utils/date';
import { ReportShell } from './ReportShell';
import { getReportDefinition } from './reportRegistry';
import { formatDisplayRange } from './reportDates';
import { useReportControls } from './useReportControls';
import type { ClientExports } from './useReportExport';
import {
  buildReportExcelBlob,
  buildReportPdfHtml,
  renderReportPdf,
  type ReportExportContent,
} from './reportExportFiles';
import type { DisplayRow, ReportColumn } from './reportTable';

const DEFINITION = getReportDefinition('cash-flow');

// Fix(SOUPFIN-11): Escape a single CSV cell — quotes the value when it contains
// a comma, quote, or newline (per RFC 4180).
function csvCell(value: string | number): string {
  const str = typeof value === 'number' ? String(value) : value ?? '';
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// Fix(SOUPFIN-11): Build a CSV representation of the cash flow statement for
// client-side download. Includes every section, every activity row, and the
// summary totals so the export is self-contained.
function buildCashFlowCsv(cashFlow: CashFlowStatement): string {
  const rows: string[] = [];
  rows.push(`Cash Flow Statement,${csvCell(cashFlow.periodStart)},to,${csvCell(cashFlow.periodEnd)}`);
  rows.push('');
  rows.push('Section,Description,Amount');

  const sections: Array<{ name: string; activities: CashFlowActivity[]; total: number }> = [
    { name: 'Operating Activities', activities: cashFlow.operatingActivities ?? [], total: cashFlow.totalOperatingCashFlow },
    { name: 'Investing Activities', activities: cashFlow.investingActivities ?? [], total: cashFlow.totalInvestingCashFlow },
    { name: 'Financing Activities', activities: cashFlow.financingActivities ?? [], total: cashFlow.totalFinancingCashFlow },
  ];

  for (const section of sections) {
    for (const activity of section.activities) {
      rows.push(`${csvCell(section.name)},${csvCell(activity.description)},${csvCell(activity.amount.toFixed(2))}`);
    }
    rows.push(`${csvCell(section.name)},Total ${csvCell(section.name)},${csvCell(section.total.toFixed(2))}`);
    rows.push('');
  }

  rows.push(`Summary,Beginning Cash Balance,${csvCell(cashFlow.beginningCashBalance.toFixed(2))}`);
  rows.push(`Summary,Net Cash Flow,${csvCell(cashFlow.netCashFlow.toFixed(2))}`);
  rows.push(`Summary,Ending Cash Balance,${csvCell(cashFlow.endingCashBalance.toFixed(2))}`);

  return rows.join('\n');
}

// Added (SOUPFIN-104): the statement as an export table, so PDF and Excel are
// built in the browser like the CSV. The backend cashFlow action has no export.
const CASH_FLOW_COLUMNS: ReportColumn[] = [
  { key: 'description', header: 'Description', type: 'text' },
  { key: 'amount', header: 'Amount', type: 'currency' },
];

function cashFlowDisplayRows(cashFlow: CashFlowStatement): DisplayRow[] {
  const rows: DisplayRow[] = [
    { kind: 'row', row: { description: 'Beginning cash balance', amount: cashFlow.beginningCashBalance } },
  ];
  const sections: Array<[string, CashFlowActivity[] | undefined, number]> = [
    ['Operating Activities', cashFlow.operatingActivities, cashFlow.totalOperatingCashFlow],
    ['Investing Activities', cashFlow.investingActivities, cashFlow.totalInvestingCashFlow],
    ['Financing Activities', cashFlow.financingActivities, cashFlow.totalFinancingCashFlow],
  ];
  for (const [name, activities, total] of sections) {
    rows.push({ kind: 'group', label: name });
    for (const activity of activities ?? []) {
      rows.push({ kind: 'row', row: { description: activity.description, amount: activity.amount } });
    }
    rows.push({ kind: 'subtotal', label: `Total ${name}`, row: { description: `Total ${name}`, amount: total } });
  }
  rows.push({ kind: 'total', row: { description: 'Net cash flow', amount: cashFlow.netCashFlow } });
  rows.push({ kind: 'total', row: { description: 'Ending cash balance', amount: cashFlow.endingCashBalance } });
  return rows;
}

export function CashFlowPage() {
  const controls = useReportControls(DEFINITION.page);
  const formatCurrency = useFormatCurrency();
  const currency = useCurrencyConfig();
  const { from: fromDate, to: toDate } = controls.range;

  // Added: Fetch cash flow data using React Query
  const {
    data: cashFlow,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery<CashFlowStatement>({
    queryKey: ['cashFlowStatement', fromDate, toDate],
    queryFn: () => getCashFlowStatement({ from: fromDate, to: toDate }),
    staleTime: 5 * 60 * 1000, // 5 minutes cache
    enabled: controls.isRangeValid,
  });

  // Added: Calculate summary values
  const summary = useMemo(() => {
    if (!cashFlow) {
      return {
        netCashFlow: 0,
        beginningBalance: 0,
        endingBalance: 0,
      };
    }
    return {
      netCashFlow: cashFlow.netCashFlow,
      beginningBalance: cashFlow.beginningCashBalance,
      endingBalance: cashFlow.endingCashBalance,
    };
  }, [cashFlow]);

  // Fix(SOUPFIN-11): CSV export runs entirely client-side from data already in
  // memory, so users can download the report without a backend export endpoint.
  // The shell keeps the CSV button disabled until the statement has loaded.
  //
  // Changed (SOUPFIN-104): PDF and Excel are built the same way, from the
  // statement on screen, so Cash Flow exports all three formats.
  const clientExports = useMemo<ClientExports | undefined>(() => {
    if (!cashFlow) return undefined;
    const content = (): ReportExportContent => ({
      title: DEFINITION.page.title,
      subtitle: formatDisplayRange(controls.range),
      columns: CASH_FLOW_COLUMNS,
      displayRows: cashFlowDisplayRows(cashFlow),
      currencyCode: currency.code,
    });
    return {
      csv: () => new Blob([buildCashFlowCsv(cashFlow)], { type: 'text/csv;charset=utf-8' }),
      xlsx: () => buildReportExcelBlob(content()),
      pdf: () => renderReportPdf(buildReportPdfHtml(content(), formatCurrency), 'portrait'),
    };
  }, [cashFlow, controls.range, currency.code, formatCurrency]);

  return (
    <ReportShell
      page={DEFINITION.page}
      controls={controls}
      onRefresh={() => refetch()}
      exportDefinition={DEFINITION}
      exportDisabled={!cashFlow}
      clientExports={clientExports}
      isFetching={isFetching}
      subtitle={
        cashFlow
          ? formatDisplayRange({ from: cashFlow.periodStart, to: cashFlow.periodEnd })
          : 'Cash inflows and outflows for the period'
      }
    >
      {/* Loading State */}
      {isLoading && (
        <div
          className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-12 text-center"
          data-testid="cash-flow-loading"
        >
          <span className="material-symbols-outlined text-4xl text-primary animate-spin mb-4">sync</span>
          <p className="text-subtle-text">Loading cash flow statement...</p>
        </div>
      )}

      {/* Error State */}
      {isError && (
        <div
          className="bg-danger/10 rounded-xl border border-danger/30 p-6 text-center"
          data-testid="cash-flow-error"
        >
          <span className="material-symbols-outlined text-4xl text-danger mb-2">error</span>
          <h3 className="text-lg font-bold text-danger mb-2">Failed to load cash flow statement</h3>
          <p className="text-subtle-text mb-4">
            {error instanceof Error ? error.message : 'An unexpected error occurred'}
          </p>
          <button
            onClick={() => refetch()}
            className="h-10 px-4 bg-danger text-white rounded-lg hover:bg-danger/90 font-bold"
          >
            Retry
          </button>
        </div>
      )}

      {/* Cash Flow Data */}
      {cashFlow && !isLoading && !isError && (
        <>
          {/* Summary Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6" data-testid="cash-flow-stats">
            {/* Beginning Cash Balance Card */}
            <div className="flex flex-col gap-2 rounded-xl p-6 border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-subtle-text">account_balance_wallet</span>
                <p className="text-text-light dark:text-text-dark text-base font-medium">Beginning Cash Balance</p>
              </div>
              <p
                className="text-text-light dark:text-text-dark tracking-tight text-2xl font-bold"
                data-testid="cash-flow-beginning-balance"
              >
                {formatCurrency(summary.beginningBalance)}
              </p>
            </div>

            {/* Net Cash Flow Card */}
            <div className="flex flex-col gap-2 rounded-xl p-6 border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark">
              <div className="flex items-center gap-2">
                <span className={`material-symbols-outlined ${summary.netCashFlow >= 0 ? 'text-success' : 'text-danger'}`}>
                  {summary.netCashFlow >= 0 ? 'trending_up' : 'trending_down'}
                </span>
                <p className="text-text-light dark:text-text-dark text-base font-medium">Net Cash Flow</p>
              </div>
              <p
                className={`tracking-tight text-2xl font-bold ${summary.netCashFlow >= 0 ? 'text-success' : 'text-danger'}`}
                data-testid="cash-flow-net"
              >
                {formatCurrency(summary.netCashFlow)}
              </p>
            </div>

            {/* Ending Cash Balance Card */}
            <div className="flex flex-col gap-2 rounded-xl p-6 border border-primary/30 bg-primary/5 dark:bg-primary/10">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">water_drop</span>
                <p className="text-text-light dark:text-text-dark text-base font-medium">Ending Cash Balance</p>
              </div>
              <p
                className="text-primary tracking-tight text-2xl font-bold"
                data-testid="cash-flow-ending-balance"
              >
                {formatCurrency(summary.endingBalance)}
              </p>
            </div>
          </div>

          {/* Activity Sections */}
          {/* Fix(SOUPFIN-11): Defensive fallbacks ensure missing arrays from backend
              never crash the page with "t is not iterable". */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" data-testid="cash-flow-sections">
            {/* Operating Activities Section */}
            <CashFlowSection
              title="Operating Activities"
              icon="business_center"
              iconColor="text-primary"
              activities={Array.isArray(cashFlow.operatingActivities) ? cashFlow.operatingActivities : []}
              total={cashFlow.totalOperatingCashFlow}
              testIdPrefix="operating"
            />

            {/* Investing Activities Section */}
            <CashFlowSection
              title="Investing Activities"
              icon="trending_up"
              iconColor="text-info"
              activities={Array.isArray(cashFlow.investingActivities) ? cashFlow.investingActivities : []}
              total={cashFlow.totalInvestingCashFlow}
              testIdPrefix="investing"
            />

            {/* Financing Activities Section */}
            <CashFlowSection
              title="Financing Activities"
              icon="account_balance"
              iconColor="text-warning"
              activities={Array.isArray(cashFlow.financingActivities) ? cashFlow.financingActivities : []}
              total={cashFlow.totalFinancingCashFlow}
              testIdPrefix="financing"
            />
          </div>

          {/* Summary Section */}
          <div
            className="bg-surface-light dark:bg-surface-dark rounded-xl border-2 border-text-light dark:border-text-dark overflow-hidden"
            data-testid="cash-flow-summary"
          >
            <div className="px-6 py-4 border-b border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">summarize</span>
                <h2 className="text-lg font-bold text-text-light dark:text-text-dark">Cash Flow Summary</h2>
              </div>
            </div>
            <div className="divide-y divide-border-light dark:divide-border-dark">
              {/* Beginning Cash Balance */}
              <div className="flex justify-between items-center px-6 py-4">
                <span className="text-text-light dark:text-text-dark">Beginning Cash Balance</span>
                <span className="font-medium text-text-light dark:text-text-dark">
                  {formatCurrency(cashFlow.beginningCashBalance)}
                </span>
              </div>
              {/* Operating Cash Flow */}
              <div className="flex justify-between items-center px-6 py-3 pl-10">
                <span className="text-subtle-text">Cash from Operating Activities</span>
                <span className={`font-medium ${cashFlow.totalOperatingCashFlow >= 0 ? 'text-success' : 'text-danger'}`}>
                  {cashFlow.totalOperatingCashFlow >= 0 ? '+' : ''}{formatCurrency(cashFlow.totalOperatingCashFlow)}
                </span>
              </div>
              {/* Investing Cash Flow */}
              <div className="flex justify-between items-center px-6 py-3 pl-10">
                <span className="text-subtle-text">Cash from Investing Activities</span>
                <span className={`font-medium ${cashFlow.totalInvestingCashFlow >= 0 ? 'text-success' : 'text-danger'}`}>
                  {cashFlow.totalInvestingCashFlow >= 0 ? '+' : ''}{formatCurrency(cashFlow.totalInvestingCashFlow)}
                </span>
              </div>
              {/* Financing Cash Flow */}
              <div className="flex justify-between items-center px-6 py-3 pl-10">
                <span className="text-subtle-text">Cash from Financing Activities</span>
                <span className={`font-medium ${cashFlow.totalFinancingCashFlow >= 0 ? 'text-success' : 'text-danger'}`}>
                  {cashFlow.totalFinancingCashFlow >= 0 ? '+' : ''}{formatCurrency(cashFlow.totalFinancingCashFlow)}
                </span>
              </div>
              {/* Net Cash Flow */}
              <div className="flex justify-between items-center px-6 py-4 bg-background-light dark:bg-background-dark">
                <span className="font-bold text-text-light dark:text-text-dark">Net Cash Flow</span>
                <span className={`font-bold text-lg ${cashFlow.netCashFlow >= 0 ? 'text-success' : 'text-danger'}`}>
                  {cashFlow.netCashFlow >= 0 ? '+' : ''}{formatCurrency(cashFlow.netCashFlow)}
                </span>
              </div>
              {/* Ending Cash Balance */}
              <div className="flex justify-between items-center px-6 py-4 border-t-2 border-text-light dark:border-text-dark">
                <span className="font-black text-text-light dark:text-text-dark">Ending Cash Balance</span>
                <span className="font-black text-xl text-primary">
                  {formatCurrency(cashFlow.endingCashBalance)}
                </span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Empty State - No activities */}
      {!isLoading && !isError && cashFlow &&
        cashFlow.operatingActivities.length === 0 &&
        cashFlow.investingActivities.length === 0 &&
        cashFlow.financingActivities.length === 0 && (
          <div
            className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-12 text-center"
            data-testid="cash-flow-empty"
          >
            <span className="material-symbols-outlined text-6xl text-subtle-text/50 mb-4">water_drop</span>
            <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">No cash flow activities</h3>
            <p className="text-subtle-text">
              There are no cash flow activities for the period {formatDisplayDate(fromDate)} to {formatDisplayDate(toDate)}.
            </p>
          </div>
        )}
    </ReportShell>
  );
}

/**
 * Cash Flow Section Component
 * Displays a card with activity list and subtotal
 */
interface CashFlowSectionProps {
  title: string;
  icon: string;
  iconColor: string;
  activities: CashFlowActivity[];
  total: number;
  testIdPrefix: string;
}

function CashFlowSection({ title, icon, iconColor, activities, total, testIdPrefix }: CashFlowSectionProps) {
  const formatCurrency = useFormatCurrency();
  return (
    <div
      className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden"
      data-testid={`cash-flow-section-${testIdPrefix}`}
    >
      {/* Section Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark">
        <div className="flex items-center gap-2">
          <span className={`material-symbols-outlined ${iconColor}`}>{icon}</span>
          <h2 className="text-lg font-bold text-text-light dark:text-text-dark">{title}</h2>
        </div>
        <span className="text-sm text-subtle-text">{activities.length} items</span>
      </div>

      {/* Activity List */}
      <div className="divide-y divide-border-light dark:divide-border-dark max-h-80 overflow-y-auto">
        {activities.length === 0 ? (
          <div className="p-6 text-center text-subtle-text">
            <p>No {title.toLowerCase()}</p>
          </div>
        ) : (
          activities.map((activity, index) => (
            <CashFlowActivityRow
              key={`${testIdPrefix}-${index}`}
              activity={activity}
              testId={`${testIdPrefix}-activity-${index}`}
            />
          ))
        )}
      </div>

      {/* Section Total */}
      <div
        className="flex justify-between items-center px-6 py-4 border-t-2 border-text-light dark:border-text-dark bg-background-light dark:bg-background-dark"
        data-testid={`cash-flow-${testIdPrefix}-total`}
      >
        <span className="font-bold text-text-light dark:text-text-dark">Total {title}</span>
        <span className={`font-bold text-lg ${total >= 0 ? 'text-success' : 'text-danger'}`}>
          {total >= 0 ? '+' : ''}{formatCurrency(total)}
        </span>
      </div>
    </div>
  );
}

/**
 * Cash Flow Activity Row Component
 * Displays individual activity with amount colored by inflow/outflow
 */
interface CashFlowActivityRowProps {
  activity: CashFlowActivity;
  testId: string;
}

function CashFlowActivityRow({ activity, testId }: CashFlowActivityRowProps) {
  const formatCurrency = useFormatCurrency();
  const isInflow = activity.amount >= 0;

  return (
    <div
      className="flex justify-between items-center px-6 py-3 hover:bg-primary/5 transition-colors"
      data-testid={testId}
    >
      <span className="text-sm text-text-light dark:text-text-dark truncate pr-4">
        {activity.description}
      </span>
      <span
        className={`text-sm font-medium whitespace-nowrap ${isInflow ? 'text-success' : 'text-danger'}`}
      >
        {isInflow ? '+' : ''}{formatCurrency(activity.amount)}
      </span>
    </div>
  );
}
