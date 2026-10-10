/**
 * Added (SOUPFIN-104): how each report in the core pack gets its rows.
 *
 * A loader takes the toolbar's dates and returns a ReportTable. Reports the
 * backend computes (P&L, Balance Sheet, account balances, client income,
 * vendor purchases, sales tax, the general ledger) read FinanceReportsController.
 * The rest aggregate the paged list endpoints in the browser; each of those is
 * listed in plans/soupfin-104-core-report-pack-backend.md as a candidate for a
 * server-side endpoint.
 *
 * Dates are compared as `YYYY-MM-DD` strings, never through `new Date()`, so a
 * report reads the same east and west of UTC (SOUPFIN-64/72).
 */
import {
  getBalanceSheetDirect,
  getIncomeStatement,
  fetchReportRows,
  type ReportFilters,
  type ReportRow,
} from '../../api/endpoints/reports';
import { listInvoices, listAllInvoicePayments } from '../../api/endpoints/invoices';
import { listBills, listAllBillPayments, extractVendorName } from '../../api/endpoints/bills';
import { listLedgerAccounts } from '../../api/endpoints/ledger';
import {
  fetchAllPages,
  getClientIncome,
  getGeneralLedger,
  getSalesTax,
  getVendorPurchases,
  listBillItemsPage,
  listInvoiceItemsPage,
  listLedgerTransactionsPage,
  GENERAL_LEDGER_ACCOUNT_LIMIT,
  type RawRecord,
  type ReportRef,
} from '../../api/endpoints/reportPack';
import type { Bill, BillPayment, Invoice, InvoicePayment, ProfitLoss } from '../../types';
import {
  REPORT_MIN_DATE,
  addDays,
  addMonths,
  getComparisonAsOf,
  getComparisonRange,
  type DateRange,
} from './reportDates';
import {
  REPORT_ROW_LIMIT,
  percentOf,
  round2,
  toReportNumber,
  type ReportColumn,
  type ReportTable,
} from './reportTable';

export interface ReportLoadContext {
  /** The selected range. For as-of reports, from and to are both the as-of date. */
  range: DateRange;
  /** from/to as the backend reads them. */
  filters: ReportFilters;
}

export type ReportLoader = (context: ReportLoadContext) => Promise<ReportTable>;

// =============================================================================
// Shared helpers
// =============================================================================

/** The date part of a backend value: "2026-10-01T00:00:00Z" -> "2026-10-01". */
export function isoDay(value: unknown): string {
  return typeof value === 'string' ? value.split('T')[0] : '';
}

/** True when an ISO day falls inside the range, both ends included. */
export function inRange(day: string, range: DateRange): boolean {
  return Boolean(day) && day >= range.from && day <= range.to;
}

/** A label for a Grails reference or enum: name, then serialised, then the raw string. */
export function refLabel(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const ref = value as ReportRef & { enumType?: string };
    return ref.name || ref.serialised || fallback;
  }
  return fallback;
}

function refId(value: unknown): string {
  return value && typeof value === 'object' ? String((value as ReportRef).id ?? '') : '';
}

export function invoiceLabel(invoice: Pick<Invoice, 'number' | 'numberPrefix' | 'serialised'>): string {
  if (invoice.number !== undefined && invoice.number !== null) {
    return `${invoice.numberPrefix ?? ''}${invoice.number}`;
  }
  return invoice.serialised ?? '';
}

export function billLabel(bill: Pick<Bill, 'billNumber' | 'number' | 'numberPrefix'>): string {
  if (bill.billNumber) return bill.billNumber;
  if (bill.number !== undefined && bill.number !== null) return `${bill.numberPrefix ?? ''}${bill.number}`;
  return '';
}

export function customerOf(invoice: Pick<Invoice, 'accountServices'>): string {
  return invoice.accountServices?.serialised || 'Unknown customer';
}

export function vendorOf(bill: Pick<Bill, 'vendor'>): string {
  return extractVendorName(bill.vendor) || 'Unknown vendor';
}

const isCancelled = (status: unknown) => String(status ?? '').toUpperCase() === 'CANCELLED';

function byKey<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}

const sum = <T>(items: T[], value: (item: T) => unknown) =>
  round2(items.reduce((total, item) => total + toReportNumber(value(item)), 0));

const byDate = (a: ReportRow, b: ReportRow) => String(a.date ?? '').localeCompare(String(b.date ?? ''));
const byName = (field: string) => (a: ReportRow, b: ReportRow) =>
  String(a[field] ?? '').localeCompare(String(b[field] ?? ''));

// -----------------------------------------------------------------------------
// Sources shared by several reports
// -----------------------------------------------------------------------------

