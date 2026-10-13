/**
 * Added (SOUPFIN-168): the invoice-side helpers for lines with several taxes.
 *
 * `resolveItemTaxEntryIds` feeds the edit form, which used to re-select only the
 * first of a line's taxes. `sumItemStoredTax` is what an untouched saved line
 * previews, and must agree with `computeInvoiceTotals`, which the detail page uses.
 */
import { describe, it, expect } from 'vitest';
import { resolveItemTaxEntryIds, sumItemStoredTax } from '../invoices';

/** Verbatim shape of a bare TaxEntryInvoiceItem row on LXC, 13 Oct 2026. */
function bareRow(label: string, amount: number) {
  return {
    id: `row-${label}`,
    serialised: `TaxEntryInvoiceItem(InvoiceItem(quantity:2.0, unitPrice:3000.00, invoice:Invoice(number:2025028, total:0.00)), ${label}, ${amount}, ${6000 + amount})`,
  };
}

const CATALOGUE = [
  { id: '', serialised: undefined },
  { id: 'ff80818173ca7d260173ca8249e70001', serialised: 'NHIL-2.5%' },
  { id: 'ff80818173ca7d260173ca82dcc00002', serialised: 'GETFL-2.5%' },
  { id: 'ff80818186941f2701869cb315b11dda', serialised: 'VAT-S-15.0%' },
];

describe('resolveItemTaxEntryIds', () => {
  it('returns all three taxes of a Ghana stack', () => {
    const item = {
      taxEntryInvoiceItemList: [bareRow('NHIL-2.5%', 150), bareRow('GETFL-2.5%', 150), bareRow('VAT-S-15.0%', 945)],
    };
    expect(resolveItemTaxEntryIds(item, CATALOGUE)).toEqual({
      ids: [
        'ff80818173ca7d260173ca8249e70001',
        'ff80818173ca7d260173ca82dcc00002',
        'ff80818186941f2701869cb315b11dda',
      ],
      unresolved: 0,
    });
  });

  it('an item with no join rows has no taxes', () => {
    expect(resolveItemTaxEntryIds({ taxEntryInvoiceItemList: null }, CATALOGUE)).toEqual({ ids: [], unresolved: 0 });
  });
});

describe('sumItemStoredTax', () => {
  it('adds every stored amount on the line', () => {
    const item = {
      taxEntryInvoiceItemList: [bareRow('NHIL-2.5%', 150), bareRow('GETFL-2.5%', 150), bareRow('VAT-S-15.0%', 945)],
    };
    expect(sumItemStoredTax(item)).toBe(1245);
  });

  it('prefers an expanded taxAmount and leaves withholding out, as the backend total does', () => {
    const item = {
      taxEntryInvoiceItemList: [
        { taxAmount: 150, taxEntry: { id: 'nhil' } },
        { taxAmount: 180, taxEntry: { id: 'wht', isWithholdingTax: true } },
      ],
    };
    expect(sumItemStoredTax(item)).toBe(150);
  });

  it('zero rows sum to zero', () => {
    expect(sumItemStoredTax({ taxEntryInvoiceItemList: [] })).toBe(0);
    expect(sumItemStoredTax({})).toBe(0);
  });

  it('overflow: 500 rows sum without float drift', () => {
    const rows = Array.from({ length: 500 }, () => ({ taxAmount: 0.1 }));
    expect(sumItemStoredTax({ taxEntryInvoiceItemList: rows })).toBe(50);
  });
});
