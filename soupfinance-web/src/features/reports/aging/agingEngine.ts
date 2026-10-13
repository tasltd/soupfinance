/**
 * Added (SOUPFIN-105): A/R and A/P aging, computed from the open documents.
 *
 * Why the browser does the bucketing instead of /financeReports/agedReceivables
 * and /agedPayables:
 *
 * - Client.getThirtyOneToSixtyDaysOverdueAmount, ...SixtyOneToNinety... and
 *   ...NinetyOneOrMore... (and the same three on Vendor) all sum
 *   Invoice/Bill.getThirtyOrLessDaysOverdue. An amount 1-30 days late is counted
 *   four times and anything older than 30 days is never counted, so the backend
 *   totals cannot reconcile to the ledger.
 * - Invoice/Bill bucket on strict `<` / `>` against reference-30/60/90, so a
 *   document exactly 30, 60 or 90 days late falls in no bucket at all.
 * - The backend buckets are fixed at 30 days, and it returns one row per party,
 *   so there is no Detail view and no configurable period length.
 * - Outstanding is `baseTotal - basePaidAmount` as of now, not as of the
 *   report date: payments made after the as-of date still reduce the balance.
 *
 * Here every report (Summary, Detail, Open Invoices, Unpaid Bills) reads the
 * same list of open documents, so their totals agree with each other.
 *
 * Everything in this file is pure: no fetching, no React.
 */
import type { Bill, BillPayment, Invoice, InvoicePayment } from '../../../types';

// =============================================================================
// Bucket configuration
// =============================================================================

export interface AgingBucketConfig {
  /** Length of each overdue period, in days (QuickBooks: "Days per aging period"). */
  daysPerPeriod: number;
  /** Overdue periods before the last open-ended one (QuickBooks: "Number of periods"). */
  periods: number;
}

/** Current, 1-30, 31-60, 61-90, Over 90. */
export const DEFAULT_BUCKET_CONFIG: AgingBucketConfig = { daysPerPeriod: 30, periods: 3 };

export const BUCKET_LIMITS = {
  minDays: 1,
  maxDays: 365,
  minPeriods: 1,
  maxPeriods: 12,
} as const;