async function loadInvoices() {
  return fetchAllPages<Invoice>((params) => listInvoices(params), REPORT_ROW_LIMIT);
}
async function loadBills() {
  return fetchAllPages<Bill>((params) => listBills(params), REPORT_ROW_LIMIT);
}
async function loadInvoicePayments() {
  return fetchAllPages<InvoicePayment>((params) => listAllInvoicePayments(params), REPORT_ROW_LIMIT);
}
async function loadBillPayments() {
  return fetchAllPages<BillPayment>((params) => listAllBillPayments(params), REPORT_ROW_LIMIT);
}

/** Invoices dated in the range, cancelled ones left out. */
async function invoicesInRange(range: DateRange) {
  const { items, truncated } = await loadInvoices();
  return {
    invoices: items.filter((i) => !isCancelled(i.status) && inRange(isoDay(i.invoiceDate), range)),
    truncated,
  };
}

/** Bills dated in the range, cancelled ones left out. */
async function billsInRange(range: DateRange) {
  const { items, truncated } = await loadBills();
  return {
    bills: items.filter((b) => !isCancelled(b.status) && inRange(isoDay(b.billDate), range)),
    truncated,
  };
}

// =============================================================================
// Business overview
// =============================================================================

const INCOME = 'Income';
const EXPENSES = 'Expenses';

/** Calendar months covering the range, each clipped to it. */
export function monthsInRange(range: DateRange): DateRange[] {
  const months: DateRange[] = [];
  let start = range.from;
  while (start <= range.to) {
    const firstOfNext = addMonths(`${start.slice(0, 7)}-01`, 1);
    const end = addDays(firstOfNext, -1);
    months.push({ from: start, to: end < range.to ? end : range.to });
    start = firstOfNext;
  }
  return months;
}

/** Most months P&L by Month will lay side by side. */
export const MAX_REPORT_MONTHS = 24;

export function monthHeader(isoMonthStart: string): string {
  const [year, month] = isoMonthStart.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'short', year: 'numeric' });
}

/** Income and expense rows for several P&L results side by side, keyed by `keys`. */
function sideBySide(results: ProfitLoss[], keys: string[]): ReportRow[] {
  const rows: ReportRow[] = [];
  for (const [section, pick] of [
    [INCOME, (p: ProfitLoss) => p.income],
    [EXPENSES, (p: ProfitLoss) => p.expenses],
  ] as const) {
    const accounts = new Map<string, ReportRow>();
    results.forEach((result, index) => {
      for (const item of pick(result)) {
        // Every column starts at 0, so an account with nothing in one period
        // reads 0.00 there rather than a blank cell.
        const row =
          accounts.get(item.account) ??
          Object.fromEntries([['account', item.account], ['section', section], ...keys.map((k) => [k, 0])]);
        row[keys[index]] = round2(toReportNumber(row[keys[index]]) + item.amount);
        accounts.set(item.account, row);
      }
    });
    rows.push(...[...accounts.values()].sort(byName('account')));
  }
  return rows;
}

/** Net income per column: income rows minus expense rows. */
function netIncomeRow(rows: ReportRow[], keys: string[], label = 'Net income'): ReportRow {
  const net: ReportRow = { account: label };
  for (const key of keys) {
    net[key] = round2(
      rows.reduce(
        (total, row) =>
          total + (row.section === INCOME ? 1 : -1) * toReportNumber(row[key]),
        0
      )
    );
  }
  return net;
}

export const loadProfitLossByMonth: ReportLoader = async ({ range }) => {
  const months = monthsInRange(range);
  if (months.length > MAX_REPORT_MONTHS) {
    throw new Error(
      `P&L by Month shows at most ${MAX_REPORT_MONTHS} months. Pick a shorter date range.`
    );
  }
  const results = await Promise.all(months.map((m) => getIncomeStatement({ from: m.from, to: m.to })));
  const keys = months.map((m) => `m${m.from.slice(0, 7).replace('-', '')}`);
  const rows = sideBySide(results, keys);
  for (const row of rows) row.total = round2(keys.reduce((t, k) => t + toReportNumber(row[k]), 0));

  const columns: ReportColumn[] = [
    { key: 'account', header: 'Account', type: 'text' },
    ...months.map((m, i) => ({ key: keys[i], header: monthHeader(m.from), type: 'currency' as const })),
    { key: 'total', header: 'Total', type: 'currency' },
  ];
  return { rows, columns, summaryRows: [netIncomeRow(rows, [...keys, 'total'])] };
};

export const loadProfitLossComparative: ReportLoader = async ({ range }) => {
  const prior = getComparisonRange(range, 'previousYear')!;
  const [current, previous] = await Promise.all([
    getIncomeStatement({ from: range.from, to: range.to }),
    getIncomeStatement({ from: prior.from, to: prior.to }),
  ]);
  const rows = sideBySide([current, previous], ['current', 'prior']);
  const withChange = (row: ReportRow) => {
    const change = round2(toReportNumber(row.current) - toReportNumber(row.prior));
    return { ...row, change, changePercent: percentOf(change, Math.abs(toReportNumber(row.prior))) };
  };
  return {
    rows: rows.map(withChange),
    summaryRows: [withChange(netIncomeRow(rows, ['current', 'prior']))],
  };
};

