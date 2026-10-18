/**
 * Added (SOUPFIN-281): open invoices and bills for the aging page tests.
 *
 * SOUPFIN-105 moved aging into the browser: the pages fetch every invoice, bill and payment
 * (api/endpoints/aging) and bucket them in agingEngine. The older tests mocked the backend aging
 * report the page no longer calls, so it never left its loading state. These builders give the
 * engine the documents it reads.
 */
import type { PayablesSource, ReceivablesSource } from '../../../api/endpoints/aging';

/** A calendar day `days` from today, as yyyy-MM-dd (negative = in the past). */
export function dayFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

let seq = 0;

/** An unpaid invoice of `amount`, issued 40 days before its due date, due `dueInDays` from today. */
export function openInvoice(customer: string, amount: number, dueInDays = 10) {
  seq += 1;
  return {
    id: `inv-${seq}`,
    numberPrefix: 'INV-',
    number: seq,
    accountServices: { id: `cust-${customer}`, serialised: customer },
    invoiceDate: dayFromToday(Math.min(dueInDays, 0) - 40),
    paymentDate: dayFromToday(dueInDays),
    totalAmount: amount,
    status: 'PENDING',
    exchangeRate: 1,
  };
}

/** An unpaid bill of `amount`, due `dueInDays` from today. */
export function openBill(vendor: string, amount: number, dueInDays = 10) {
  seq += 1;
  return {
    id: `bill-${seq}`,
    billNumber: `BILL-${seq}`,
    vendor: { id: `vend-${vendor}`, name: vendor },
    billDate: dayFromToday(Math.min(dueInDays, 0) - 40),
    paymentDate: dayFromToday(dueInDays),
    totalAmount: amount,
    status: 'PENDING',
    exchangeRate: 1,
  };
}

export function receivables(invoices: ReturnType<typeof openInvoice>[] = []): ReceivablesSource {
  return { invoices, payments: [], truncated: false } as unknown as ReceivablesSource;
}

export function payables(bills: ReturnType<typeof openBill>[] = []): PayablesSource {
  return { bills, payments: [], truncated: false } as unknown as PayablesSource;
}

/** No control accounts: the overview shows the documents' own totals. */
export const NO_CONTROL_ACCOUNTS = { account: {}, ledgerAccounts: [] };
