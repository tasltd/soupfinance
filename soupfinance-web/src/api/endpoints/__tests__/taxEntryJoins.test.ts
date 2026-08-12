/**
 * Unit tests for the TaxEntry join-row helpers.
 *
 * Covers SOUPFIN-38 / SOUPFIN-42. The serialised strings below are VERBATIM
 * captures from the LXC backend, and the two domains differ in shape:
 *
 *   TaxEntryInvoiceItem(InvoiceItem(...), CST-5.0%, 150.0, 3150.0)  // amount + total
 *   TaxEntryBillItem(BillItem(...), CST-5.0%, 0.0)                  // amount only
 *
 * A parser written against one shape silently returns 0/'' for the other, which
 * is how bill tax disappeared while invoice tax worked.
 */
import { describe, it, expect } from 'vitest';
import {
  parseTaxAmountFromSerialised,
  parseJoinRowTaxAmount,
  resolveTaxEntryIdFromRows,
} from '../taxEntryJoins';

/** Verbatim TaxEntryInvoiceItem.serialised (CST-5.0% on 2 x 1500). */
const INVOICE_ROW =
  'TaxEntryInvoiceItem(InvoiceItem(serviceDescription:ServiceDescription(Arrangement Fees, INVOICE), ' +
  'quantity:2.0, unitPrice:1500.00, invoice:Invoice(numberPrefix:FXI, number:1000004, ' +
  'accountServices:Direct Account : Corporate(Test Corporate Client) | Test Account Service, ' +
  'total:3000.00)), CST-5.0%, 150.0, 3150.0)';

/** Verbatim TaxEntryBillItem.serialised — note only ONE trailing number. */
const BILL_ROW =
  'TaxEntryBillItem(BillItem(quantity:2.0, unitPrice:1500, taxEntries:[CST-5.0%], ' +
  'bill:Bill((805 Restaurant)[PROVIDER], 202206-03, 230)), CST-5.0%, 0.0)';

describe('parseTaxAmountFromSerialised', () => {
  it('reads the amount from the four-field invoice shape', () => {
    // Must anchor to the END: the nested InvoiceItem carries its own commas
    // and parens, so a left-to-right split reads a quantity as the tax.
    expect(parseTaxAmountFromSerialised(INVOICE_ROW)).toBe(150);
  });

  it('reads the amount from the three-field bill shape', () => {
    expect(parseTaxAmountFromSerialised(BILL_ROW)).toBe(0);
    expect(
      parseTaxAmountFromSerialised('TaxEntryBillItem(BillItem(a,b), VAT-S-15.0%, 450.0)')
    ).toBe(450);
  });

  it('parses a negative amount — withholding is stored as a deduction', () => {
    expect(parseTaxAmountFromSerialised('TaxEntryInvoiceItem(X(a), WHT, -25.5, 974.5)')).toBe(-25.5);
    expect(parseTaxAmountFromSerialised('TaxEntryBillItem(X(a), WHT, -25.5)')).toBe(-25.5);
  });

  it('handles integers and whitespace before the closing paren', () => {
    expect(parseTaxAmountFromSerialised('TaxEntryInvoiceItem(X(a,b), VAT-15%, 75, 575 )')).toBe(75);
  });

  it('returns 0 for empty, undefined and unparseable input rather than NaN', () => {
    expect(parseTaxAmountFromSerialised(undefined)).toBe(0);
    expect(parseTaxAmountFromSerialised('')).toBe(0);
    expect(parseTaxAmountFromSerialised('not a serialised value')).toBe(0);
    // Trailing text after the closing paren must not match.
    expect(parseTaxAmountFromSerialised('TaxEntryInvoiceItem(X, 1.0, 2.0) extra')).toBe(0);
  });
});

describe('parseJoinRowTaxAmount', () => {
  it('prefers a numeric taxAmount when the row is expanded', () => {
    expect(parseJoinRowTaxAmount({ taxAmount: 42, serialised: BILL_ROW })).toBe(42);
  });

  it('accepts an expanded zero rather than falling through to the string', () => {
    // 0 is falsy — a truthiness check here would wrongly re-parse.
    expect(parseJoinRowTaxAmount({ taxAmount: 0, serialised: 'TaxEntryBillItem(X, T, 99.0)' })).toBe(0);
  });

  it('falls back to the serialised form when the row is a bare FK reference', () => {
    expect(parseJoinRowTaxAmount({ serialised: INVOICE_ROW })).toBe(150);
  });

  it('returns 0 for an empty row', () => {
    expect(parseJoinRowTaxAmount({})).toBe(0);
  });
});

describe('resolveTaxEntryIdFromRows', () => {
  const catalogue = [
    { id: 'uuid-cst', serialised: 'CST-5.0%' },
    { id: 'uuid-vat', serialised: 'VAT-S-15.0%' },
  ];

  it('matches the label in an invoice FK reference', () => {
    expect(resolveTaxEntryIdFromRows([{ serialised: INVOICE_ROW }], catalogue)).toBe('uuid-cst');
  });

  it('matches the label in a bill FK reference despite the different shape', () => {
    expect(resolveTaxEntryIdFromRows([{ serialised: BILL_ROW }], catalogue)).toBe('uuid-cst');
  });

  it('prefers a nested taxEntry.id when the row is expanded', () => {
    expect(
      resolveTaxEntryIdFromRows([{ taxEntry: { id: 'uuid-direct' } }], catalogue)
    ).toBe('uuid-direct');
  });

  it('returns empty string when there are no rows', () => {
    expect(resolveTaxEntryIdFromRows(null, catalogue)).toBe('');
    expect(resolveTaxEntryIdFromRows([], catalogue)).toBe('');
    expect(resolveTaxEntryIdFromRows(undefined, catalogue)).toBe('');
  });

  it('returns empty string when the label is not in the catalogue', () => {
    expect(
      resolveTaxEntryIdFromRows(
        [{ serialised: 'TaxEntryBillItem(X(a), UNKNOWN-9%, 1.0)' }],
        catalogue
      )
    ).toBe('');
  });

  it('skips an unparseable row and resolves a later one', () => {
    expect(
      resolveTaxEntryIdFromRows(
        [{ serialised: 'garbage' }, { serialised: 'TaxEntryBillItem(X(a), VAT-S-15.0%, 450.0)' }],
        catalogue
      )
    ).toBe('uuid-vat');
  });

  it('tolerates a missing or empty catalogue', () => {
    expect(resolveTaxEntryIdFromRows([{ serialised: BILL_ROW }], undefined)).toBe('');
    expect(resolveTaxEntryIdFromRows([{ serialised: BILL_ROW }], [])).toBe('');
  });

  it('trims catalogue entries before comparing', () => {
    expect(
      resolveTaxEntryIdFromRows([{ serialised: BILL_ROW }], [{ id: 'uuid-cst', serialised: ' CST-5.0% ' }])
    ).toBe('uuid-cst');
  });
});