export const loadProfitLossPercentOfIncome: ReportLoader = async ({ filters }) => {
  const pl = await getIncomeStatement(filters);
  const rows = sideBySide([pl], ['amount']).map((row) => ({
    ...row,
    percent: percentOf(toReportNumber(row.amount), pl.totalIncome),
  }));
  return {
    rows,
    summaryRows: [
      { account: 'Net income', amount: round2(pl.netProfit), percent: percentOf(pl.netProfit, pl.totalIncome) },
    ],
  };
};

function shareRows(items: { account: string; amount: number }[], whole: number): ReportRow[] {
  return [...items]
    .sort((a, b) => b.amount - a.amount)
    .map((item) => ({ account: item.account, amount: round2(item.amount), percent: percentOf(item.amount, whole) }));
}

export const loadIncomeByAccount: ReportLoader = async ({ filters }) => {
  const pl = await getIncomeStatement(filters);
  return { rows: shareRows(pl.income, pl.totalIncome) };
};

export const loadExpensesByCategory: ReportLoader = async ({ filters }) => {
  const pl = await getIncomeStatement(filters);
  return { rows: shareRows(pl.expenses, pl.totalExpenses) };
};

const BALANCE_SECTIONS = [
  ['Assets', 'assets'],
  ['Liabilities', 'liabilities'],
  ['Equity', 'equity'],
] as const;

export const loadBalanceSheetComparative: ReportLoader = async ({ range }) => {
  const priorAsOf = getComparisonAsOf(range.to, 'previousYear')!;
  const [current, prior] = await Promise.all([getBalanceSheetDirect(range.to), getBalanceSheetDirect(priorAsOf)]);
  const rows: ReportRow[] = [];
  for (const [section, field] of BALANCE_SECTIONS) {
    const accounts = new Map<string, ReportRow>();
    for (const [key, sheet] of [['current', current], ['prior', prior]] as const) {
      for (const item of sheet[field]) {
        const row = accounts.get(item.account) ?? { account: item.account, section, current: 0, prior: 0 };
        row[key] = round2(toReportNumber(row[key]) + item.balance);
        accounts.set(item.account, row);
      }
    }
    rows.push(...[...accounts.values()].sort(byName('account')));
  }
  for (const row of rows) row.change = round2(toReportNumber(row.current) - toReportNumber(row.prior));
  return {
    rows,
    summaryRows: [
      {
        account: 'Total liabilities and equity',
        current: round2(current.totalLiabilities + current.totalEquity),
        prior: round2(prior.totalLiabilities + prior.totalEquity),
        change: round2(
          current.totalLiabilities + current.totalEquity - (prior.totalLiabilities + prior.totalEquity)
        ),
      },
    ],
  };
};

export const loadBalanceSheetSummary: ReportLoader = async ({ range }) => {
  const sheet = await getBalanceSheetDirect(range.to);
  return {
    rows: [
      { section: 'Assets', accounts: sheet.assets.length, balance: round2(sheet.totalAssets) },
      { section: 'Liabilities', accounts: sheet.liabilities.length, balance: round2(sheet.totalLiabilities) },
      { section: 'Equity', accounts: sheet.equity.length, balance: round2(sheet.totalEquity) },
    ],
    summaryRows: [
      { section: 'Liabilities and equity', balance: round2(sheet.totalLiabilities + sheet.totalEquity) },
      {
        section: 'Difference (assets less liabilities and equity)',
        balance: round2(sheet.totalAssets - sheet.totalLiabilities - sheet.totalEquity),
      },
    ],
  };
};

const ACCOUNT_BALANCES = '/financeReports/accountBalances.json';

export const loadBalanceSheetDetail: ReportLoader = async ({ filters }) => {
  const rows = await fetchReportRows(ACCOUNT_BALANCES, filters, 'groupedAccountList');
  const order = ['Assets', 'Liabilities', 'Equity'];
  return {
    rows: rows
      .filter((row) => order.includes(String(row.ledgerGroup)))
      .sort(
        (a, b) =>
          order.indexOf(String(a.ledgerGroup)) - order.indexOf(String(b.ledgerGroup)) ||
          byName('name')(a, b)
      ),
  };
};

export const loadChangesInEquity: ReportLoader = async ({ filters }) => {
  const [rows, pl] = await Promise.all([
    fetchReportRows(ACCOUNT_BALANCES, filters, 'groupedAccountList'),
    getIncomeStatement(filters),
  ]);
  const equity = rows.filter((row) => row.ledgerGroup === 'Equity').sort(byName('name'));
  const profit = round2(pl.netProfit);
  equity.push({
    name: 'Profit for the period (not yet closed to equity)',
    startingBalance: 0,
    calculatedDebitBalance: profit < 0 ? -profit : 0,
    calculatedCreditBalance: profit > 0 ? profit : 0,
    endingBalance: profit,
  });
  return { rows: equity };
};

