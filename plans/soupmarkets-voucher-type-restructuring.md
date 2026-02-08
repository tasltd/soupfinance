# Soupmarkets-Web Backend — Voucher Type Restructuring Plan

**Created**: 2026-02-07
**Status**: Ready for implementation
**Executor**: Separate Claude session with soupmarkets-web context
**Consumers**: SSR admin app, SoupFinance SPA, other SPA clients

---

## 1. Goal

Restructure the soupmarkets-web Grails backend voucher system to support 4 proper accounting voucher types, fix the RECEIPT → DEPOSIT normalization bug, and ensure backward compatibility with all consumers (SSR, SoupFinance SPA, other SPAs).

### Current State (Broken)

| Issue | Location | Impact |
|-------|----------|--------|
| RECEIPT silently normalized to DEPOSIT | `Voucher.beforeImport()` | RECEIPT type is meaningless |
| DEPOSIT overloaded | VoucherType enum | Conflates external receipts AND internal transfers |
| InvoicePayment creates DEPOSIT voucher | `InvoicePaymentLedgerTransactionListenerService` | Should create RECEIPT |
| No CONTRA type | VoucherType enum | No way to record internal fund transfers |
| No JOURNAL type | VoucherType enum | No non-cash adjustment vouchers |
| Amount validation commented out | `Voucher.groovy` constraints | No server-side amount validation |

### Target State

| Type | Direction | Journal Entry | Use Case |
|------|-----------|---------------|----------|
| **PAYMENT** | Money OUT | Dr: Expense/Payable, Cr: Bank/Cash | Pay vendor, staff, bills |
| **RECEIPT** | Money IN | Dr: Bank/Cash, Cr: Income/Receivable | Receive from client, invoice payments |
| **CONTRA** | Internal | Dr: Bank/Cash, Cr: Bank/Cash | Transfer between own accounts |
| **JOURNAL** | Non-cash | Dr: Any, Cr: Any | Depreciation, provisions, accruals |

---

## 2. Architecture Context

### Consumer Map

The soupmarkets-web backend serves multiple frontends:

| Consumer | Type | Voucher UI | Impact Level |
|----------|------|------------|-------------|
| **SSR Admin App** | Server-side Grails GSP | Full voucher CRUD forms | HIGH — GSP templates use VoucherType enum directly |
| **SoupFinance SPA** | React SPA (app.soupfinance.com) | Voucher create/list/detail | HIGH — TypeScript types must match |
| **Other SPA** | Unknown SPA | May use voucher endpoints | MEDIUM — Must not break existing API contract |
| **API Consumers** | REST clients | Direct REST calls | LOW — Accept header determines response format |

### Key Constraint

**All changes MUST be backward compatible during a transition period.** The SSR admin app and other SPA may still send DEPOSIT. The backend should accept DEPOSIT but internally map it to RECEIPT (inverse of current behavior).

---

## 3. Implementation Steps

### Step 1: Add CONTRA and JOURNAL to VoucherType Enum

**File**: `grails-app/domain/soupbroker/finance/Voucher.groovy` (or wherever VoucherType enum is defined)

```groovy
// Changed: Added CONTRA and JOURNAL voucher types for proper accounting
enum VoucherType {
    PAYMENT,    // Money out to external party
    RECEIPT,    // Money in from external party
    DEPOSIT,    // DEPRECATED: mapped to RECEIPT for backward compatibility
    CONTRA,     // Internal fund transfer between own bank/cash accounts
    JOURNAL     // Non-cash adjustment (depreciation, provisions, accruals)
}
```

**Note**: Keep DEPOSIT in the enum for backward compatibility but mark as deprecated. New code should never create DEPOSIT vouchers.

### Step 2: Fix RECEIPT Normalization (CRITICAL)

**File**: `Voucher.groovy` — `beforeImport()` method

**Current behavior**: Converts RECEIPT → DEPOSIT
```groovy
void beforeImport() {
    if (voucherType == VoucherType.RECEIPT) {
        voucherType = VoucherType.DEPOSIT
    }
}
```

