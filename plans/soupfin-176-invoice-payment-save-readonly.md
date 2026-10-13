# SOUPFIN-176 Backend Plan: invoice payments answer 201 but are never stored

## Context

SOUPFIN-176 moved the SoupFinance payment form to nested foreign keys
(`{ invoice: { id }, paymentMethod: { id }, payInAccount: { id } }`). Grails ignores
the dotted keys the form used before (`'invoice.id'`), so every save had failed with
422 "invoice cannot be null".

With the nested body, `POST /rest/invoicePayment/save.json` now answers **201** with an
`id`, but **no row is written**. Bill payments with the same shape are stored correctly.

## Evidence (LXC `soupfinance-backend`, DB `soupbroker_dev`, 2026-10-13)

| Request | Response | `invoice_payment` / `bill_payment` row |
|---|---|---|
| `invoicePayment/save.json`, dotted keys | 422 `invoice` / `payInAccount` cannot be null | none |
| `invoicePayment/save.json`, nested keys | 201, id `89dc409b…` | **none** |
| `invoicePayment/save.json` from the form (spec run) | 201, id `d268cf70…` | **none**, `show/{id}.json` 404 |
| `billPayment/save.json`, dotted keys | 422 `bill` / `payOutAccount` cannot be null | none |
| `billPayment/save.json`, nested keys | 201 | stored with `payment_method_id`, `pay_out_account_id` |

No exception is logged for the invoice saves.

## Root cause

`grails-app/services/soupbroker/finance/InvoicePaymentService.groovy`:

```groovy
@ReadOnly
class InvoicePaymentService {
    ...
    InvoicePayment save(InvoicePayment invoicePayment){
        IInvoicePaymentService.save(invoicePayment)
    }
```

The class-level `@ReadOnly` (from the 5d9983deaf / a5c1e9c4e2 "use GORM @ReadOnly" refactor)
wraps `save()` in a read-only transaction. The data service's `save` joins it, the session
flush mode is MANUAL, so the insert is never flushed. The UUID id is assigned before the
flush, which is why the response still carries an id.

`BillPaymentService` has no class-level `@ReadOnly` (only on its read methods), which is
why bill payments persist.

## Required change

### Service update

`InvoicePaymentService`: make writes transactional. Either

- remove the class-level `@ReadOnly` and put `@ReadOnly` on the read methods only
  (mirrors `BillPaymentService`), or
- annotate `save(InvoicePayment)` and `delete(Serializable)` with
  `@grails.gorm.transactions.Transactional`.

Check every other service touched by the same refactor for a class-level `@ReadOnly`
that also has write methods; they fail the same way, silently.

### Test

An integration spec that saves an `InvoicePayment` through `InvoicePaymentController.save`
and then reads it back with `InvoicePayment.get(id)` in a new session, asserting
`paymentMethod.id` and `payInAccount.id`. Assert on the stored row, not the 201.

## API contract (unchanged)

```
POST /rest/invoicePayment/save.json?SYNCHRONIZER_TOKEN=…&SYNCHRONIZER_URI=…
{ "invoice": { "id": "<uuid>" }, "amount": 100.00, "paymentDate": "2026-10-13",
  "paymentMethod": { "id": "<uuid>" }, "payInAccount": { "id": "<uuid>" }, "notes": "…" }
→ 201 { "id": "<uuid>", "invoice": {…}, "paymentMethod": {…}, "payInAccount": {…} }
GET  /rest/invoicePayment/show/<uuid>.json → 200, same FKs
```

## Verification from SoupFinance

`soupfinance-web/e2e/integration/soupfin-176-payment-fks.integration.spec.ts`, test
"invoice payment stores invoice, paymentMethod and payInAccount". It fails at the
`show/{id}.json` read-back today and passes once this lands. The bill test in the same
spec already passes.

## Notes

- `InvoicePayment` has no `reference` property; the form's Reference field is dropped by
  the binder for both invoice and bill payments.