// =============================================================================
// Who owes you (sales and customers)
// =============================================================================

function invoiceRow(invoice: Invoice): ReportRow {
  return {
    id: invoice.id,
    date: isoDay(invoice.invoiceDate),
    dueDate: isoDay(invoice.paymentDate),
    number: invoiceLabel(invoice),
    customer: customerOf(invoice),
    status: invoice.status ?? '',
    subtotal: round2(invoice.subtotal ?? 0),
    tax: round2(invoice.taxAmount ?? 0),
    total: round2(invoice.totalAmount ?? 0),
    paid: round2(invoice.amountPaid ?? 0),
    balance: round2(invoice.amountDue ?? 0),
  };
}

export const loadSalesByCustomerSummary: ReportLoader = async ({ range }) => {
  const { invoices, truncated } = await invoicesInRange(range);
  const rows = [...byKey(invoices, customerOf)].map(([customer, list]) => ({
    customer,
    invoices: list.length,
    subtotal: sum(list, (i) => i.subtotal),
    tax: sum(list, (i) => i.taxAmount),
    total: sum(list, (i) => i.totalAmount),
  }));
  return { rows: rows.sort(byName('customer')), truncated };
};

export const loadSalesByCustomerDetail: ReportLoader = async ({ range }) => {
  const { invoices, truncated } = await invoicesInRange(range);
  const rows = invoices.map(invoiceRow).sort((a, b) => byName('customer')(a, b) || byDate(a, b));
  return { rows, truncated };
};

export const loadInvoiceList: ReportLoader = async ({ range }) => {
  const { items, truncated } = await loadInvoices();
  const rows = items
    .filter((i) => inRange(isoDay(i.invoiceDate), range))
    .map(invoiceRow)
    .sort(byDate);
  return { rows, truncated };
};

interface ItemLine {
  product: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  parentId: string;
}

/** Invoice or bill items as lines: product name, quantity, price, amount. */
function toItemLines(items: RawRecord[], parentField: 'invoice' | 'bill'): ItemLine[] {
  return items.map((item) => {
    const quantity = toReportNumber(item.quantity);
    const unitPrice = toReportNumber(item.unitPrice);
    const description = String(item.description ?? '').trim();
    const amount = item.amount !== undefined && item.amount !== null ? toReportNumber(item.amount) : quantity * unitPrice;
    return {
      product: refLabel(item.serviceDescription) || description || 'Uncategorised',
      description,
      quantity,
      unitPrice: round2(unitPrice),
      amount: round2(amount),
      parentId: refId(item[parentField]),
    };
  });
}

async function invoiceItemLinesInRange(range: DateRange) {
  const [{ invoices, truncated: t1 }, items] = await Promise.all([
    invoicesInRange(range),
    fetchAllPages(listInvoiceItemsPage, REPORT_ROW_LIMIT),
  ]);
  const byId = new Map(invoices.map((i) => [i.id, i]));
  const lines = toItemLines(items.items, 'invoice')
    .map((line) => ({ line, invoice: byId.get(line.parentId) }))
    .filter((entry): entry is { line: ItemLine; invoice: Invoice } => Boolean(entry.invoice));
  return { lines, truncated: t1 || items.truncated };
}

function productSummary(lines: ItemLine[]): ReportRow[] {
  return [...byKey(lines, (l) => l.product)]
    .map(([product, list]) => {
      const quantity = sum(list, (l) => l.quantity);
      const amount = sum(list, (l) => l.amount);
      return { product, quantity, amount, averagePrice: quantity ? round2(amount / quantity) : 0 };
    })
    .sort(byName('product'));
}

export const loadSalesByProductSummary: ReportLoader = async ({ range }) => {
  const { lines, truncated } = await invoiceItemLinesInRange(range);
  return { rows: productSummary(lines.map((e) => e.line)), truncated };
};

export const loadSalesByProductDetail: ReportLoader = async ({ range }) => {
  const { lines, truncated } = await invoiceItemLinesInRange(range);
  const rows = lines
    .map(({ line, invoice }) => ({
      product: line.product,
      date: isoDay(invoice.invoiceDate),
      number: invoiceLabel(invoice),
      customer: customerOf(invoice),
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      amount: line.amount,
    }))
    .sort((a, b) => byName('product')(a, b) || byDate(a, b));
  return { rows, truncated };
};

/**
 * Open balances as of a date: invoices (or bills) dated on or before it, less
 * the payments dated on or before it. A payment made after the date does not
 * reduce the balance the report shows for that date.
 */
