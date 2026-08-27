/**
 * PDF template tests — line-item Tax column (SOUPFIN-47).
 *
 * The bill template printed `${item.taxRate}%`. `BillItem` has NO `taxRate`
 * column, and `getBill()` normalises the missing field to `Number(...) || 0`, so
 * every line of every downloaded/emailed bill claimed `0%` — under a total block
 * that reported the tax. The invoice template hardcoded `-`, so a taxed invoice
 * line never showed its rate at all.
 *
 * These assert the rendered HTML, which is the artifact the vendor/client
 * receives: input (line items + catalogue) -> output (the Tax cell).
 */
import { describe, it, expect } from 'vitest';
import { generateBillHtml, generateInvoiceHtml, type TaxRateOption } from '../templates';
import type { Bill, Invoice } from '../../../types';

const company = { name: 'Acme Ltd' };
const formatCurrency = (amount: number | null | undefined) => `GHS ${(amount ?? 0).toFixed(2)}`;

/** Mirrors `listTaxRates()`: NO_TAX_OPTION (empty id!) prepended to real entries. */
const catalogue: TaxRateOption[] = [
  { id: '', rate: 0 },
  { id: 'uuid-vat', rate: 15, serialised: 'VAT-15.0%' },
  { id: 'uuid-cst', rate: 5, serialised: 'CST-5.0%' },
];

/** Grails serialises the bill join with ONE trailing number, the invoice with two. */
const BILL_ROW_VAT = 'TaxEntryBillItem(BillItem(Consulting, 2, 500.0), VAT-15.0%, 150.0)';
const INVOICE_ROW_VAT = 'TaxEntryInvoiceItem(InvoiceItem(Consulting, 2, 500.0), VAT-15.0%, 150.0, 1150.0)';

function billWith(items: Partial<Bill['billItemList']>[0][] = []): Bill {
  return {
    id: 'bill-1',
    billNumber: 'BILL-001',
    vendor: { id: 'v-1', name: 'Vendor Co' },
    billDate: '2026-08-01',
    paymentDate: '2026-08-31',
    status: 'PENDING',
    subtotal: 1000,
    taxAmount: 150,
    totalAmount: 1150,
    amountPaid: 0,
    amountDue: 1150,
    billItemList: items,
  } as Bill;
}

function invoiceWith(items: Partial<Invoice['invoiceItemList']>[0][] = []): Invoice {
  return {
    id: 'inv-1',
    number: 42,
    accountServices: { id: 'as-1', serialised: 'Direct Account : Corporate(Client Co)' },
    invoiceDate: '2026-08-01',
    paymentDate: '2026-08-31',
    status: 'SENT',
    subtotal: 1000,
    taxAmount: 150,
    totalAmount: 1150,
    amountPaid: 0,
    amountDue: 1150,
    invoiceItemList: items,
  } as Invoice;
}

/** Pull the Tax cell out of each body row (4th of the 5 columns). */
function taxCells(html: string): string[] {
  const body = html.split('<tbody>')[1]?.split('</tbody>')[0] ?? '';
  return body
    .split('<tr>')
    .slice(1)
    .map((row) => row.match(/<td class="text-right">([^<]*)<\/td>\s*<td class="text-right font-medium">/)?.[1] ?? '')
    .filter((cell) => cell !== '');
}

