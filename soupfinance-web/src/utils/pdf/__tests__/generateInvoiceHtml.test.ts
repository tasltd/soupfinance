/**
 * Unit tests for the invoice PDF line items (SOUPFIN-92).
 *
 * The defect: every line in the invoice PDF printed a hard-coded `-` in the
 * Tax column, while the Tax total under the table was right (GH₵3,600.00 on
 * invoice 1043). The lines could never add up to the total on paper.
 *
 * Each test starts from a raw backend response, runs it through getInvoice()
 * (so transformInvoice() computes the totals exactly as the detail page does),
 * renders generateInvoiceHtml(), and reads the Tax cells back out of the HTML.
 *
 * Note: axios is mocked globally via test/setup.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import type { Invoice } from '../../../types';

/** Verbatim shape of a TaxEntryInvoiceItem row from the LXC backend: a bare FK reference. */
const joinRow = (label: string, taxAmount: number, lineTotal: number) => ({
  class: 'soupbroker.finance.TaxEntryInvoiceItem',
  id: `tei-${label}-${taxAmount}`,
  serialised: `TaxEntryInvoiceItem(InvoiceItem(quantity:1.0, unitPrice:1000.00, invoice:Invoice(number:1043)), ${label}, ${taxAmount}, ${lineTotal})`,
});

const company = { name: 'Harbour Advisory Ltd' };

