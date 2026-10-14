/**
 * Added (SOUPFIN-184): the bill lifecycle rules every bill page reads.
 *
 * `today` is passed explicitly so OVERDUE does not depend on the machine clock.
 */
import { describe, it, expect } from 'vitest';
import {
  canEditBill,
  getBillDisplayStatus,
  getBillStatusStyle,
  getVoidBlockReason,
  isDraftBill,
  UNKNOWN_STATUS_STYLE,
} from '../billStatus';
import type { Bill } from '../../../types';

const TODAY = '2026-10-14';

function bill(overrides: Partial<Bill> = {}): Bill {
  return {
    id: 'bill-1',
    billDate: '2026-10-01',
    paymentDate: '2026-11-01',
    status: 'PENDING',
    totalAmount: 1000,
    amountPaid: 0,
    amountDue: 1000,
    ...overrides,
  } as Bill;
}

describe('getBillDisplayStatus', () => {
  it('shows a posted, unpaid bill that is not yet due as PENDING', () => {
    expect(getBillDisplayStatus(bill(), TODAY)).toBe('PENDING');
  });

  it('shows PARTIAL and PAID as the backend derived them', () => {
    expect(getBillDisplayStatus(bill({ status: 'PARTIAL', amountPaid: 400, amountDue: 600 }), TODAY)).toBe('PARTIAL');
    expect(getBillDisplayStatus(bill({ status: 'PAID', amountPaid: 1000, amountDue: 0 }), TODAY)).toBe('PAID');
  });

  it('marks an unpaid balance past its due date OVERDUE', () => {
    expect(getBillDisplayStatus(bill({ paymentDate: '2026-10-13' }), TODAY)).toBe('OVERDUE');
    expect(getBillDisplayStatus(bill({ status: 'PARTIAL', paymentDate: '2026-01-01', amountDue: 1 }), TODAY)).toBe('OVERDUE');
  });

  it('does not mark a bill due today OVERDUE', () => {
    expect(getBillDisplayStatus(bill({ paymentDate: TODAY }), TODAY)).toBe('PENDING');
  });

  it('reads a full ISO due date by its calendar day', () => {
    expect(getBillDisplayStatus(bill({ paymentDate: `${TODAY}T23:59:59Z` }), TODAY)).toBe('PENDING');
    expect(getBillDisplayStatus(bill({ paymentDate: '2026-10-13T00:00:00Z' }), TODAY)).toBe('OVERDUE');
  });

  it('never marks a bill with nothing owed OVERDUE', () => {
    expect(getBillDisplayStatus(bill({ paymentDate: '2020-01-01', amountDue: 0 }), TODAY)).toBe('PENDING');
    expect(getBillDisplayStatus(bill({ status: 'PAID', paymentDate: '2020-01-01', amountDue: 0 }), TODAY)).toBe('PAID');
  });

  it('treats a missing due date or missing balance as not overdue', () => {
    expect(getBillDisplayStatus(bill({ paymentDate: undefined }), TODAY)).toBe('PENDING');
    expect(getBillDisplayStatus(bill({ paymentDate: '2020-01-01', amountDue: undefined }), TODAY)).toBe('PENDING');
  });

  it('derives a null status the way the backend would (never-updated bill)', () => {
    expect(getBillDisplayStatus(bill({ status: null }), TODAY)).toBe('PENDING');
    expect(getBillDisplayStatus(bill({ status: null, amountPaid: 250, amountDue: 750 }), TODAY)).toBe('PARTIAL');
    expect(getBillDisplayStatus(bill({ status: null, amountPaid: 1000, amountDue: 0 }), TODAY)).toBe('PAID');
    expect(getBillDisplayStatus(bill({ status: undefined, paymentDate: '2020-01-01' }), TODAY)).toBe('OVERDUE');
  });

  it('does not call a zero-total bill with no payments PAID', () => {
    expect(getBillDisplayStatus(bill({ status: null, totalAmount: 0, amountDue: 0 }), TODAY)).toBe('PENDING');
  });

  it('lets postingStatus win over any payment status', () => {
    expect(getBillDisplayStatus(bill({ postingStatus: 'DRAFT', status: null }), TODAY)).toBe('DRAFT');
    expect(getBillDisplayStatus(bill({ postingStatus: 'DRAFT', paymentDate: '2020-01-01' }), TODAY)).toBe('DRAFT');
    expect(getBillDisplayStatus(bill({ postingStatus: 'CANCELLED', status: 'PARTIAL' }), TODAY)).toBe('CANCELLED');
    expect(getBillDisplayStatus(bill({ postingStatus: 'POSTED' }), TODAY)).toBe('PENDING');
  });

  it('passes an unrecognised backend status through instead of relabelling it', () => {
    expect(getBillDisplayStatus(bill({ status: 'PROCESSING' }), TODAY)).toBe('PROCESSING');
    expect(getBillDisplayStatus(bill({ status: 'FAILED' }), TODAY)).toBe('FAILED');
  });

  it('handles a very large balance and a far-past due date', () => {
    const huge = bill({ totalAmount: 9_999_999_999.99, amountDue: 9_999_999_999.99, paymentDate: '1970-01-01' });
    expect(getBillDisplayStatus(huge, TODAY)).toBe('OVERDUE');
  });
});

describe('canEditBill / isDraftBill', () => {
  it.each([
    ['DRAFT', true, true],
    ['PENDING', true, false],
    ['PARTIAL', true, false],
    ['OVERDUE', true, false],
    ['PAID', false, false],
    ['CANCELLED', false, false],
    ['PROCESSING', true, false],
  ])('%s: editable=%s, draft=%s', (status, editable, draft) => {
    expect(canEditBill(status)).toBe(editable);
    expect(isDraftBill(status)).toBe(draft);
  });
});

describe('getVoidBlockReason', () => {
  it('allows voiding a posted bill with no payments', () => {
    expect(getVoidBlockReason(bill(), 'PENDING')).toBeNull();
    expect(getVoidBlockReason(bill({ paymentDate: '2020-01-01' }), 'OVERDUE')).toBeNull();
  });

  it('refuses a draft: there is nothing posted to reverse', () => {
    expect(getVoidBlockReason(bill({ postingStatus: 'DRAFT' }), 'DRAFT')).toBe('draft');
  });

  it('refuses a closed bill', () => {
    expect(getVoidBlockReason(bill({ status: 'PAID' }), 'PAID')).toBe('closed');
    expect(getVoidBlockReason(bill({ postingStatus: 'CANCELLED' }), 'CANCELLED')).toBe('closed');
  });

  it('refuses a bill that has any payment, however small', () => {
    expect(getVoidBlockReason(bill({ amountPaid: 0.01 }), 'PARTIAL')).toBe('has-payments');
  });
});

describe('getBillStatusStyle', () => {
  it('styles each lifecycle status', () => {
    expect(getBillStatusStyle('PAID')).toContain('bg-success');
    expect(getBillStatusStyle('OVERDUE')).toContain('bg-danger');
    expect(getBillStatusStyle('CANCELLED')).toContain('line-through');
  });

  it('gives an unknown status a neutral style that is not the draft style', () => {
    expect(getBillStatusStyle('PROCESSING')).toBe(UNKNOWN_STATUS_STYLE);
    expect(getBillStatusStyle('PROCESSING')).not.toBe(getBillStatusStyle('DRAFT'));
  });
});
