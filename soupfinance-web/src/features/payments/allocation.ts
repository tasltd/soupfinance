/**
 * Payment allocation maths (SOUPFIN-178).
 *
 * One payment is spread across several open invoices (money in) or bills
 * (money out). Everything here is pure so the page and its tests share one
 * source of truth.
 *
 * Amounts are worked in integer cents. Adding 0.1 + 0.2 in floats gives
 * 0.30000000000000004, and over enough lines that drift either blocks a valid
 * allocation as "over-allocated" or leaves a phantom 0.01 unapplied.
 */
import type { Invoice, Bill } from '../../types';

/** An invoice or bill reduced to what allocation needs. */
export interface AllocatableDoc {
  id: string;
  /** Number shown to the user, e.g. "1042" or "BILL-2026-014". */
  label: string;
  /** yyyy-MM-dd due date (the backend's `paymentDate`); '' when unknown. */
  dueDate: string;
  totalAmount: number;
  amountDue: number;
  /** Numeric tie-break when two documents fall due on the same day. */
  sortNumber: number;
  /** AccountServices id (invoices) or vendor id (bills) the document belongs to. */
  partyId: string;
}

/** documentId -> amount to apply (in currency units, 2 dp). */
export type Allocations = Record<string, number>;

export const toCents = (value: number): number => Math.round((Number(value) || 0) * 100);
export const fromCents = (cents: number): number => cents / 100;

/** Statuses that can never take another payment. */
const CLOSED_STATUSES = new Set(['PAID', 'CANCELLED']);

function dueDateOf(value?: string): string {
  return (value || '').slice(0, 10);
}

export function invoiceToDoc(invoice: Invoice): AllocatableDoc {
  return {
    id: invoice.id,
    label: `${invoice.numberPrefix ?? ''}${invoice.number ?? ''}` || invoice.id,
    dueDate: dueDateOf(invoice.paymentDate),
    totalAmount: invoice.totalAmount ?? 0,
    amountDue: invoice.amountDue ?? 0,
    sortNumber: Number(invoice.number) || 0,
    partyId: invoice.accountServices?.id ?? '',
  };
}

export function billToDoc(bill: Bill): AllocatableDoc {
  // `billNumber` is the display name the type promises, but the list endpoint
  // sends `number` (SOUPFIN-249), so fall back to it.
  const label = bill.billNumber || (bill.number !== undefined ? String(bill.number) : '') || bill.id;
  return {
    id: bill.id,
    label,
    dueDate: dueDateOf(bill.paymentDate),
    totalAmount: bill.totalAmount ?? 0,
    amountDue: bill.amountDue ?? 0,
    sortNumber: Number(String(bill.number ?? bill.billNumber ?? '').replace(/\D/g, '')) || 0,
    partyId: bill.vendor?.id ?? '',
  };
}

/** True when a document still has a balance and is not closed. */
export function isOpen(doc: { amountDue?: number; status?: string | null }): boolean {
  return toCents(doc.amountDue ?? 0) > 0 && !CLOSED_STATUSES.has(String(doc.status ?? ''));
}

/**
 * Oldest due date first; undated documents last; then by document number.
 * Returns a new array.
 */
export function sortByDueDate(docs: AllocatableDoc[]): AllocatableDoc[] {
  return [...docs].sort((a, b) => {
    if (a.dueDate !== b.dueDate) {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate < b.dueDate ? -1 : 1;
    }
    return a.sortNumber - b.sortNumber;
  });
}

/**
 * FIFO: pay the oldest due document in full, then the next, until the payment
 * runs out. Documents that receive nothing are left out of the result.
 */
export function allocateFIFO(docs: AllocatableDoc[], paymentAmount: number): Allocations {
  const result: Allocations = {};
  let remaining = toCents(paymentAmount);
  for (const doc of sortByDueDate(docs)) {
    if (remaining <= 0) break;
    const due = toCents(doc.amountDue);
    if (due <= 0) continue;
    const apply = Math.min(due, remaining);
    result[doc.id] = fromCents(apply);
    remaining -= apply;
  }
  return result;
}

export interface AllocationSummary {
  paymentAmount: number;
  allocated: number;
  /** Payment not applied to any document. Never negative. */
  unapplied: number;
  /** Amount by which the lines exceed the payment. 0 when not over-allocated. */
  overAllocatedBy: number;
  /** Balance left on the listed documents after this payment. */
  remainingOnDocs: number;
  /** documentId -> why that line cannot be saved. */
  lineErrors: Record<string, string>;
  /** Documents that receive a positive amount. */
  allocatedCount: number;
}

export function summariseAllocation(
  docs: AllocatableDoc[],
  allocations: Allocations,
  paymentAmount: number
): AllocationSummary {
  const lineErrors: Record<string, string> = {};
  let allocatedCents = 0;
  let dueCents = 0; // still owed on the listed documents after this payment
  let allocatedCount = 0;

  for (const doc of docs) {
    const due = toCents(doc.amountDue);
    const raw = allocations[doc.id];
    const cents = raw === undefined ? 0 : toCents(raw);
    // Per line, so one over-filled line does not hide what another still owes
    dueCents += Math.max(0, due - Math.max(0, cents));
    if (raw === undefined) continue;
    if (!Number.isFinite(Number(raw)) || cents < 0) {
      lineErrors[doc.id] = 'Enter an amount of zero or more';
      continue;
    }
    if (cents > due) {
      lineErrors[doc.id] = 'More than the balance due';
    }
    if (cents > 0) allocatedCount += 1;
    allocatedCents += cents;
  }

  const paymentCents = toCents(paymentAmount);
  return {
    paymentAmount: fromCents(paymentCents),
    allocated: fromCents(allocatedCents),
    unapplied: fromCents(Math.max(0, paymentCents - allocatedCents)),
    overAllocatedBy: fromCents(Math.max(0, allocatedCents - paymentCents)),
    remainingOnDocs: fromCents(dueCents),
    lineErrors,
    allocatedCount,
  };
}

/**
 * Amount a newly ticked line should take: its balance, capped at what the
 * payment still has left. Never negative.
 */
export function amountForTickedLine(
  doc: AllocatableDoc,
  allocations: Allocations,
  paymentAmount: number
): number {
  let usedCents = 0;
  for (const [id, value] of Object.entries(allocations)) {
    if (id !== doc.id) usedCents += Math.max(0, toCents(value));
  }
  const left = Math.max(0, toCents(paymentAmount) - usedCents);
  return fromCents(Math.min(toCents(doc.amountDue), left));
}

/** The lines to send: positive amounts only, in due-date order, 2 dp. */
export function toAllocationLines(
  docs: AllocatableDoc[],
  allocations: Allocations
): Array<{ id: string; amount: number }> {
  return sortByDueDate(docs)
    .map((doc) => ({ id: doc.id, amount: fromCents(toCents(allocations[doc.id] ?? 0)) }))
    .filter((line) => toCents(line.amount) > 0);
}
