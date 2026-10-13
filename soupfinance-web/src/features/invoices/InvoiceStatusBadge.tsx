/**
 * Invoice status badge
 *
 * Added (SOUPFIN-167): the list and detail pages each kept their own copy of the
 * colour map and rendered the raw backend enum ("PAID", "OVERDUE"), so German,
 * French and Dutch users read English capitals. One badge now owns both the
 * colour and the translated label.
 */
import { useTranslation } from 'react-i18next';

type StatusKey =
  | 'status.draft'
  | 'status.pending'
  | 'status.sent'
  | 'status.viewed'
  | 'status.partial'
  | 'status.paid'
  | 'status.overdue'
  | 'status.cancelled';

const STATUS_LABEL_KEYS: Record<string, StatusKey> = {
  DRAFT: 'status.draft',
  PENDING: 'status.pending',
  SENT: 'status.sent',
  VIEWED: 'status.viewed',
  PARTIAL: 'status.partial',
  PAID: 'status.paid',
  OVERDUE: 'status.overdue',
  CANCELLED: 'status.cancelled',
};

const STATUS_STYLES: Record<string, string> = {
  PAID: 'bg-success/10 text-success',
  SENT: 'bg-info/10 text-info',
  VIEWED: 'bg-info/10 text-info',
  PENDING: 'bg-warning/10 text-warning',
  PARTIAL: 'bg-warning/10 text-warning',
  OVERDUE: 'bg-danger/10 text-danger',
  DRAFT: 'bg-subtle-text/10 text-subtle-text',
  CANCELLED: 'bg-subtle-text/10 text-subtle-text',
};

function getInvoiceStatusStyle(status: string): string {
  return STATUS_STYLES[status] || STATUS_STYLES.DRAFT;
}

interface InvoiceStatusBadgeProps {
  /** Backend enum value; a missing status is treated as DRAFT. */
  status?: string | null;
  'data-testid'?: string;
}

export function InvoiceStatusBadge({ status, 'data-testid': testId }: InvoiceStatusBadgeProps) {
  const { t } = useTranslation('invoices');
  const value = status || 'DRAFT';
  const key = STATUS_LABEL_KEYS[value];
  return (
    <span
      className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${getInvoiceStatusStyle(value)}`}
      data-status={value}
      data-testid={testId}
    >
      {/* A status the backend adds later still shows, untranslated, rather than blank */}
      {key ? t(key) : value}
    </span>
  );
}
