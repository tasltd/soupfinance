/**
 * Added (SOUPFIN-158): pure rules for the opening-balances grid.
 *
 * Amounts are kept as the strings the user typed so an empty cell stays empty;
 * they are parsed here. Totals are summed in cents to keep 0.1 + 0.2 honest.
 */
import type { OpeningBalanceLine } from '../../types/financialYear';

export interface GridAmounts {
  debit: string;
  credit: string;
}

/** Parse a typed amount. Blank is 0; anything else unusable is NaN. */
export function parseAmount(value: string): number {
  const trimmed = value.replace(/,/g, '').trim();
  if (!trimmed) return 0;
  return /^\d+(\.\d{0,2})?$/.test(trimmed) ? Number(trimmed) : Number.NaN;
}

const toCents = (amount: number) => Math.round(amount * 100);

/** Why a row cannot be posted, or null when it can (an empty row is fine). */
export function rowError(amounts: GridAmounts | undefined): string | null {
  if (!amounts) return null;
  const debit = parseAmount(amounts.debit);
  const credit = parseAmount(amounts.credit);
  if (Number.isNaN(debit) || Number.isNaN(credit)) return 'Enter a positive amount with up to 2 decimals.';
  if (debit > 0 && credit > 0) return 'Enter a debit or a credit, not both.';
  return null;
}

export interface GridTotals {
  totalDebit: number;
  totalCredit: number;
  /** Debits minus credits. Positive means credits are short. */
  difference: number;
  balanced: boolean;
  /** Rows with an amount in them. */
  lineCount: number;
  /** Rows that fail rowError(). */
  invalidCount: number;
}

export function gridTotals(rows: Record<string, GridAmounts>): GridTotals {
  let debitCents = 0;
  let creditCents = 0;
  let lineCount = 0;
  let invalidCount = 0;
  for (const amounts of Object.values(rows)) {
    if (rowError(amounts)) {
      invalidCount++;
      continue;
    }
    const debit = toCents(parseAmount(amounts.debit));
    const credit = toCents(parseAmount(amounts.credit));
    if (debit > 0 || credit > 0) lineCount++;
    debitCents += debit;
    creditCents += credit;
  }
  return {
    totalDebit: debitCents / 100,
    totalCredit: creditCents / 100,
    difference: (debitCents - creditCents) / 100,
    balanced: debitCents === creditCents,
    lineCount,
    invalidCount,
  };
}

/** Submit only a balanced grid with at least one amount, a date, and no bad rows. */
export function canSubmitGrid(totals: GridTotals, asOfDate: string): boolean {
  return !!asOfDate && totals.balanced && totals.lineCount > 0 && totals.invalidCount === 0 && totals.totalDebit > 0;
}

/** The rows that carry an amount, in the shape the backend expects. */
export function toOpeningBalanceLines(rows: Record<string, GridAmounts>): OpeningBalanceLine[] {
  return Object.entries(rows)
    .map(([accountId, amounts]) => ({
      ledgerAccount: { id: accountId },
      debit: parseAmount(amounts.debit) || 0,
      credit: parseAmount(amounts.credit) || 0,
    }))
    .filter((line) => line.debit > 0 || line.credit > 0);
}

/**
 * The amounts that make the grid balance by posting the difference to one
 * account (Opening Balance Equity). Returns the account's new cell values, net
 * of what was already in it.
 */
export function balancingAmounts(rows: Record<string, GridAmounts>, accountId: string): GridAmounts {
  const others = { ...rows };
  delete others[accountId];
  const { difference } = gridTotals(others);
  if (difference > 0) return { debit: '', credit: difference.toFixed(2) };
  if (difference < 0) return { debit: (-difference).toFixed(2), credit: '' };
  return { debit: '', credit: '' };
}
