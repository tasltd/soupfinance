# Accounting Transactions Research Summary

**Date**: 2026-01-20
**Purpose**: Research for generic accounting transactions feature in SoupFinance

---

## Online Research Findings

### Double-Entry Bookkeeping Best Practices

**Core Principle**: Every financial transaction records a debit and a credit that must be equal.

| Account Type | Normal Balance | Increase | Decrease |
|--------------|----------------|----------|----------|
| Assets | Debit | Debit | Credit |
| Liabilities | Credit | Credit | Debit |
| Equity | Credit | Credit | Debit |
| Income/Revenue | Credit | Credit | Debit |
| Expenses | Debit | Debit | Credit |

**Sources**:
- [QuickBooks Double-Entry Guide](https://quickbooks.intuit.com/r/bookkeeping/complete-guide-to-double-entry-bookkeeping/)
- [Financial Cents Double-Entry Accounting](https://financial-cents.com/resources/articles/double-entry-accounting/)

### Journal Entry UI Design

**Essential Components**:
1. **Header**: Date, entry number, description
2. **Line Items**: Account, debit amount, credit amount, line description
3. **Footer**: Total debits, total credits, balance indicator
4. **Validation**: Real-time balance check (debits must equal credits)

**Best Practices**:
- Clear debit/credit column separation
- Running totals for verification
- Account search/autocomplete from chart of accounts
- Balance warning when totals don't match

**Sources**:
- [Manager.io Journal Entry Form](https://www.manager.io/guides/journal-entry-form)
- [AccountingTools Journal Entry Format](https://www.accountingtools.com/articles/journal-entry-format.html)

### Voucher Types

| Type | Purpose | Debit | Credit |
|------|---------|-------|--------|
| **Payment Voucher** | Money paid out | Expense/Payable | Cash/Bank |
| **Receipt Voucher** | Money received | Cash/Bank | Income/Receivable |
| **Contra Voucher** | Bank transfers | Bank A | Bank B |
| **Journal Voucher** | Non-cash adjustments | Various | Various |

**Sources**:
- [Wafeq Payment Vouchers](https://www.wafeq.com/en/forms/accounting-templates/payment-voucher)
- [TallyHelp Voucher Types](https://help.tallysolutions.com/payments-and-receipts-tally/)

---

## Soupmarkets Finance Module Investigation

### Domain Classes

| Domain | Purpose | Key Fields |
|--------|---------|------------|
| **LedgerTransaction** | Core transaction record | amount, debit/creditLedgerAccount, transactionDate, journalEntryType |
| **LedgerTransactionGroup** | Groups related entries | ledgerTransactionList, balanced, totalDebit, totalCredit |
| **Voucher** | Payment/receipt wrapper | voucherType (PAYMENT/DEPOSIT/RECEIPT), voucherTo, ledgerTransaction |
| **LedgerJournal** | Period closing | journalDate, journalTransactionList |
| **LedgerAccount** | Chart of accounts | name, number, ledgerAccountCategory, parentAccount |
| **LedgerAccountCategory** | Account classification | ledgerGroup (ASSET/LIABILITY/EQUITY/INCOME/EXPENSE) |

### Entry Modes

1. **DOUBLE_ENTRY**: Traditional accounting
   - `debitLedgerAccount`: Account to debit
   - `creditLedgerAccount`: Account to credit
   - `amount`: Positive value

2. **SINGLE_ENTRY**: Simplified mode
   - `ledgerAccount`: Account affected
   - `transactionState`: DEBIT or CREDIT
   - `amount`: Positive value

### API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /rest/ledgerTransaction/save.json` | Create single transaction |
| `POST /rest/ledgerTransaction/saveMultiple.json` | Create grouped/balanced entries |
| `GET /rest/ledgerTransaction/index.json` | List transactions |
| `POST /rest/voucher/save.json` | Create payment/receipt |
| `GET /rest/voucher/index.json` | List vouchers |
| `GET /rest/ledgerAccount/index.json` | List accounts |

### Voucher-Transaction Relationship

- Voucher and LedgerTransaction **share the same ID** (foreign key pattern)
- Voucher delegates financial properties to LedgerTransaction
- Creating a Voucher automatically creates underlying LedgerTransaction

---

## Feature Requirements for SoupFinance

### 1. Journal Entries (Manual Transactions)

**User Story**: As an accountant, I need to record manual adjustments like accruals, write-offs, and corrections.

**Components**:
- Journal entry form with multiple line items
- Debit/credit columns
- Account autocomplete from chart of accounts
- Real-time balance validation
- Description per entry and per line
- Recurring entry templates

### 2. Payment Vouchers

**User Story**: As an accountant, I need to record payments to vendors, staff, and other beneficiaries.

**Components**:
- Payment form with beneficiary selection
- Bank/cash account selection
- Reference number and date
- Expense categorization
- Attachment support

### 3. Receipt Vouchers

**User Story**: As an accountant, I need to record money received from clients and other sources.

**Components**:
- Receipt form with payer selection
- Deposit account selection
- Income categorization
- Invoice allocation

### 4. Contra Vouchers (Bank Transfers)

**User Story**: As an accountant, I need to record transfers between bank accounts.

**Components**:
- Source and destination bank selection
- Transfer amount
- Reference numbers

### 5. Transaction Register

**User Story**: As an accountant, I need to view all transactions with filtering and export.

**Components**:
- Transaction list with date range filter
- Account filter
- Type filter (journal, payment, receipt)
- Export to CSV/Excel/PDF
- Drill-down to source documents

---

## Recommended Implementation Approach

1. **Start with Journal Entries**: Most flexible, covers all use cases
2. **Add Vouchers**: Business-friendly wrappers for payments/receipts
3. **Build Transaction Register**: Unified view of all entries
4. **Add Reports**: Trial balance, general ledger detail

---

**Research Complete**: 2026-01-20
