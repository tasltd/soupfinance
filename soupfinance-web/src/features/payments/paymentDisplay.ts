/**
 * Display helpers for InvoicePayment / BillPayment rows.
 *
 * Added (SOUPFIN-177): the REST payloads carry foreign keys as
 * `{ id, class, serialised }` only — no `name`, no invoice number. These
 * helpers read the PaymentMethod record (from usePaymentMethods) and the
 * Grails `serialised` toString instead of a hard-coded enum map, which
 * rendered every real method as a blank badge.
 */
import type { PaymentMethod } from '../../types';

interface FkRef {
  id?: string;
  name?: string;
  serialised?: string;
}

/** Shown when a payment has no method recorded. */
export const NO_METHOD_LABEL = 'Not recorded';

/**
 * Method name: the PaymentMethod record's `name`, then the FK's own name or
 * serialised string, then NO_METHOD_LABEL.
 */
export function getPaymentMethodName(
  method: FkRef | null | undefined,
  methods?: PaymentMethod[]
): string {
  if (!method) return NO_METHOD_LABEL;
  const record = method.id ? methods?.find((m) => m.id === method.id) : undefined;
  return record?.name || method.name || method.serialised || NO_METHOD_LABEL;
}

// Light + dark pairs. Order is part of the contract: a method keeps its colour
// as long as its id does, whatever its free-text name is.
const METHOD_BADGE_STYLES = [
  'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300',
  'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300',
  'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300',
  'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300',
  'bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-300',
  'bg-pink-100 text-pink-800 dark:bg-pink-900/50 dark:text-pink-300',
  'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300',
  'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300',
];

export const NO_METHOD_BADGE_STYLE =
  'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';

/**
 * Badge colour derived from the PaymentMethod id, so every method a tenant
 * creates gets a stable colour without a code change.
 */
export function getPaymentMethodBadgeStyle(method: FkRef | null | undefined): string {
  const key = method?.id || method?.name || method?.serialised;
  if (!key) return NO_METHOD_BADGE_STYLE;
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return METHOD_BADGE_STYLES[hash % METHOD_BADGE_STYLES.length];
}

export interface DocumentSummary {
  /** e.g. "Invoice #2025001" or "Bill #43"; falls back to "Invoice" / "Bill". */
  label: string;
  /** Client or vendor name when the serialised string names one. */
  party?: string;
}

/**
 * Read the invoice number and client out of
 * `Invoice(number:2025001, accountServices:Direct Account : Corporate(Acme Ltd), currency:USD, total:6095.00)`.
 */
export function describeInvoiceRef(ref: FkRef | null | undefined): DocumentSummary {
  const text = ref?.serialised || '';
  const number = text.match(/number:\s*([^,)]+)/)?.[1]?.trim();
  const accountServices = text.match(/accountServices:\s*(.*?),\s*(?:currency|total):/)?.[1]?.trim();
  const party =
    accountServices?.match(/(?:Corporate|Individual|Client)\((.+)\)\s*$/)?.[1]?.trim() ||
    accountServices ||
    undefined;
  return { label: number ? `Invoice #${number}` : 'Invoice', party };
}

/**
 * Read the bill number and vendor out of
 * `Bill((805 Restaurant)[PROVIDER], BILL-, 43)` (Bill's @ToString: vendor, numberPrefix, number).
 */
export function describeBillRef(ref: FkRef | null | undefined): DocumentSummary {
  const text = ref?.serialised || '';
  const number = text.match(/,\s*(\d+)\)\s*$/)?.[1];
  const party = text.match(/^Bill\(\((.+?)\)(?:\[[^\]]*\])?/)?.[1]?.trim() || undefined;
  return { label: number ? `Bill #${number}` : 'Bill', party };
}

/**
 * Account label: the record's name (+ code) when present, else the serialised string.
 */
export function describeAccountRef(
  ref: (FkRef & { code?: string }) | null | undefined
): string | undefined {
  if (!ref) return undefined;
  if (ref.name) return ref.code ? `${ref.code} · ${ref.name}` : ref.name;
  return ref.serialised || undefined;
}