describe('generateBillHtml — Tax column', () => {
  it('prints the resolved rate for a taxed line, not 0%', () => {
    const html = generateBillHtml(
      billWith([
        {
          id: 'bi-1',
          bill: { id: 'bill-1' },
          description: 'Consulting',
          quantity: 2,
          unitPrice: 500,
          taxEntryBillItemList: [{ serialised: BILL_ROW_VAT }],
        },
      ]),
      company,
      formatCurrency,
      catalogue
    );

    expect(taxCells(html)).toEqual(['15%']);
    expect(html).not.toContain('>0%<');
  });

  it('reads the rate from an EXPANDED join row via taxEntry.id', () => {
    const html = generateBillHtml(
      billWith([
        {
          id: 'bi-1',
          bill: { id: 'bill-1' },
          description: 'Consulting',
          quantity: 1,
          unitPrice: 100,
          taxEntryBillItemList: [{ taxAmount: 5, taxEntry: { id: 'uuid-cst' } }],
        },
      ]),
      company,
      formatCurrency,
      catalogue
    );

    expect(taxCells(html)).toEqual(['5%']);
  });

  it('ignores the phantom item.taxRate the backend never sends', () => {
    // getBill() sets taxRate: Number(item.taxRate) || 0 — the regression guard.
    // A taxed line must NOT report that 0, and an item claiming 99 must not be
    // believed either: the join rows are the only source of truth.
    const html = generateBillHtml(
      billWith([
        {
          id: 'bi-1',
          bill: { id: 'bill-1' },
          description: 'Consulting',
          quantity: 1,
          unitPrice: 100,
          taxRate: 0,
          taxEntryBillItemList: [{ serialised: BILL_ROW_VAT }],
        },
        {
          id: 'bi-2',
          bill: { id: 'bill-1' },
          description: 'Hosting',
          quantity: 1,
          unitPrice: 100,
          taxRate: 99,
          taxEntryBillItemList: [{ taxEntry: { id: 'uuid-cst' } }],
        },
      ]),
      company,
      formatCurrency,
      catalogue
    );

    expect(taxCells(html)).toEqual(['15%', '5%']);
    expect(html).not.toContain('99%');
  });

  it('prints a truthful 0% only when the line carries no tax rows at all', () => {
    const html = generateBillHtml(
      billWith([
        {
          id: 'bi-1',
          bill: { id: 'bill-1' },
          description: 'Exempt supply',
          quantity: 1,
          unitPrice: 100,
          taxEntryBillItemList: [],
        },
      ]),
      company,
      formatCurrency,
      catalogue
    );

    expect(taxCells(html)).toEqual(['0%']);
  });

  it('renders an em dash — never 0% — when the entry cannot be named', () => {
    // Bare FK reference whose label is absent from the catalogue.
    const html = generateBillHtml(
      billWith([
        {
          id: 'bi-1',
          bill: { id: 'bill-1' },
          description: 'Consulting',
          quantity: 1,
          unitPrice: 100,
          taxEntryBillItemList: [
            { serialised: 'TaxEntryBillItem(BillItem(Consulting, 1, 100.0), NHIL-2.5%, 2.5)' },
          ],
        },
      ]),
      company,
      formatCurrency,
      catalogue
    );

    expect(taxCells(html)).toEqual(['&mdash;']);
    expect(html).not.toContain('>0%<');
  });

  it('renders an em dash when the catalogue is missing entirely (403 / still loading)', () => {
    const html = generateBillHtml(
      billWith([
        {
          id: 'bi-1',
          bill: { id: 'bill-1' },
          description: 'Consulting',
          quantity: 1,
          unitPrice: 100,
          taxEntryBillItemList: [{ serialised: BILL_ROW_VAT }],
        },
      ]),
      company,
      formatCurrency,
      undefined
    );

    expect(taxCells(html)).toEqual(['&mdash;']);
    expect(html).not.toContain('>0%<');
  });

  it('handles an empty line-item list without emitting a stray Tax cell', () => {
    const html = generateBillHtml(billWith([]), company, formatCurrency, catalogue);
    expect(taxCells(html)).toEqual([]);
  });

  it('stays correct under overload: 12 mixed lines, long text, 7-figure amounts', () => {
    const items = Array.from({ length: 12 }, (_, i) => ({
      id: `bi-${i}`,
      bill: { id: 'bill-1' },
      description: `Line ${i} — ${'extremely long service description '.repeat(4)}`,
      quantity: 999,
      unitPrice: 1234567.89,
      taxRate: 0, // the phantom field, present on every line
      taxEntryBillItemList:
        i % 3 === 0
          ? [{ serialised: BILL_ROW_VAT }] // resolvable -> 15%
          : i % 3 === 1
            ? [] // genuinely untaxed -> 0%
            : [{ serialised: 'TaxEntryBillItem(BillItem(x, 1, 1.0), UNKNOWN-9.0%, 9.0)' }], // -> dash
    }));

    const cells = taxCells(generateBillHtml(billWith(items), company, formatCurrency, catalogue));

    expect(cells).toHaveLength(12);
    expect(cells.filter((c) => c === '15%')).toHaveLength(4);
    expect(cells.filter((c) => c === '0%')).toHaveLength(4);
    expect(cells.filter((c) => c === '&mdash;')).toHaveLength(4);
  });
});

describe('generateInvoiceHtml — Tax column', () => {
  it('prints the resolved rate instead of the old hardcoded dash', () => {
    const html = generateInvoiceHtml(
      invoiceWith([
        {
          id: 'ii-1',
          description: 'Consulting',
          quantity: 2,
          unitPrice: 500,
          taxEntryInvoiceItemList: [{ serialised: INVOICE_ROW_VAT }],
        },
      ]),
      company,
      formatCurrency,
      catalogue
    );

    expect(taxCells(html)).toEqual(['15%']);
  });

  it('prints a truthful 0% for an untaxed invoice line', () => {
    const html = generateInvoiceHtml(
      invoiceWith([
        {
          id: 'ii-1',
          description: 'Exempt supply',
          quantity: 1,
          unitPrice: 100,
          taxEntryInvoiceItemList: [],
        },
      ]),
      company,
      formatCurrency,
      catalogue
    );

    expect(taxCells(html)).toEqual(['0%']);
  });

  it('renders an em dash when the invoice entry cannot be named', () => {
    const html = generateInvoiceHtml(
      invoiceWith([
        {
          id: 'ii-1',
          description: 'Consulting',
          quantity: 1,
          unitPrice: 100,
          taxEntryInvoiceItemList: [{ serialised: INVOICE_ROW_VAT }],
        },
      ]),
      company,
      formatCurrency,
      undefined
    );

    expect(taxCells(html)).toEqual(['&mdash;']);
    expect(html).not.toContain('>0%<');
  });
});
