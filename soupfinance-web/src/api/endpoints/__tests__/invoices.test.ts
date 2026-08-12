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

  // ===========================================================================
  // createInvoiceWithItems / updateInvoiceWithItems — NOT ADOPTED (SOUPFIN-42)
  // ===========================================================================
  //
  // These six specs came from a competing SOUPFIN-37 attempt and are archived at
  // .claude/archive/soupfin-42/invoices-orchestration-tests.deferred.ts.txt.
  //
  // Two of them are worth restoring the day the backend lands SOUPFIN-40; the
  // rest cannot be made green without reintroducing a known data-loss bug:
  //
  //   `updateInvoiceWithItems` PUTs to /rest/invoiceItem/update/:id. Verified in
  //   InvoiceItemController: save() calls `invoiceItem.refresh()` (line 132)
  //   before it iterates taxEntryInvoiceItemList, so the join rows it just
  //   created are visible and taxAmount is computed. update() has NO refresh(),
  //   so it iterates a stale collection and any tax added to an EXISTING line
  //   persists as 0. It also omits save()'s `!isWithholdingTax` filter.
  //
  // That is exactly the silent-zero failure SOUPFIN-37 was raised to fix, so the
  // frontend deliberately creates line items rather than updating them. Adopting
  // the helper would make the suite green and the product wrong.
  //
  // Still worth having once the backend is fixed: per-line error surfacing
  // ("line 1 (\"Bad line\")") and failing loudly when the invoice save returns
  // no id. Both are tracked in plans/soupfinance-invoice-tax-and-discount-backend.md.
});
