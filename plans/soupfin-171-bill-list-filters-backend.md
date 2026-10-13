# SOUPFIN-171 Bill List Filters: Backend Plan (tracked as SOUPFIN-259)

## Context

SOUPFIN-171 gave the SoupFinance Bills list paging, search, and filters for status, vendor and bill date. The frontend checked every param against both backends before shipping (13 Oct 2026). Production traffic reaches the Go gateway first, with Demo's Grails as the hot standby (`deploy/apache-soupfinance.conf`).

| Param on `GET /rest/bill/index.json` | Grails (`Bill.searchList`) | Go (`BillHandler.Index` → `parseQuery` → `db.Repo.applyFilters`) |
|---|---|---|
| `max`, `offset`, `sort`, `order` | honoured, max ≤ 1000 | honoured, max ≤ 1000 (`MaxPageSize`) |
| `search` | OR over tokens: `ilike` on `id` and `serialised` | same grammar |
| `totalCount` | stamped on every row (`_bill.gson`) | stamped on every row |
| `from` / `to` | filters **`billDate`** | filters **`date_created`** |
| `vendor` | ignored | ignored |
| `status` | ignored | ignored |
| PAID bills | excluded from index (served by `archived`) | included |

The `BillController` javadoc lists `vendor`, `status` and `from/to` as index filters. Only `from/to` is implemented, and only in Grails.

### What the frontend does today

Paging and search run on the server. When a status, vendor or date filter is active, the page fetches the newest 1,000 bills (offset 0) and filters and pages them in the browser. It does not send `from`/`to`, because the Go gateway would apply them to the creation date and drop bills whose bill date is in range. A note appears once the 1,000-row window is full, because older bills are then missed.

See `soupfinance-web/src/features/bills/billListFilters.ts`.

## Required Changes (soupmarkets-web)

### 1. Go gateway: filter `from`/`to` on `bill_date` for bills

`db.Repo.applyFilters` hard-codes `date_created`. Give `Repo[T]` a per-domain date column, or a bill-specific filter via `r.filter`, so `BillHandler` matches Grails `ge('billDate', from)` / `le('billDate', to)`.

### 2. Both backends: `vendor` and `status` filters on bill index

- `vendor` (UUID) → `eq('vendor.id', params.vendor)` in `Bill.searchList`; in Go, a `ColumnFilter` on `vendor_id` from the bill handler's allowlist.
- `status` → `eq('status', PaymentStatus.valueOf(params.status))` for PENDING / PARTIAL / PAID. Reject unknown values with a 422 rather than ignoring them.
- `overdue=true` (optional, derived) → `paymentDate < today AND (baseTotal - basePaidAmount) > 0`. This needs the paid amount in SQL, so it may stay client-side.

### 3. Decide whether index includes PAID bills

Grails excludes PAID bills from `index` and Go includes them. The SoupFinance list wants PAID bills to be visible and filterable. Make the two agree. The recommendation is to include them, which matches the Go behaviour production already serves.

## API Contract After the Change

```
GET /rest/bill/index.json?max=20&offset=0&sort=dateCreated&order=desc
    &search=acme&vendor=<uuid>&status=PENDING&from=2026-01-01&to=2026-03-31
→ [ { ...bill, "totalCount": 37 }, ... ]
```

## Frontend Follow-up

Once both backends honour these params, `buildBillListParams` should send `vendor`, `status`, `from` and `to`, and use server paging for every filter. The 1,000-row window and its note can then be removed. Unit tests in `src/features/bills/__tests__/billListFilters.test.ts` pin the current params and need updating at the same time.
