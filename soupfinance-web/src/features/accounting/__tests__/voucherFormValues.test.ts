/**
 * Unit tests for voucherToFormValues (SOUPFIN-154).
 *
 * The voucher view/edit page fills its form from /rest/voucher/show/:id.json.
 * The backend renders the money fields under `ledgerTransaction` with
 * debit/credit accounts; the frontend type and mocks use flattened names.
 * Both shapes must produce the same form values.
 */
import { describe, it, expect } from 'vitest';
import { voucherToFormValues } from '../voucherFormValues';
import type { Voucher } from '../../../types';

const asVoucher = (raw: Record<string, unknown>) => raw as unknown as Voucher;

describe('voucherToFormValues (SOUPFIN-154)', () => {
  it('reads the flattened shape used by the frontend type', () => {
    const values = voucherToFormValues(asVoucher({
      id: 'voucher-001',
      voucherType: 'PAYMENT',
      voucherTo: 'VENDOR',
      voucherDate: '2024-10-21',
      description: 'Office supplies payment',
      reference: 'REF-9',
      amount: 450,
      vendor: { id: 'vendor-001' },
      cashAccount: { id: 'acc-cash' },
      expenseAccount: { id: 'acc-expense' },
      paymentMethod: { id: 'pm-bank', name: 'Bank Transfer' },
    }));

    expect(values).toMatchObject({
      voucherType: 'PAYMENT',
      voucherTo: 'VENDOR',
      transactionDate: '2024-10-21',
      notes: 'Office supplies payment',
      reference: 'REF-9',
      amount: 450,
      vendorId: 'vendor-001',
      cashAccountId: 'acc-cash',
      expenseAccountId: 'acc-expense',
      incomeAccountId: '',
      paymentMethod: 'pm-bank',
    });
  });

  it('reads the backend shape: a payment credits the bank and debits the expense', () => {
    const values = voucherToFormValues(asVoucher({
      id: 'v1',
      voucherType: 'PAYMENT',
      voucherTo: 'STAFF',
      staff: { id: 'agent-1', class: 'soupbroker.security.Agent' },
      ledgerTransaction: {
        transactionDate: '2026-03-04T23:30:00Z',
        notes: 'Travel refund',
        amount: '120.50',
        debitLedgerAccount: { id: 'acc-travel' },
        creditLedgerAccount: { id: 'acc-bank' },
      },
    }));

    expect(values.transactionDate).toBe('2026-03-04');
    expect(values.notes).toBe('Travel refund');
    expect(values.amount).toBe(120.5);
    expect(values.staffId).toBe('agent-1');
    expect(values.cashAccountId).toBe('acc-bank');
    expect(values.expenseAccountId).toBe('acc-travel');
    expect(values.incomeAccountId).toBe('');
  });

  it('reads the backend shape: a receipt debits the bank and credits the income', () => {
    const values = voucherToFormValues(asVoucher({
      voucherType: 'RECEIPT',
      voucherTo: 'CLIENT',
      accountServices: { id: 'as-1' },
      ledgerTransaction: {
        debitLedgerAccount: { id: 'acc-bank' },
        creditLedgerAccount: { id: 'acc-fees' },
      },
    }));

    expect(values.clientId).toBe('as-1');
    expect(values.cashAccountId).toBe('acc-bank');
    expect(values.incomeAccountId).toBe('acc-fees');
    expect(values.expenseAccountId).toBe('');
  });

  it('falls back to safe defaults when the voucher is nearly empty', () => {
    const values = voucherToFormValues(asVoucher({ id: 'v-empty' }));
    expect(values).toEqual({
      voucherType: 'PAYMENT',
      transactionDate: '',
      reference: '',
      notes: '',
      paymentMethod: '',
      currency: '',
      exchangeRate: undefined,
      voucherTo: 'VENDOR',
      beneficiaryName: '',
      clientId: '',
      vendorId: '',
      staffId: '',
      cashAccountId: '',
      expenseAccountId: '',
      incomeAccountId: '',
      amount: 0,
    });
  });

  it('defaults the party to CLIENT for a receipt with an unknown voucherTo', () => {
    const values = voucherToFormValues(asVoucher({ voucherType: 'DEPOSIT', voucherTo: 'SOMEONE' }));
    expect(values.voucherType).toBe('DEPOSIT');
    expect(values.voucherTo).toBe('CLIENT');
  });

  it('keeps a large amount, long notes and the beneficiaryInfo name intact', () => {
    const longNotes = 'Quarterly settlement '.repeat(200);
    const values = voucherToFormValues(asVoucher({
      voucherType: 'PAYMENT',
      voucherTo: 'OTHER',
      beneficiaryInfo: 'Ghana Revenue Authority',
      amount: 98765432.1,
      notes: longNotes,
      exchangeRate: 15.25,
      currency: { id: 'cur-1', code: 'GHS' },
    }));

    expect(values.amount).toBe(98765432.1);
    expect(values.notes).toBe(longNotes);
    expect(values.beneficiaryName).toBe('Ghana Revenue Authority');
    expect(values.exchangeRate).toBe(15.25);
    expect(values.currency).toBe('GHS');
  });
});
