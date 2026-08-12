# Invoice Tax & Discount — Backend Plan

**Raised by:** SOUPFIN-37 (V21 frontend issues — invoice save omits line-item discount and tax)
**Follow-up items:** SOUPFIN-39 (discount field), SOUPFIN-40 (update refresh bug), SOUPFIN-41 (slow CSRF endpoint)
**Status:** frontend fix shipped; the items below need `soupmarkets-web` and must NOT be made from the soupfinance context.

---

## Context

SoupFinance invoices were saving with zero tax and no discount, while the form previewed both.
The frontend half is fixed (see "What the frontend now does"). Three backend gaps remain.

### What was actually wrong

The frontend sent line items as indexed params on `POST /rest/invoice/save.json`:

```json
{"invoiceItemList[0].description": "...", "invoiceItemList[0].quantity": 2, "invoiceItemList[0].unitPrice": 1500}
```

`InvoiceService.applyItemFields()` (InvoiceService.groovy:336-346) copies only
`description`, `quantity`, `unitPrice` and `serviceDescription` off those params. Everything
else is discarded, so tax never reached the database.

The ticket originally proposed mirroring the bill pattern
(`billItemList[N].taxRate` / `taxAmount` / `totalAmount`). **That would not have worked
either** — `InvoiceItem` has no `taxRate` column, and `getAmount()`, `getTaxAmount()` and
`getTotalAmount()` are derived getters with no setters. The bill path has the same defect
(tracked as SOUPFIN-38).

Tax is really modelled as `InvoiceItem.taxEntries`, a `Set<TaxEntry>` bound via `@BindUsing`
from a comma-separated id string; `InvoiceItemController` then creates the
`TaxEntryInvoiceItem` join rows and computes `taxAmount = amount * taxRate/100`.

### What the frontend now does

Line items are created through `POST /rest/invoiceItem/save.json` with a `taxEntries` value,
which is the one path that provably persists tax. Tax options come from the real
`GET /rest/taxEntry/index.json` records instead of hardcoded synthetic ids.

Verified end-to-end on the LXC backend: a 3,000.00 line with NHIL 2.5% + GETFund 2.5% stores
`taxAmount` 75.00 on each join row.

---

## Required Changes

### 1. `InvoiceItemController.update()` — missing `refresh()` (SOUPFIN-40)

**Priority: high.** Adding tax to an already-saved line item silently stores zero.

`save()` calls `invoiceItem.refresh()` after creating the join rows and before computing
`taxAmount`. `update()` does not, so it iterates a stale `taxEntryInvoiceItemList` (the new
rows were created via `new TaxEntryInvoiceItem(...).save()`, not `addTo...`) and never
assigns an amount.

```groovy
invoiceItemService.save(invoiceItem)
invoiceItem.refresh()          // <-- ADD THIS, matching save()
def subTotal = invoiceItem.amount
invoiceItem.taxEntryInvoiceItemList.findAll { ... }.each { it.taxAmount = ... }
```

Check `BillItemController.update()` for the same gap.

**Measured:**

| Path | Stored taxAmount (3,000 @ 2.5% x2) |
|---|---|
| `POST /rest/invoiceItem/save.json` | 75.0 + 75.0 — correct |
| `PUT /rest/invoiceItem/update/{id}.json` | **0.0 + 0.0** |

### 2. Accept tax on the invoice's own indexed line-item params (optional)

Currently a caller must make N+1 requests to create an invoice with N taxed items. If
`applyItemFields()` also bound `taxEntries` (and created the join rows + computed amounts, as
`InvoiceItemController.save()` does), the whole invoice could be saved in one request.

```groovy
private void applyItemFields(InvoiceItem item, Map data){
    ...
    if (data.containsKey('taxEntries')) {
        // bind ids, create TaxEntryInvoiceItem + InvoiceTaxEntry rows,
        // refresh, then compute taxAmount as InvoiceItemController.save() does
    }
}
```

Would let the frontend collapse back to a single POST and remove the per-item CSRF round trips.

### 3. Discount field (SOUPFIN-39)

**There is no discount anywhere in the finance domain** — `grep -ri discount
grails-app/domain/soupbroker/finance/` returns zero files. The frontend's `Disc %` input has
been removed because it could never persist.

To support discounts:

