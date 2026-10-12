/**
 * Unit tests for turning a voucher into Transaction Register rows (SOUPFIN-157).
 *
 * The backend sends a voucher's two sides as debitLedgerAccount and
 * creditLedgerAccount (top level, or under ledgerTransaction). Before this the
 * register read only cashAccount/expenseAccount/incomeAccount, which the
 * backend never sends, so real vouchers produced no rows.
 */
import { describe, it, expect } from 'vitest';
import { transformVoucher, TRANSACTION_TYPE_LABELS } from '../useTransactions';
import type { Voucher } from '../../types';

const asVoucher = (raw: Record<string, unknown>) => raw as unknown as Voucher;

describe('transformVoucher (SOUPFIN-157)', () => {
  it.each([
    ['PAYMENT', 'PV'],
    ['RECEIPT', 'RV'],
    ['CONTRA', 'CV'],
    ['JOURNAL', 'JV'],
  ])('%s: one debit row and one credit row for the same amount', (voucherType, prefix) => {
    const rows = transformVoucher(asVoucher({
      id: 'abcdef12',
      voucherType,
      status: 'PENDING',
      ledgerTransaction: {
        transactionDate: '2026-10-12',
        notes: 'Backend shape',
        amount: 750,
        debitLedgerAccount: { id: 'd', code: '1010', name: 'Debit Side' },
        creditLedgerAccount: { id: 'c', code: '1020', name: 'Credit Side' },
      },
    }));

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      id: 'abcdef12-debit', accountName: 'Debit Side', debitAmount: 750, creditAmount: 0,
      type: voucherType, transactionId: `${prefix}-ABCDE`, date: '2026-10-12', description: 'Backend shape',
    });
    expect(rows[1]).toMatchObject({
      id: 'abcdef12-credit', accountName: 'Credit Side', debitAmount: 0, creditAmount: 750, type: voucherType,
    });
  });

  it('reads a legacy DEPOSIT voucher as a receipt', () => {
    const rows = transformVoucher(asVoucher({
      id: 'v1', voucherType: 'DEPOSIT', amount: 10,
      debitLedgerAccount: { code: '1010', name: 'Bank' },
      creditLedgerAccount: { code: '4010', name: 'Fees' },
    }));
    expect(rows.map((r) => r.type)).toEqual(['RECEIPT', 'RECEIPT']);
    expect(rows[0].debitAmount).toBe(10);
  });

  it('still reads the legacy flattened mock shape by role', () => {
    const payment = transformVoucher(asVoucher({
      id: 'p', voucherType: 'PAYMENT', amount: 450,
      cashAccount: { code: '1001', name: 'Cash' },
      expenseAccount: { code: '5001', name: 'Office Expenses' },
    }));
    expect(payment.map((r) => [r.accountName, r.debitAmount, r.creditAmount])).toEqual([
      ['Office Expenses', 450, 0],
      ['Cash', 0, 450],
    ]);

    const receipt = transformVoucher(asVoucher({
      id: 'r', voucherType: 'RECEIPT', amount: 5000,
      cashAccount: { code: '1001', name: 'Cash' },
      incomeAccount: { code: '4001', name: 'Service Revenue' },
    }));
    expect(receipt.map((r) => [r.accountName, r.debitAmount, r.creditAmount])).toEqual([
      ['Cash', 5000, 0],
      ['Service Revenue', 0, 5000],
    ]);
  });

  it('yields no rows for a voucher with no accounts, and 0 for a missing amount', () => {
    expect(transformVoucher(asVoucher({ id: 'empty', voucherType: 'JOURNAL' }))).toEqual([]);
    const rows = transformVoucher(asVoucher({ id: 'z', voucherType: 'CONTRA', debitLedgerAccount: { name: 'A' } }));
    expect(rows).toHaveLength(1);
    expect(rows[0].debitAmount).toBe(0);
  });

  it('keeps a seven-figure amount exact', () => {
    const rows = transformVoucher(asVoucher({
      id: 'big', voucherType: 'JOURNAL', amount: 9876543.21,
      debitLedgerAccount: { name: 'A' }, creditLedgerAccount: { name: 'B' },
    }));
    expect(rows[0].debitAmount).toBe(9876543.21);
    expect(rows[1].creditAmount).toBe(9876543.21);
  });

  it('labels every register type', () => {
    expect(TRANSACTION_TYPE_LABELS).toEqual({
      JOURNAL_ENTRY: 'Journal Entry',
      PAYMENT: 'Payment',
      RECEIPT: 'Receipt',
      CONTRA: 'Contra',
      JOURNAL: 'Journal Voucher',
    });
  });
});
