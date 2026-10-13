/**
 * Bill lifecycle: what status to show and which actions a bill allows.
 *
 * Added (SOUPFIN-184). The PRD lifecycle is
 *
 *   DRAFT -> PENDING -> PARTIAL/PAID -> OVERDUE
 *                    \-> CANCELLED
 *
 * but the backend stores only part of it (checked on the LXC backend 2026-10-13):
 *  - `Bill.status` is a `PaymentStatus` the backend DERIVES from payments and
 *    will not accept from a client. Rows read PENDING, PARTIAL, PAID or null;
 *    null is a bill never updated since it was created.
 *  - OVERDUE is not stored anywhere. It is an unpaid balance past its due date,
 *    the same rule the backend's aging buckets use.
 *  - DRAFT and CANCELLED need the planned `postingStatus` field
 *    (`plans/soupfin-184-bill-lifecycle.html`). Until it ships every saved bill
 *    is posted, and those two states never appear.
 *
 * Every page reads the lifecycle through this module so the list, the detail
 * page, the edit form and the PDF cannot disagree.
 */
import type { Bill, BillStatus } from '../../types';
import { getTodayIsoDate } from '../../utils/date';

type BillLike = Pick<Bill, 'status' | 'postingStatus' | 'paymentDate' | 'amountDue' | 'amountPaid' | 'totalAmount'>;

/** A status this module recognises, or the raw backend string it does not. */
export type BillDisplayStatus = BillStatus | (string & {});

const DISPLAY_STATUSES: readonly BillStatus[] = ['DRAFT', 'PENDING', 'PARTIAL', 'PAID', 'OVERDUE', 'CANCELLED'];

function isDisplayStatus(value: string): value is BillStatus {
  return (DISPLAY_STATUSES as readonly string[]).includes(value);
}

/** Positive balance still owed. Missing amounts count as nothing owed. */
function hasBalance(bill: BillLike): boolean {
  return (bill.amountDue ?? 0) > 0;
}

/** Due date strictly before `today`. Both are `YYYY-MM-DD`, so strings compare as dates. */
function isPastDue(bill: BillLike, today: string): boolean {
  const due = bill.paymentDate?.slice(0, 10);
  return !!due && due < today;
}

/**
 * The lifecycle status to show for a bill.
 *
 * @param today local calendar day as `YYYY-MM-DD`; injectable so tests can pin it.
 */
export function getBillDisplayStatus(bill: BillLike, today: string = getTodayIsoDate()): BillDisplayStatus {
  if (bill.postingStatus === 'CANCELLED') return 'CANCELLED';
  if (bill.postingStatus === 'DRAFT') return 'DRAFT';

  const raw = bill.status ?? null;

  if (raw === 'PAID') return 'PAID';

  if (raw === null || raw === 'PENDING' || raw === 'PARTIAL') {
    // null: the backend has not run getCheckStatus() yet. Apply its rule here.
    let payment: BillStatus = raw ?? 'PENDING';
    if (raw === null) {
      const paid = bill.amountPaid ?? 0;
      const total = bill.totalAmount ?? 0;
      if (total > 0 && paid >= total) payment = 'PAID';
      else if (paid > 0) payment = 'PARTIAL';
    }
    if (payment !== 'PAID' && hasBalance(bill) && isPastDue(bill, today)) return 'OVERDUE';
    return payment;
  }

  // PROCESSING / FAILED / EXPIRED, or a display value an older caller already
  // put on the bill. Show it as sent; never relabel it as DRAFT.
  return raw;
}

/** PAID and CANCELLED bills are closed. Editing either would rewrite posted history. */
export function canEditBill(status: BillDisplayStatus): boolean {
  return status !== 'PAID' && status !== 'CANCELLED';
}

/** True while the bill is a draft that has not been submitted. */
export function isDraftBill(status: BillDisplayStatus): boolean {
  return status === 'DRAFT';
}

export type VoidBlockReason = 'draft' | 'closed' | 'has-payments';

/**
 * Why a bill cannot be voided, or `null` when it can.
 *
 * - A draft was never posted, so there is nothing to reverse: delete it instead.
 * - A paid or already cancelled bill is closed.
 * - A bill with payments must have them voided first, or the reversal would
 *   leave payments against a bill that no longer owes anything.
 */
export function getVoidBlockReason(bill: BillLike, status: BillDisplayStatus): VoidBlockReason | null {
  if (status === 'DRAFT') return 'draft';
  if (status === 'PAID' || status === 'CANCELLED') return 'closed';
  if ((bill.amountPaid ?? 0) > 0) return 'has-payments';
  return null;
}

const STATUS_STYLES: Record<BillStatus, string> = {
  PAID: 'bg-success/10 text-success',
  PARTIAL: 'bg-info/10 text-info',
  PENDING: 'bg-warning/10 text-warning',
  OVERDUE: 'bg-danger/10 text-danger',
  DRAFT: 'bg-subtle-text/10 text-subtle-text',
  CANCELLED: 'bg-subtle-text/10 text-subtle-text line-through',
};

/** Badge classes for an unrecognised backend status: neutral, and visibly not a draft. */
export const UNKNOWN_STATUS_STYLE = 'bg-text-light/10 text-text-light dark:bg-text-dark/10 dark:text-text-dark';

export function getBillStatusStyle(status: BillDisplayStatus): string {
  return isDisplayStatus(status) ? STATUS_STYLES[status] : UNKNOWN_STATUS_STYLE;
}
