/**
 * Added (SOUPFIN-163): running-balance maths for the account ledger.
 */
import { describe, it, expect } from 'vitest';
import { buildAccountLedger, dayBefore, normalSide, signedBalance, roundMoney } from '../ledgerBalance';
import type { LedgerTransaction } from '../../types';

const line = (
  id: string,
  state: 'DEBIT' | 'CREDIT',
  amount: number,
  transactionDate = '2026-03-01T00:00:00Z',
  dateCreated = '2026-03-01T09:00:00Z'
) => ({ id, transactionState: state, amount, transactionDate, dateCreated }) as unknown as LedgerTransaction;

describe('normalSide', () => {
  it('uses ledgerState when the backend sets it', () => {
    expect(normalSide({ ledgerState: 'CREDIT', ledgerGroup: 'ASSET' })).toBe('CREDIT');
  });

  it('falls back to the group when ledgerState is null', () => {
    expect(normalSide({ ledgerState: null, ledgerGroup: 'ASSET' })).toBe('DEBIT');
    expect(normalSide({ ledgerGroup: 'EXPENSE' })).toBe('DEBIT');
    for (const g of ['LIABILITY', 'EQUITY', 'INCOME', 'REVENUE'] as const) {
      expect(normalSide({ ledgerGroup: g })).toBe('CREDIT');
    }
  });

  it('treats an account with no group as debit-normal', () => {
    expect(normalSide(undefined)).toBe('DEBIT');
    expect(normalSide({ ledgerGroup: undefined })).toBe('DEBIT');
  });
});

describe('signedBalance', () => {
  it('signs debits minus credits for a debit-normal account', () => {
    expect(signedBalance(1500, 400, 'DEBIT')).toBe(1100);
  });

  it('signs credits minus debits for a credit-normal account, and goes negative when overdrawn', () => {
    expect(signedBalance(1500, 400, 'CREDIT')).toBe(-1100);
    expect(signedBalance(0, 0, 'CREDIT')).toBe(0);
  });
});

describe('buildAccountLedger', () => {
  it('runs a debit-normal balance from the opening balance, oldest first', () => {
    const ledger = buildAccountLedger(1000, [
      line('c', 'CREDIT', 250, '2026-03-03T00:00:00Z'),
      line('a', 'DEBIT', 500, '2026-03-01T00:00:00Z'),
      line('b', 'DEBIT', 100, '2026-03-02T00:00:00Z'),
    ], 'DEBIT');

    expect(ledger.lines.map((l) => [l.transaction.id, l.debit, l.credit, l.balance])).toEqual([
      ['a', 500, 0, 1500],
      ['b', 100, 0, 1600],
      ['c', 0, 250, 1350],
    ]);
    expect(ledger).toMatchObject({ opening: 1000, totalDebit: 600, totalCredit: 250, closing: 1350 });
  });

  it('runs a credit-normal balance the other way', () => {
    const ledger = buildAccountLedger(200, [
      line('a', 'CREDIT', 300),
      line('b', 'DEBIT', 700, '2026-03-02T00:00:00Z'),
    ], 'CREDIT');
    expect(ledger.lines.map((l) => l.balance)).toEqual([500, -200]);
    expect(ledger.closing).toBe(-200);
  });

  it('orders same-day lines by when they were created', () => {
    const ledger = buildAccountLedger(0, [
      line('late', 'CREDIT', 40, '2026-03-01T00:00:00Z', '2026-03-01T17:00:00Z'),
      line('early', 'DEBIT', 100, '2026-03-01T00:00:00Z', '2026-03-01T08:00:00Z'),
    ], 'DEBIT');
    expect(ledger.lines.map((l) => l.transaction.id)).toEqual(['early', 'late']);
    expect(ledger.lines.map((l) => l.balance)).toEqual([100, 60]);
  });

  it('keeps the opening as the closing balance when the period is empty (zero)', () => {
    expect(buildAccountLedger(1234.5, [], 'DEBIT')).toEqual({
      opening: 1234.5, lines: [], totalDebit: 0, totalCredit: 0, closing: 1234.5,
    });
  });

  it('counts a line with no debit/credit state as zero', () => {
    const odd = { id: 'x', amount: 99, transactionDate: '2026-03-01' } as unknown as LedgerTransaction;
    const ledger = buildAccountLedger(10, [odd], 'DEBIT');
    expect(ledger.lines[0]).toMatchObject({ debit: 0, credit: 0, balance: 10 });
  });

  it('does not drift over thousands of cent amounts', () => {
    const lines = Array.from({ length: 3000 }, (_, i) => line(`d${i}`, 'DEBIT', 0.1, '2026-03-01', `t${String(i).padStart(5, '0')}`));
    const ledger = buildAccountLedger(0.2, lines, 'DEBIT');
    expect(ledger.totalDebit).toBe(300);
    expect(ledger.closing).toBe(300.2);
  });

  it('stays exact over 10,000 seven-figure lines (overflow)', () => {
    const lines = Array.from({ length: 10_000 }, (_, i) =>
      line(`l${i}`, i % 2 === 0 ? 'DEBIT' : 'CREDIT', i % 2 === 0 ? 1_234_567.89 : 1_000_000.01, '2026-03-01', `t${String(i).padStart(6, '0')}`)
    );
    const ledger = buildAccountLedger(5_000_000, lines, 'DEBIT');
    expect(ledger.totalDebit).toBe(6_172_839_450);
    expect(ledger.totalCredit).toBe(5_000_000_050);
    // closing = opening + debits − credits
    expect(ledger.closing).toBe(roundMoney(5_000_000 + 6_172_839_450 - 5_000_000_050));
    expect(ledger.lines.at(-1)?.balance).toBe(ledger.closing);
  });
});

describe('dayBefore', () => {
  it('steps back across month, year and leap-day boundaries', () => {
    expect(dayBefore('2026-03-15')).toBe('2026-03-14');
    expect(dayBefore('2026-03-01')).toBe('2026-02-28');
    expect(dayBefore('2024-03-01')).toBe('2024-02-29');
    expect(dayBefore('2026-01-01')).toBe('2025-12-31');
  });
});
