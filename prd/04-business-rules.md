# Business Rules

[← Back to PRD Index](../PRD.md)

---

## Accounting Rules

| Rule | Description |
|------|-------------|
| **Balanced Entries** | Total Debits must equal Total Credits in journal entries |
| **Minimum Lines** | Journal entries require at least 2 line items |
| **Active Accounts** | Can only post to active (isActive=true) accounts |
| **No Direct Equity** | Cannot post directly to EQUITY accounts (except retained earnings) |
| **Immutable Posted** | Posted transactions are read-only |
| **Reversal Method** | Reversals create inverse entries, don't delete originals |

### Journal Entry Validation

```
1. At least 2 line items required
2. Each line has Account + (Debit XOR Credit amount)
3. Sum(Debits) === Sum(Credits)
4. All referenced accounts must be active
5. Cannot modify after status = POSTED
```

---

## Invoice/Bill Payment Rules

| Rule | Description |
|------|-------------|
| **Partial Payments** | Allowed; status updates to PARTIAL |
| **Overpayment** | Not prevented; amountPaid can exceed totalAmount |
| **Status Auto-Update** | PARTIAL when 0 < paid < total; PAID when paid >= total |
| **Overdue Trigger** | Status becomes OVERDUE if unpaid and past dueDate |

### Status Calculation Logic

```typescript
function calculateStatus(amountPaid: number, totalAmount: number, dueDate: Date): Status {
  if (amountPaid === 0) return 'PENDING';
  if (amountPaid >= totalAmount) return 'PAID';
  if (amountPaid > 0 && amountPaid < totalAmount) {
    return new Date() > dueDate ? 'OVERDUE' : 'PARTIAL';
  }
  return 'PENDING';
}
```

---

## Voucher Rules

| Rule | Description |
|------|-------------|
| **Atomic Creation** | Voucher and LedgerTransaction share same ID |
| **Approval Required** | Must be APPROVED before posting |
| **Type-Specific Accounts** | Payment: cash + expense; Receipt: cash + income |
| **No Modification After Post** | POSTED vouchers are read-only |

### Voucher Type Requirements

| Type | Required Accounts | Party Selection |
|------|-------------------|-----------------|
| PAYMENT | Cash Account + Expense Account | Vendor, Staff, or Other |
| RECEIPT | Cash Account + Income Account | Client or Other |
| DEPOSIT | Cash Account only | None |

### Voucher Workflow

```
PENDING → APPROVED → POSTED → (readonly)
              ↓
          CANCELLED
```

---

## Registration Rules

| Rule | Description |
|------|-------------|
| **Email Confirmation** | Required before login enabled |
| **Unique Email** | Email address must be unique across all tenants |
| **Default COA** | Chart of Accounts created based on businessType |
| **Admin User** | First user always gets ROLE_ADMIN |
| **No Password at Registration** | Password set during email confirmation |

### Registration Flow

```
1. User submits: companyName, businessType, adminName, email
2. System creates: Account, Agent, default COA
3. Confirmation email sent with token
4. User clicks link, sets password
5. User can now login
```

---

## Invoice Status Workflow

```
DRAFT → SENT → VIEWED → PARTIAL/PAID
                    ↓
                OVERDUE (if past due date)
                    ↓
                CANCELLED (any time from any status)
```

### Status Transitions

| From | To | Trigger |
|------|-----|---------|
| DRAFT | SENT | User sends invoice |
| SENT | VIEWED | Client opens invoice |
| VIEWED | PARTIAL | Partial payment recorded |
| PARTIAL | PAID | Full payment recorded |
| * | OVERDUE | System check (past due, unpaid) |
| * | CANCELLED | User cancels |

---

## Bill Status Workflow

```
DRAFT → PENDING → PARTIAL/PAID → OVERDUE
                              ↓
                          CANCELLED
```

---

## Transaction Status Workflow

### Journal Entry / Transaction Group

```
PENDING → POSTED → (readonly) → REVERSED
```

- PENDING: Can be edited or deleted
- POSTED: Read-only, affects account balances
- REVERSED: Creates inverse entry, original unchanged

---

## Aging Bucket Rules

| Bucket | Calculation |
|--------|-------------|
| Current | dueDate >= today |
| 30 Days | 1-30 days past dueDate |
| 60 Days | 31-60 days past dueDate |
| 90 Days | 61-90 days past dueDate |
| 90+ Days | > 90 days past dueDate |

---

## Currency Rules

- Tenant currency set during registration
- All monetary values stored in tenant's base currency
- Currency formatting via `useFormatCurrency` hook
- Currency symbol and decimal places vary by currency code

---

## Soft Delete Rules

- All entities use `archived` flag for soft delete
- Archived records excluded from default queries
- Archived records can be restored by admin
- Hard delete only via database admin
