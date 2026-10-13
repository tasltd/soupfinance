# Vendor Payment Summary + Vendor Bill Filter: Backend Plan (SOUPFIN-172)

## Context

The SoupFinance vendor detail page (`/vendors/:id`) now shows the vendor's
accounts payable summary (PRD `prd/features/vendors.md` VND-2: Total Billed,
Total Paid, Outstanding) and bill history.

The frontend wanted to read both from the backend. Neither works today. Both
gaps were checked against the LXC backend (`soupfinance-backend`,
`10.115.213.183:9090`, user `david.tetteh`) on 2026-10-13.

| Request | Result |
|---|---|
| `GET /rest/trading/vendor/paymentSummary/{id}.json` | **404**. `VendorController` has no `paymentSummary` action |
| `GET /rest/vendor/paymentSummary/{id}.json` | **404** |
| `GET /rest/bill/index.json?vendor.id={id}&max=500` | 200, but **all 277 tenant bills** across 67 vendors, for any id, including a made-up one |
| `GET /rest/bill/index.json?vendor={id}&max=500` | Same: the filter is ignored |
| `GET /rest/bill/index.json` | Leaves out every PAID bill (`ne("status", PAID)` in `Bill.searchList`) |
| `GET /rest/bill/archived.json` | Returns `archived=true OR status=PAID` (13 PAID rows on LXC) |

So the frontend currently works around both gaps
(`soupfinance-web/src/api/endpoints/bills.ts`, `listVendorBills`):

1. It fetches `bill/index.json` **and** `bill/archived.json`, each at `max=1000`
   (the controller cap).
2. It filters by `vendor.id` and drops `archived=true` rows in the browser.
3. It sums `total`, `paidAmount` and `amountDue` itself.
4. When a list's `totalCount` is larger than the rows returned, it warns that
   the totals may be low. A tenant with more than 1000 open bills can hide some
   of a vendor's bills from the page.

This is correct for small tenants. It is not acceptable for large ones: it
downloads every bill in the tenant to show one vendor, and the totals can be
silently short.

## Required Changes (soupmarkets-web)

### 1. Honour a vendor filter in `Bill.searchList` and `Bill.archivedList`

`grails-app/domain/soupbroker/finance/Bill.groovy`. The javadoc on
`BillService.searchActiveList` already promises `vendor: Filter by vendor UUID`.
Make it true, in both closures:

```groovy
def vendorId = params?.vendor instanceof Map ? params.vendor.id : (params?.'vendor.id' ?: params?.vendor)
if (vendorId) {
    eq('vendor.id', vendorId.toString())
}
```

Accept both `?vendor.id=` and `?vendor=`. Grails binds `vendor.id` into a nested
map, so check both shapes.

### 2. Add `VendorController.paymentSummary`

`grails-app/controllers/soupbroker/trading/VendorController.groovy`, reached as
`GET /rest/trading/vendor/paymentSummary/{id}.json`.

- Look up the vendor in the current tenant. Respond 404 if it is missing.
- Include every non-archived bill for the vendor, **including PAID ones**.
- Compute the totals with an HQL/criteria projection, not by loading bills.
  `Bill.total`, `paidAmount` and `amountDue` are getters, so the projection has
  to sum the underlying `BillItem` / `BillPayment` columns.

Response:

```json
{
  "vendor": { "id": "uuid", "name": "Vendor name" },
  "billCount": 3,
  "totalBilled": 7100.00,
  "totalPaid": 4100.00,
  "totalOutstanding": 3000.00,
  "currency": "GHS",
  "bills": [
    { "id": "uuid", "billNumber": "INV-35", "billDate": "2026-09-15", "paymentDate": "2026-10-15",
      "total": 1500.00, "paidAmount": 0, "amountDue": 1500.00, "status": "PENDING" }
  ]
}
```

`bills` should be paginated (`max`, `offset`, newest `billDate` first) and carry
`totalCount`, so the page can show the latest bills without loading them all.

Also add the action to the controller's `allowedMethods` (GET). Check that the
`TradingModuleInterceptor` lets SoupFinance tenants reach it. Vendors are shown
only to TRADING tenants (SOUPFIN-25), so this should already hold.

### 3. Tests

- `BillServiceSpec`: `searchActiveList(vendor: id)` returns only that vendor's
  bills; `archivedList(vendor: id)` likewise.
- `VendorControllerFunctionalSpec`: `paymentSummary` with zero bills (all totals
  0), with a PAID bill (counted in Total Paid), with a soft-deleted bill (not
  counted), with another vendor's bill (not counted), and with an unknown id (404).

## Frontend follow-up once deployed

- Switch `VendorDetailPage` to `getVendorPaymentSummary()` (already declared in
  `soupfinance-web/src/api/endpoints/vendors.ts`, currently unused). Update its
  return type to the response above.
- Remove the browser-side filter in `listVendorBills`, or keep it only as a
  guard. Drop the "totals may be low" warning.

## Notes

- Do not change the backend from the SoupFinance context. A soupmarkets-web
  session should carry this out (`.claude/rules/backend-changes-workflow.md`).
- On LXC every bill header currently reads `total: 0`. That is the
  `LazyInitializationException` degrade noted in SOUPFIN-43, not this bug. Use a
  bill with line items when verifying the totals.
