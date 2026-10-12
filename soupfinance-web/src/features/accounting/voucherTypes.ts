/**
 * Added (SOUPFIN-157): the four accounting voucher types and the accounts each
 * side of their journal entry may use.
 *
 * | Type    | Debit             | Credit            | Meaning                      |
 * |---------|-------------------|-------------------|------------------------------|
 * | PAYMENT | Expense           | Bank/Cash (ASSET) | Money paid out               |
 * | RECEIPT | Bank/Cash (ASSET) | Income            | Money received               |
 * | CONTRA  | Bank/Cash (ASSET) | Bank/Cash (ASSET) | Transfer between own accounts |
 * | JOURNAL | Any account       | Any account       | Non-cash adjustment          |
 *
 * The backend (soupmarkets-web Voucher.constraints) enforces the same rules:
 * a payment must credit an ASSET, a receipt must debit one, and a contra must
 * have ASSET accounts on both sides. DEPOSIT is the backend's legacy name for
 * a receipt; Voucher.beforeImport() now stores it as RECEIPT, and older rows
 * still carrying DEPOSIT are read as RECEIPT here.
 */
import { ledgerGroupMatches } from '../../api/endpoints/ledger';
import type { LedgerAccount, LedgerGroup, VoucherTo, VoucherType } from '../../types';

export const VOUCHER_TYPES: VoucherType[] = ['PAYMENT', 'RECEIPT', 'CONTRA', 'JOURNAL'];

export type VoucherSide = 'debit' | 'credit';

export interface VoucherSideRule {
  /** Ledger groups allowed on this side; null means any account. */
  groups: LedgerGroup[] | null;
  label: string;
  helperText: string;
}

export interface VoucherTypeRule {
  label: string;
  /** Path segment under /accounting/voucher/ that opens a new voucher of this type. */
  path: string;
  icon: string;
  debit: VoucherSideRule;
  credit: VoucherSideRule;
  /** Who the voucher is paid to or received from; a contra has no outside party. */
  hasBeneficiary: boolean;
  defaultVoucherTo: VoucherTo;
}

export const VOUCHER_TYPE_RULES: Record<VoucherType, VoucherTypeRule> = {
  PAYMENT: {
    label: 'Payment Voucher',
    path: 'payment',
    icon: 'payments',
    debit: { groups: ['EXPENSE'], label: 'Expense Account', helperText: 'Account to debit for this payment' },
    credit: { groups: ['ASSET'], label: 'Bank/Cash Account', helperText: 'Bank or cash account the money leaves' },
    hasBeneficiary: true,
    defaultVoucherTo: 'VENDOR',
  },
  RECEIPT: {
    label: 'Receipt Voucher',
    path: 'receipt',
    icon: 'receipt_long',
    debit: { groups: ['ASSET'], label: 'Bank/Cash Account', helperText: 'Bank or cash account the money goes into' },
    credit: { groups: ['INCOME'], label: 'Income Account', helperText: 'Income account to credit' },
    hasBeneficiary: true,
    defaultVoucherTo: 'CLIENT',
  },
  CONTRA: {
    label: 'Contra Voucher',
    path: 'contra',
    icon: 'swap_horiz',
    debit: { groups: ['ASSET'], label: 'Transfer To (Bank/Cash)', helperText: 'Bank or cash account receiving the transfer' },
    credit: { groups: ['ASSET'], label: 'Transfer From (Bank/Cash)', helperText: 'Bank or cash account the transfer comes from' },
    hasBeneficiary: false,
    defaultVoucherTo: 'OTHER',
  },
  JOURNAL: {
    label: 'Journal Voucher',
    path: 'journal',
    icon: 'edit_note',
    debit: { groups: null, label: 'Debit Account', helperText: 'Any account to debit' },
    credit: { groups: null, label: 'Credit Account', helperText: 'Any account to credit' },
    hasBeneficiary: true,
    defaultVoucherTo: 'OTHER',
  },
};

/**
 * Read a voucher type from the backend or a URL segment. DEPOSIT is the
 * legacy name for RECEIPT. Anything unrecognised returns null so the caller
 * picks its own default.
 */
export function normalizeVoucherType(value: unknown): VoucherType | null {
  const upper = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (upper === 'DEPOSIT') return 'RECEIPT';
  return (VOUCHER_TYPES as string[]).includes(upper) ? (upper as VoucherType) : null;
}

/** True when the account may sit on the given side of a voucher of this type. */
export function isAccountAllowed(
  account: Pick<LedgerAccount, 'ledgerGroup'>,
  voucherType: VoucherType,
  side: VoucherSide
): boolean {
  const { groups } = VOUCHER_TYPE_RULES[voucherType][side];
  if (!groups) return true;
  return groups.some((group) => ledgerGroupMatches(account.ledgerGroup, group));
}

/** The accounts a voucher of this type may use on one side of its entry. */
export function filterAccountsForSide<T extends Pick<LedgerAccount, 'ledgerGroup'>>(
  accounts: T[] | undefined,
  voucherType: VoucherType,
  side: VoucherSide
): T[] {
  return (accounts || []).filter((account) => isAccountAllowed(account, voucherType, side));
}
