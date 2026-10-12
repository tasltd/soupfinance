/**
 * Added (SOUPFIN-159): Audit Trail report — who changed which record, and when.
 * Reference: soupfinance-designs/audit-trail-log/
 *
 * Filters by date range, user, event, record type, record id and free text.
 * Each row opens to show the field changes (Before / After). Export writes the
 * filtered events to CSV in the browser, so it contains exactly what the
 * filters selected.
 *
 * Source: /rest/auditTrail/index.json through listAuditEvents(). The backend
 * caps a request at 1000 change rows; when it hits that cap the page says so
 * rather than presenting a partial log as complete.
 */
import { Fragment, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AUDIT_ACTION_LABELS,
  AUDIT_ENTITY_LABELS,
  auditEventsToCsv,
  entityLabel,
  listAuditEvents,
  summariseAuditEvent,
} from '../../api/endpoints/auditTrail';
import { ApiErrorState } from '../../components/feedback';
import { HelpLink } from '../../components/help';
import { AUDIT_ACTION_STYLE, AuditChangeTable, formatAuditTimestamp } from '../../components/audit';
import { toLocalIsoDate } from '../../utils/date';
import { downloadBlob } from './useReportExport';
import type { AuditAction, AuditEvent, AuditTrailFilters } from '../../types/auditTrail';

const PAGE_SIZE = 25;
const DEFAULT_DAYS = 30;

/** Records that have a page of their own. */
function recordPath(event: AuditEvent): string | null {
  if (event.entityType === 'LedgerTransactionGroup') return `/accounting/journal-entry/${event.entityId}`;
  if (event.entityType === 'Voucher') return `/accounting/vouchers/${event.entityId}`;
  if (event.entityType === 'Invoice') return `/invoices/${event.entityId}`;
  if (event.entityType === 'Bill') return `/bills/${event.entityId}`;
  return null;
}

function defaultFilters(): AuditTrailFilters {
  const from = new Date();
  from.setDate(from.getDate() - (DEFAULT_DAYS - 1));
  return { from: toLocalIsoDate(from), to: toLocalIsoDate() };
}

const inputClass =
  'h-10 w-full rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-background-dark px-3 text-sm text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/50 focus:outline-0';