function openAsOf<T extends { id: string }>(
  documents: T[],
  payments: { parentId: string; date: string; amount: number }[],
  asOf: string,
  total: (doc: T) => number
): { doc: T; total: number; paid: number; balance: number }[] {
  const paid = new Map<string, number>();
  for (const payment of payments) {
    if (payment.date && payment.date <= asOf) {
      paid.set(payment.parentId, (paid.get(payment.parentId) ?? 0) + payment.amount);
    }
  }
  return documents
    .map((doc) => {
      const docTotal = round2(total(doc));
      const docPaid = round2(paid.get(doc.id) ?? 0);
      return { doc, total: docTotal, paid: docPaid, balance: round2(docTotal - docPaid) };
    })
    .filter((entry) => entry.balance > 0.004);
}

async function openInvoicesAsOf(asOf: string) {
  const [invoices, payments] = await Promise.all([loadInvoices(), loadInvoicePayments()]);
  const dated = invoices.items.filter((i) => !isCancelled(i.status) && isoDay(i.invoiceDate) && isoDay(i.invoiceDate) <= asOf);
  const open = openAsOf(
    dated,
    payments.items.map((p) => ({ parentId: refId(p.invoice), date: isoDay(p.paymentDate), amount: toReportNumber(p.amount) })),
    asOf,
    (i) => i.totalAmount ?? 0
  );
  return { open, truncated: invoices.truncated || payments.truncated };
}

export const loadCustomerBalanceSummary: ReportLoader = async ({ range }) => {
  const { open, truncated } = await openInvoicesAsOf(range.to);
  const rows = [...byKey(open, (e) => customerOf(e.doc))]
    .map(([customer, list]) => ({ customer, invoices: list.length, balance: sum(list, (e) => e.balance) }))
    .sort(byName('customer'));
  return { rows, truncated };
};

export const loadCustomerBalanceDetail: ReportLoader = async ({ range }) => {
  const { open, truncated } = await openInvoicesAsOf(range.to);
  const rows = open
    .map((e) => ({
      customer: customerOf(e.doc),
      date: isoDay(e.doc.invoiceDate),
      dueDate: isoDay(e.doc.paymentDate),
      number: invoiceLabel(e.doc),
      total: e.total,
      paid: e.paid,
      balance: e.balance,
    }))
    .sort((a, b) => byName('customer')(a, b) || byDate(a, b));
  return { rows, truncated };
};

export const loadIncomeByCustomer: ReportLoader = async ({ filters }) => {
  const items = await getClientIncome(filters);
  const rows = items
    .map((item) => {
      const income = round2(toReportNumber(item.income));
      const paid = round2(toReportNumber(item.paidIncome));
      return { customer: item.name || 'Unknown customer', income, paid, unpaid: round2(income - paid) };
    })
    .sort(byName('customer'));
  return { rows };
};

// =============================================================================
// What you owe (expenses and vendors)
// =============================================================================

function billRow(bill: Bill): ReportRow {
  return {
    id: bill.id,
    date: isoDay(bill.billDate),
    dueDate: isoDay(bill.paymentDate),
    number: billLabel(bill),
    vendor: vendorOf(bill),
    status: bill.status ?? '',
    subtotal: round2(bill.subtotal ?? 0),
    tax: round2(bill.taxAmount ?? 0),
    total: round2(bill.totalAmount ?? 0),
    paid: round2(bill.amountPaid ?? 0),
    balance: round2(bill.amountDue ?? 0),
  };
}

export const loadExpensesByVendorSummary: ReportLoader = async ({ range }) => {
  const { bills, truncated } = await billsInRange(range);
  const rows = [...byKey(bills, vendorOf)].map(([vendor, list]) => ({
    vendor,
    bills: list.length,
    subtotal: sum(list, (b) => b.subtotal),
    tax: sum(list, (b) => b.taxAmount),
    total: sum(list, (b) => b.totalAmount),
  }));
  return { rows: rows.sort(byName('vendor')), truncated };
};

export const loadExpensesByVendorDetail: ReportLoader = async ({ range }) => {
  const { bills, truncated } = await billsInRange(range);
  return { rows: bills.map(billRow).sort((a, b) => byName('vendor')(a, b) || byDate(a, b)), truncated };
};

export const loadVendorPurchases: ReportLoader = async ({ filters }) => {
  const items = await getVendorPurchases(filters);
  const rows = items
    .map((item) => {
      const purchases = round2(toReportNumber(item.purchases));
      const paid = round2(toReportNumber(item.paidPurchases));
      return { vendor: item.name || 'Unknown vendor', purchases, paid, unpaid: round2(purchases - paid) };
    })
    .sort(byName('vendor'));
  return { rows };
};

export const loadBillList: ReportLoader = async ({ range }) => {
  const { items, truncated } = await loadBills();
  const rows = items
    .filter((b) => inRange(isoDay(b.billDate), range))
    .map(billRow)
    .sort(byDate);
  return { rows, truncated };
};

