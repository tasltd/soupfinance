/**
 * Unit tests for voucherToFormValues (SOUPFIN-154, SOUPFIN-157).
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
      // A payment debits the expense and credits the bank.
      debitAccountId: 'acc-expense',
      creditAccountId: 'acc-cash',
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
    expect(values.debitAccountId).toBe('acc-travel');
    expect(values.creditAccountId).toBe('acc-bank');
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
    expect(values.debitAccountId).toBe('acc-bank');
    expect(values.creditAccountId).toBe('acc-fees');
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
      debitAccountId: '',
      creditAccountId: '',
      amount: 0,
    });
  });

  // Changed (SOUPFIN-157): DEPOSIT is the legacy name for RECEIPT
  it('opens a legacy DEPOSIT as a RECEIPT, defaulting the party to CLIENT', () => {
    const values = voucherToFormValues(asVoucher({ voucherType: 'DEPOSIT', voucherTo: 'SOMEONE' }));
    expect(values.voucherType).toBe('RECEIPT');
    expect(values.voucherTo).toBe('CLIENT');
  });

  // Added (SOUPFIN-157): contra and journal vouchers keep both sides as saved
  it.each(['CONTRA', 'JOURNAL'])('reads a %s voucher\'s two sides from the backend shape', (voucherType) => {
    const values = voucherToFormValues(asVoucher({
      voucherType,
      ledgerTransaction: {
        debitLedgerAccount: { id: 'acc-savings' },
        creditLedgerAccount: { id: 'acc-current' },
      },
    }));
    expect(values.voucherType).toBe(voucherType);
    expect(values.voucherTo).toBe('OTHER');
    expect(values.debitAccountId).toBe('acc-savings');
    expect(values.creditAccountId).toBe('acc-current');
  });

  it('falls back to PAYMENT for an unknown voucher type', () => {
    expect(voucherToFormValues(asVoucher({ voucherType: 'TRANSFER' })).voucherType).toBe('PAYMENT');
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
