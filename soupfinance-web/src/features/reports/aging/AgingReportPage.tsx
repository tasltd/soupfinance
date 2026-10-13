/**
 * Added (SOUPFIN-105): A/R and A/P aging Summary and Detail, Open Invoices and
 * Unpaid Bills.
 *
 * One component, six registry entries. `side` picks receivables or payables;
 * `view` picks the layout:
 * - summary: one row per customer/vendor, one column per aging period;
 * - detail:  one row per document, grouped by aging period, oldest first;
 * - open:    every open document, by customer/vendor then due date.
 *
 * All three read the same open documents (agingEngine.ts), so the Summary
 * total, the Detail total, the open-document total and the reconciliation
 * against the Balance Sheet are the same number.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useFormatCurrency } from '../../../stores';
import { useAgingSettingsStore } from '../../../stores/agingSettingsStore';
import { formatDisplayDate } from '../../../utils/date';
import { ReportShell } from '../ReportShell';
import { getReportDefinition } from '../reportRegistry';
import { useReportControls } from '../useReportControls';
import type { ClientExports } from '../useReportExport';
import {
  buildAgingDetail,
  buildAgingSummary,
  buildDocumentsCsv,
  buildSummaryCsv,
  computeAgingKpis,
  filterByParty,
  listParties,
  reconcileAging,
  sortOpenDocuments,
  type AgingSide,
  type OpenDocument,
} from './agingEngine';
import { AGING_SIDES, partyPathFor } from './agingSides';
import {
  AgingBucketChart,
  AgingEmpty,
  AgingError,
  AgingFilters,
  AgingKpiCards,
  AgingLoading,
  AgingViewTabs,
  PartyName,
  ReconciliationPanel,
  TruncatedNotice,
  bucketAmountClass,
} from './AgingParts';
import { useAgingDocuments, useClientLinks, useControlAccount } from './useAgingData';

export type AgingView = 'summary' | 'detail' | 'open';

const TH = 'px-4 py-3 font-semibold text-text-light dark:text-text-dark whitespace-nowrap';
const TD = 'px-4 py-3';
const TABLE_CARD =
  'bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden';

function csvBlob(text: string): Blob {
  return new Blob([text], { type: 'text/csv;charset=utf-8' });
}

/** "12 days" overdue, "Due today", or "Due in 5 days" for Current documents. */
function overdueLabel(days: number): string {
  if (days > 0) return days === 1 ? '1 day' : `${days.toLocaleString()} days`;
  if (days === 0) return 'Due today';
  const ahead = Math.abs(days);
  return ahead === 1 ? 'Due in 1 day' : `Due in ${ahead.toLocaleString()} days`;
}

