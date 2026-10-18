/**
 * SOUPFIN-178: allocation maths for one payment across many invoices or bills.
 */
import { describe, it, expect } from 'vitest';
import {
  allocateFIFO,
  amountForTickedLine,
  billToDoc,
  invoiceToDoc,
  isOpen,
  sortByDueDate,
  summariseAllocation,
  toAllocationLines,
  type AllocatableDoc,
} from '../allocation';
import type { Bill, Invoice } from '../../../types';

function doc(id: string, dueDate: string, amountDue: number, sortNumber = 0): AllocatableDoc {
  return { id, label: id, dueDate, totalAmount: amountDue, amountDue, sortNumber, partyId: 'as-1' };
}

describe('sortByDueDate', () => {
  it('puts the oldest due date first and undated documents last', () => {
    const sorted = sortByDueDate([
      doc('c', '2026-03-01', 1),
      doc('none', '', 1),
      doc('a', '2026-01-15', 1),
      doc('b', '2026-02-01', 1),
    ]);
    expect(sorted.map((d) => d.id)).toEqual(['a', 'b', 'c', 'none']);
  });

  it('breaks a same-day tie by document number, and does not mutate its input', () => {
    const input = [doc('n12', '2026-01-15', 1, 12), doc('n3', '2026-01-15', 1, 3)];
    expect(sortByDueDate(input).map((d) => d.id)).toEqual(['n3', 'n12']);
    expect(input.map((d) => d.id)).toEqual(['n12', 'n3']);
  });
});

describe('allocateFIFO', () => {
  const docs = [doc('inv-3', '2026-02-01', 1000), doc('inv-1', '2026-01-15', 3000), doc('inv-2', '2026-01-20', 2500)];

  it('pays the oldest invoice in full, then the next, until the money runs out', () => {
    expect(allocateFIFO(docs, 5000)).toEqual({ 'inv-1': 3000, 'inv-2': 2000 });
  });

  it('pays everything and leaves the excess out when the payment is larger than the total due', () => {
    expect(allocateFIFO(docs, 9000)).toEqual({ 'inv-1': 3000, 'inv-2': 2500, 'inv-3': 1000 });
  });

  it('returns nothing for a zero, negative or missing payment', () => {
    expect(allocateFIFO(docs, 0)).toEqual({});
    expect(allocateFIFO(docs, -50)).toEqual({});
    expect(allocateFIFO(docs, Number.NaN)).toEqual({});
    expect(allocateFIFO([], 500)).toEqual({});
  });

  it('skips documents with nothing due', () => {
    expect(allocateFIFO([doc('paid', '2026-01-01', 0), doc('open', '2026-02-01', 40)], 100)).toEqual({ open: 40 });
  });

  it('never drifts by a cent across many fractional lines', () => {
    const many = Array.from({ length: 30 }, (_, i) => doc(`d${i}`, `2026-01-${String(i + 1).padStart(2, '0')}`, 0.1));
    const result = allocateFIFO(many, 3);
    expect(Object.keys(result)).toHaveLength(30);
    expect(summariseAllocation(many, result, 3)).toMatchObject({ allocated: 3, unapplied: 0, overAllocatedBy: 0 });
  });

  it('handles 1,000 invoices and seven-figure amounts', () => {
    const many = Array.from({ length: 1000 }, (_, i) => doc(`d${i}`, '2026-01-01', 1_234_567.89, i));
    const payment = 1_234_567.89 * 400 + 100;
    const result = allocateFIFO(many, payment);
    expect(Object.keys(result)).toHaveLength(401);
    expect(result.d0).toBe(1_234_567.89);
    expect(result.d399).toBe(1_234_567.89);
    expect(result.d400).toBe(100);
    expect(summariseAllocation(many, result, payment)).toMatchObject({ unapplied: 0, overAllocatedBy: 0 });
  });
});

