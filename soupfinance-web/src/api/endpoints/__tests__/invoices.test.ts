/**
 * Unit tests for the invoices API module.
 *
 * Covers SOUPFIN-37: "Invoice save omits line-item discount and tax — saved total
 * ignores both."
 *
 * Root cause (verified against the live LXC backend and the Grails domain classes):
 *   - `InvoiceItem` has NO taxRate / discountPercent / amount / totalAmount column.
 *     Tax is persisted as `TaxEntryInvoiceItem` join rows referencing a `TaxEntry`.
 *   - `POST /rest/invoice/save.json` routes indexed `invoiceItemList[n].*` params
 *     through `InvoiceService.applyItemFields()`, which copies ONLY description,
 *     quantity, unitPrice and serviceDescription.id — `taxEntries` is dropped.
 *   - `POST /rest/invoiceItem/save.json` (`InvoiceItemController.save()`) DOES create
 *     the TaxEntryInvoiceItem rows from the transient `taxEntries` property.
 *   - The backend never serialises `total`/`subTotal`/`totalTaxAmount`, so the
 *     frontend must compute the total — and it previously ignored tax entirely.
 *
 * The serialised strings below are verbatim captures from the LXC backend.
 *
 * Note: axios is mocked globally via test/setup.ts. Modules are imported dynamically
 * after installing the per-test axios mock (matches bills.test.ts / clients.test.ts).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';

/** Verbatim TaxEntryInvoiceItem.serialised from the LXC backend (CST-5.0% on 2 x 1500). */
const REAL_TAX_ROW_SERIALISED =
  'TaxEntryInvoiceItem(InvoiceItem(serviceDescription:ServiceDescription(Arrangement Fees, INVOICE), ' +
  'quantity:2.0, unitPrice:1500.00, invoice:Invoice(numberPrefix:FXI, number:1000004, ' +
  'accountServices:Direct Account : Corporate(Test Corporate Client) | Test Account Service, ' +
  'total:3000.00)), CST-5.0%, 150.0, 3150.0)';