export interface AgingBucket {
  /** 0 is Current; the last index is the open-ended "Over N days" bucket. */
  index: number;
  label: string;
  /** Inclusive lower bound on days overdue. Current has no lower bound. */
  minDays: number | null;
  /** Inclusive upper bound on days overdue. The last bucket has none. */
  maxDays: number | null;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** Keep a user-entered configuration inside the supported range. */
export function normaliseBucketConfig(config: Partial<AgingBucketConfig>): AgingBucketConfig {
  return {
    daysPerPeriod: clampInt(
      config.daysPerPeriod,
      BUCKET_LIMITS.minDays,
      BUCKET_LIMITS.maxDays,
      DEFAULT_BUCKET_CONFIG.daysPerPeriod
    ),
    periods: clampInt(
      config.periods,
      BUCKET_LIMITS.minPeriods,
      BUCKET_LIMITS.maxPeriods,
      DEFAULT_BUCKET_CONFIG.periods
    ),
  };
}

/** Current, then `periods` closed periods, then one open-ended period. */
export function buildBuckets(input: AgingBucketConfig): AgingBucket[] {
  const { daysPerPeriod, periods } = normaliseBucketConfig(input);
  const buckets: AgingBucket[] = [{ index: 0, label: 'Current', minDays: null, maxDays: 0 }];
  for (let i = 1; i <= periods; i++) {
    const minDays = (i - 1) * daysPerPeriod + 1;
    const maxDays = i * daysPerPeriod;
    buckets.push({
      index: i,
      label: minDays === maxDays ? `${minDays} days` : `${minDays}–${maxDays} days`,
      minDays,
      maxDays,
    });
  }
  const last = periods * daysPerPeriod;
  buckets.push({ index: periods + 1, label: `Over ${last} days`, minDays: last + 1, maxDays: null });
  return buckets;
}

/**
 * Which bucket a document falls in. Every whole number of days lands in exactly
 * one bucket: 0 or less is Current, 1..d the first period, and so on.
 */
export function bucketIndexFor(daysOverdue: number, input: AgingBucketConfig): number {
  const { daysPerPeriod, periods } = normaliseBucketConfig(input);
  if (daysOverdue <= 0) return 0;
  return Math.min(periods + 1, Math.ceil(daysOverdue / daysPerPeriod));
}

// =============================================================================
// Dates (calendar days, never wall-clock time)
// =============================================================================

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * Days since 1970-01-01 for a YYYY-MM-DD (or ISO datetime) string, counted in
 * UTC so the answer is the same east and west of Greenwich. Null when blank.
 */
export function toDayNumber(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const [, y, m, d] = match;
  return Math.round(Date.UTC(Number(y), Number(m) - 1, Number(d)) / 86_400_000);
}

/**
 * Whole days a document is past its due date on the as-of date. Due today is 0
 * (Current). A document with no due date is aged from its own date.
 */
export function daysOverdue(dueDate: string | null | undefined, asOf: string, fallbackDate?: string): number {
  const asOfDay = toDayNumber(asOf);
  const dueDay = toDayNumber(dueDate) ?? toDayNumber(fallbackDate);
  if (asOfDay === null || dueDay === null) return 0;
  return asOfDay - dueDay;
}

// =============================================================================
// Open documents
// =============================================================================

export type AgingSide = 'receivables' | 'payables';

export interface OpenDocument {
  id: string;
  kind: 'invoice' | 'bill';
  /** What the user calls the document: invoice number, bill number. */
  reference: string;
  /** Customer: the invoice's AccountServices id. Vendor: the vendor id. */
  partyId: string;
  partyName: string;
  /** Document date (invoiceDate / billDate), YYYY-MM-DD. */
  date: string;
  /** Due date (the backend's paymentDate), YYYY-MM-DD. */
  dueDate: string;
  /** Amounts in the tenant's base currency. */
  total: number;
  paid: number;
  open: number;
  daysOverdue: number;
}

/** Balances below half a pesewa/cent are float dust, not money owed. */
const OPEN_EPSILON = 0.005;

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function toNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Backend status can be a string or a Grails enum object `{ name }` / `{ serialised }`. */
function statusName(value: unknown): string {
  if (typeof value === 'string') return value.toUpperCase();
  if (value && typeof value === 'object') {
    const obj = value as { name?: unknown; serialised?: unknown };
    if (typeof obj.name === 'string') return obj.name.toUpperCase();
    if (typeof obj.serialised === 'string') return obj.serialised.toUpperCase();
  }
  return '';
}

const VOID_STATUSES = new Set(['CANCELLED', 'CANCELED', 'VOID', 'VOIDED']);

/** Sum payments per document id, counting only those made on or before the as-of date. */
function paidByDocument<T extends { paymentDate: string; amount: number }>(
  payments: T[],
  documentIdOf: (payment: T) => string | undefined,
  asOfDay: number
): Map<string, number> {
  const paid = new Map<string, number>();
  for (const payment of payments) {
    const documentId = documentIdOf(payment);
    if (!documentId) continue;
    const day = toDayNumber(payment.paymentDate);
    // A payment with no date cannot be placed in time; count it, as the
    // document's own balance on the backend does.
    if (day !== null && day > asOfDay) continue;
    paid.set(documentId, (paid.get(documentId) ?? 0) + toNumber(payment.amount));
  }
  return paid;
}

function exchangeRateOf(value: unknown): number {
  const rate = toNumber(value);
  return rate > 0 ? rate : 1;
}

interface DocumentInput {
  id: string;
  kind: OpenDocument['kind'];
  reference: string;
  partyId: string;
  partyName: string;
  date: string;
  dueDate: string;
  total: number;
  status: unknown;
  exchangeRate: unknown;
}

function toOpenDocument(
  input: DocumentInput,
  paid: number,
  asOf: string,
  asOfDay: number
): OpenDocument | null {
  if (VOID_STATUSES.has(statusName(input.status))) return null;
  const docDay = toDayNumber(input.date);
  // Not yet raised on the as-of date.
  if (docDay !== null && docDay > asOfDay) return null;

  const rate = exchangeRateOf(input.exchangeRate);
  const open = round2(input.total - paid);
  if (open < OPEN_EPSILON) return null;

  return {
    id: input.id,
    kind: input.kind,
    reference: input.reference,
    partyId: input.partyId,
    partyName: input.partyName,
    date: input.date,
    dueDate: input.dueDate,
    total: round2(input.total * rate),
    paid: round2(paid * rate),
    open: round2(open * rate),
    daysOverdue: daysOverdue(input.dueDate, asOf, input.date),
  };
}

const dateOnly = (value: string | undefined | null): string => (value ? value.split('T')[0] : '');

/**
 * Invoices with a balance on the as-of date. `invoices` must already have
 * `totalAmount` (listInvoices computes it, tax included).
 */
export function buildOpenInvoices(
  invoices: Invoice[],
  payments: InvoicePayment[],
  asOf: string
): OpenDocument[] {
  const asOfDay = toDayNumber(asOf);
  if (asOfDay === null) return [];
  const paid = paidByDocument(payments, (p) => p.invoice?.id, asOfDay);

  const documents: OpenDocument[] = [];
  for (const invoice of invoices) {
    const doc = toOpenDocument(
      {
        id: invoice.id,
        kind: 'invoice',
        reference: `${invoice.numberPrefix ?? ''}${invoice.number ?? ''}` || invoice.id,
        partyId: invoice.accountServices?.id ?? '',
        partyName: invoice.accountServices?.serialised || 'Unknown customer',
        date: dateOnly(invoice.invoiceDate),
        dueDate: dateOnly(invoice.paymentDate),
        total: toNumber(invoice.totalAmount),
        status: invoice.status,
        exchangeRate: invoice.exchangeRate,
      },
      paid.get(invoice.id) ?? 0,
      asOf,
      asOfDay
    );
    if (doc) documents.push(doc);
  }
  return documents;
}

/** Bills with a balance on the as-of date. `bills` must come through listBills (header normalised). */
export function buildOpenBills(bills: Bill[], payments: BillPayment[], asOf: string): OpenDocument[] {
  const asOfDay = toDayNumber(asOf);
  if (asOfDay === null) return [];
  const paid = paidByDocument(payments, (p) => p.bill?.id, asOfDay);

  const documents: OpenDocument[] = [];
  for (const bill of bills) {
    const doc = toOpenDocument(
      {
        id: bill.id,
        kind: 'bill',
        reference: bill.billNumber || `${bill.numberPrefix ?? ''}${bill.number ?? ''}` || bill.id,
        partyId: bill.vendor?.id ?? '',
        partyName: bill.vendor?.name || bill.vendor?.serialised || 'Unknown vendor',
        date: dateOnly(bill.billDate),
        dueDate: dateOnly(bill.paymentDate),
        total: toNumber(bill.totalAmount),
        status: bill.status,
        exchangeRate: bill.exchangeRate,
      },
      paid.get(bill.id) ?? 0,
      asOf,
      asOfDay
    );
    if (doc) documents.push(doc);
  }
  return documents;
}

// =============================================================================
// Summary, detail, totals
// =============================================================================

export interface AgingSummaryRow {
  partyId: string;
  partyName: string;
  /** Open amount per bucket, indexed like buildBuckets(). */
  amounts: number[];
  total: number;
  documentCount: number;
}

export interface AgingSummary {
  buckets: AgingBucket[];
  rows: AgingSummaryRow[];
  /** Per bucket, then the grand total. */
  totals: number[];
  total: number;
}

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });

/** One row per customer/vendor, open amounts spread across the buckets. */
export function buildAgingSummary(documents: OpenDocument[], config: AgingBucketConfig): AgingSummary {
  const buckets = buildBuckets(config);
  const rows = new Map<string, AgingSummaryRow>();

  for (const doc of documents) {
    const key = doc.partyId || doc.partyName;
    let row = rows.get(key);
    if (!row) {
      row = {
        partyId: doc.partyId,
        partyName: doc.partyName,
        amounts: buckets.map(() => 0),
        total: 0,
        documentCount: 0,
      };
      rows.set(key, row);
    }
    row.amounts[bucketIndexFor(doc.daysOverdue, config)] += doc.open;
    row.total += doc.open;
    row.documentCount += 1;
  }

  const sorted = [...rows.values()]
    .map((row) => ({ ...row, amounts: row.amounts.map(round2), total: round2(row.total) }))
    .sort((a, b) => byName(a.partyName, b.partyName));
  const totals = buckets.map((_, i) => round2(sorted.reduce((sum, row) => sum + row.amounts[i], 0)));

  return {
    buckets,
    rows: sorted,
    totals,
    total: round2(totals.reduce((sum, amount) => sum + amount, 0)),
  };
}

export interface AgingDetailGroup {
  bucket: AgingBucket;
  documents: OpenDocument[];
  total: number;
}

