/**
 * Added (SOUPFIN-156): where a voucher is in its lifecycle, and what the user
 * may do with it there.
 *
 * The backend Voucher has no POSTED or CANCELLED status. `Voucher.status` is
 * an ApprovalState (PENDING, APPROVED, REJECTED, ...), set by saving a
 * VoucherApproval. Posting does not change it: VoucherService.doPost marks the
 * embedded LedgerTransaction `verifiedTransaction = true`. So a posted voucher
 * arrives as status APPROVED with a verified ledger transaction, and this
 * module folds the two into one lifecycle status.
 *
 * The frontend mocks and older code also send POSTED, CANCELLED and DRAFT
 * directly, so those are read as well.
 */
import type { Voucher } from '../../types';

export type VoucherLifecycleStatus = 'PENDING' | 'APPROVED' | 'POSTED' | 'REJECTED' | 'CANCELLED';

export type VoucherAction = 'edit' | 'approve' | 'approveAndPost' | 'post' | 'reject' | 'delete';

type Loose = Record<string, unknown>;

function isVerified(voucher: Voucher): boolean {
  const v = voucher as unknown as Loose;
  const lt = (v.ledgerTransaction ?? {}) as Loose;
  return v.verifiedTransaction === true || lt.verifiedTransaction === true;
}

export function voucherLifecycleStatus(voucher: Voucher | null | undefined): VoucherLifecycleStatus {
  if (!voucher) return 'PENDING';
  const status = String(voucher.status ?? '').toUpperCase();
  if (status === 'POSTED' || isVerified(voucher)) return 'POSTED';
  if (status === 'REJECTED') return 'REJECTED';
  if (status === 'CANCELLED' || status === 'REVERSED') return 'CANCELLED';
  if (status === 'APPROVED') return 'APPROVED';
  // PENDING, DRAFT (mock data) and the intermediate ApprovalStates
  // (UPDATED, CHECKED) are all still open for editing and approval.
  return 'PENDING';
}

/**
 * The status -> actions matrix. Every action here maps to an endpoint the
 * backend has:
 * - edit:           PUT /rest/voucher/update/:id.json (blocked once approved)
 * - approve:        POST /rest/voucherApproval/save.json, approvalState APPROVED
 * - approveAndPost: approve, then POST /rest/voucher/post/:id.json, because
 *                   doPost refuses a voucher that is not APPROVED
 * - post:           POST /rest/voucher/post/:id.json
 * - reject:         POST /rest/voucherApproval/save.json, approvalState REJECTED
 * - delete:         DELETE /rest/voucher/delete/:id.json
 *
 * A posted voucher has no action: the backend has no cancel or reverse for a
 * voucher, and rejecting it would leave its ledger entries posted. See
 * plans/soupfin-156-voucher-reversal-backend.md.
 */
const ACTIONS_BY_STATUS: Record<VoucherLifecycleStatus, VoucherAction[]> = {
  PENDING: ['edit', 'approve', 'approveAndPost', 'delete'],
  APPROVED: ['post', 'reject'],
  POSTED: [],
  REJECTED: [],
  CANCELLED: [],
};

export function voucherActions(status: VoucherLifecycleStatus): VoucherAction[] {
  return ACTIONS_BY_STATUS[status];
}

export const VOUCHER_STATUS_LABELS: Record<VoucherLifecycleStatus, string> = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  POSTED: 'Posted',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};
