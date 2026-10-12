/**
 * Added (SOUPFIN-159): "History" panel for a journal entry or voucher.
 *
 * Lists who created, edited, approved, posted and reversed the record, newest
 * first, from the backend audit log. Each event can be opened to show the
 * field changes it made. Reference: soupfinance-designs/audit-trail-log/ and
 * the vertical timeline in soupfinance-designs/invoice-approval-workflow/.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AUDIT_ACTION_LABELS,
  entityLabel,
  getEntityHistory,
  summariseAuditEvent,
} from '../../api/endpoints/auditTrail';
import { parseApiError } from '../../api/errors';
import type { AuditAction, AuditEntityRef, AuditEvent } from '../../types/auditTrail';
import { AuditChangeTable } from './AuditChangeTable';
import { formatAuditTimestamp } from './formatAuditTimestamp';

/** Icon and colour per action, so posting and reversing read apart at a glance. */
export const AUDIT_ACTION_STYLE: Record<AuditAction, { icon: string; tone: string }> = {
  CREATED: { icon: 'add_circle', tone: 'text-blue-600 dark:text-blue-400' },
  EDITED: { icon: 'edit', tone: 'text-subtle-text' },
  APPROVED: { icon: 'task_alt', tone: 'text-green-600 dark:text-green-400' },
  POSTED: { icon: 'check_circle', tone: 'text-green-600 dark:text-green-400' },
  REVERSED: { icon: 'undo', tone: 'text-orange-600 dark:text-orange-400' },
  CANCELLED: { icon: 'cancel', tone: 'text-orange-600 dark:text-orange-400' },
  ARCHIVED: { icon: 'inventory_2', tone: 'text-subtle-text' },
  DELETED: { icon: 'delete', tone: 'text-danger' },
};

interface AuditHistoryPanelProps {
  /** The record and any child records whose changes belong to its history. */
  entities: AuditEntityRef[];
  /** Prefix for data-testid attributes. */
  testId?: string;
}

export function AuditHistoryPanel({ entities, testId = 'audit-history' }: AuditHistoryPanelProps) {
  const ids = entities.map((e) => e.id).filter(Boolean);
  const { data: events, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['audit-history', ...ids],
    queryFn: () => getEntityHistory(entities),
    enabled: ids.length > 0,
    // Posting or reversing elsewhere must show up the next time the page opens.
    staleTime: 0,
  });

  // Only the record itself is named; its lines are part of its story.
  const showRecordType = new Set(events?.map((e) => e.entityType)).size > 1;

  return (
    <section
      className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden"
      data-testid={testId}
      aria-labelledby={`${testId}-heading`}
    >
      <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-border-light dark:border-border-dark">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">history</span>
          <h2 id={`${testId}-heading`} className="text-lg font-bold text-text-light dark:text-text-dark">
            History
          </h2>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1 h-9 px-3 rounded-lg text-sm font-bold text-primary hover:bg-primary/10 disabled:opacity-50"
          data-testid={`${testId}-refresh`}
        >
          <span className={`material-symbols-outlined text-base ${isFetching ? 'animate-spin' : ''}`}>refresh</span>
          Refresh
        </button>
      </div>

      <div className="p-6">
        {isLoading && (
          <p className="flex items-center gap-2 text-sm text-subtle-text" data-testid={`${testId}-loading`}>
            <span className="material-symbols-outlined animate-spin text-base text-primary">progress_activity</span>
            Loading history
          </p>
        )}

        {error && <HistoryError error={error} testId={testId} />}

        {!isLoading && !error && events?.length === 0 && (
          <p className="text-sm text-subtle-text" data-testid={`${testId}-empty`}>
            No changes have been recorded for this entry yet.
          </p>
        )}

        {events && events.length > 0 && (
          <ol className="flex flex-col" data-testid={`${testId}-list`}>
            {events.map((event, index) => (
              <HistoryItem
                key={event.key}
                event={event}
                last={index === events.length - 1}
                showRecordType={showRecordType}
                testId={`${testId}-event-${index}`}
              />
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

function HistoryError({ error, testId }: { error: unknown; testId: string }) {
  const parsed = parseApiError(error);
  return (
    <div className="flex items-start gap-3 text-sm" data-testid={`${testId}-error`} data-error-kind={parsed.kind}>
      <span className="material-symbols-outlined text-danger">error</span>
      <div>
        <p className="font-bold text-text-light dark:text-text-dark">The history could not be loaded</p>
        <p className="text-subtle-text">{parsed.message}</p>
      </div>
    </div>
  );
}

interface HistoryItemProps {
  event: AuditEvent;
  last: boolean;
  showRecordType: boolean;
  testId: string;
}

function HistoryItem({ event, last, showRecordType, testId }: HistoryItemProps) {
  const [open, setOpen] = useState(false);
  const style = AUDIT_ACTION_STYLE[event.action];
  const label = AUDIT_ACTION_LABELS[event.action];

  return (
    <li className="grid grid-cols-[32px_1fr] gap-x-3" data-testid={testId} data-action={event.action}>
      <div className="flex flex-col items-center">
        <span className={`material-symbols-outlined ${style.tone}`}>{style.icon}</span>
        {!last && <span className="w-[2px] grow bg-border-light dark:bg-border-dark" aria-hidden="true" />}
      </div>
      <div className={last ? '' : 'pb-5'}>
        <p className="text-sm text-text-light dark:text-text-dark">
          <span className={`font-bold ${style.tone}`} data-testid={`${testId}-action`}>{label}</span>
          {showRecordType && <span className="text-subtle-text"> · {entityLabel(event.className)}</span>}
          {' by '}
          <span className="font-bold" data-testid={`${testId}-actor`}>{event.actor}</span>
        </p>
        <p className="text-xs text-subtle-text">
          <time dateTime={event.at} data-testid={`${testId}-time`}>{formatAuditTimestamp(event.at)}</time>
          {' · '}
          {summariseAuditEvent(event)}
        </p>
        {event.changes.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="mt-1 flex items-center gap-1 text-xs font-bold text-primary hover:underline"
              data-testid={`${testId}-toggle`}
            >
              <span className="material-symbols-outlined text-base">{open ? 'expand_less' : 'expand_more'}</span>
              {open ? 'Hide changes' : `Show ${event.changes.length} ${event.changes.length === 1 ? 'change' : 'changes'}`}
            </button>
            {open && <AuditChangeTable changes={event.changes} testId={`${testId}-changes`} />}
          </>
        )}
      </div>
    </li>
  );
}