/** Deterministic GHS formatter, so the tests can read numbers back out. */
const formatCurrency = (amount: number | null | undefined) =>
  `GH₵${(amount ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const parseMoney = (text: string) => Number(text.replace(/[^\d.-]/g, ''));

describe('generateInvoiceHtml line tax (SOUPFIN-92)', () => {
  let mockGet: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockGet = vi.fn();
    (axios.create as ReturnType<typeof vi.fn>).mockReturnValue({
      interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
      get: mockGet,
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    });
  });

  /**
   * Serve `/invoice/show` and `/invoiceItem/index` the way the backend does,
   * then load the invoice through getInvoice() as the detail page does.
   */
  async function loadInvoice(invoiceItemList: unknown[], showItems: unknown[] = []): Promise<Invoice> {
    mockGet.mockImplementation((url: string) => {
      if (url.startsWith('/invoice/show/')) {
        return Promise.resolve({
          data: {
            id: 'inv-003',
            number: 1043,
            invoiceDate: '2026-01-05T00:00:00Z',
            paymentDate: '2026-02-04T00:00:00Z',
            accountServices: { id: 'as-003', serialised: 'Harbour Logistics Ltd' },
            invoiceItemList: showItems,
            invoicePaymentList: [],
          },
        });
      }
      if (url.startsWith('/invoiceItem/index.json')) {
        return Promise.resolve({ data: invoiceItemList });
      }
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    const { getInvoice } = await import('../../../api/endpoints/invoices');
    return getInvoice('inv-003');
  }

  /** Render the template and read the line-item table and the Tax total back. */
  async function render(invoice: Invoice) {
    const { generateInvoiceHtml } = await import('../templates');
    const html = generateInvoiceHtml(invoice, company, formatCurrency);
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const headers = [...doc.querySelectorAll('table thead th')].map((th) => th.textContent?.trim());
    const taxColumn = headers.indexOf('Tax');
    const rows = [...doc.querySelectorAll('table tbody tr')].map((tr) =>
      [...tr.querySelectorAll('td')].map((td) => td.textContent?.trim() ?? '')
    );
    const taxTotalRow = [...doc.querySelectorAll('.totals .total-row')].find(
      (row) => row.querySelector('.total-label')?.textContent?.trim() === 'Tax'
    );
    return {
      headers,
      rows,
      taxCells: rows.map((cells) => cells[taxColumn]),
      taxTotal: taxTotalRow?.querySelector('.total-value')?.textContent?.trim() ?? '',
    };
  }

  it('prints each line tax on invoice 1043 and they add up to the Tax total', async () => {
    // The ticket's invoice: 18,000 + 4 x 1,500 at 15% = 2,700 + 900 = 3,600.
    const invoice = await loadInvoice([
      { id: 'item-004', description: 'Process review — phase one', quantity: 1, unitPrice: 18000,
        taxEntryInvoiceItemList: [joinRow('VAT-15.0%', 2700.0, 20700.0)] },
      { id: 'item-005', description: 'On-site workshops', quantity: 4, unitPrice: 1500,
        taxEntryInvoiceItemList: [joinRow('VAT-15.0%', 900.0, 6900.0)] },
    ]);

    const { headers, taxCells, taxTotal } = await render(invoice);

    expect(headers).toEqual(['Description', 'Qty', 'Unit Price', 'Tax', 'Amount']);
    expect(taxCells).toEqual(['GH₵2,700.00', 'GH₵900.00']);
    expect(taxCells).not.toContain('-');
    expect(taxTotal).toBe('GH₵3,600.00');
    expect(taxCells.map(parseMoney).reduce((a, b) => a + b, 0)).toBe(parseMoney(taxTotal));
  });

  it('reads expanded join rows as well as bare FK references', async () => {
    const invoice = await loadInvoice([
      { id: 'item-1', description: 'Expanded', quantity: 1, unitPrice: 1000,
        taxEntryInvoiceItemList: [{ id: 'r1', taxAmount: 125, taxEntry: { id: 'vat', isWithholdingTax: false } }] },
    ]);

    const { taxCells, taxTotal } = await render(invoice);
    expect(taxCells).toEqual(['GH₵125.00']);
    expect(taxTotal).toBe('GH₵125.00');
  });

  it('sums every tax on a line that carries more than one', async () => {
    // NHIL 2.5% + GETFund 2.5% on 3,000, as captured from the LXC backend.
    const invoice = await loadInvoice([
      { id: 'item-1', description: 'Advisory', quantity: 2, unitPrice: 1500,
        taxEntryInvoiceItemList: [joinRow('NHIL-2.5%', 75.0, 3075.0), joinRow('GETFL-2.5%', 75.0, 3075.0)] },
    ]);

    const { taxCells, taxTotal } = await render(invoice);
    expect(taxCells).toEqual(['GH₵150.00']);
    expect(taxTotal).toBe('GH₵150.00');
  });

  it('prints 0.00 for an untaxed line beside a taxed one', async () => {
    const invoice = await loadInvoice([
      { id: 'item-1', description: 'Taxed', quantity: 1, unitPrice: 1000,
        taxEntryInvoiceItemList: [joinRow('VAT-15.0%', 150.0, 1150.0)] },
      { id: 'item-2', description: 'Untaxed', quantity: 1, unitPrice: 500, taxEntryInvoiceItemList: [] },
    ]);

    const { taxCells, taxTotal } = await render(invoice);
    expect(taxCells).toEqual(['GH₵150.00', 'GH₵0.00']);
    expect(taxTotal).toBe('GH₵150.00');
  });

  it('leaves withholding tax out of the line, as it is left out of the total', async () => {
    const invoice = await loadInvoice([
      { id: 'item-1', description: 'Consulting', quantity: 1, unitPrice: 1000,
        taxEntryInvoiceItemList: [
          { taxAmount: 150, taxEntry: { id: 'vat', isWithholdingTax: false } },
          { taxAmount: -75, taxEntry: { id: 'wht', isWithholdingTax: true } },
        ] },
    ]);

    const { taxCells, taxTotal } = await render(invoice);
    expect(taxCells).toEqual(['GH₵150.00']);
    expect(taxTotal).toBe('GH₵150.00');
  });

  it('prints a dash, never 0.00, when a taxed line has no readable amount', async () => {
    // A join row exists, so the line IS taxed; 0.00 would claim it is not.
    const invoice = await loadInvoice([
      { id: 'item-1', description: 'Unreadable', quantity: 1, unitPrice: 1000,
        taxEntryInvoiceItemList: [{ id: 'r1', serialised: 'TaxEntryInvoiceItem' }] },
      { id: 'item-2', description: 'Readable', quantity: 1, unitPrice: 1000,
        taxEntryInvoiceItemList: [joinRow('VAT-15.0%', 150.0, 1150.0)] },
    ]);

    const { taxCells } = await render(invoice);
    expect(taxCells).toEqual(['-', 'GH₵150.00']);
  });

  it('falls back to the rates in the serialised item when the items fetch fails', async () => {
    // getInvoice() keeps the show response's bare FK items if /invoiceItem fails.
    mockGet.mockImplementation((url: string) => {
      if (url.startsWith('/invoice/show/')) {
        return Promise.resolve({
          data: {
            id: 'inv-003', number: 1043, invoicePaymentList: [],
            invoiceItemList: [{
              class: 'soupbroker.finance.InvoiceItem', id: 'item-1',
              serialised: 'InvoiceItem(quantity:2.0, unitPrice:1500, taxEntries:[NHIL-2.5%, GETFL-2.5%], invoice:Invoice(1043))',
            }],
          },
        });
      }
      return Promise.reject(new Error('items fetch failed'));
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { getInvoice } = await import('../../../api/endpoints/invoices');
    const invoice = await getInvoice('inv-003');
    warn.mockRestore();

    const { taxCells, taxTotal } = await render(invoice);
    expect(taxCells).toEqual(['GH₵150.00']);
    expect(taxTotal).toBe('GH₵150.00');
  });

  it('renders no line rows and a zero Tax total for an invoice with no lines (zero edge)', async () => {
    const invoice = await loadInvoice([]);

    const { rows, taxTotal } = await render(invoice);
    expect(rows).toHaveLength(0);
    expect(taxTotal).toBe('GH₵0.00');
  });

  it('keeps 500 seven-figure lines adding up to the Tax total (overflow edge)', async () => {
    const lines = Array.from({ length: 500 }, (_, i) => {
      const unitPrice = 1_250_000 + i;
      const tax = i % 3 === 0 ? 0 : Math.round(unitPrice * 0.15 * 100) / 100;
      return {
        id: `item-${i}`,
        description: `Workstream ${i + 1}`,
        quantity: 1,
        unitPrice,
        taxEntryInvoiceItemList: tax ? [joinRow('VAT-15.0%', tax, unitPrice + tax)] : [],
      };
    });
    const invoice = await loadInvoice(lines);

    const { rows, taxCells, taxTotal } = await render(invoice);
    expect(rows).toHaveLength(500);
    expect(taxCells).not.toContain('-');
    expect(taxCells[0]).toBe('GH₵0.00');
    expect(taxCells[1]).toBe('GH₵187,500.15');
    const columnSum = Math.round(taxCells.map(parseMoney).reduce((a, b) => a + b, 0) * 100) / 100;
    expect(columnSum).toBe(parseMoney(taxTotal));
    expect(parseMoney(taxTotal)).toBeGreaterThan(60_000_000);
  });
});
