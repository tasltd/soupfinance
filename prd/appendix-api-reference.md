# API Reference

[← Back to PRD Index](../PRD.md)

---

## Authentication

All authenticated endpoints require the `X-Auth-Token` header.

```
X-Auth-Token: {token}
```

**Note:** NOT a Bearer token.

---

## Content Types

| Method | Content-Type |
|--------|-------------|
| GET | N/A |
| POST | `application/x-www-form-urlencoded` |
| PUT | `application/x-www-form-urlencoded` |
| DELETE | N/A |

---

## Public Endpoints (No Auth)

```
POST /account/register.json            - Register new tenant
POST /account/confirmEmail.json        - Verify email & set password
POST /account/resendConfirmation.json  - Resend confirmation email
POST /login.json                       - User login
POST /logout.json                      - User logout
```

---

## Core CRUD Pattern

Most entities follow this pattern:

```
GET    /rest/{entity}/index.json       - List (paginated)
POST   /rest/{entity}/save.json        - Create
GET    /rest/{entity}/show/:id.json    - Read
PUT    /rest/{entity}/update/:id.json  - Update
DELETE /rest/{entity}/delete/:id.json  - Delete (soft)
```

---

## Invoice Endpoints

```
GET    /rest/invoice/index.json          - List invoices
POST   /rest/invoice/save.json           - Create invoice
GET    /rest/invoice/show/:id.json       - Get invoice
PUT    /rest/invoice/update/:id.json     - Update invoice
DELETE /rest/invoice/delete/:id.json     - Delete invoice
POST   /rest/invoice/send/:id.json       - Send to client
POST   /rest/invoice/cancel/:id.json     - Cancel invoice

POST   /rest/invoiceItem/save.json       - Add line item
PUT    /rest/invoiceItem/update/:id.json - Update line item
DELETE /rest/invoiceItem/delete/:id.json - Delete line item

GET    /rest/invoicePayment/index.json   - List payments
POST   /rest/invoicePayment/save.json    - Record payment
DELETE /rest/invoicePayment/delete/:id.json - Delete payment
```

---

## Invoice Client Endpoints

**Important:** Use `/rest/invoiceClient/*` NOT `/rest/client/*`

```
GET    /rest/invoiceClient/index.json              - List clients
POST   /rest/invoiceClient/save.json               - Create client
GET    /rest/invoiceClient/show/:id.json           - Get client
PUT    /rest/invoiceClient/update/:id.json         - Update client
DELETE /rest/invoiceClient/delete/:id.json         - Delete client
GET    /rest/invoiceClient/invoiceSummary/:id.json - AR summary
```

---

## Bill Endpoints

```
GET    /rest/bill/index.json           - List bills
POST   /rest/bill/save.json            - Create bill
GET    /rest/bill/show/:id.json        - Get bill
PUT    /rest/bill/update/:id.json      - Update bill
DELETE /rest/bill/delete/:id.json      - Delete bill

POST   /rest/billItem/save.json        - Add line item
PUT    /rest/billItem/update/:id.json  - Update line item
DELETE /rest/billItem/delete/:id.json  - Delete line item

GET    /rest/billPayment/index.json    - List payments
POST   /rest/billPayment/save.json     - Record payment
DELETE /rest/billPayment/delete/:id.json - Delete payment
```

---

## Vendor Endpoints

```
GET    /rest/vendor/index.json              - List vendors
POST   /rest/vendor/save.json               - Create vendor
GET    /rest/vendor/show/:id.json           - Get vendor
PUT    /rest/vendor/update/:id.json         - Update vendor
DELETE /rest/vendor/delete/:id.json         - Delete vendor
GET    /rest/vendor/paymentSummary/:id.json - AP summary
```

---

## Ledger Account Endpoints

```
GET  /rest/ledgerAccount/index.json         - List accounts
GET  /rest/ledgerAccount/show/:id.json      - Get account
POST /rest/ledgerAccount/save.json          - Create account
PUT  /rest/ledgerAccount/update/:id.json    - Update account
DELETE /rest/ledgerAccount/delete/:id.json  - Delete account
GET  /rest/ledgerAccount/balance/:id.json   - Balance as of date
GET  /rest/ledgerAccount/trialBalance.json  - Trial balance
```

---

## Ledger Transaction Endpoints

```
GET  /rest/ledgerTransaction/index.json         - List transactions
POST /rest/ledgerTransaction/save.json          - Create single
POST /rest/ledgerTransaction/saveMultiple.json  - Create multi-line
GET  /rest/ledgerTransaction/show/:id.json      - Get transaction
POST /rest/ledgerTransaction/post/:id.json      - Post to ledger
POST /rest/ledgerTransaction/reverse/:id.json   - Reverse entry
DELETE /rest/ledgerTransaction/delete/:id.json  - Delete pending
```

---

## Transaction Group Endpoints