export function AgingReportPage({ side, view }: { side: AgingSide; view: AgingView }) {
  const config = AGING_SIDES[side];
  const definition = getReportDefinition(config.reportIds[view]);
  const p = definition.page.testIdPrefix;
  const formatCurrency = useFormatCurrency();

  const controls = useReportControls(definition.page);
  const asOf = controls.asOf;
  const bucketConfig = useAgingSettingsStore((s) => s.bucketConfig);
  const setBucketConfig = useAgingSettingsStore((s) => s.setBucketConfig);
  const [partyId, setPartyId] = useState('');

  const data = useAgingDocuments(side, asOf, controls.isRangeValid);
  const controlAccount = useControlAccount(side, asOf, controls.isRangeValid);
  const clientLinks = useClientLinks(side === 'receivables');

  const parties = useMemo(() => listParties(data.documents), [data.documents]);
  // A customer who has paid up on the new as-of date drops out of the list.
  const activePartyId = parties.some((party) => party.id === partyId) ? partyId : '';
  const visible = useMemo(() => filterByParty(data.documents, activePartyId), [data.documents, activePartyId]);

  const summary = useMemo(() => buildAgingSummary(visible, bucketConfig), [visible, bucketConfig]);
  const detail = useMemo(() => buildAgingDetail(visible, bucketConfig), [visible, bucketConfig]);
  const openDocuments = useMemo(() => sortOpenDocuments(visible), [visible]);
  const kpis = useMemo(() => computeAgingKpis(visible), [visible]);

  // The control account holds every customer/vendor, so always reconcile the
  // unfiltered total, whatever the filter shows.
  const allTotal = useMemo(() => computeAgingKpis(data.documents).totalOpen, [data.documents]);
  const reconciliation = useMemo(
    () => (controlAccount.isLoading || controlAccount.isError ? null : reconcileAging(allTotal, controlAccount.control)),
    [allTotal, controlAccount.control, controlAccount.isLoading, controlAccount.isError]
  );

  const partyPath = (doc: Pick<OpenDocument, 'partyId'>) =>
    partyPathFor(side, doc.partyId, clientLinks.isError ? undefined : clientLinks.data);

  const clientExports = useMemo<ClientExports | undefined>(() => {
    if (!data.isLoaded) return undefined;
    const labels = { party: config.partyLabel, document: config.documentLabel };
    if (view === 'summary') return { csv: () => csvBlob(buildSummaryCsv(summary, config.partyLabel, asOf)) };
    if (view === 'detail') {
      const ordered = detail.flatMap((group) => group.documents);
      return { csv: () => csvBlob(buildDocumentsCsv(ordered, labels, asOf, bucketConfig)) };
    }
    return { csv: () => csvBlob(buildDocumentsCsv(openDocuments, labels, asOf)) };
  }, [data.isLoaded, view, summary, detail, openDocuments, asOf, bucketConfig, config]);

  const refresh = () => {
    data.refetch();
    controlAccount.refetch();
  };

  const subtitle = (
    <>
      {view === 'open'
        ? `${config.documentPlural.charAt(0).toUpperCase()}${config.documentPlural.slice(1)} with a balance as of `
        : `Unpaid ${config.documentPlural} by how overdue they are, as of `}
      <span className="font-medium text-text-light dark:text-text-dark">{formatDisplayDate(asOf)}</span>
    </>
  );

  let body;
  if (data.isLoading) {
    body = <AgingLoading testIdPrefix={p} />;
  } else if (data.isError) {
    body = <AgingError error={data.error} onRetry={data.refetch} testIdPrefix={p} />;
  } else if (visible.length === 0) {
    body = <AgingEmpty config={config} testIdPrefix={p} filtered={Boolean(activePartyId)} />;
  } else if (view === 'summary') {
    body = (
      <div className={TABLE_CARD}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm" data-testid={`${p}-table`}>
            <thead className="bg-background-light dark:bg-background-dark border-b border-border-light dark:border-border-dark">
              <tr>
                <th scope="col" className={`${TH} text-left px-6`}>
                  {config.partyLabel}
                </th>
                {summary.buckets.map((bucket) => (
                  <th key={bucket.index} scope="col" className={`${TH} text-right`} data-testid={`${p}-bucket-header-${bucket.index}`}>
                    {bucket.label}
                  </th>
                ))}
                <th scope="col" className={`${TH} text-right`}>
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {summary.rows.map((row, i) => (
                <tr
                  key={row.partyId || row.partyName}
                  className="border-b border-border-light dark:border-border-dark hover:bg-primary/5"
                  data-testid={`${p}-row-${i}`}
                >
                  <td className={`${TD} px-6`}>
                    <PartyName name={row.partyName} path={partyPath(row)} testId={`${p}-party-link-${i}`} />
                  </td>
                  {row.amounts.map((amount, b) => (
                    <td
                      key={b}
                      className={`${TD} text-right font-mono whitespace-nowrap ${bucketAmountClass(b, row.amounts.length, amount)}`}
                    >
                      {formatCurrency(amount)}
                    </td>
                  ))}
                  <td className={`${TD} text-right font-mono font-semibold whitespace-nowrap text-text-light dark:text-text-dark`}>
                    {formatCurrency(row.total)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-background-light dark:bg-background-dark border-t-2 border-border-light dark:border-border-dark">
              <tr data-testid={`${p}-totals`}>
                <th scope="row" className={`${TH} text-left px-6`}>
                  Total
                </th>
                {summary.totals.map((amount, b) => (
                  <td
                    key={b}
                    className={`${TD} text-right font-mono font-bold whitespace-nowrap ${bucketAmountClass(b, summary.totals.length, amount)}`}
                    data-testid={`${p}-total-${b}`}
                  >
                    {formatCurrency(amount)}
                  </td>
                ))}
                <td className={`${TD} text-right font-mono font-bold whitespace-nowrap text-primary`} data-testid={`${p}-grand-total`}>
                  {formatCurrency(summary.total)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    );
  } else if (view === 'detail') {
    body = (
      <div className={TABLE_CARD}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm" data-testid={`${p}-table`}>
            <thead className="bg-background-light dark:bg-background-dark border-b border-border-light dark:border-border-dark">
              <tr>
                <th scope="col" className={`${TH} text-left px-6`}>{config.documentLabel}</th>
                <th scope="col" className={`${TH} text-left`}>{config.partyLabel}</th>
                <th scope="col" className={`${TH} text-left`}>Date</th>
                <th scope="col" className={`${TH} text-left`}>Due date</th>
                <th scope="col" className={`${TH} text-right`}>Days overdue</th>
                <th scope="col" className={`${TH} text-right`}>Open balance</th>
              </tr>
            </thead>
            {detail.map((group) => (
              <tbody key={group.bucket.index} data-testid={`${p}-group-${group.bucket.index}`}>
                <tr className="bg-primary/5">
                  <th scope="rowgroup" colSpan={6} className={`${TH} text-left px-6`}>
                    {`${group.bucket.label} (${group.documents.length})`}
                  </th>
                </tr>
                {group.documents.map((doc) => (
                  <tr key={doc.id} className="border-b border-border-light dark:border-border-dark hover:bg-primary/5" data-testid={`${p}-doc-${doc.id}`}>
                    <td className={`${TD} px-6`}>
                      <Link to={config.documentPath(doc.id)} className="font-medium text-primary hover:underline" data-testid={`${p}-doc-link-${doc.id}`}>
                        {doc.reference}
                      </Link>
                    </td>
                    <td className={TD}>
                      <PartyName name={doc.partyName} path={partyPath(doc)} />
                    </td>
                    <td className={`${TD} text-subtle-text whitespace-nowrap`}>{formatDisplayDate(doc.date)}</td>
                    <td className={`${TD} text-subtle-text whitespace-nowrap`}>{formatDisplayDate(doc.dueDate)}</td>
                    <td className={`${TD} text-right whitespace-nowrap text-text-light dark:text-text-dark`}>
                      {doc.daysOverdue > 0 ? doc.daysOverdue.toLocaleString() : '–'}
                    </td>
                    <td className={`${TD} text-right font-mono whitespace-nowrap text-text-light dark:text-text-dark`}>
                      {formatCurrency(doc.open)}
                    </td>
                  </tr>
                ))}
                <tr className="border-b-2 border-border-light dark:border-border-dark" data-testid={`${p}-group-total-${group.bucket.index}`}>
                  <th scope="row" colSpan={5} className={`${TH} text-right`}>
                    {`${group.bucket.label} total`}
                  </th>
                  <td className={`${TD} text-right font-mono font-bold whitespace-nowrap text-text-light dark:text-text-dark`}>
                    {formatCurrency(group.total)}
                  </td>
                </tr>
              </tbody>
            ))}
            <tfoot className="bg-background-light dark:bg-background-dark">
              <tr data-testid={`${p}-totals`}>
                <th scope="row" colSpan={5} className={`${TH} text-right`}>Total</th>
                <td className={`${TD} text-right font-mono font-bold whitespace-nowrap text-primary`} data-testid={`${p}-grand-total`}>
                  {formatCurrency(summary.total)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    );
  } else {
    body = (
      <div className={TABLE_CARD}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm" data-testid={`${p}-table`}>
            <thead className="bg-background-light dark:bg-background-dark border-b border-border-light dark:border-border-dark">
              <tr>
                <th scope="col" className={`${TH} text-left px-6`}>{config.documentLabel}</th>
                <th scope="col" className={`${TH} text-left`}>{config.partyLabel}</th>
                <th scope="col" className={`${TH} text-left`}>Date</th>
                <th scope="col" className={`${TH} text-left`}>Due date</th>
                <th scope="col" className={`${TH} text-left`}>Overdue</th>
                <th scope="col" className={`${TH} text-right`}>Total</th>
                <th scope="col" className={`${TH} text-right`}>Paid</th>
                <th scope="col" className={`${TH} text-right`}>Open balance</th>
              </tr>
            </thead>
            <tbody>
              {openDocuments.map((doc, i) => (
                <tr key={doc.id} className="border-b border-border-light dark:border-border-dark hover:bg-primary/5" data-testid={`${p}-row-${i}`}>
                  <td className={`${TD} px-6`}>
                    <Link to={config.documentPath(doc.id)} className="font-medium text-primary hover:underline" data-testid={`${p}-doc-link-${doc.id}`}>
                      {doc.reference}
                    </Link>
                  </td>
                  <td className={TD}>
                    <PartyName name={doc.partyName} path={partyPath(doc)} testId={`${p}-party-link-${i}`} />
                  </td>
                  <td className={`${TD} text-subtle-text whitespace-nowrap`}>{formatDisplayDate(doc.date)}</td>
                  <td className={`${TD} text-subtle-text whitespace-nowrap`}>{formatDisplayDate(doc.dueDate)}</td>
                  <td className={`${TD} whitespace-nowrap ${doc.daysOverdue > 0 ? 'text-danger' : 'text-subtle-text'}`}>
                    {overdueLabel(doc.daysOverdue)}
                  </td>
                  <td className={`${TD} text-right font-mono whitespace-nowrap text-text-light dark:text-text-dark`}>{formatCurrency(doc.total)}</td>
                  <td className={`${TD} text-right font-mono whitespace-nowrap text-subtle-text`}>{formatCurrency(doc.paid)}</td>
                  <td className={`${TD} text-right font-mono font-semibold whitespace-nowrap text-text-light dark:text-text-dark`}>
                    {formatCurrency(doc.open)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-background-light dark:bg-background-dark border-t-2 border-border-light dark:border-border-dark">
              <tr data-testid={`${p}-totals`}>
                <th scope="row" colSpan={7} className={`${TH} text-right`}>
                  {`Total (${openDocuments.length.toLocaleString()} ${openDocuments.length === 1 ? config.documentLabel.toLowerCase() : config.documentPlural})`}
                </th>
                <td className={`${TD} text-right font-mono font-bold whitespace-nowrap text-primary`} data-testid={`${p}-grand-total`}>
                  {formatCurrency(summary.total)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    );
  }

  const hasRows = !data.isLoading && !data.isError && visible.length > 0;

  return (
    <ReportShell
      page={definition.page}
      controls={controls}
      onRefresh={refresh}
      exportDefinition={definition}
      exportDisabled={!hasRows}
      clientExports={clientExports}
      isFetching={data.isFetching}
      subtitle={subtitle}
      filterSlot={
        <AgingFilters
          config={config}
          testIdPrefix={p}
          bucketConfig={view === 'open' ? undefined : bucketConfig}
          onBucketConfigChange={view === 'open' ? undefined : setBucketConfig}
          parties={parties}
          partyId={activePartyId}
          onPartyChange={setPartyId}
        />
      }
    >
      <AgingViewTabs config={config} />
      {data.truncated && <TruncatedNotice config={config} testIdPrefix={p} />}
      {hasRows && <AgingKpiCards kpis={kpis} config={config} testIdPrefix={p} />}
      {hasRows && view !== 'open' && (
        <AgingBucketChart summary={summary} title={`${config.shortLabel} aging by period`} testIdPrefix={p} />
      )}
      {body}
      {!data.isLoading && !data.isError && (
        <ReconciliationPanel
          reconciliation={reconciliation}
          isLoading={controlAccount.isLoading}
          error={controlAccount.error}
          onRetry={controlAccount.refetch}
          config={config}
          asOf={asOf}
          testIdPrefix={p}
        />
      )}
    </ReportShell>
  );
}
