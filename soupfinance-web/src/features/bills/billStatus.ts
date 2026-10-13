/**
 * Bill status badge helpers, shared by the bill list and detail pages.
 *
 * Added (SOUPFIN-183): the badge label goes through `bills:status.<STATUS>`
 * instead of printing the raw enum value ("PARTIAL"), so it is translated.
 */
import type { TFunction } from 'i18next';
import type { BillStatus } from '../../types';

export const BILL_STATUSES: readonly BillStatus[] = ['DRAFT', 'PENDING', 'PARTIAL', 'PAID', 'OVERDUE', 'CANCELLED'];

const STATUS_STYLES: Record<BillStatus, string> = {
  PAID: 'bg-success/10 text-success',
  PARTIAL: 'bg-info/10 text-info',
  PENDING: 'bg-warning/10 text-warning',
  OVERDUE: 'bg-danger/10 text-danger',
  DRAFT: 'bg-subtle-text/10 text-subtle-text',
  CANCELLED: 'bg-subtle-text/10 text-subtle-text',
};

function isBillStatus(status: unknown): status is BillStatus {
  return typeof status === 'string' && (BILL_STATUSES as readonly string[]).includes(status);
}

export function billStatusStyle(status: string | null | undefined): string {
  return isBillStatus(status) ? STATUS_STYLES[status] : STATUS_STYLES.DRAFT;
}

/**
 * Translated label for a bill status. A status the frontend does not know yet
 * (a new backend enum value) is shown as sent rather than as a missing key.
 * Bill.status is derived and nullable on the backend; a null stays blank, as
 * it was before, rather than claiming a state the bill is not in.
 */
export function billStatusLabel(t: TFunction<'bills'>, status: string | null | undefined): string {
  if (isBillStatus(status)) return t(`status.${status}`);
  return status ?? '';
}
