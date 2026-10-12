/**
 * Added (SOUPFIN-154): turn a voucher from /rest/voucher/show/:id.json into
 * the values the voucher form edits.
 *
 * The backend Voucher delegates its money fields to an embedded
 * LedgerTransaction, and show.json renders that transaction under
 * `ledgerTransaction` (transactionDate, notes, amount, paymentMethod,
 * debitLedgerAccount, creditLedgerAccount). The frontend Voucher type and the
 * E2E mocks use flattened names instead (voucherDate, description,
 * cashAccount, expenseAccount, incomeAccount). This reads both, top level
 * first, so a voucher opens filled in whichever shape arrives.
 *
 * Changed (SOUPFIN-157): the form edits the two sides of the entry directly
 * (debitAccountId, creditAccountId) for all four voucher types. A legacy
 * DEPOSIT voucher opens as a RECEIPT.
 */
import type { Voucher, VoucherTo, VoucherType } from '../../types';
import { normalizeVoucherType, VOUCHER_TYPE_RULES } from './voucherTypes';

export interface VoucherFormValues {
  voucherType: VoucherType;
  transactionDate: string;
  reference: string;
  notes: string;
  paymentMethod: string;
  currency: string;
  exchangeRate?: number;
  voucherTo: VoucherTo;
  beneficiaryName: string;
  clientId: string;
  vendorId: string;
  staffId: string;
  debitAccountId: string;
  creditAccountId: string;
  amount: number;
}

type Ref = { id?: string; code?: string } | string | null | undefined;
type Loose = Record<string, unknown>;

const VOUCHER_TOS: VoucherTo[] = ['CLIENT', 'VENDOR', 'STAFF', 'OTHER'];

function refId(ref: unknown): string {
  if (!ref) return '';
  if (typeof ref === 'string') return ref;
  return (ref as { id?: string }).id ?? '';
}

function firstDefined(...values: unknown[]): unknown {
  return values.find((v) => v !== undefined && v !== null && v !== '');
}

function asText(value: unknown): string {
  return value === undefined || value === null ? '' : String(value);
}

export function voucherToFormValues(voucher: Voucher): VoucherFormValues {
  const v = voucher as unknown as Loose;
  const lt = (v.ledgerTransaction ?? {}) as Loose;
  const pick = (...keys: string[]) => firstDefined(...keys.map((k) => v[k]), ...keys.map((k) => lt[k]));

  const voucherType = normalizeVoucherType(v.voucherType) ?? 'PAYMENT';
  const voucherTo = VOUCHER_TOS.includes(v.voucherTo as VoucherTo)
    ? (v.voucherTo as VoucherTo)
    : VOUCHER_TYPE_RULES[voucherType].defaultVoucherTo;

  // The backend names the sides debitLedgerAccount/creditLedgerAccount. The
  // legacy mock names map by role: a payment debits the expense and credits
  // the bank; a receipt debits the bank and credits the income account.
  const isPayment = voucherType === 'PAYMENT';
  const cash = refId(pick('cashAccount'));
  const debitAccountId = refId(pick('debitLedgerAccount'))
    || (isPayment ? refId(pick('expenseAccount')) : cash);
  const creditAccountId = refId(pick('creditLedgerAccount'))
    || (isPayment ? cash : refId(pick('incomeAccount')));

  // Keep only the calendar date: the date input takes yyyy-MM-dd, and slicing
  // the string avoids a timezone shift that Date parsing would introduce.
  const transactionDate = asText(pick('transactionDate', 'voucherDate')).slice(0, 10);

  const currency = pick('currency') as Ref;
  const exchangeRate = Number(pick('exchangeRate'));
  const amount = Number(pick('amount'));

  return {
    voucherType,
    transactionDate,
    reference: asText(pick('reference')),
    notes: asText(pick('notes', 'description')),
    paymentMethod: refId(pick('paymentMethod')),
    currency: typeof currency === 'string' ? currency : currency?.code ?? '',
    exchangeRate: Number.isFinite(exchangeRate) && exchangeRate > 0 ? exchangeRate : undefined,
    voucherTo,
    beneficiaryName: asText(pick('beneficiaryName', 'beneficiaryInfo')),
    clientId: refId(pick('client', 'accountServices')),
    vendorId: refId(pick('vendor')),
    staffId: refId(pick('staff')),
    debitAccountId,
    creditAccountId,
    amount: Number.isFinite(amount) ? amount : 0,
  };
}