**New behavior**: Convert DEPOSIT → RECEIPT (reverse the mapping)
```groovy
// Changed: DEPOSIT is deprecated, normalize to RECEIPT instead of the reverse
void beforeImport() {
    if (voucherType == VoucherType.DEPOSIT) {
        voucherType = VoucherType.RECEIPT
    }
}
```

This is the **single most important fix** — it reverses the broken normalization direction.

### Step 3: Fix InvoicePayment Voucher Creation

**File**: `InvoicePaymentLedgerTransactionListenerService.groovy` (or similar service)

When an InvoicePayment is recorded, the system auto-creates a voucher. Currently it creates a DEPOSIT voucher. It should create a RECEIPT voucher.

**Current**:
```groovy
voucher.voucherType = VoucherType.DEPOSIT
```

**New**:
```groovy
// Fix: Invoice payments are money IN from client — should be RECEIPT, not DEPOSIT
voucher.voucherType = VoucherType.RECEIPT
```

Also verify the ledger transaction direction:
- Debit: Bank/Cash account (ASSET) — money coming IN
- Credit: Accounts Receivable or Income account — reducing the receivable

### Step 4: Fix BillPayment Voucher Creation

**File**: `BillPaymentService.groovy` or `BillPaymentLedgerTransactionListenerService.groovy`

Verify BillPayment creates PAYMENT voucher (this should already be correct). Confirm:
- Debit: Expense or Accounts Payable account — recording the expense
- Credit: Bank/Cash account (ASSET) — money going OUT

### Step 5: Add CONTRA Validation

**File**: `VoucherService.groovy` or `Voucher.groovy` constraints

For CONTRA vouchers, both debit and credit accounts MUST be ASSET type:

```groovy
// Added: CONTRA voucher validation — both accounts must be ASSET
static constraints = {
    // ... existing constraints ...
}

def beforeValidate() {
    // ... existing validation ...
    if (voucherType == VoucherType.CONTRA) {
        // Validate both accounts are ASSET type
        def debitAccount = debitLedgerAccount ?: ledgerTransaction?.debitLedgerAccount
        def creditAccount = creditLedgerAccount ?: ledgerTransaction?.creditLedgerAccount
        if (debitAccount?.ledgerGroup != LedgerGroup.ASSET) {
            errors.rejectValue('debitLedgerAccount',
                'voucher.contra.debit.must.be.asset',
                'Contra voucher debit account must be an ASSET account')
        }
        if (creditAccount?.ledgerGroup != LedgerGroup.ASSET) {
            errors.rejectValue('creditLedgerAccount',
                'voucher.contra.credit.must.be.asset',
                'Contra voucher credit account must be an ASSET account')
        }
    }
}
```

### Step 6: Add JOURNAL Validation

For JOURNAL vouchers, debit and credit can be any account type, but they must be different accounts:

```groovy
// Added: JOURNAL voucher validation — accounts must be different
if (voucherType == VoucherType.JOURNAL) {
    def debitAccount = debitLedgerAccount ?: ledgerTransaction?.debitLedgerAccount
    def creditAccount = creditLedgerAccount ?: ledgerTransaction?.creditLedgerAccount
    if (debitAccount?.id == creditAccount?.id) {
        errors.rejectValue('creditLedgerAccount',
            'voucher.journal.accounts.must.differ',
            'Journal voucher debit and credit accounts must be different')
    }
}
```

### Step 7: Uncomment/Fix Amount Validation

**File**: `Voucher.groovy` constraints

The amount validation is currently commented out. Re-enable it:

```groovy
static constraints = {
    // Fix: Re-enable amount validation (was commented out)
    amount min: 0.01d, validator: { val, obj ->
        if (val == null || val <= 0) {
            return 'voucher.amount.must.be.positive'
        }
    }
}
```

### Step 8: Update VoucherController for New Types

**File**: `VoucherController.groovy`

Ensure the `save` and `update` actions accept the new type values (CONTRA, JOURNAL). Since they're in the enum, Grails data binding should handle this automatically. However, verify:

1. The `create` action (for CSRF token) works with new types
2. The `save` action validates the new type constraints
3. The `index` action can filter by the new types (if it supports type filtering)

```groovy
// Added: Support filtering by new voucher types
def index() {
    params.max = params.max ?: 20
    // Allow filtering by voucherType query param
    def criteria = Voucher.createCriteria()
    def results = criteria.list(max: params.max, offset: params.offset ?: 0) {
        if (params.voucherType) {
            eq('voucherType', VoucherType.valueOf(params.voucherType))
        }
        order(params.sort ?: 'dateCreated', params.order ?: 'desc')
    }
    respond results
}
```

### Step 9: Update SSR GSP Forms

**Files**:
- `grails-app/views/voucher/create.gsp`
- `grails-app/views/voucher/edit.gsp`
- `grails-app/views/voucher/_form.gsp`

Add CONTRA and JOURNAL options to the voucher type dropdown:

```gsp
<g:select name="voucherType"
    from="${soupbroker.finance.VoucherType.values().findAll { it != VoucherType.DEPOSIT }}"
    optionKey="name"
    optionValue="${{ it.name().toLowerCase().capitalize() }}"
    value="${voucherInstance?.voucherType}" />
```

**Note**: Filter out DEPOSIT from the dropdown (deprecated), but the backend still accepts it for backward compatibility.

Update the account selection to be dynamic based on voucher type:
- CONTRA: Show only ASSET accounts for both debit and credit dropdowns
- JOURNAL: Show all accounts
- PAYMENT: Expense/Payable accounts for debit, ASSET for credit
- RECEIPT: ASSET for debit, Income/Receivable for credit

This may require JavaScript in the GSP or conditional rendering with Grails tags.

### Step 10: Update JSON Renderers/Marshallers

If the backend uses custom JSON marshallers for Voucher, update them to include the new type values in their output. Verify the REST API response includes:

```json
{
  "id": "uuid",
  "voucherType": "RECEIPT",
  "voucherTo": "CLIENT",
  "amount": 1000.00,
  "debitLedgerAccount": { "id": "uuid", "name": "Petty Cash", "code": "1001" },
  "creditLedgerAccount": { "id": "uuid", "name": "Service Revenue", "code": "4001" },
  "status": "PENDING"
}
```

---

## 4. Data Migration

### Migrate Existing DEPOSIT Vouchers

Create a Grails migration or bootstrap script to convert existing DEPOSIT vouchers to RECEIPT:

```groovy
// Migration: Convert all DEPOSIT vouchers to RECEIPT
def migrateDepositToReceipt() {
    Voucher.executeUpdate(
        "UPDATE Voucher SET voucherType = :receipt WHERE voucherType = :deposit",
        [receipt: VoucherType.RECEIPT, deposit: VoucherType.DEPOSIT]
    )
    log.info("Migrated all DEPOSIT vouchers to RECEIPT")
}
```

**Timing**: Run AFTER deploying the code changes, BEFORE removing DEPOSIT from the enum.

### Migration Safety

1. **Before migration**: Count DEPOSIT vouchers for verification
2. **Run migration**: Convert DEPOSIT → RECEIPT
3. **After migration**: Verify count matches, spot-check ledger entries
4. **Later**: Once all consumers have updated, remove DEPOSIT from enum

---

## 5. Backward Compatibility Strategy

### Transition Period (Phase 1 — Deploy changes)

| Consumer Sends | Backend Accepts | Backend Stores |
|---------------|-----------------|----------------|
| PAYMENT | Yes | PAYMENT |
| RECEIPT | Yes | RECEIPT |
| DEPOSIT | Yes (backward compat) | RECEIPT (via beforeImport) |
| CONTRA | Yes (new) | CONTRA |
| JOURNAL | Yes (new) | JOURNAL |

### After Migration (Phase 2 — Remove DEPOSIT)

Once all consumers have been updated (SSR, SoupFinance, other SPA):
1. Remove DEPOSIT from VoucherType enum
2. Remove `beforeImport()` DEPOSIT → RECEIPT mapping
3. Tighten validation to reject DEPOSIT

