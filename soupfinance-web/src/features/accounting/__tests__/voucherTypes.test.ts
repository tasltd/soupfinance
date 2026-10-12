/**
 * Unit tests for the voucher type rules (SOUPFIN-157).
 *
 * Each voucher type allows different ledger groups on each side of its entry:
 *   PAYMENT  Dr EXPENSE  Cr ASSET
 *   RECEIPT  Dr ASSET    Cr INCOME (or REVENUE)
 *   CONTRA   Dr ASSET    Cr ASSET
 *   JOURNAL  Dr any      Cr any
 * DEPOSIT is the backend's legacy name for RECEIPT.
 */
import { describe, it, expect } from 'vitest';
import {
  VOUCHER_TYPES,
  VOUCHER_TYPE_RULES,
  filterAccountsForSide,
  isAccountAllowed,
  normalizeVoucherType,
} from '../voucherTypes';
import type { LedgerAccount, LedgerGroup, VoucherType } from '../../../types';

const account = (id: string, ledgerGroup: LedgerGroup) =>
  ({ id, code: id, name: id, ledgerGroup, isActive: true, balance: 0 }) as LedgerAccount;

const CHART: LedgerAccount[] = [
  account('bank', 'ASSET'),
  account('cash', 'ASSET'),
  account('payable', 'LIABILITY'),
  account('capital', 'EQUITY'),
  account('fees', 'INCOME'),
  account('sales', 'REVENUE'),
  account('rent', 'EXPENSE'),
];

const ids = (type: VoucherType, side: 'debit' | 'credit') =>
  filterAccountsForSide(CHART, type, side).map((a) => a.id);

describe('filterAccountsForSide (SOUPFIN-157)', () => {
  it('PAYMENT debits an expense and credits a bank or cash account', () => {
    expect(ids('PAYMENT', 'debit')).toEqual(['rent']);
    expect(ids('PAYMENT', 'credit')).toEqual(['bank', 'cash']);
  });

  it('RECEIPT debits a bank or cash account and credits income, under either backend name', () => {
    expect(ids('RECEIPT', 'debit')).toEqual(['bank', 'cash']);
    expect(ids('RECEIPT', 'credit')).toEqual(['fees', 'sales']);
  });

  it('CONTRA moves money between asset accounts only, on both sides', () => {
    expect(ids('CONTRA', 'debit')).toEqual(['bank', 'cash']);
    expect(ids('CONTRA', 'credit')).toEqual(['bank', 'cash']);
  });

  it('JOURNAL allows every account on both sides', () => {
    const all = CHART.map((a) => a.id);
    expect(ids('JOURNAL', 'debit')).toEqual(all);
    expect(ids('JOURNAL', 'credit')).toEqual(all);
  });

  it('returns nothing for an empty or missing chart of accounts', () => {
    for (const type of VOUCHER_TYPES) {
      expect(filterAccountsForSide(undefined, type, 'debit')).toEqual([]);
      expect(filterAccountsForSide([], type, 'credit')).toEqual([]);
    }
  });

  it('excludes an account with no ledger group except on a journal voucher', () => {
    const ungrouped = [{ id: 'x', ledgerGroup: undefined } as unknown as LedgerAccount];
    expect(filterAccountsForSide(ungrouped, 'CONTRA', 'debit')).toEqual([]);
    expect(filterAccountsForSide(ungrouped, 'PAYMENT', 'debit')).toEqual([]);
    expect(filterAccountsForSide(ungrouped, 'JOURNAL', 'credit')).toHaveLength(1);
  });

  it('filters a large chart without dropping or duplicating accounts', () => {
    const groups: LedgerGroup[] = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE', 'REVENUE'];
    const big = Array.from({ length: 5000 }, (_, i) => account(`a${i}`, groups[i % groups.length]));
    // 834 ASSET (i % 6 === 0); 833 INCOME + 833 REVENUE
    expect(filterAccountsForSide(big, 'CONTRA', 'credit')).toHaveLength(834);
    expect(filterAccountsForSide(big, 'RECEIPT', 'credit')).toHaveLength(1666);
    expect(filterAccountsForSide(big, 'JOURNAL', 'debit')).toHaveLength(5000);
  });
});

describe('isAccountAllowed (SOUPFIN-157)', () => {
  it('refuses an expense on either side of a contra', () => {
    expect(isAccountAllowed(account('rent', 'EXPENSE'), 'CONTRA', 'debit')).toBe(false);
    expect(isAccountAllowed(account('rent', 'EXPENSE'), 'CONTRA', 'credit')).toBe(false);
  });

  it('refuses a liability as the bank side of a payment', () => {
    expect(isAccountAllowed(account('payable', 'LIABILITY'), 'PAYMENT', 'credit')).toBe(false);
  });
});

describe('normalizeVoucherType (SOUPFIN-157)', () => {
  it('reads the legacy DEPOSIT as RECEIPT', () => {
    expect(normalizeVoucherType('DEPOSIT')).toBe('RECEIPT');
    expect(normalizeVoucherType('deposit')).toBe('RECEIPT');
  });

  it('accepts the four types in any case, from a URL segment or the backend', () => {
    expect(normalizeVoucherType('payment')).toBe('PAYMENT');
    expect(normalizeVoucherType('Receipt')).toBe('RECEIPT');
    expect(normalizeVoucherType('contra')).toBe('CONTRA');
    expect(normalizeVoucherType(' JOURNAL ')).toBe('JOURNAL');
  });

  it('returns null for anything else so the caller picks a default', () => {
    expect(normalizeVoucherType(undefined)).toBeNull();
    expect(normalizeVoucherType('')).toBeNull();
    expect(normalizeVoucherType('vouchers')).toBeNull();
    expect(normalizeVoucherType(42)).toBeNull();
  });
});

describe('VOUCHER_TYPE_RULES (SOUPFIN-157)', () => {
  it('has a rule, label and route segment for every type', () => {
    expect(VOUCHER_TYPES).toEqual(['PAYMENT', 'RECEIPT', 'CONTRA', 'JOURNAL']);
    for (const type of VOUCHER_TYPES) {
      expect(VOUCHER_TYPE_RULES[type].path).toBe(type.toLowerCase());
      expect(VOUCHER_TYPE_RULES[type].label).toMatch(/Voucher$/);
    }
  });

  it('gives a contra no outside party', () => {
    expect(VOUCHER_TYPE_RULES.CONTRA.hasBeneficiary).toBe(false);
    expect(VOUCHER_TYPE_RULES.CONTRA.defaultVoucherTo).toBe('OTHER');
  });
});
