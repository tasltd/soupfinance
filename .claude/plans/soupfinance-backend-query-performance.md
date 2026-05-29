# Backend Query Performance Optimization Plan

## Context
5 integration tests are skipped due to backend performance/behavior issues on the seed database (3145+ ledger accounts). This plan provides fixes for the soupmarkets-web backend.

## Issues

| Issue | Endpoint | Behavior | Impact |
|-------|----------|----------|--------|
| Trial balance timeout | `/rest/financeReports/trialBalance.json` | >45s query time | 1 skipped test |
| Voucher index timeout | `/rest/voucher/index.json` | >45s query time | 2 skipped tests |
| Bill save redirect | `/rest/bill/save.json` | Returns 302 not JSON | 2 skipped tests |

---

## Fix 1: Trial Balance Query Optimization (HIGH PRIORITY)

### Root Cause
The query loads full entity objects for 3145+ accounts and computes balances in-memory. This triggers N+1 queries through GORM lazy loading.

### Step 1: Add Database Indexes

```sql
-- Optimize date range + account lookups for trial balance
CREATE INDEX idx_ledger_txn_account_date
ON ledger_transaction(ledger_account_id, transaction_date, transaction_type);

-- Optimize GROUP BY queries
CREATE INDEX idx_ledger_txn_date_account
ON ledger_transaction(transaction_date, ledger_account_id, amount);

-- For trial balance with account type filtering
CREATE INDEX idx_ledger_account_type_code
ON ledger_account(account_type, code);
```

### Step 2: Use HQL Projections in FinanceReportsService

Replace entity loading with HQL projection query that computes aggregates in the database:

```groovy
// In FinanceReportsService.groovy
@Transactional(readOnly = true)
def trialBalance(Date startDate, Date endDate, Integer max = 100, Integer offset = 0) {
    def results = LedgerTransaction.executeQuery('''
        SELECT
            la.id, la.code, la.name, la.accountType,
            COALESCE(SUM(CASE WHEN lt.transactionType = 'DEBIT' THEN lt.amount ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN lt.transactionType = 'CREDIT' THEN lt.amount ELSE 0 END), 0)
        FROM LedgerTransaction lt
        JOIN lt.ledgerAccount la
        WHERE lt.transactionDate BETWEEN :startDate AND :endDate
        GROUP BY la.id, la.code, la.name, la.accountType
        ORDER BY la.code
    ''', [startDate: startDate, endDate: endDate, max: max, offset: offset])

    return results.collect { row ->
        [id: row[0], code: row[1], name: row[2], accountType: row[3],
         debit: row[4], credit: row[5], balance: row[4] - row[5]]
    }
}
```

### Step 3: Add Pagination in Controller

```groovy
// In FinanceReportsController.groovy
def trialBalance() {
    params.max = Math.min(params.max as Integer ?: 100, 500)
    params.offset = params.offset as Integer ?: 0
    // ... use paginated service method
}
```

### Expected Result
Query time should drop from 45s+ to 3-8s with indexes + projections + pagination.

---

## Fix 2: Voucher Index Performance (HIGH PRIORITY)

### Root Cause
The `_domainClassInstance.gson` generic template iterates over hasMany collections, triggering N+1 lazy loading queries. The voucher endpoint processes hundreds of vouchers with their items.

### Option A: Dedicated GSON View (Recommended)

Create `grails-app/views/voucher/_voucher.gson`:

```groovy
import soupbroker.finance.Voucher

model {
    Voucher voucher
}

json {
    id voucher.id
    voucherNumber voucher.voucherNumber
    voucherDate voucher.voucherDate
    voucherType voucher.voucherType
    status voucher.status
    description voucher.description
    totalAmount voucher.totalAmount
    // Render FK without lazy loading collections
    ledgerAccount voucher.ledgerAccount ? [
        id: voucher.ledgerAccount.id,
        code: voucher.ledgerAccount.code,
        name: voucher.ledgerAccount.name
    ] : null
    // DO NOT access voucherItems here — load separately
}
```

