# Accounting & Journal Entries

[← Back to PRD Index](../../PRD.md)

---

## Purpose

Create double-entry journal entries and manage vouchers (payments/receipts/deposits).

---

## User Stories

| ID | Story | Priority |
|----|-------|----------|
| ACC-1 | As an accountant, I want to create journal entries so I can record transactions | P0 |
| ACC-2 | As an accountant, I want to create payment vouchers so I can track disbursements | P0 |
| ACC-3 | As an accountant, I want to create receipt vouchers so I can track income | P0 |
| ACC-4 | As an accountant, I want to post transactions so they affect the ledger | P0 |
| ACC-5 | As an accountant, I want to reverse posted entries if corrections needed | P1 |

---

## Journal Entry Types

| Type | Description |
|------|-------------|
| DOUBLE_ENTRY | Traditional debit/credit with two or more accounts |
| SINGLE_ENTRY | One account with direction (DEBIT/CREDIT) |

---

## Voucher Types

| Type | Purpose | Required Accounts |
|------|---------|-------------------|
| PAYMENT | Record disbursement/expense | Cash Account + Expense Account |
| RECEIPT | Record incoming payment | Cash Account + Income Account |
| DEPOSIT | Record bank deposit | Cash Account only |

---

## Status Workflows

### Journal Entry

```
PENDING → POSTED → (readonly) → REVERSED
```

| Status | Description | Editable |
|--------|-------------|----------|
| PENDING | Draft, not yet posted | Yes |
| POSTED | Affects balances | No |
| REVERSED | Offset by reverse entry | No |

### Voucher

```
PENDING → APPROVED → POSTED → (readonly)
              ↓
          CANCELLED
```

| Status | Description | Editable |
|--------|-------------|----------|
| PENDING | Draft, awaiting approval | Yes |
| APPROVED | Ready to post | No |
| POSTED | Affects balances | No |
| CANCELLED | Voided | No |

---

## Functional Requirements

### Journal Entry Creation

1. Enter date, description, reference
2. Add multiple line items (minimum 2)
3. Each line: Account, Debit OR Credit amount, line description
4. System validates: Total Debits = Total Credits
5. Save as PENDING
6. Review and POST to ledger

### Voucher Creation

1. Select voucher type (Payment/Receipt/Deposit)
2. Select payee/payer (Client, Vendor, Staff, Other)
3. Enter amount, date, reference
4. Select accounts based on type
5. Save as PENDING
6. Approve, then POST

---

## Validation Rules

| Rule | Description |
|------|-------------|
| Balanced | Total Debits must equal Total Credits |
| Minimum Lines | At least 2 line items required |
| Active Accounts | All accounts must be active |
| No Dual Amount | Line cannot have both debit and credit |

---

## Pages

| Page | Route | Description |
|------|-------|-------------|
| JournalEntryPage | `/accounting/journal-entry/new` | Create journal entry |
| JournalEntryDetailPage | `/accounting/journal-entry/:id` | View entry details |
| VoucherListPage | `/accounting/vouchers` | List all vouchers |
| VoucherFormPage | `/accounting/voucher/:type` | Create voucher by type |
| TransactionRegisterPage | `/accounting/register` | View all transactions |

---

## API Endpoints

```
POST /rest/ledgerTransaction/save.json         - Create single transaction
POST /rest/ledgerTransaction/saveMultiple.json - Create multi-line journal entry
GET  /rest/ledgerTransaction/show/:id.json     - Get transaction details
POST /rest/ledgerTransaction/post/:id.json     - Post pending transaction
POST /rest/ledgerTransaction/reverse/:id.json  - Reverse posted transaction

GET  /rest/ledgerTransactionGroup/index.json   - List transaction groups
GET  /rest/ledgerTransactionGroup/show/:id.json - Get group details
POST /rest/ledgerTransactionGroup/post/:id.json - Post group
POST /rest/ledgerTransactionGroup/reverse/:id.json - Reverse group

GET  /rest/voucher/index.json          - List vouchers
POST /rest/voucher/save.json           - Create voucher
GET  /rest/voucher/show/:id.json       - Get voucher details
PUT  /rest/voucher/update/:id.json     - Update voucher
POST /rest/voucher/approve/:id.json    - Approve voucher
POST /rest/voucher/post/:id.json       - Post voucher
POST /rest/voucher/cancel/:id.json     - Cancel voucher
```

---

## Example Journal Entry

**Scenario:** Record office supplies purchase of $500

| Account | Debit | Credit |
|---------|-------|--------|
| Office Supplies (Expense) | $500 | - |
| Cash (Asset) | - | $500 |

---

## Example Voucher (Payment)

**Scenario:** Pay vendor invoice of $1,000

| Field | Value |
|-------|-------|
| Type | PAYMENT |
| To | Vendor: ABC Supplies |
| Amount | $1,000 |
| Cash Account | Bank Account |
| Expense Account | Accounts Payable |

---

## Wireframe References

- `soupfinance-designs/screenshots/journal-entry.png`
- `soupfinance-designs/screenshots/voucher-payment.png`
- `soupfinance-designs/screenshots/transaction-register.png`