async function openBillsAsOf(asOf: string) {
  const [bills, payments] = await Promise.all([loadBills(), loadBillPayments()]);
  const dated = bills.items.filter((b) => !isCancelled(b.status) && isoDay(b.billDate) && isoDay(b.billDate) <= asOf);
  const open = openAsOf(
    dated,
    payments.items.map((p) => ({ parentId: refId(p.bill), date: isoDay(p.paymentDate), amount: toReportNumber(p.amount) })),
    asOf,
    (b) => b.totalAmount ?? 0
  );
  return { open, truncated: bills.truncated || payments.truncated };
}

export const loadVendorBalanceSummary: ReportLoader = async ({ range }) => {
  const { open, truncated } = await openBillsAsOf(range.to);
  const rows = [...byKey(open, (e) => vendorOf(e.doc))]
    .map(([vendor, list]) => ({ vendor, bills: list.length, balance: sum(list, (e) => e.balance) }))
    .sort(byName('vendor'));
  return { rows, truncated };
};

export const loadVendorBalanceDetail: ReportLoader = async ({ range }) => {
  const { open, truncated } = await openBillsAsOf(range.to);
  const rows = open
    .map((e) => ({
      vendor: vendorOf(e.doc),
      date: isoDay(e.doc.billDate),
      dueDate: isoDay(e.doc.paymentDate),
      number: billLabel(e.doc),
      total: e.total,
      paid: e.paid,
      balance: e.balance,
    }))
    .sort((a, b) => byName('vendor')(a, b) || byDate(a, b));
  return { rows, truncated };
};

export const loadTransactionListByVendor: ReportLoader = async ({ range }) => {
  const [bills, payments] = await Promise.all([loadBills(), loadBillPayments()]);
  const billsById = new Map(bills.items.map((b) => [b.id, b]));
  const rows: ReportRow[] = [];
  for (const bill of bills.items) {
    if (isCancelled(bill.status) || !inRange(isoDay(bill.billDate), range)) continue;
    rows.push({
      vendor: vendorOf(bill),
      date: isoDay(bill.billDate),
      type: 'Bill',
      number: billLabel(bill),
      reference: bill.purchaseOrderNumber ?? '',
      billed: round2(bill.totalAmount ?? 0),
      paid: null,
    });
  }
  for (const payment of payments.items) {
    if (!inRange(isoDay(payment.paymentDate), range)) continue;
    const bill = billsById.get(refId(payment.bill));
    rows.push({
      vendor: bill ? vendorOf(bill) : 'Unknown vendor',
      date: isoDay(payment.paymentDate),
      type: 'Bill payment',
      number: bill ? billLabel(bill) : '',
      reference: payment.reference ?? '',
      billed: null,
      paid: round2(toReportNumber(payment.amount)),
    });
  }
  return {
    rows: rows.sort((a, b) => byName('vendor')(a, b) || byDate(a, b)),
    truncated: bills.truncated || payments.truncated,
  };
};

export const loadPurchasesByProduct: ReportLoader = async ({ range }) => {
  const [{ bills, truncated: t1 }, items] = await Promise.all([
    billsInRange(range),
    fetchAllPages(listBillItemsPage, REPORT_ROW_LIMIT),
  ]);
  const ids = new Set(bills.map((b) => b.id));
  const lines = toItemLines(items.items, 'bill').filter((line) => ids.has(line.parentId));
  return { rows: productSummary(lines), truncated: t1 || items.truncated };
};

// =============================================================================
// Taxes
// =============================================================================

export const loadTaxDetail: ReportLoader = async ({ filters }) => {
  const report = await getSalesTax(filters);
  const rows = report.salesTaxList
    .map((item) => ({
      date: isoDay(item.invoiceDate),
      number: item.invoiceNumber !== undefined && item.invoiceNumber !== null ? String(item.invoiceNumber) : '',
      customer: item.clientName || 'Unknown customer',
      sales: round2(toReportNumber(item.salesAmount)),
      tax: round2(toReportNumber(item.taxAmount)),
      total: round2(toReportNumber(item.totalAmount)),
    }))
    .sort(byDate);
  return { rows };
};

export const loadTaxSummaryByRate: ReportLoader = async ({ filters }) => {
  const report = await getSalesTax(filters);
  const rates = new Map<string, ReportRow>();
  for (const item of report.salesTaxList) {
    for (const entry of item.taxBreakdown ?? []) {
      const rate = round2(toReportNumber(entry.taxRate));
      const name = entry.taxName || 'Tax';
      const key = `${name}|${rate}`;
      const row = rates.get(key) ?? { tax: name, rate, invoices: 0, collected: 0 };
      row.invoices = toReportNumber(row.invoices) + 1;
      row.collected = round2(toReportNumber(row.collected) + toReportNumber(entry.taxAmount));
      rates.set(key, row);
    }
  }
  return { rows: [...rates.values()].sort(byName('tax')) };
};

export const loadTaxOnPurchases: ReportLoader = async ({ range }) => {
  const { bills, truncated } = await billsInRange(range);
  const rows = bills
    .filter((b) => toReportNumber(b.taxAmount) !== 0)
    .map(billRow)
    .sort(byDate);
  return { rows, truncated };
};

