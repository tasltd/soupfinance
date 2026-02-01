# Ledger & Chart of Accounts

[← Back to PRD Index](../../PRD.md)

---

## Purpose

Manage chart of accounts and view transaction history.

---

## User Stories

| ID | Story | Priority |
|----|-------|----------|
| LED-1 | As an accountant, I want to view the chart of accounts so I can understand our GL structure | P0 |
| LED-2 | As an accountant, I want to filter accounts by type so I can focus on specific areas | P1 |
| LED-3 | As an accountant, I want to see account balances so I can verify accuracy | P0 |

---

## Ledger Groups

| Group | Code | Description | Normal Balance |
|-------|------|-------------|----------------|
| ASSET | A | Cash, receivables, inventory, fixed assets | Debit |
| LIABILITY | L | Payables, loans, accrued expenses | Credit |
| EQUITY | E | Owner's equity, retained earnings | Credit |
| INCOME | I | Sales revenue, service income | Credit |
| EXPENSE | X | Operating expenses, COGS | Debit |

---

## Functional Requirements

### Chart of Accounts

- Hierarchical account structure (parent/child)
- Filter by ledger group
- View account code, name, description
- View current balance
- Active/inactive status

### Account Properties

| Field | Required | Description |
|-------|----------|-------------|
| Code | Yes | Unique account code |
| Name | Yes | Account name |
| Ledger Group | Yes | ASSET, LIABILITY, EQUITY, INCOME, EXPENSE |
| Description | No | Account description |
| Parent Account | No | For hierarchical structure |
| Is Active | Yes | Whether account can be used |

### Transaction History

- Filter by date range
- Filter by account
- View debit/credit amounts
- View running balance
- Transaction reference and description

---

## Pages

| Page | Route | Description |
|------|-------|-------------|
| ChartOfAccountsPage | `/ledger/accounts` | View/manage all accounts |
| LedgerTransactionsPage | `/ledger/transactions` | View transaction history |
| AccountDetailPage | `/ledger/accounts/:id` | Account detail with transactions |

---

## API Endpoints

```
GET  /rest/ledgerAccount/index.json         - List accounts
GET  /rest/ledgerAccount/show/:id.json      - Get account details
POST /rest/ledgerAccount/save.json          - Create account
PUT  /rest/ledgerAccount/update/:id.json    - Update account
GET  /rest/ledgerAccount/balance/:id.json   - Get balance as of date
GET  /rest/ledgerAccount/trialBalance.json  - Get trial balance

GET  /rest/ledgerTransaction/index.json     - List transactions
GET  /rest/ledgerTransaction/show/:id.json  - Get transaction details
```

---

## Default Chart of Accounts

Created automatically based on business type:

### TRADING Business
- 1000 Cash and Bank
- 1100 Accounts Receivable
- 1200 Inventory
- 2000 Accounts Payable
- 2100 Accrued Expenses
- 3000 Owner's Equity
- 4000 Sales Revenue
- 5000 Cost of Goods Sold
- 6000 Operating Expenses

### SERVICES Business
- 1000 Cash and Bank
- 1100 Accounts Receivable
- 2000 Accounts Payable
- 2100 Accrued Expenses
- 3000 Owner's Equity
- 4000 Service Revenue
- 5000 Direct Labor
- 6000 Operating Expenses

---

## Wireframe References

- `soupfinance-designs/screenshots/chart-of-accounts.png`
- `soupfinance-designs/screenshots/ledger-transactions.png`
