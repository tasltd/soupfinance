/**
 * Unit tests for the voucher lifecycle status and the status -> actions
 * matrix (SOUPFIN-156).
 *
 * The backend never sends POSTED: a posted voucher is status APPROVED with a
 * verified ledger transaction. Mocks and older payloads send POSTED, DRAFT and
 * CANCELLED directly. Both shapes must land on the same lifecycle status.
 */
import { describe, it, expect } from 'vitest';
import { voucherLifecycleStatus, voucherActions, type VoucherLifecycleStatus } from '../voucherLifecycle';
import type { Voucher } from '../../../types';

const v = (fields: Record<string, unknown>) => fields as unknown as Voucher;

describe('voucherLifecycleStatus', () => {
  it.each([
    ['PENDING', {}, 'PENDING'],
    ['DRAFT (mock data)', { status: 'DRAFT' }, 'PENDING'],
    ['UPDATED (intermediate ApprovalState)', { status: 'UPDATED' }, 'PENDING'],
    ['CHECKED (intermediate ApprovalState)', { status: 'CHECKED' }, 'PENDING'],
    ['lower-case approved', { status: 'approved' }, 'APPROVED'],
    ['APPROVED, not verified', { status: 'APPROVED', ledgerTransaction: { verifiedTransaction: false } }, 'APPROVED'],
    ['APPROVED with a verified ledger transaction', { status: 'APPROVED', ledgerTransaction: { verifiedTransaction: true } }, 'POSTED'],
    ['APPROVED with top-level verifiedTransaction', { status: 'APPROVED', verifiedTransaction: true }, 'POSTED'],
    ['POSTED (mock data)', { status: 'POSTED' }, 'POSTED'],
    ['REJECTED', { status: 'REJECTED' }, 'REJECTED'],
    ['CANCELLED (older payload)', { status: 'CANCELLED' }, 'CANCELLED'],
  ])('%s', (_label, fields, expected) => {
    expect(voucherLifecycleStatus(v({ status: 'PENDING', ...fields }))).toBe(expected);
  });

  it('treats a missing voucher or status as PENDING', () => {
    expect(voucherLifecycleStatus(undefined)).toBe('PENDING');
    expect(voucherLifecycleStatus(null)).toBe('PENDING');
    expect(voucherLifecycleStatus(v({}))).toBe('PENDING');
  });
});

describe('voucherActions — status to actions matrix', () => {
  const matrix: Record<VoucherLifecycleStatus, string[]> = {
    PENDING: ['edit', 'approve', 'approveAndPost', 'delete'],
    APPROVED: ['post', 'reject'],
    POSTED: [],
    REJECTED: [],
    CANCELLED: [],
  };

  it.each(Object.entries(matrix))('%s offers exactly %j', (status, actions) => {
    expect(voucherActions(status as VoucherLifecycleStatus)).toEqual(actions);
  });

  it('only a PENDING voucher can be edited or deleted', () => {
    const editable = (Object.keys(matrix) as VoucherLifecycleStatus[]).filter((s) => voucherActions(s).includes('edit'));
    const deletable = (Object.keys(matrix) as VoucherLifecycleStatus[]).filter((s) => voucherActions(s).includes('delete'));
    expect(editable).toEqual(['PENDING']);
    expect(deletable).toEqual(['PENDING']);
  });

  it('a posted voucher offers no reject: rejecting it would leave its entries posted', () => {
    expect(voucherActions('POSTED')).not.toContain('reject');
  });
});