### Option B: Batch Fetching on Domain

```groovy
// In Voucher.groovy domain class
static mapping = {
    voucherItems batchSize: 20
}
```

This reduces N+1 queries to ceil(N/20)+1 queries.

### Expected Result
Query time should drop from 45s+ to 2-5s.

---

## Fix 3: Bill Save 302 Redirect (CRITICAL)

### Root Cause
RestfulController's `withFormat` block mixes form and JSON handling. When the `form multipartForm` block matches first, it triggers a redirect instead of returning JSON. This is a known Grails issue (apache/grails-core#15172).

### Fix: Override save() with Explicit JSON Handling

```groovy
// In BillController.groovy
@Transactional
def save(Bill bill) {
    if (bill == null) {
        request.withFormat {
            form multipartForm {
                redirect action: "index"
            }
            '*' { render status: NOT_FOUND }
        }
        return
    }

    if (bill.hasErrors()) {
        request.withFormat {
            form multipartForm { respond bill.errors, view: 'create' }
            '*' { render status: UNPROCESSABLE_ENTITY, contentType: 'application/json', text: (bill.errors as JSON) }
        }
        return
    }

    try {
        billService.save(bill)
    } catch (ValidationException e) {
        request.withFormat {
            form multipartForm { respond bill.errors, view: 'create' }
            '*' { render status: UNPROCESSABLE_ENTITY, contentType: 'application/json', text: (bill.errors as JSON) }
        }
        return
    }

    request.withFormat {
        form multipartForm {
            flash.message = message(code: 'default.created.message')
            redirect bill
        }
        '*' { render status: CREATED, contentType: 'application/json', text: (bill as JSON) }
    }
}
```

### Key Changes
- Replace `respond` with explicit `render` + `contentType: 'application/json'` in non-form blocks
- Use `as JSON` to force JSON serialization
- Explicit status codes (`CREATED`, `UNPROCESSABLE_ENTITY`)

### Also Applies To
Check and fix the same pattern in:
- `InvoiceController.save()`
- `VendorController.save()`
- Any other RestfulController subclass that shows 302 behavior

---

## Implementation Order

1. **Database indexes** — Can be applied immediately, zero risk
2. **GSON views** — Low risk, fixes voucher timeout
3. **HQL projections** — Medium complexity, fixes trial balance
4. **Controller save overrides** — Medium risk, fixes bill 302

## Testing After Each Fix

```bash
# Test trial balance (should complete in <10s)
curl -s -w "\n%{time_total}s" -H "X-Auth-Token: $TOKEN" -H "Api-Authorization: Basic $API_AUTH" \
  "http://10.115.213.183:9090/rest/financeReports/trialBalance.json?from=2026-01-01&to=2026-02-13"

# Test voucher index (should complete in <10s)
curl -s -w "\n%{time_total}s" -H "X-Auth-Token: $TOKEN" -H "Api-Authorization: Basic $API_AUTH" \
  "http://10.115.213.183:9090/rest/voucher/index.json"

# Test bill save (should return 201 JSON, not 302)
curl -s -w "\n%{http_code}" -X POST -H "Content-Type: application/json" \
  -H "X-Auth-Token: $TOKEN" -H "Api-Authorization: Basic $API_AUTH" \
  -d '{"billNumber":"TEST-001","vendor":{"id":"..."},"billItemList":[...]}' \
  "http://10.115.213.183:9090/rest/bill/save.json"
```

## References
- [Hibernate Performance Tuning - Thorben Janssen (2025)](https://thorben-janssen.com/hibernate-performance-tuning/)
- [GORM Fetching Strategies](https://github.com/grails/gorm-hibernate5)
- [Grails RestfulController JSON issue #15172](https://github.com/apache/grails-core/issues/15172)
- [MySQL Composite Indexes](https://dev.mysql.com/doc/refman/8.0/en/multiple-column-indexes.html)
