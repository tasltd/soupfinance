/**
 * Helpers for the TaxEntry join rows that carry line-item tax.
 *
 * Neither `InvoiceItem` nor `BillItem` has a `taxRate`/`taxAmount` column.
 * `getTaxAmount()` is a derived getter summing the join collection, so the tax
 * on a line lives entirely in `taxEntryInvoiceItemList` / `taxEntryBillItemList`.
 *
 * Grails renders those rows either fully expanded or, very often, as a bare FK
 * reference — `{class, id, serialised}` — and the two domains serialise with a
 * DIFFERENT number of trailing fields:
 *
 *   TaxEntryInvoiceItem(InvoiceItem(...), CST-5.0%, 150.0, 3150.0)   // amount, total
 *   TaxEntryBillItem(BillItem(...), CST-5.0%, 0.0)                   // amount only
 *
 * Both captured verbatim from the backend. Anything parsing these must anchor to
 * the END of the string — the nested item carries its own commas and
 * parentheses, so a left-to-right split lands inside it and reads a quantity as
 * the tax — and must treat the final number as optional.
 */

/** `, <taxAmount>[, <totalAmount>])` at end of string. Both numbers may be negative. */
const TRAILING_AMOUNTS = /,\s*(-?[\d.]+)(?:,\s*-?[\d.]+)?\s*\)\s*$/;

/** `, <label>, <taxAmount>[, <totalAmount>])` at end of string. */
const TRAILING_LABEL = /,\s*([^,()]+?),\s*-?[\d.]+(?:,\s*-?[\d.]+)?\s*\)\s*$/;

/**
 * Extract the persisted tax amount from a join row's serialised string.
 *
 * The amount may be NEGATIVE: withholding rows are stored as a deduction. A
 * digits-only character class silently reads those as 0.
 *
 * @returns the tax amount, or 0 when the string is absent or unparseable.
 */
export function parseTaxAmountFromSerialised(serialised?: string): number {
  const match = serialised?.match(TRAILING_AMOUNTS);
  if (!match) return 0;
  const value = parseFloat(match[1]);
  return Number.isFinite(value) ? value : 0;
}

/**
 * Extract the persisted tax amount from a join row that may or may not be
 * expanded. A numeric `taxAmount` is authoritative; otherwise fall back to the
 * serialised form.
 */
export function parseJoinRowTaxAmount(row: { taxAmount?: number; serialised?: string }): number {
  if (typeof row?.taxAmount === 'number') {
    return row.taxAmount;
  }
  return parseTaxAmountFromSerialised(row?.serialised);
}

/** A join row as it arrives from either domain. */
export interface TaxEntryJoinRow {
  serialised?: string;
  taxEntry?: { id?: string } | null;
}

/**
 * Resolve which TaxEntry a line item carries, so an edit form can re-select it.
 *
 * Reading `rows[0].taxEntry.id` directly only works when the row is expanded.
 * For the bare FK-reference shape that returns undefined, the dropdown falls
 * back to "No Tax", and re-saving then persists the line untaxed — the silent
 * drop SOUPFIN-37 was raised about, re-entered through the edit form.
 *
 * Resolution order:
 *   1. the nested `taxEntry.id` when any row is expanded (authoritative);
 *   2. otherwise the TaxEntry label embedded in the serialised string
 *      (e.g. `CST-5.0%`), matched against the catalogue's own serialised form.
 *
 * @returns the TaxEntry id, or '' when nothing matches (the form's "No Tax").
 */
export function resolveTaxEntryIdFromRows(
  rows?: TaxEntryJoinRow[] | null,
  catalogue?: Array<{ id: string; serialised?: string }>
): string {
  if (!rows || rows.length === 0) return '';

  for (const row of rows) {
    const nestedId = row?.taxEntry?.id;
    if (nestedId) return nestedId;
  }

  if (!catalogue || catalogue.length === 0) return '';

  for (const row of rows) {
    const label = row?.serialised?.match(TRAILING_LABEL)?.[1]?.trim();
    if (!label) continue;
    const hit = catalogue.find((entry) => entry.serialised?.trim() === label);
    if (hit) return hit.id;
  }

  return '';
}