export const loadTaxLiability: ReportLoader = async ({ range, filters }) => {
  const [sales, { bills, truncated }] = await Promise.all([getSalesTax(filters), billsInRange(range)]);
  const taxedBills = bills.filter((b) => toReportNumber(b.taxAmount) !== 0);
  const collected = round2(sales.totalTaxAmount);
  const paid = sum(taxedBills, (b) => b.taxAmount);
  return {
    rows: [
      { item: 'Tax collected on sales', taxable: round2(sales.totalSalesAmount), tax: collected },
      { item: 'Tax paid on purchases (reclaimable)', taxable: sum(taxedBills, (b) => b.subtotal), tax: paid },
    ],
    summaryRows: [{ item: 'Net tax payable', tax: round2(collected - paid) }],
    truncated,
  };
};

// =============================================================================
// Banking
// =============================================================================

export function methodOf(payment: Pick<InvoicePayment, 'paymentMethod'>): string {
  return refLabel(payment.paymentMethod) || 'Not recorded';
}

async function invoicePaymentsInRange(range: DateRange) {
  const [invoices, payments] = await Promise.all([loadInvoices(), loadInvoicePayments()]);
  const byId = new Map(invoices.items.map((i) => [i.id, i]));
  return {
    entries: payments.items
      .filter((p) => inRange(isoDay(p.paymentDate), range))
      .map((payment) => ({ payment, invoice: byId.get(refId(payment.invoice)) })),
    truncated: invoices.truncated || payments.truncated,
  };
}

export const loadDepositDetail: ReportLoader = async ({ range }) => {
  const { entries, truncated } = await invoicePaymentsInRange(range);
  const rows = entries
    .map(({ payment, invoice }) => ({
      date: isoDay(payment.paymentDate),
      customer: invoice ? customerOf(invoice) : 'Unknown customer',
      number: invoice ? invoiceLabel(invoice) : '',
      method: methodOf(payment),
      account: refLabel(payment.payInAccount),
      reference: payment.reference ?? '',
      amount: round2(toReportNumber(payment.amount)),
    }))
    .sort(byDate);
  return { rows, truncated };
};

export const loadDepositsByMethod: ReportLoader = async ({ range }) => {
  const { entries, truncated } = await invoicePaymentsInRange(range);
  const rows = [...byKey(entries, (e) => methodOf(e.payment))]
    .map(([method, list]) => ({ method, payments: list.length, amount: sum(list, (e) => e.payment.amount) }))
    .sort(byName('method'));
  return { rows, truncated };
};

/** Matches cheque payment methods in British and American spelling. */
export const CHEQUE_METHOD = /\b(cheque|check)\b/i;

async function billPaymentRows(range: DateRange, keep: (payment: BillPayment) => boolean) {
  const [bills, payments] = await Promise.all([loadBills(), loadBillPayments()]);
  const byId = new Map(bills.items.map((b) => [b.id, b]));
  const rows = payments.items
    .filter((p) => inRange(isoDay(p.paymentDate), range) && keep(p))
    .map((payment) => {
      const bill = byId.get(refId(payment.bill));
      return {
        date: isoDay(payment.paymentDate),
        vendor: bill ? vendorOf(bill) : 'Unknown vendor',
        number: bill ? billLabel(bill) : '',
        method: methodOf(payment),
        reference: payment.reference ?? '',
        account: refLabel(payment.payOutAccount),
        amount: round2(toReportNumber(payment.amount)),
      };
    })
    .sort(byDate);
  return { rows, truncated: bills.truncated || payments.truncated };
}

export const loadChequeDetail: ReportLoader = ({ range }) =>
  billPaymentRows(range, (p) => CHEQUE_METHOD.test(methodOf(p)));

export const loadPaymentsMade: ReportLoader = ({ range }) => billPaymentRows(range, () => true);

// =============================================================================
// For my accountant
// =============================================================================

/** Debit and credit of one transaction as its account sees it. */
export function debitCredit(tx: RawRecord): { debit: number; credit: number } {
  if (tx.debit !== undefined && tx.debit !== null) {
    return { debit: round2(toReportNumber(tx.debit)), credit: round2(toReportNumber(tx.credit)) };
  }
  const amount = round2(toReportNumber(tx.amount));
  return refLabel(tx.transactionState).toUpperCase() === 'CREDIT'
    ? { debit: 0, credit: amount }
    : { debit: amount, credit: 0 };
}