```
GET  /rest/ledgerTransactionGroup/index.json    - List groups
GET  /rest/ledgerTransactionGroup/show/:id.json - Get group
POST /rest/ledgerTransactionGroup/post/:id.json - Post group
POST /rest/ledgerTransactionGroup/reverse/:id.json - Reverse group
DELETE /rest/ledgerTransactionGroup/delete/:id.json - Delete group
```

---

## Voucher Endpoints

```
GET  /rest/voucher/index.json          - List vouchers
POST /rest/voucher/save.json           - Create voucher
GET  /rest/voucher/show/:id.json       - Get voucher
PUT  /rest/voucher/update/:id.json     - Update voucher
POST /rest/voucher/approve/:id.json    - Approve
POST /rest/voucher/post/:id.json       - Post to ledger
POST /rest/voucher/cancel/:id.json     - Cancel
DELETE /rest/voucher/delete/:id.json   - Delete pending
```

---

## Finance Reports Endpoints

```
GET /rest/financeReports/trialBalance.json      - Trial balance
GET /rest/financeReports/incomeStatement.json   - P&L
GET /rest/financeReports/balanceSheet.json      - Balance sheet
GET /rest/financeReports/agedReceivables.json   - AR aging
GET /rest/financeReports/agedPayables.json      - AP aging
GET /rest/financeReports/accountBalances.json   - Account balances
GET /rest/financeReports/accountTransactions.json - Transactions

# Export (add format parameter)
GET /rest/financeReports/{type}.json?f=pdf      - PDF export
GET /rest/financeReports/{type}.json?f=xlsx     - Excel export
GET /rest/financeReports/{type}.json?f=csv      - CSV export
```

---

## Corporate KYC Endpoints

```
POST /rest/corporate/save.json              - Create corporate
GET  /rest/corporate/show/:id.json          - Get corporate
PUT  /rest/corporate/update/:id.json        - Update corporate
GET  /rest/corporate/current.json           - Current user's corporate
POST /rest/corporate/submitKyc/:id.json     - Submit for review

GET  /rest/corporateAccountPerson/index.json    - List directors
POST /rest/corporateAccountPerson/save.json     - Add director
PUT  /rest/corporateAccountPerson/update/:id.json - Update
DELETE /rest/corporateAccountPerson/delete/:id.json - Delete

GET  /rest/corporateDocuments/index.json    - List documents
POST /rest/corporateDocuments/save.json     - Upload (multipart)
DELETE /rest/corporateDocuments/delete/:id.json - Delete
```

---

## Email Service Endpoint

```
POST /rest/email/send.json              - Send email with attachments
```

### Request Body (JSON)

```json
{
  "to": ["recipient@example.com"],
  "cc": ["copy@example.com"],
  "bcc": ["blind@example.com"],
  "subject": "Invoice INV-2024-001",
  "body": "Plain text body",
  "bodyHtml": "<p>HTML body</p>",
  "attachments": [{
    "filename": "Invoice-INV-2024-001.pdf",
    "content": "base64-encoded-content",
    "contentType": "application/pdf"
  }],
  "replyTo": "finance@company.com",
  "invoiceId": "uuid",
  "billId": "uuid",
  "reportType": "trial-balance"
}
```

### Response

```json
{
  "success": true,
  "messageId": "email-tracking-id",
  "error": null
}
```

---

## Settings Endpoints

```
# Account
GET  /rest/account/current.json         - Get settings
PUT  /rest/account/update.json          - Update settings

# Staff (Agents)
GET  /rest/agent/index.json             - List active
GET  /rest/agent/archived.json          - List archived
POST /rest/agent/save.json              - Create
GET  /rest/agent/show/:id.json          - Get details
PUT  /rest/agent/update.json            - Update
DELETE /rest/agent/delete/:id.json      - Archive
PUT  /rest/agent/updateAccess/:id.json  - Update credentials

# Bank Accounts
GET  /rest/accountBankDetails/index.json   - List accounts
POST /rest/accountBankDetails/save.json    - Create
GET  /rest/accountBankDetails/show/:id.json - Get details
PUT  /rest/accountBankDetails/update.json  - Update
DELETE /rest/accountBankDetails/delete/:id.json - Delete

# Reference Data
GET  /rest/sbRole/index.json            - List roles
GET  /rest/bank/index.json              - List banks
```

---

## Common Query Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| max | Page size | 20 |
| offset | Skip records | 0 |
| sort | Sort field | dateCreated |
| order | Sort direction | desc |
| from | Start date | 2026-01-01 |
| to | End date | 2026-12-31 |

---

## API Quirks

| Endpoint | Quirk |
|----------|-------|
| `/rest/sbUser/index.json` | Requires `?sort=id` (dateCreated not available) |
| `/rest/invoiceClient/*` | Use this, NOT `/rest/client/*` |
| POST/PUT | Must use `application/x-www-form-urlencoded` |
| Arrays | Use indexed notation: `items[0].description` |