describe('summariseAllocation', () => {
  const docs = [doc('a', '2026-01-01', 300), doc('b', '2026-02-01', 200)];

  it('reports allocated, unapplied and what stays due', () => {
    expect(summariseAllocation(docs, { a: 300, b: 100 }, 500)).toEqual({
      paymentAmount: 500,
      allocated: 400,
      unapplied: 100,
      overAllocatedBy: 0,
      remainingOnDocs: 100,
      lineErrors: {},
      allocatedCount: 2,
    });
  });

  it('flags over-allocation by the exact excess', () => {
    const summary = summariseAllocation(docs, { a: 300, b: 200 }, 450);
    expect(summary.overAllocatedBy).toBe(50);
    expect(summary.unapplied).toBe(0);
  });

  it('counts what each document still owes, so an over-filled line does not cancel another', () => {
    // a is over-filled by 50; b still owes 150
    expect(summariseAllocation(docs, { a: 350, b: 50 }, 1000).remainingOnDocs).toBe(150);
  });

  it('flags a line above its balance and a negative line', () => {
    const summary = summariseAllocation(docs, { a: 300.01, b: -1 }, 1000);
    expect(summary.lineErrors).toEqual({ a: 'More than the balance due', b: 'Enter an amount of zero or more' });
  });

  it('counts only lines with money on them, and ignores allocations for unknown documents', () => {
    const summary = summariseAllocation(docs, { a: 0, b: 50, stray: 999 }, 50);
    expect(summary.allocatedCount).toBe(1);
    expect(summary.allocated).toBe(50);
  });

  it('is all zeros for no documents and no payment', () => {
    expect(summariseAllocation([], {}, 0)).toMatchObject({ allocated: 0, unapplied: 0, overAllocatedBy: 0, remainingOnDocs: 0 });
  });
});

describe('amountForTickedLine', () => {
  const docs = [doc('a', '2026-01-01', 300), doc('b', '2026-02-01', 200)];

  it('takes the whole balance when the payment has room', () => {
    expect(amountForTickedLine(docs[1], { a: 100 }, 1000)).toBe(200);
  });

  it('takes only what the payment has left', () => {
    expect(amountForTickedLine(docs[1], { a: 300 }, 350)).toBe(50);
  });

  it('takes nothing when the payment is already used up', () => {
    expect(amountForTickedLine(docs[1], { a: 300 }, 300)).toBe(0);
    expect(amountForTickedLine(docs[1], { a: 300 }, 0)).toBe(0);
  });
});

describe('toAllocationLines', () => {
  it('sends positive lines only, in due-date order, rounded to cents', () => {
    const docs = [doc('late', '2026-03-01', 500), doc('early', '2026-01-01', 500), doc('zero', '2026-02-01', 500)];
    expect(toAllocationLines(docs, { late: 10.005, early: 20, zero: 0 })).toEqual([
      { id: 'early', amount: 20 },
      { id: 'late', amount: 10.01 },
    ]);
  });
});

describe('document adapters', () => {
  it('maps an invoice using its due date (paymentDate) and accountServices', () => {
    const invoice = {
      id: 'inv-1',
      number: 1042,
      numberPrefix: 'INV-',
      paymentDate: '2026-03-13T00:00:00Z',
      accountServices: { id: 'as-9' },
      totalAmount: 7475,
      amountDue: 7475,
    } as Invoice;
    expect(invoiceToDoc(invoice)).toEqual({
      id: 'inv-1',
      label: 'INV-1042',
      dueDate: '2026-03-13',
      totalAmount: 7475,
      amountDue: 7475,
      sortNumber: 1042,
      partyId: 'as-9',
    });
  });

  it('labels a bill by `number` when the list response has no billNumber', () => {
    const bill = { id: 'b-1', number: 'BILL-2026-014', vendor: { id: 'v-1' }, paymentDate: '2026-03-08', amountDue: 10 } as unknown as Bill;
    expect(billToDoc(bill)).toMatchObject({ label: 'BILL-2026-014', partyId: 'v-1', sortNumber: 2026014, dueDate: '2026-03-08' });
  });

  it('treats paid, cancelled and zero-balance documents as closed', () => {
    expect(isOpen({ amountDue: 10, status: 'SENT' })).toBe(true);
    expect(isOpen({ amountDue: 10, status: 'PARTIAL' })).toBe(true);
    expect(isOpen({ amountDue: 10, status: 'PAID' })).toBe(false);
    expect(isOpen({ amountDue: 10, status: 'CANCELLED' })).toBe(false);
    expect(isOpen({ amountDue: 0.004 })).toBe(false);
    expect(isOpen({})).toBe(false);
  });
});