/**
 * Documents grouped by bucket, oldest bucket first (the QuickBooks Detail
 * order), most overdue first within a bucket. Empty buckets are dropped.
 */
export function buildAgingDetail(documents: OpenDocument[], config: AgingBucketConfig): AgingDetailGroup[] {
  const buckets = buildBuckets(config);
  const groups = buckets.map((bucket) => ({ bucket, documents: [] as OpenDocument[], total: 0 }));
  for (const doc of documents) {
    const group = groups[bucketIndexFor(doc.daysOverdue, config)];
    group.documents.push(doc);
    group.total += doc.open;
  }
  return groups
    .filter((group) => group.documents.length > 0)
    .map((group) => ({
      ...group,
      total: round2(group.total),
      documents: group.documents.sort(
        (a, b) => b.daysOverdue - a.daysOverdue || byName(a.partyName, b.partyName) || byName(a.reference, b.reference)
      ),
    }))
    .reverse();
}

/** Open Invoices / Unpaid Bills order: by customer/vendor, then due date. */
export function sortOpenDocuments(documents: OpenDocument[]): OpenDocument[] {
  return [...documents].sort(
    (a, b) =>
      byName(a.partyName, b.partyName) ||
      (toDayNumber(a.dueDate) ?? 0) - (toDayNumber(b.dueDate) ?? 0) ||
      byName(a.reference, b.reference)
  );
}

export interface AgingKpis {
  totalOpen: number;
  totalOverdue: number;
  overdueCount: number;
  documentCount: number;
  partyCount: number;
}

export function computeAgingKpis(documents: OpenDocument[]): AgingKpis {
  const overdue = documents.filter((doc) => doc.daysOverdue > 0);
  return {
    totalOpen: round2(documents.reduce((sum, doc) => sum + doc.open, 0)),
    totalOverdue: round2(overdue.reduce((sum, doc) => sum + doc.open, 0)),
    overdueCount: overdue.length,
    documentCount: documents.length,
    partyCount: new Set(documents.map((doc) => doc.partyId || doc.partyName)).size,
  };
}

/** Keep one customer/vendor, or everything when partyId is empty. */
export function filterByParty(documents: OpenDocument[], partyId: string): OpenDocument[] {
  if (!partyId) return documents;
  return documents.filter((doc) => (doc.partyId || doc.partyName) === partyId);
}

/** Customers/vendors that have open documents, for the filter dropdown. */
export function listParties(documents: OpenDocument[]): { id: string; name: string }[] {
  const parties = new Map<string, string>();
  for (const doc of documents) parties.set(doc.partyId || doc.partyName, doc.partyName);
  return [...parties.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => byName(a.name, b.name));
}

// =============================================================================
// Reconciliation against the Balance Sheet control account
// =============================================================================

export interface ControlAccountBalance {
  /** Accounts the balance was read from (normally one: the tenant's default). */
  accountNames: string[];
  balance: number;
}

