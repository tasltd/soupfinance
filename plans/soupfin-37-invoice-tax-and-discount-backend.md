# SOUPFIN-37 — Invoice line-item tax & discount: backend plan

**Status:** proposed (frontend fix landed separately)
**Raised by:** SOUPFIN-37 "Invoice save omits line-item discount and tax"
**Backend repo:** `soupmarkets-web` — per `.claude/rules/backend-changes-workflow.md`, nothing here
was applied from the soupfinance context.

---

## Context

SOUPFIN-37 reported that an invoice created with a 5% discount and 15% VAT saved with
`Tax GH₵0.00` and a total equal to its subtotal.

Investigation against the Grails domain classes and the live LXC backend
(`10.115.213.183:9090`) found the ticket's proposed fix — "mirror the
`billItemList[0].taxRate / taxAmount / totalAmount` pattern used by bills" — **cannot work**,
because none of those are fields on either domain.

### What the domains actually have

`soupbroker.finance.InvoiceItem` (and `BillItem`, which is identical in shape):

| Property | Kind |
|---|---|
| `invoice`, `serviceDescription`, `description`, `quantity`, `unitPrice`, `priority` | persistent |
| `taxEntries` (`Set<TaxEntry>`) | **transient**, bound via `@BindUsing` from a comma-separated list of TaxEntry ids |
| `getAmount()`, `getTaxAmount()`, `getTotalAmount()` | derived getters |
| `taxEntryInvoiceItemList` | `hasMany` → `TaxEntryInvoiceItem` (this is where tax actually lives) |

There is **no** `taxRate`, `taxAmount`, `discountPercent`, `amount` or `totalAmount` column,
and **no discount concept anywhere** on `Invoice`, `InvoiceItem`, `Bill` or `BillItem`.

### Empirical results (LXC backend)

| Path | `taxEntries` sent | `TaxEntryInvoiceItem` rows created |
|---|---|---|
| `POST /rest/invoice/save.json` with `invoiceItemList[0].taxEntries` | yes | **0 — silently dropped** |
| `POST /rest/invoiceItem/save.json` with `taxEntries` | yes | **1, `taxAmount = 150.0`** (5% of 2 × 1500) |

Cause: `InvoiceController.save()` delegates to `InvoiceService.saveWithItems()` →
`applyItemFields()`, which copies only `description`, `quantity`, `unitPrice` and
`serviceDescription.id`. Everything else in the indexed param map is discarded without error.

---

## Requested backend changes

### 1. Bind `taxEntries` in `InvoiceService.applyItemFields()` (and the Bill equivalent)

**Why:** so a single `POST /rest/invoice/save.json` can create an invoice *with* its tax,
instead of forcing clients into N+1 requests (which is what the frontend now does).

`applyItemFields(InvoiceItem item, Map data)` should additionally:
- read `data.taxEntries` (comma-separated ids, matching the `@BindUsing` contract),
- resolve each to a `TaxEntry`,
- create the `TaxEntryInvoiceItem` + `InvoiceTaxEntry` rows and compute `taxAmount`,
  reusing the logic already in `InvoiceItemController.save()` rather than duplicating it —
  ideally by extracting that block into `InvoiceItemService`.

Apply the same to `BillService` / `BillItemController`. **Bills have the identical defect**;
`BillFormPage` currently sends `billItemList[n].taxRate` and `.amount`, both of which are
discarded. Filed separately — see "Related" below.

### 2. Expose the computed totals in JSON

`Invoice.getSubTotal()`, `getTotal()`, `getTotalTaxAmount()` and `getAmountDue()` are derived
getters. They are **not** rendered by `_domainClassInstance.gson` (they are neither persistent
properties nor declared in `static transients`), and `?fields=total,subTotal,totalTaxAmount`
does **not** surface them — verified against the live backend.

Consequence: every client must recompute invoice totals itself, and the invoice **list**
response cannot do so at all, because it returns line items as bare FK references with no tax
rows attached. The frontend list therefore under-states any taxed invoice.

**Requested:** add `total`, `subTotal`, `totalTaxAmount` and `amountDue` to `Invoice`'s
`static transients` (or give `Invoice` an explicit `_invoice.gson` that renders them), so
`/rest/invoice/index.json` carries authoritative totals.

This is the single highest-value item here: it removes an entire class of client-side
divergence, and AR/aging reporting derived from invoice amounts stops depending on each
client's arithmetic.

### 3. Refresh `Invoice.serialised` when line items change

`Invoice.serialised` embeds `total:<value>`, but it is written when the invoice is saved and
never refreshed afterwards. Observed live: an invoice holding two items worth 6,150 still
serialised as `total:0.00`, because the items were added after the header was saved.

Anything that trusts that embedded total is wrong. Either refresh the parent's `serialised`
after item mutations, or drop `total` from `Invoice`'s `@ToString` so it cannot mislead.

### 4. Decide whether discount is in scope at all

There is currently **no way to store a discount** on an invoice. The frontend has removed the
discount column rather than keep accepting input it silently discards.

If discounts are a product requirement, they need a domain change. Options:

| Option | Shape | Notes |
|---|---|---|
| **A — line-level** | `InvoiceItem.discountPercent` (or `discountAmount`) | Matches the removed UI. `getAmount()` becomes `unitPrice × quantity × (1 - discountPercent/100)`; tax then computes on the discounted amount |
| **B — invoice-level** | `Invoice.discountAmount` | Simpler, but cannot express per-line discounts |
| **C — as a TaxEntry** | negative-rate `TaxEntry` | No schema change, but abuses the tax model and pollutes tax reporting |

**Recommendation: A.** It matches how the form was designed, keeps discount and tax on the same
row, and makes the ordering (discount before tax) explicit. Requires a migration adding the
column plus updates to `getAmount()`, the GSON views, and the AR/aging report queries.

**Until this lands, discounts are simply unavailable** — which is the honest state, and better
than the previous behaviour of accepting a discount and saving the undiscounted amount.

---

## Frontend fix already shipped (for reference)

Landed in `soupfinance-web` under SOUPFIN-37, frontend-only:

1. `listTaxRates()` now reads `/rest/taxEntry/index.json` (14 real records) instead of a
   hardcoded catalogue whose ids (`tax-vat-15`, `tax-none`, …) had no backend counterpart —
   so a selected tax could never have persisted regardless of the save path.
2. Line items are written through `/rest/invoiceItem/save.json` / `update`, carrying
   `taxEntries`, so tax is persisted. Reverting this is safe once change **1** above lands.
3. `computeInvoiceTotals()` adds tax parsed from `taxEntryInvoiceItemList`, so the total is no
   longer equal to the subtotal for taxed invoices. Can be replaced by the server-provided
   totals once change **2** lands.
4. The discount column was removed, pending change **4**.

---

## Related

- Bills carry the identical defect (`BillFormPage` sends `billItemList[n].taxRate`/`.amount`,
  both discarded). Filed as a separate SOUPFIN issue — see the SOUPFIN-37 comment thread.
- `.claude/rules/grails-domain-source-of-truth.md` — frontend types must mirror the Grails
  domains; `src/types/index.ts` already documented that `taxRate`/`discountPercent` are not
  backend fields and that "Discount is not a backend concept". The form ignored it.