| Layer | Change |
|---|---|
| Domain | `BigDecimal discountPercent = 0` (or `discountAmount`) on `InvoiceItem` |
| Domain | `getAmount()` applies it, so `getSubTotal()` / `getTotal()` follow |
| Service | `InvoiceService.applyItemFields()` binds it |
| Controller | `InvoiceItemController` save/update bind it |
| Parity | Same for `BillItem` if bills need it |

Note tax must be computed on the **post-discount** amount, so `getTaxAmount()` ordering
matters.

### 4. `InvoiceController.create()` performance (SOUPFIN-41)

`GET /rest/invoice/create.json` takes **21-24s** on the seed DB against a 30s client timeout.
`invoiceItem/create.json` is instant, so the cost is specific to `InvoiceController.create()` —
most likely the last-invoice lookup for auto-numbering scanning the table. Replace with an
indexed `max(number)` / `ORDER BY dateCreated DESC LIMIT 1` and confirm the index exists.

---

## API Endpoints Involved

```
GET  /rest/taxEntry/index.json           # real TaxEntry records (14 on the seed tenant)
POST /rest/invoiceItem/save.json         # binds taxEntries, computes tax  — WORKS
PUT  /rest/invoiceItem/update/{id}.json  # binds taxEntries, tax lands 0   — BROKEN (#1)
POST /rest/invoice/save.json             # drops tax from invoiceItemList  — (#2)
```

`taxEntries` format — comma-separated TaxEntry ids, per the `@BindUsing` on the domain:

```json
{"invoice":{"id":"<uuid>"},"description":"Advisory","quantity":2,"unitPrice":1500,
 "taxEntries":"ff80818173ca7d260173ca8249e70001,ff80818173ca7d260173ca82dcc00002"}
```

## Notes

- Withholding-tax entries are excluded from the SoupFinance tax dropdown — they are deducted
  by the payer, not added to the receivable. `InvoiceItem.getTaxAmount()` already filters them.
- Compound tax is charged on (amount + simple taxes). The frontend list view approximates
  totals from rates embedded in the serialised string, so a compound-plus-simple combination
  can read marginally low there; the detail view uses the exact stored amounts. Change #2
  would remove the need for that approximation.

---

## SOUPFIN-42 (V22, 2026-08-12) — discount re-raised; still blocked on change #3

The V22 sweep against `app.soupfinance.com` confirms the tax half of SOUPFIN-37 is working in
production: the save splits into `POST /rest/invoice/save.json` followed by
`POST /rest/invoiceItem/save.json` carrying `taxEntries`, and the response persists
`taxEntryInvoiceItemList` with the correct per-entry amounts.

It then asks for the discount input to be restored and a `discount` / `disc%` key added to the
`invoiceItem/save.json` payload. **That cannot be done frontend-only, and doing it would be a
regression rather than a fix.** Re-verified against the current multi-tenant backend on
2026-08-12:

- `grep -ril discount grails-app/domain/soupbroker/finance/` → **0 files**
- `InvoiceItem` declares `invoice`, `serviceDescription`, `description`, `quantity`,
  `unitPrice`, the transient `taxEntries`, and the `taxEntryInvoiceItemList` hasMany. No
  discount column.
- `Invoice.getTotal()` is `subTotal + totalTaxAmount` — no discount term.

Grails discards unknown keys silently, so a `discount` field in the payload would be accepted
with a 201 and stored nowhere. The form would preview one total and the database would hold
another — which is the exact misstatement SOUPFIN-37 removed the input to stop, and the same
class of defect as SOUPFIN-38 (`billItemList[n].taxRate` on a domain with no such field).

**Change #3 above is the prerequisite.** Until it lands there are two options, and the choice
is a product decision because it changes what a customer sees on an issued invoice:

| Option | Behaviour | Cost |
|---|---|---|
| **A — wait for #3** (recommended) | No discount input. Totals stay truthful. | Discount unavailable until the backend column exists. |
| **B — fold the discount into `unitPrice`** | UI takes a discount %, sends the reduced unit price. Form and database agree, and tax is charged on the discounted amount, which is correct. | The invoice shows the *net* unit price. The discount is not recorded as a separate figure, so it cannot be printed as "10% off" and there is no audit trail of the original price. |

Option B is honest arithmetic but silently changes the document a customer receives, so it is
not being taken unilaterally. It is a one-line change to the payload builder in
`InvoiceFormPage.tsx` if the decision is that a usable discount now outweighs the loss of
provenance.

Legacy invoices created while the old input existed still carry the pre-fix totals; neither
option retro-corrects them, and no backfill is proposed here.
