# Payments

[← Back to PRD Index](../../PRD.md)

---

## Purpose

Track all invoice and bill payments.

---

## User Stories

| ID | Story | Priority |
|----|-------|----------|
| PAY-1 | As a user, I want to view all payments so I can see cash flow | P1 |
| PAY-2 | As a user, I want to filter payments by type so I can analyze AR vs AP | P2 |

---

## Payment Methods

| Method | Code | Description |
|--------|------|-------------|
| Cash | CASH | Cash payment |
| Bank Transfer | BANK_TRANSFER | Wire/ACH transfer |
| Cheque | CHEQUE | Check payment |
| Card | CARD | Credit/debit card |
| Other | OTHER | Other methods |

---

## Functional Requirements

### Payment List

- View all payments (invoice and bill)
- Filter by date range
- Filter by payment method
- Filter by type (received/made)
- See associated invoice/bill
- Track reference numbers

### Payment Recording

Payments are recorded from:
1. Invoice detail page (for received payments)
2. Bill detail page (for made payments)

---

## Pages

| Page | Route | Description |
|------|-------|-------------|
| PaymentListPage | `/payments` | All payments combined |

---

## API Endpoints

```
GET  /rest/invoicePayment/index.json   - List invoice payments
POST /rest/invoicePayment/save.json    - Record invoice payment
DELETE /rest/invoicePayment/delete/:id.json - Delete payment

GET  /rest/billPayment/index.json      - List bill payments
POST /rest/billPayment/save.json       - Record bill payment
DELETE /rest/billPayment/delete/:id.json - Delete payment
```

---

## Payment Fields

| Field | Required | Description |
|-------|----------|-------------|
| Amount | Yes | Payment amount |
| Date | Yes | Payment date |
| Method | Yes | Payment method |
| Reference | No | Check #, transaction ID |
| Notes | No | Additional notes |

---

## List View Columns

| Column | Description |
|--------|-------------|
| Date | Payment date |
| Type | Received / Made |
| Reference | Invoice/Bill number |
| Client/Vendor | Payer/Payee name |
| Amount | Payment amount |
| Method | Payment method |
