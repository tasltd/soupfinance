/**
 * Added (SOUPFIN-163): running-balance maths for the account ledger.
 *
 * An account's balance is kept on its normal side: assets and expenses grow
 * with debits, liabilities, equity and income grow with credits. The backend
 * marks the side as `ledgerState` (DEBIT/CREDIT) but leaves it null on many
 * accounts, so fall back to the account's group.
 */
import type { LedgerGroup, LedgerTransaction } from '../types';

export type NormalSide = 'DEBIT' | 'CREDIT';

/** The side on which this account's balance increases. */
export function normalSide(account?: { ledgerGroup?: LedgerGroup; ledgerState?: string | null }): NormalSide {
  if (account?.ledgerState === 'DEBIT' || account?.ledgerState === 'CREDIT') return account.ledgerState;
  switch (account?.ledgerGroup) {
    case 'LIABILITY':
    case 'EQUITY':
    case 'INCOME':
    case 'REVENUE':
      return 'CREDIT';
    default:
      return 'DEBIT';
  }
}

/**
 * Opening balance from the debit and credit totals posted before the period,
 * signed for the account's normal side.
 */
export function signedBalance(debit: number, credit: number, side: NormalSide): number {
  return roundMoney(side === 'DEBIT' ? debit - credit : credit - debit);
}

export interface LedgerLine {
  transaction: LedgerTransaction;
  debit: number;
  credit: number;
  /** Balance after this line, on the account's normal side. */
  balance: number;
}

export interface AccountLedger {
  opening: number;
  lines: LedgerLine[];
  totalDebit: number;
  totalCredit: number;
  closing: number;
}

// Money is held to the cent; summing many floats drifts (0.1 + 0.2), so round
// each step to 2 places the way the backend's getBalanceAt does (HALF_UP).
export function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function sortKey(tx: LedgerTransaction): string {
  const created = (tx as { dateCreated?: string }).dateCreated ?? '';
  return `${tx.transactionDate ?? ''}|${created}|${tx.id ?? ''}`;
}

/**
 * Lay out an account's transactions oldest first with the balance after each.
 * Lines carry the debit or credit by `transactionState`; anything else (an
 * unbalanced placeholder row) counts as zero.
 */
export function buildAccountLedger(
  opening: number,
  transactions: LedgerTransaction[],
  side: NormalSide
): AccountLedger {
  const sorted = [...transactions].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  let balance = roundMoney(opening);
  let totalDebit = 0;
  let totalCredit = 0;
  const lines = sorted.map((transaction) => {
    const amount = Number(transaction.amount) || 0;
    const debit = transaction.transactionState === 'DEBIT' ? amount : 0;
    const credit = transaction.transactionState === 'CREDIT' ? amount : 0;
    totalDebit = roundMoney(totalDebit + debit);
    totalCredit = roundMoney(totalCredit + credit);
    balance = roundMoney(balance + (side === 'DEBIT' ? debit - credit : credit - debit));
    return { transaction, debit, credit, balance };
  });
  return { opening: roundMoney(opening), lines, totalDebit, totalCredit, closing: balance };
}

/** The calendar day before an ISO date (YYYY-MM-DD), without timezone drift. */
export function dayBefore(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}
