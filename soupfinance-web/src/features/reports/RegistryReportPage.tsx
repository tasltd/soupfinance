/**
 * Added (SOUPFIN-103): the page for registry-only reports.
 *
 * A report whose registry entry has a `source` and `columns` needs no page of
 * its own: this component reads the entry for the :reportId route parameter,
 * fetches the rows, and renders them as a table inside <ReportShell>. Currency
 * columns use the tenant's currency and get a totals row.
 */
import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, useParams } from 'react-router-dom';
import { fetchReportRows } from '../../api/endpoints/reports';
import { useFormatCurrency } from '../../stores';
import { formatDisplayRange } from './reportDates';
import { ReportShell } from './ReportShell';
import {
  findReportDefinition,
  isRegistryOnlyReport,
  toReportNumber as toNumber,
  totalReportColumns,
  type ReportColumn,
  type ReportDefinition,
} from './reportRegistry';
import { useReportControls } from './useReportControls';

export function RegistryReportPage() {
  const { reportId } = useParams<{ reportId: string }>();
  const definition = findReportDefinition(reportId);

  // An unknown id, or a report that has its own page, goes back to the hub.
  if (!definition || !isRegistryOnlyReport(definition)) {
    return <Navigate to="/reports" replace />;
  }
  // Keyed so switching between two registry reports resets the filters.
  return <RegistryReport key={definition.id} definition={definition} />;
}

function RegistryReport({ definition }: { definition: ReportDefinition }) {
  const controls = useReportControls(definition.page);
  const formatCurrency = useFormatCurrency();
  const columns = definition.columns ?? [];
  const source = definition.source!;
  const p = definition.page.testIdPrefix;

  const { data: rows, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['registryReport', definition.id, controls.filters],
    queryFn: () => fetchReportRows(source.endpoint, controls.filters, source.rows),
    staleTime: 5 * 60 * 1000,
    enabled: controls.isRangeValid,
  });

  const formatCell = (column: ReportColumn, value: unknown): string => {
    if (column.type === 'currency') return formatCurrency(toNumber(value));
    if (column.type === 'number') return toNumber(value).toLocaleString('en-US');
    return value === null || value === undefined ? '' : String(value);
  };

  const totals = rows ? totalReportColumns(rows, columns) : {};
  const hasTotals = columns.some((column) => column.type !== 'text');

  return (
    <ReportShell
      page={definition.page}
      controls={controls}
      onRefresh={() => refetch()}
      exportDefinition={definition}
      exportDisabled={isLoading}
      isFetching={isFetching}
      subtitle={
        <>
          {definition.description}
          {definition.page.dateMode === 'range' && ` · ${formatDisplayRange(controls.range)}`}
        </>
      }
    >
      <div
        className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden"
        data-testid={`${p}-table-container`}
      >
        {isLoading ? (
          <div className="p-12 text-center" data-testid={`${p}-loading`}>
            <span className="material-symbols-outlined text-4xl text-primary animate-spin mb-4">sync</span>
            <p className="text-subtle-text">Loading {definition.title.toLowerCase()}...</p>
          </div>
        ) : isError ? (
          <div className="p-12 text-center" data-testid={`${p}-error`}>
            <span className="material-symbols-outlined text-6xl text-danger/50 mb-4">error</span>
            <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">Failed to load report</h3>
            <p className="text-subtle-text mb-4">
              {error instanceof Error ? error.message : 'An unexpected error occurred'}
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm"
            >
              <span className="material-symbols-outlined text-lg">refresh</span>
              Try Again
            </button>
          </div>
        ) : !rows || rows.length === 0 ? (
          <div className="p-12 text-center" data-testid={`${p}-empty`}>
            <span className="material-symbols-outlined text-6xl text-subtle-text/50 mb-4">{definition.icon}</span>
            <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">Nothing to show</h3>
            <p className="text-subtle-text max-w-md mx-auto">
              This report has no rows for the dates you picked. Try a wider date range.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm" data-testid={`${p}-table`}>
              <thead className="text-xs text-subtle-text uppercase bg-background-light dark:bg-background-dark">
                <tr>
                  {columns.map((column) => (
                    <th
                      key={column.key}
                      scope="col"
                      className={`px-4 py-3 font-semibold whitespace-nowrap ${column.type === 'text' ? 'text-left' : 'text-right'}`}
                    >
                      {column.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr
                    key={String(row.id ?? index)}
                    className="border-b border-border-light dark:border-border-dark hover:bg-primary/5"
                    data-testid={`${p}-row-${index}`}
                  >
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        className={`px-4 py-3 text-text-light dark:text-text-dark ${
                          column.type === 'text' ? 'text-left' : 'text-right font-mono whitespace-nowrap'
                        }`}
                      >
                        {formatCell(column, row[column.key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {hasTotals && (
                <tfoot>
                  <tr
                    className="bg-background-light dark:bg-background-dark font-bold border-t-2 border-text-light dark:border-text-dark"
                    data-testid={`${p}-totals`}
                  >
                    {columns.map((column, index) => (
                      <td
                        key={column.key}
                        className={`px-4 py-3 text-text-light dark:text-text-dark ${
                          column.type === 'text' ? 'text-left' : 'text-right font-mono whitespace-nowrap'
                        }`}
                      >
                        {column.type === 'text'
                          ? index === 0
                            ? 'Total'
                            : ''
                          : formatCell(column, totals[column.key])}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      <Link to="/reports" className="self-start text-sm font-medium text-primary hover:underline">
        Back to all reports
      </Link>
    </ReportShell>
  );
}