### API Response Compatibility

During Phase 1, the REST API response should always return the actual stored type (never DEPOSIT for new vouchers). Old vouchers may still return DEPOSIT until the data migration runs.

---

## 6. Testing Requirements

### Unit Tests

| Test | Expected |
|------|----------|
| Create PAYMENT voucher | Dr: Expense, Cr: ASSET — stored as PAYMENT |
| Create RECEIPT voucher | Dr: ASSET, Cr: Income — stored as RECEIPT |
| Create CONTRA voucher | Dr: ASSET, Cr: ASSET — stored as CONTRA |
| Create JOURNAL voucher | Dr: Any, Cr: Any — stored as JOURNAL |
| Send DEPOSIT type | Stored as RECEIPT (backward compat) |
| CONTRA with non-ASSET debit | Validation error |
| CONTRA with non-ASSET credit | Validation error |
| JOURNAL with same debit/credit | Validation error |
| Amount <= 0 | Validation error |

### Integration Tests

| Test | Expected |
|------|----------|
| InvoicePayment auto-creates RECEIPT voucher | Voucher.voucherType == RECEIPT |
| BillPayment auto-creates PAYMENT voucher | Voucher.voucherType == PAYMENT |
| REST POST with CONTRA type | 200 OK, voucher created |
| REST POST with JOURNAL type | 200 OK, voucher created |
| REST POST with DEPOSIT type (legacy) | 200 OK, stored as RECEIPT |
| GSP form with CONTRA selected | Account dropdowns filter to ASSET only |

### SSR Form Tests

- Verify voucher type dropdown shows PAYMENT, RECEIPT, CONTRA, JOURNAL (not DEPOSIT)
- Verify account filtering changes dynamically based on selected type
- Verify existing voucher list shows correct type labels

---

## 7. Files to Modify Summary

| File | Change |
|------|--------|
| `Voucher.groovy` (domain) | Add CONTRA/JOURNAL to enum, fix beforeImport, add validation |
| `VoucherService.groovy` | Add CONTRA/JOURNAL validation logic |
| `VoucherController.groovy` | Support new types in create/save/index |
| `InvoicePaymentLedgerTransactionListenerService.groovy` | DEPOSIT → RECEIPT |
| `BillPaymentService.groovy` | Verify PAYMENT type (should be correct) |
| `voucher/create.gsp` | Add CONTRA/JOURNAL to dropdown, hide DEPOSIT |
| `voucher/edit.gsp` | Same as create |
| `voucher/_form.gsp` | Dynamic account filtering per type |
| JSON marshallers (if any) | Include new type values |
| `BootStrap.groovy` or migration | Data migration DEPOSIT → RECEIPT |

---

## 8. Rollback Plan

If issues arise after deployment:

1. **Revert `beforeImport()`** to original RECEIPT → DEPOSIT direction
2. CONTRA and JOURNAL won't break existing data (additive change)
3. Data migration can be reversed: `UPDATE Voucher SET voucherType = 'DEPOSIT' WHERE voucherType = 'RECEIPT'`

The enum addition (CONTRA, JOURNAL) is safe and doesn't need rollback.

---

## 9. Acceptance Criteria

- [ ] RECEIPT type stored correctly (not normalized to DEPOSIT)
- [ ] DEPOSIT accepted but stored as RECEIPT (backward compat)
- [ ] InvoicePayment creates RECEIPT voucher (not DEPOSIT)
- [ ] BillPayment creates PAYMENT voucher (confirmed)
- [ ] CONTRA type accepted with both-ASSET validation
- [ ] JOURNAL type accepted with different-accounts validation
- [ ] Amount validation re-enabled (> 0)
- [ ] SSR forms show 4 types (PAYMENT, RECEIPT, CONTRA, JOURNAL)
- [ ] SSR forms filter accounts per voucher type
- [ ] REST API returns correct type in JSON response
- [ ] Data migration converts existing DEPOSIT → RECEIPT
- [ ] All existing tests still pass
- [ ] New unit tests cover all 4 types + backward compat