describe('invoices API (SOUPFIN-37)', () => {
  let mockGet: ReturnType<typeof vi.fn>;
  let mockPost: ReturnType<typeof vi.fn>;
  let mockPut: ReturnType<typeof vi.fn>;

  function installAxiosMock() {
    mockGet = vi.fn();
    mockPost = vi.fn();
    mockPut = vi.fn();
    (axios.create as ReturnType<typeof vi.fn>).mockReturnValue({
      interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
      get: mockGet,
      post: mockPost,
      put: mockPut,
      delete: vi.fn(),
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    installAxiosMock();
  });

  // ===========================================================================
  // parseTaxAmountFromSerialised
  // ===========================================================================

  describe('parseTaxAmountFromSerialised', () => {
    it('extracts taxAmount from a real backend TaxEntryInvoiceItem string', async () => {
      vi.resetModules();
      const { parseTaxAmountFromSerialised } = await import('../invoices');
      // The nested InvoiceItem(...) contains its own commas and parentheses — the
      // parser must anchor to the END of the string, not split left-to-right.
      expect(parseTaxAmountFromSerialised(REAL_TAX_ROW_SERIALISED)).toBe(150);
    });

    it('handles integer amounts and surrounding whitespace', async () => {
      vi.resetModules();
      const { parseTaxAmountFromSerialised } = await import('../invoices');
      expect(parseTaxAmountFromSerialised('TaxEntryInvoiceItem(X(a,b), VAT-15%, 75, 575 )')).toBe(75);
    });

    it('returns 0 for empty, undefined, and unparseable input rather than NaN', async () => {
      vi.resetModules();
      const { parseTaxAmountFromSerialised } = await import('../invoices');
      expect(parseTaxAmountFromSerialised(undefined)).toBe(0);
      expect(parseTaxAmountFromSerialised('')).toBe(0);
      expect(parseTaxAmountFromSerialised('not a serialised value')).toBe(0);
      // Trailing text after the closing paren must not match.
      expect(parseTaxAmountFromSerialised('TaxEntryInvoiceItem(X, 1.0, 2.0) extra')).toBe(0);
    });

    it('parses a negative tax amount', async () => {
      vi.resetModules();
      const { parseTaxAmountFromSerialised } = await import('../invoices');
      expect(parseTaxAmountFromSerialised('TaxEntryInvoiceItem(X(a), WHT, -25.5, 974.5)')).toBe(-25.5);
    });
  });

  // ===========================================================================
  // resolveItemTaxEntryId — edit form must re-select the saved tax
  // ===========================================================================

  describe('resolveItemTaxEntryId', () => {
    const catalogue = [
      { id: 'uuid-cst', serialised: 'CST-5.0%' },
      { id: 'uuid-vat', serialised: 'VAT-S-15.0%' },
    ];

    it('matches the TaxEntry label embedded in a FK reference', async () => {
      vi.resetModules();
      const { resolveItemTaxEntryId } = await import('../invoices');
      expect(
        resolveItemTaxEntryId(
          { taxEntryInvoiceItemList: [{ serialised: REAL_TAX_ROW_SERIALISED }] },
          catalogue
        )
      ).toBe('uuid-cst');
    });

    it('prefers a nested taxEntry.id when the row is expanded', async () => {
      vi.resetModules();
      const { resolveItemTaxEntryId } = await import('../invoices');
      expect(
        resolveItemTaxEntryId(
          { taxEntryInvoiceItemList: [{ taxEntry: { id: 'uuid-direct' } }] },
          catalogue
        )
      ).toBe('uuid-direct');
    });

    it('returns empty string when the item has no tax rows', async () => {
      vi.resetModules();
      const { resolveItemTaxEntryId } = await import('../invoices');
      expect(resolveItemTaxEntryId({ taxEntryInvoiceItemList: null }, catalogue)).toBe('');
      expect(resolveItemTaxEntryId({ taxEntryInvoiceItemList: [] }, catalogue)).toBe('');
      expect(resolveItemTaxEntryId({}, catalogue)).toBe('');
    });

    it('returns empty string when the label is not in the catalogue', async () => {
      vi.resetModules();
      const { resolveItemTaxEntryId } = await import('../invoices');
      expect(
        resolveItemTaxEntryId(
          { taxEntryInvoiceItemList: [{ serialised: 'TaxEntryInvoiceItem(X(a), UNKNOWN-9%, 1.0, 2.0)' }] },
          catalogue
        )
      ).toBe('');
    });

    it('skips an unparseable row and resolves a later one', async () => {
      vi.resetModules();
      const { resolveItemTaxEntryId } = await import('../invoices');
      expect(
        resolveItemTaxEntryId(
          {
            taxEntryInvoiceItemList: [
              { serialised: 'garbage' },
              { serialised: 'TaxEntryInvoiceItem(X(a), VAT-S-15.0%, 150.0, 1150.0)' },
            ],
          },
          catalogue
        )
      ).toBe('uuid-vat');
    });

    it('tolerates an undefined catalogue', async () => {
      vi.resetModules();
      const { resolveItemTaxEntryId } = await import('../invoices');
      expect(
        resolveItemTaxEntryId({ taxEntryInvoiceItemList: [{ serialised: REAL_TAX_ROW_SERIALISED }] }, undefined)
      ).toBe('');
    });
  });

  // ===========================================================================
  // Totals include tax — the reported symptom
  // ===========================================================================

  describe('invoice totals include line-item tax', () => {
    async function getInvoiceWith(items: unknown[]) {
      vi.resetModules();
      const { getInvoice } = await import('../invoices');
      mockGet.mockImplementation((url: string) => {
        if (url.includes('/invoice/show/')) {
          return Promise.resolve({
            data: { id: 'inv-1', number: 5, invoiceDate: '2026-08-04T00:00:00Z', invoicePaymentList: [] },
          });
        }
        if (url.includes('/invoiceItem/index.json')) return Promise.resolve({ data: items });
        return Promise.resolve({ data: [] });
      });
      return getInvoice('inv-1');
    }

    it('adds tax parsed from taxEntryInvoiceItemList FK references to the total', async () => {
      // Reproduces the ticket: 2 x 1500 with tax. Before the fix the total was 3000.
      const invoice = await getInvoiceWith([
        {
          id: 'ii-1',
          quantity: 2,
          unitPrice: 1500,
          taxEntryInvoiceItemList: [{ id: 't-1', serialised: REAL_TAX_ROW_SERIALISED }],
        },
      ]);

      expect(invoice.subtotal).toBe(3000);
      expect(invoice.taxAmount).toBe(150);
      expect(invoice.totalAmount).toBe(3150);
    });

    it('prefers a numeric taxAmount when the row is fully expanded', async () => {
      const invoice = await getInvoiceWith([
        {
          id: 'ii-1',
          quantity: 1,
          unitPrice: 1000,
          taxEntryInvoiceItemList: [{ id: 't-1', taxAmount: 150, serialised: REAL_TAX_ROW_SERIALISED }],
        },
      ]);
      expect(invoice.taxAmount).toBe(150);
      expect(invoice.totalAmount).toBe(1150);
    });

    it('sums tax across multiple rows and multiple line items', async () => {
      const invoice = await getInvoiceWith([
        {
          id: 'ii-1',
          quantity: 1,
          unitPrice: 1000,
          taxEntryInvoiceItemList: [{ taxAmount: 150 }, { taxAmount: 25 }],
        },
        { id: 'ii-2', quantity: 2, unitPrice: 500, taxEntryInvoiceItemList: [{ taxAmount: 100 }] },
      ]);
      expect(invoice.subtotal).toBe(2000);
      expect(invoice.taxAmount).toBe(275);
      expect(invoice.totalAmount).toBe(2275);
    });

    it('treats a withholding row (taxAmount 0) as adding nothing, matching the backend', async () => {
      // InvoiceItemController only computes a non-zero taxAmount for
      // !isCompoundTax && !isWithholdingTax && isTaxable entries.
      const invoice = await getInvoiceWith([
        { id: 'ii-1', quantity: 1, unitPrice: 1000, taxEntryInvoiceItemList: [{ taxAmount: 0 }] },
      ]);
      expect(invoice.taxAmount).toBe(0);
      expect(invoice.totalAmount).toBe(1000);
    });

    it('falls back to zero tax when the item carries no tax rows', async () => {
      const invoice = await getInvoiceWith([
        { id: 'ii-1', quantity: 2, unitPrice: 1500, taxEntryInvoiceItemList: null },
      ]);
      expect(invoice.subtotal).toBe(3000);
      expect(invoice.taxAmount).toBe(0);
      expect(invoice.totalAmount).toBe(3000);
    });

    it('computes amountDue from the tax-inclusive total', async () => {
      vi.resetModules();
      const { getInvoice } = await import('../invoices');
      mockGet.mockImplementation((url: string) => {
        if (url.includes('/invoice/show/')) {
          return Promise.resolve({
            data: { id: 'inv-1', number: 5, invoicePaymentList: [{ id: 'p1', amount: 1000 }] },
          });
        }
        if (url.includes('/invoiceItem/index.json')) {
          return Promise.resolve({
            data: [{ id: 'ii-1', quantity: 2, unitPrice: 1500, taxEntryInvoiceItemList: [{ taxAmount: 150 }] }],
          });
        }
        return Promise.resolve({ data: [] });
      });
      const invoice = await getInvoice('inv-1');
      expect(invoice.totalAmount).toBe(3150);
      expect(invoice.amountPaid).toBe(1000);
      // Regression guard: amountDue must not be computed off the untaxed subtotal.
      expect(invoice.amountDue).toBe(2150);
    });

    it('returns zeroed totals for an invoice with no items', async () => {
      const invoice = await getInvoiceWith([]);
      expect(invoice.subtotal).toBe(0);
      expect(invoice.taxAmount).toBe(0);
      expect(invoice.totalAmount).toBe(0);
    });
  });

  // ===========================================================================
  // createInvoiceWithItems — the save path that actually persists tax
  // ===========================================================================

  describe('createInvoiceWithItems', () => {
    /** Wires up create.json (CSRF), the invoice/item saves, and the final re-read. */
    function wireSaveMocks() {
      mockGet.mockImplementation((url: string) => {
        if (url.includes('/create.json')) {
          return Promise.resolve({ data: { SYNCHRONIZER_TOKEN: 'tok', SYNCHRONIZER_URI: '/uri' } });
        }
        if (url.includes('/invoice/show/')) return Promise.resolve({ data: { id: 'inv-9', number: 9 } });
        if (url.includes('/invoiceItem/index.json')) return Promise.resolve({ data: [] });
        return Promise.resolve({ data: [] });
      });
      mockPost.mockImplementation((url: string) => {
        if (url.includes('/invoice/save.json')) return Promise.resolve({ data: { id: 'inv-9', number: 9 } });
        return Promise.resolve({ data: { id: 'item-1' } });
      });
    }

    it('sends taxEntries to /invoiceItem/save.json, NOT as invoiceItemList params', async () => {
      vi.resetModules();
      const { createInvoiceWithItems } = await import('../invoices');
      wireSaveMocks();

      await createInvoiceWithItems(
        { accountServices: { id: 'as-1' }, invoiceDate: '2026-08-04' } as never,
        [{ description: 'Advisory', quantity: 2, unitPrice: 1500, taxEntryId: 'taxentry-uuid-1' }]
      );

      const invoiceSave = mockPost.mock.calls.find((c) => String(c[0]).includes('/invoice/save.json'));
      const itemSave = mockPost.mock.calls.find((c) => String(c[0]).includes('/invoiceItem/save.json'));

      expect(invoiceSave).toBeDefined();
      expect(itemSave).toBeDefined();

      // Regression guard for the root cause: the invoice header must NOT carry indexed
      // line-item params, because that path silently drops taxEntries.
      const headerBody = JSON.stringify(invoiceSave![1]);
      expect(headerBody).not.toContain('invoiceItemList[0]');
      expect(headerBody).not.toContain('taxEntries');

      // The item POST is what actually persists the tax.
      expect(itemSave![1]).toMatchObject({
        invoice: { id: 'inv-9' },
        description: 'Advisory',
        quantity: 2,
        unitPrice: 1500,
        taxEntries: 'taxentry-uuid-1',
      });
    });

    it('omits taxEntries entirely when no tax was selected', async () => {
      vi.resetModules();
      const { createInvoiceWithItems } = await import('../invoices');
      wireSaveMocks();

      await createInvoiceWithItems({ accountServices: { id: 'as-1' } } as never, [
        { description: 'No tax line', quantity: 1, unitPrice: 100 },
      ]);

      const itemSave = mockPost.mock.calls.find((c) => String(c[0]).includes('/invoiceItem/save.json'));
      expect(itemSave![1]).not.toHaveProperty('taxEntries');
    });

    it('creates one item POST per line, in order', async () => {
      vi.resetModules();
      const { createInvoiceWithItems } = await import('../invoices');
      wireSaveMocks();

      await createInvoiceWithItems({ accountServices: { id: 'as-1' } } as never, [
        { description: 'First', quantity: 1, unitPrice: 10, taxEntryId: 'tax-a' },
        { description: 'Second', quantity: 2, unitPrice: 20 },
      ]);

      const itemSaves = mockPost.mock.calls.filter((c) => String(c[0]).includes('/invoiceItem/save.json'));
      expect(itemSaves).toHaveLength(2);
      expect(itemSaves[0][1]).toMatchObject({ description: 'First', taxEntries: 'tax-a' });
      expect(itemSaves[1][1]).toMatchObject({ description: 'Second' });
    });

    it('updates existing lines via PUT and creates new ones via POST', async () => {
      vi.resetModules();
      const { updateInvoiceWithItems } = await import('../invoices');
      wireSaveMocks();
      mockPut.mockResolvedValue({ data: { id: 'inv-9' } });

      await updateInvoiceWithItems('inv-9', { invoiceDate: '2026-08-04' } as never, [
        { id: 'item-existing', description: 'Kept', quantity: 1, unitPrice: 10, taxEntryId: 'tax-a' },
        { description: 'Brand new', quantity: 1, unitPrice: 20 },
      ]);

      const itemPut = mockPut.mock.calls.find((c) => String(c[0]).includes('/invoiceItem/update/item-existing'));
      expect(itemPut![1]).toMatchObject({ description: 'Kept', taxEntries: 'tax-a' });

      const itemPost = mockPost.mock.calls.filter((c) => String(c[0]).includes('/invoiceItem/save.json'));
      expect(itemPost).toHaveLength(1);
      expect(itemPost[0][1]).toMatchObject({ description: 'Brand new' });
    });

    it('surfaces which line failed instead of reporting a clean save', async () => {
      vi.resetModules();
      const { createInvoiceWithItems } = await import('../invoices');
      wireSaveMocks();
      mockPost.mockImplementation((url: string) => {
        if (url.includes('/invoice/save.json')) return Promise.resolve({ data: { id: 'inv-9' } });
        return Promise.reject(new Error('Request failed with status code 422'));
      });

      await expect(
        createInvoiceWithItems({ accountServices: { id: 'as-1' } } as never, [
          { description: 'Bad line', quantity: 1, unitPrice: 10 },
        ])
      ).rejects.toThrow(/line 1 \("Bad line"\)/);
    });

    it('fails loudly if the backend returns no invoice id', async () => {
      vi.resetModules();
      const { createInvoiceWithItems } = await import('../invoices');
      wireSaveMocks();
      mockPost.mockImplementation((url: string) => {
        if (url.includes('/invoice/save.json')) return Promise.resolve({ data: {} });
        return Promise.resolve({ data: {} });
      });

      await expect(
        createInvoiceWithItems({ accountServices: { id: 'as-1' } } as never, [
          { description: 'x', quantity: 1, unitPrice: 1 },
        ])
      ).rejects.toThrow(/returned no id/);
    });
  });
});
