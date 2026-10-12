/**
 * Added (SOUPFIN-159): an audit timestamp in the reader's own time zone.
 * The backend sends UTC ("2026-10-12T17:20:05Z"); an unparseable value is shown as sent.
 */
import { format } from 'date-fns';

export function formatAuditTimestamp(value: string): string {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return value || '—';
  return format(date, 'd MMM yyyy, HH:mm');
}