export const loadGeneralLedger: ReportLoader = async ({ range, filters }) => {
  const accounts = await getGeneralLedger(filters);
  const rows: ReportRow[] = [];
  for (const entry of [...accounts].sort((a, b) =>
    refLabel(a.account).localeCompare(refLabel(b.account))
  )) {
    const account = refLabel(entry.account, 'Unnamed account');
    rows.push({
      account,
      date: range.from,
      description: 'Opening balance',
      debit: null,
      credit: null,
      balance: round2(toReportNumber(entry.startingBalance)),
    });
    const transactions = [...(entry.transactionList ?? [])].sort((a, b) =>
      isoDay(a.transactionDate).localeCompare(isoDay(b.transactionDate))
    );
    for (const tx of transactions) {
      rows.push({
        account,
        date: isoDay(tx.transactionDate),
        description: String(tx.notes ?? tx.description ?? ''),
        ...debitCredit(tx),
        balance: round2(toReportNumber(tx.balance)),
      });
    }
  }
  return { rows, truncated: accounts.length >= GENERAL_LEDGER_ACCOUNT_LIMIT };
};

interface JournalLine extends ReportRow {
  entry: string;
  date: string;
  account: string;
  description: string;
  debit: number;
  credit: number;
}

/**
 * The account lines of one ledger transaction. A double-entry transaction
 * names both sides and becomes two lines; a single-entry one names one
 * account and a DEBIT or CREDIT state.
 */
export function journalLines(tx: RawRecord): JournalLine[] {
  const date = isoDay(tx.transactionDate);
  const description = String(tx.notes ?? tx.description ?? '');
  const amount = round2(toReportNumber(tx.amount));
  const entry = `${date} ${refLabel(tx.ledgerTransactionGroup) || description || refId(tx)}`.trim();
  const base = { entry, date, description };
  if (tx.debitLedgerAccount || tx.creditLedgerAccount) {
    const lines: JournalLine[] = [];
    if (tx.debitLedgerAccount) {
      lines.push({ ...base, account: refLabel(tx.debitLedgerAccount), debit: amount, credit: 0 });
    }
    if (tx.creditLedgerAccount) {
      lines.push({ ...base, account: refLabel(tx.creditLedgerAccount), debit: 0, credit: amount });
    }
    return lines;
  }
  return [{ ...base, account: refLabel(tx.ledgerAccount, 'Unnamed account'), ...debitCredit(tx) }];
}

async function journalLinesInRange(range: DateRange) {
  const { items, truncated } = await fetchAllPages(listLedgerTransactionsPage, REPORT_ROW_LIMIT);
  const lines = items
    .filter((tx) => inRange(isoDay(tx.transactionDate), range))
    .flatMap(journalLines);
  return { lines, truncated };
}

export const loadJournal: ReportLoader = async ({ range }) => {
  const { lines, truncated } = await journalLinesInRange(range);
  return { rows: lines.sort((a, b) => byDate(a, b) || byName('entry')(a, b)), truncated };
};

export const loadTransactionListByDate: ReportLoader = async ({ range }) => {
  const { lines, truncated } = await journalLinesInRange(range);
  return { rows: lines.sort((a, b) => byDate(a, b) || byName('account')(a, b)), truncated };
};

const GROUP_LABELS: Record<string, string> = {
  ASSET: 'Assets',
  LIABILITY: 'Liabilities',
  EQUITY: 'Equity',
  REVENUE: 'Revenue',
  INCOME: 'Revenue',
  EXPENSE: 'Expenses',
};
const GROUP_ORDER = ['Assets', 'Liabilities', 'Equity', 'Revenue', 'Expenses'];

export const loadAccountList: ReportLoader = async ({ range }) => {
  const [accounts, balances] = await Promise.all([
    fetchAllPages((params) => listLedgerAccounts(params), REPORT_ROW_LIMIT),
    fetchReportRows(ACCOUNT_BALANCES, { from: REPORT_MIN_DATE, to: range.to }, 'groupedAccountList'),
  ]);
  // Balance rows are built from LedgerAccount.properties, which may leave out
  // `id`, so they are matched by id where present and by name otherwise.
  const closing = new Map<string, number>();
  for (const row of balances) {
    const value = toReportNumber(row.endingBalance);
    if (row.id) closing.set(`id:${row.id}`, value);
    if (row.name) closing.set(`name:${row.name}`, value);
  }
  const closingOf = (account: { id: string; name: string; balance?: number }) =>
    closing.get(`id:${account.id}`) ?? closing.get(`name:${account.name}`) ?? toReportNumber(account.balance);
  const rows = accounts.items
    .filter((account) => account.isActive !== false)
    .map((account) => ({
      code: account.code ?? '',
      account: account.name,
      type: GROUP_LABELS[String(account.ledgerGroup)] ?? 'Other',
      category: refLabel(account.ledgerAccountCategory).split('<')[0].trim(),
      balance: round2(closingOf(account)),
    }))
    .sort(
      (a, b) =>
        GROUP_ORDER.indexOf(a.type) - GROUP_ORDER.indexOf(b.type) ||
        String(a.code).localeCompare(String(b.code), undefined, { numeric: true }) ||
        a.account.localeCompare(b.account)
    );
  return { rows, truncated: accounts.truncated };
};
