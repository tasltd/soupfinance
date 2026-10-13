/**
 * Added (SOUPFIN-158): the opening-balances grid must balance before posting.
 */
import { describe, it, expect } from 'vitest';
import {
  balancingAmounts,
  canSubmitGrid,
  gridTotals,
  parseAmount,
  rowError,
  toOpeningBalanceLines,
} from '../openingBalanceGrid';

describe('parseAmount', () => {
  it('reads blanks as zero and thousands separators as noise', () => {
    expect(parseAmount('')).toBe(0);
    expect(parseAmount('  ')).toBe(0);
    expect(parseAmount('1,250,000.50')).toBe(1250000.5);
  });

  it('rejects negatives, three decimals and words', () => {
    expect(parseAmount('-5')).toBeNaN();
    expect(parseAmount('1.234')).toBeNaN();
    expect(parseAmount('ten')).toBeNaN();
  });
});

describe('rowError', () => {
  it('allows an empty row and a one-sided row', () => {
    expect(rowError(undefined)).toBeNull();
    expect(rowError({ debit: '', credit: '' })).toBeNull();
    expect(rowError({ debit: '100', credit: '' })).toBeNull();
  });

  it('refuses a debit and a credit on the same row', () => {
    expect(rowError({ debit: '100', credit: '50' })).toBe('Enter a debit or a credit, not both.');
  });

  it('refuses an unreadable amount', () => {
    expect(rowError({ debit: '-1', credit: '' })).toMatch(/positive amount/);
  });
});

describe('gridTotals and canSubmitGrid', () => {
  it('an empty grid balances but cannot be posted', () => {
    const totals = gridTotals({});
    expect(totals).toMatchObject({ totalDebit: 0, totalCredit: 0, balanced: true, lineCount: 0 });
    expect(canSubmitGrid(totals, '2025-12-31')).toBe(false);
  });

  it('a balanced grid can be posted, but not without a date', () => {
    const totals = gridTotals({ cash: { debit: '1000', credit: '' }, loan: { debit: '', credit: '1000' } });
    expect(totals).toMatchObject({ balanced: true, lineCount: 2, difference: 0 });
    expect(canSubmitGrid(totals, '2025-12-31')).toBe(true);
    expect(canSubmitGrid(totals, '')).toBe(false);
  });

  it('an unbalanced grid reports the signed difference', () => {
    const totals = gridTotals({ cash: { debit: '1000', credit: '' }, loan: { debit: '', credit: '400' } });
    expect(totals).toMatchObject({ balanced: false, difference: 600 });
    expect(canSubmitGrid(totals, '2025-12-31')).toBe(false);
  });

  it('a bad row blocks posting even when the rest balances', () => {
    const totals = gridTotals({
      cash: { debit: '1000', credit: '' },
      loan: { debit: '', credit: '1000' },
      bad: { debit: '5', credit: '5' },
    });
    expect(totals.invalidCount).toBe(1);
    expect(canSubmitGrid(totals, '2025-12-31')).toBe(false);
  });

  it('sums in cents: 10,000 rows of 0.10 against one credit of 1,000.00 balance exactly', () => {
    const rows: Record<string, { debit: string; credit: string }> = {};
    for (let i = 0; i < 10000; i++) rows[`a${i}`] = { debit: '0.10', credit: '' };
    rows.equity = { debit: '', credit: '1000.00' };
    const totals = gridTotals(rows);
    expect(totals.totalDebit).toBe(1000);
    expect(totals.balanced).toBe(true);
    expect(totals.lineCount).toBe(10001);
  });

  it('balances seven-figure amounts', () => {
    const totals = gridTotals({ land: { debit: '9,999,999.99', credit: '' }, capital: { debit: '', credit: '9999999.99' } });
    expect(totals.balanced).toBe(true);
    expect(totals.totalCredit).toBe(9999999.99);
  });
});

describe('toOpeningBalanceLines', () => {
  it('drops empty rows and sends nested FK refs', () => {
    expect(
      toOpeningBalanceLines({
        cash: { debit: '1,000', credit: '' },
        empty: { debit: '', credit: '' },
        loan: { debit: '', credit: '1000' },
      })
    ).toEqual([
      { ledgerAccount: { id: 'cash' }, debit: 1000, credit: 0 },
      { ledgerAccount: { id: 'loan' }, debit: 0, credit: 1000 },
    ]);
  });
});

describe('balancingAmounts', () => {
  it('credits Opening Balance Equity when debits are larger', () => {
    expect(balancingAmounts({ cash: { debit: '700', credit: '' } }, 'obe')).toEqual({ debit: '', credit: '700.00' });
  });

  it('debits it when credits are larger, replacing what it already held', () => {
    const rows = { loan: { debit: '', credit: '300' }, obe: { debit: '', credit: '999' } };
    expect(balancingAmounts(rows, 'obe')).toEqual({ debit: '300.00', credit: '' });
  });

  it('clears it when the rest already balances', () => {
    const rows = { cash: { debit: '5', credit: '' }, loan: { debit: '', credit: '5' } };
    expect(balancingAmounts(rows, 'obe')).toEqual({ debit: '', credit: '' });
  });
});