export interface AgingReconciliation {
  agingTotal: number;
  control: ControlAccountBalance | null;
  difference: number | null;
  reconciled: boolean;
}

/** The fields the reconciliation reads from a Balance Sheet ledger account. */
export interface LedgerAccountBalance {
  id: string;
  name: string;
  ledgerGroup: string;
  startingBalance?: number;
  calculatedBalance?: number;
}

/**
 * The control account's Balance Sheet balance for one side of the aging.
 *
 * Invoices debit Account.defaultReceivableAccount and bills credit
 * Account.defaultPayableAccount, so that account (by id) is the control
 * account. When the tenant has no default configured, fall back to every
 * ASSET account named "receivable" (or LIABILITY named "payable") and say which
 * ones were used. Balances follow the Balance Sheet page: calculatedBalance,
 * else startingBalance; liabilities are shown positive.
 */
export function resolveControlAccount(
  ledgerAccounts: LedgerAccountBalance[],
  side: AgingSide,
  defaultAccountId?: string | null
): ControlAccountBalance | null {
  const group = side === 'receivables' ? 'ASSET' : 'LIABILITY';
  const pattern = side === 'receivables' ? /receivable/i : /payable/i;

  const byId = defaultAccountId ? ledgerAccounts.filter((a) => a.id === defaultAccountId) : [];
  const matches =
    byId.length > 0 ? byId : ledgerAccounts.filter((a) => a.ledgerGroup === group && pattern.test(a.name));
  if (matches.length === 0) return null;

  const raw = matches.reduce((sum, a) => sum + (toNumber(a.calculatedBalance) || toNumber(a.startingBalance)), 0);
  return {
    accountNames: matches.map((a) => a.name),
    balance: round2(side === 'payables' ? Math.abs(raw) : raw),
  };
}

/**
 * Compare the aging total (all customers/vendors, every bucket) with the
 * control account balance on the Balance Sheet for the same date.
 */
export function reconcileAging(agingTotal: number, control: ControlAccountBalance | null): AgingReconciliation {
  if (!control) return { agingTotal: round2(agingTotal), control: null, difference: null, reconciled: false };
  const difference = round2(agingTotal - control.balance);
  return {
    agingTotal: round2(agingTotal),
    control,
    difference,
    reconciled: Math.abs(difference) < OPEN_EPSILON,
  };
}

// =============================================================================
// CSV (built from the same rows the screen shows)
// =============================================================================

function csvCell(value: string | number): string {
  const text = typeof value === 'number' ? value.toFixed(2) : value;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows: (string | number)[][]): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function buildSummaryCsv(summary: AgingSummary, partyLabel: string, asOf: string): string {
  return toCsv([
    [`As of ${asOf}`],
    [partyLabel, ...summary.buckets.map((b) => b.label), 'Total'],
    ...summary.rows.map((row) => [row.partyName, ...row.amounts, row.total]),
    ['Total', ...summary.totals, summary.total],
  ]);
}

export function buildDocumentsCsv(
  documents: OpenDocument[],
  labels: { party: string; document: string },
  asOf: string,
  config?: AgingBucketConfig
): string {
  const buckets = config ? buildBuckets(config) : null;
  const header = [labels.document, labels.party, 'Date', 'Due date', 'Days overdue'];
  if (buckets) header.push('Aging period');
  header.push('Total', 'Paid', 'Open balance');

  const total = round2(documents.reduce((sum, doc) => sum + doc.open, 0));
  return toCsv([
    [`As of ${asOf}`],
    header,
    ...documents.map((doc) => {
      const row: (string | number)[] = [
        doc.reference,
        doc.partyName,
        doc.date,
        doc.dueDate,
        String(Math.max(0, doc.daysOverdue)),
      ];
      if (buckets && config) row.push(buckets[bucketIndexFor(doc.daysOverdue, config)].label);
      row.push(doc.total, doc.paid, doc.open);
      return row;
    }),
    ['Total', '', '', '', '', ...(buckets ? [''] : []), '', '', total],
  ]);
}