export function AuditTrailPage() {
  const [draft, setDraft] = useState<AuditTrailFilters>(defaultFilters);
  const [applied, setApplied] = useState<AuditTrailFilters>(draft);
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['audit-trail', applied],
    queryFn: () => listAuditEvents(applied),
    staleTime: 0,
  });

  const events = useMemo(() => data?.events ?? [], [data]);
  const actors = useMemo(() => Array.from(new Set(events.map((e) => e.actor))).sort(), [events]);
  const pageCount = Math.max(1, Math.ceil(events.length / PAGE_SIZE));
  const visible = events.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const rangeInvalid = !!draft.from && !!draft.to && draft.from > draft.to;

  const update = (patch: Partial<AuditTrailFilters>) => setDraft((d) => ({ ...d, ...patch }));

  const apply = () => {
    if (rangeInvalid) return;
    setApplied({ ...draft });
    setPage(0);
    setExpanded(null);
  };

  const reset = () => {
    const fresh = defaultFilters();
    setDraft(fresh);
    setApplied(fresh);
    setPage(0);
    setExpanded(null);
  };

  const exportCsv = () => {
    const blob = new Blob([auditEventsToCsv(events)], { type: 'text/csv;charset=utf-8' });
    downloadBlob(blob, `audit-trail-${applied.from ?? 'start'}-to-${applied.to ?? 'today'}.csv`);
  };

  return (
    <div className="flex flex-col gap-6" data-testid="audit-trail-page">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-start gap-4">
        <div className="flex flex-col gap-1">
          <Link to="/reports" className="text-sm font-medium text-subtle-text hover:text-primary" data-testid="audit-trail-back">
            Reports
          </Link>
          <h1 className="text-3xl font-black tracking-[-0.033em] text-text-light dark:text-text-dark" data-testid="audit-trail-heading">
            Audit Trail
          </h1>
          <p className="text-base text-subtle-text max-w-2xl">
            Every change to your records: who made it, when, and what it changed.
          </p>
          <HelpLink section="audit-trail" className="mt-1 self-start" />
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={isLoading || events.length === 0}
          className="flex items-center gap-2 h-10 px-4 rounded-lg border border-primary text-primary text-sm font-bold hover:bg-primary/10 disabled:opacity-50 disabled:cursor-not-allowed"
          data-testid="audit-trail-export-csv"
        >
          <span className="material-symbols-outlined text-base">download</span>
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <form
        className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-6 flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
        data-testid="audit-trail-filters"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium text-text-light dark:text-text-dark">
            From
            <input type="date" className={inputClass} value={draft.from ?? ''} max={draft.to || undefined}
              onChange={(e) => update({ from: e.target.value })} data-testid="audit-filter-from" />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-text-light dark:text-text-dark">
            To
            <input type="date" className={inputClass} value={draft.to ?? ''} min={draft.from || undefined}
              onChange={(e) => update({ to: e.target.value })} data-testid="audit-filter-to" />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-text-light dark:text-text-dark">
            User
            <input type="text" className={inputClass} list="audit-actor-options" placeholder="Any user"
              value={draft.actor ?? ''} onChange={(e) => update({ actor: e.target.value || undefined })}
              data-testid="audit-filter-user" />
            <datalist id="audit-actor-options">
              {actors.map((a) => <option key={a} value={a} />)}
            </datalist>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-text-light dark:text-text-dark">
            Event
            <select className={inputClass} value={draft.action ?? ''}
              onChange={(e) => update({ action: (e.target.value || undefined) as AuditAction | undefined })}
              data-testid="audit-filter-event">
              <option value="">Any event</option>
              {(Object.keys(AUDIT_ACTION_LABELS) as AuditAction[]).map((a) => (
                <option key={a} value={a}>{AUDIT_ACTION_LABELS[a]}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-text-light dark:text-text-dark">
            Record type
            <select className={inputClass} value={draft.className ?? ''}
              onChange={(e) => update({ className: e.target.value || undefined })}
              data-testid="audit-filter-record-type">
              <option value="">Any record</option>
              {Object.entries(AUDIT_ENTITY_LABELS).map(([cls, label]) => (
                <option key={cls} value={cls}>{label}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-text-light dark:text-text-dark">
            Record ID or text
            <input type="search" className={inputClass} placeholder="Search changes"
              value={draft.search ?? ''} onChange={(e) => update({ search: e.target.value || undefined })}
              data-testid="audit-filter-search" />
          </label>
        </div>
        {rangeInvalid && (
          <p className="text-sm text-danger" role="alert" data-testid="audit-filter-range-error">
            The start date must be on or before the end date.
          </p>
        )}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={reset}
            className="h-10 px-4 rounded-lg bg-[#f5f1f0] dark:bg-gray-700 text-text-light dark:text-white text-sm font-bold hover:bg-gray-200 dark:hover:bg-gray-600"
            data-testid="audit-filter-reset">
            Reset
          </button>
          <button type="submit" disabled={rangeInvalid}
            className="h-10 px-4 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-50"
            data-testid="audit-filter-apply">
            Apply filters
          </button>
        </div>
      </form>

      {error ? (
        <ApiErrorState error={error} onRetry={() => refetch()} testId="audit-trail-error" />
      ) : (
        <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden">
          {/* Summary */}
          <div className="flex flex-wrap items-center gap-6 px-6 py-4 border-b border-border-light dark:border-border-dark text-sm">
            <p className="text-subtle-text">
              Total events: <span className="font-bold text-text-light dark:text-text-dark" data-testid="audit-trail-total">{events.length}</span>
            </p>
            <p className="text-subtle-text">
              Users active: <span className="font-bold text-text-light dark:text-text-dark" data-testid="audit-trail-users">{actors.length}</span>
            </p>
            {isFetching && !isLoading && (
              <span className="flex items-center gap-1 text-subtle-text">
                <span className="material-symbols-outlined animate-spin text-base text-primary">progress_activity</span>
                Updating
              </span>
            )}
          </div>

          {data?.truncated && (
            <p className="px-6 py-3 text-sm bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-300 border-b border-border-light dark:border-border-dark"
              data-testid="audit-trail-truncated">
              Only the latest {data.rowCount.toLocaleString()} field changes in this range are shown. Narrow the dates or filters to see older ones.
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm text-left" data-testid="audit-trail-table">
              <thead className="text-xs text-subtle-text uppercase bg-background-light dark:bg-background-dark">
                <tr>
                  <th scope="col" className="w-10 px-3 py-3"><span className="sr-only">Details</span></th>
                  <th scope="col" className="px-4 py-3">Timestamp</th>
                  <th scope="col" className="px-4 py-3">User</th>
                  <th scope="col" className="px-4 py-3">Event</th>
                  <th scope="col" className="px-4 py-3">Record type</th>
                  <th scope="col" className="px-4 py-3">Record ID</th>
                  <th scope="col" className="px-4 py-3">Summary of change</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={7} className="px-6 py-10 text-center text-subtle-text" data-testid="audit-trail-loading">
                      <span className="material-symbols-outlined animate-spin text-primary align-middle mr-2">progress_activity</span>
                      Loading the audit trail
                    </td>
                  </tr>
                )}
                {!isLoading && events.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-10 text-center" data-testid="audit-trail-empty">
                      <span className="material-symbols-outlined text-5xl text-subtle-text/50 block mb-2">manage_search</span>
                      <p className="font-bold text-text-light dark:text-text-dark">No changes match these filters</p>
                      <p className="text-subtle-text">Widen the date range or clear a filter.</p>
                    </td>
                  </tr>
                )}
                {visible.map((event, index) => {
                  const open = expanded === event.key;
                  const style = AUDIT_ACTION_STYLE[event.action];
                  const path = recordPath(event);
                  const rowId = String(page * PAGE_SIZE + index);
                  return (
                    <Fragment key={event.key}>
                      <tr className="border-t border-border-light dark:border-border-dark hover:bg-primary/5" data-testid={`audit-row-${rowId}`} data-action={event.action} data-entity-id={event.entityId} data-actor={event.actor}>
                        <td className="px-3 py-3">
                          <button type="button" aria-expanded={open}
                            aria-label={open ? 'Hide changes' : 'Show changes'}
                            onClick={() => setExpanded(open ? null : event.key)}
                            disabled={event.changes.length === 0}
                            className="flex size-8 items-center justify-center rounded-full text-subtle-text hover:bg-primary/10 hover:text-primary disabled:opacity-30"
                            data-testid={`audit-row-toggle-${rowId}`}>
                            <span className="material-symbols-outlined">{open ? 'remove_circle_outline' : 'add_circle_outline'}</span>
                          </button>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-text-light dark:text-text-dark">
                          <time dateTime={event.at}>{formatAuditTimestamp(event.at)}</time>
                        </td>
                        <td className="px-4 py-3 font-medium text-text-light dark:text-text-dark">{event.actor}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 font-bold ${style.tone}`}>
                            <span className="material-symbols-outlined text-base">{style.icon}</span>
                            {AUDIT_ACTION_LABELS[event.action]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-text-light dark:text-text-dark">{entityLabel(event.className)}</td>
                        <td className="px-4 py-3 font-mono text-xs">
                          {path ? (
                            <Link to={path} className="text-primary hover:underline" title={event.entityId}>{event.entityId.slice(0, 12)}</Link>
                          ) : (
                            <span className="text-subtle-text" title={event.entityId}>{event.entityId.slice(0, 12)}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-subtle-text">{summariseAuditEvent(event)}</td>
                      </tr>
                      {open && (
                        <tr className="bg-background-light/60 dark:bg-background-dark/60">
                          <td />
                          <td colSpan={6} className="px-4 pb-4">
                            <p className="pt-2 text-xs text-subtle-text">
                              Detailed changes for {entityLabel(event.className).toLowerCase()} {event.entityId}
                              {event.uri && <> · via <span className="font-mono">{event.uri}</span></>}
                            </p>
                            <AuditChangeTable changes={event.changes} testId={`audit-row-changes-${rowId}`} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {events.length > PAGE_SIZE && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-border-light dark:border-border-dark" data-testid="audit-trail-pagination">
              <p className="text-sm text-subtle-text">
                Showing {page * PAGE_SIZE + 1} to {Math.min(events.length, (page + 1) * PAGE_SIZE)} of {events.length} events
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
                  className="h-9 px-3 rounded-lg text-sm font-bold text-text-light dark:text-text-dark hover:bg-primary/10 disabled:opacity-40"
                  data-testid="audit-trail-prev">
                  Previous
                </button>
                <button type="button" onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={page >= pageCount - 1}
                  className="h-9 px-3 rounded-lg text-sm font-bold text-text-light dark:text-text-dark hover:bg-primary/10 disabled:opacity-40"
                  data-testid="audit-trail-next">
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AuditTrailPage;
