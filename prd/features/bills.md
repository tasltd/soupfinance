# Bill Management

[← Back to PRD Index](../../PRD.md)

---

## Purpose

Track vendor bills and manage expense payments.

---

## User Stories

| ID | Story | Priority |
|----|-------|----------|
| BILL-1 | As a user, I want to record vendor bills so I can track expenses | P0 |
| BILL-2 | As a user, I want to track bill payments so I know what's been paid | P0 |
| BILL-3 | As a user, I want to see overdue bills so I can prioritize payments | P1 |

---

## Bill Statuses

```
DRAFT → PENDING → PARTIAL/PAID → OVERDUE (if past due date)
                              ↓
                          CANCELLED
```

| Status | Description | Color |
|--------|-------------|-------|
| DRAFT | Created but not finalized | Gray |
| PENDING | Awaiting payment | Blue |
| PARTIAL | Partially paid | Yellow |
| PAID | Fully paid | Green |
| OVERDUE | Past due date, unpaid | Red |
| CANCELLED | Voided | Gray |

---

## Functional Requirements

### Bill Creation

- Select vendor from list
- Set issue date, due date
- Add line items: description, quantity, price, tax
- Auto-calculate totals
- Save as draft or mark as pending

### Bill Line Items

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| Description | Yes | - | Item/service description |
| Quantity | Yes | 1 | Number of units |
| Unit Price | Yes | - | Price per unit |
| Tax Rate | No | 0% | Tax percentage |

### Payment Tracking

- Record partial/full payments
- Track payment method and reference
- Auto-update status based on payment

---

## Pages

| Page | Route | Description |
|------|-------|-------------|
| BillListPage | `/bills` | Paginated list with filtering |
| BillFormPage | `/bills/new`, `/bills/:id/edit` | Create/edit bill |
| BillDetailPage | `/bills/:id` | View bill with payment history |

---

## API Endpoints

```
GET    /rest/bill/index.json           - List bills (paginated)
POST   /rest/bill/save.json            - Create bill
GET    /rest/bill/show/:id.json        - Get bill details
PUT    /rest/bill/update/:id.json      - Update bill
DELETE /rest/bill/delete/:id.json      - Delete bill (soft)

POST   /rest/billItem/save.json        - Add line item
PUT    /rest/billItem/update/:id.json  - Update line item
DELETE /rest/billItem/delete/:id.json  - Delete line item

GET    /rest/billPayment/index.json    - List payments
POST   /rest/billPayment/save.json     - Record payment
DELETE /rest/billPayment/delete/:id.json - Delete payment
```

---

## Calculations

```typescript
// Line item amount
lineAmount = quantity * unitPrice

// Tax amount per line
lineTax = lineAmount * (taxRate/100)

// Bill totals
subtotal = sum(lineAmounts)
taxAmount = sum(lineTaxes)
totalAmount = subtotal + taxAmount
amountDue = totalAmount - amountPaid
```

---

## Frontend PDF Generation

The frontend generates PDF documents using `html2pdf.js` library. This provides:

- Beautiful HTML-to-PDF rendering with consistent branding
- No backend dependency for PDF creation
- Instant preview and download capability

### PDF Components

| Component | Description |
|-----------|-------------|
| `generateBillPdf()` | Generate and download bill PDF |
| `generateBillPdfBlob()` | Generate PDF as Blob for email attachment |
| `generateBillHtml()` | HTML template for bill rendering |

### PDF Template Content

- Company header with logo/name
- Bill number, dates, status
- Vendor information
- Line items table with descriptions, quantities, prices
- Tax breakdown
- Payment summary and total due
- Generated timestamp footer

---

## Frontend Email Sending

Bills can be sent via email with frontend-generated PDF attachments (for internal sharing or vendor communication):

### Email Dialog

When user clicks "Send", a dialog appears to:
1. Enter recipient name (pre-filled with vendor name)
2. Enter recipient email address (required)
3. Preview and confirm sending

### Email Service

| Endpoint | Description |
|----------|-------------|
| `POST /rest/email/send.json` | Send email with PDF attachment |

### Email Payload

```typescript
{
  to: [{ email: string, name?: string }],
  cc?: [{ email: string, name?: string }],
  subject: string,
  body: string,
  bodyHtml: string,
  attachments: [{
    filename: string,    // e.g., "Bill-BILL-2024-001.pdf"
    content: string,     // Base64 encoded PDF
    contentType: "application/pdf"
  }],
  billId: string         // For tracking
}
```

### Hooks

| Hook | Description |
|------|-------------|
| `usePdf()` | PDF generation for download |
| `useEmailSend()` | PDF generation + email sending |

---

## Wireframe References

- `soupfinance-designs/screenshots/bills-list.png`
- `soupfinance-designs/screenshots/bill-create.png`
- `soupfinance-designs/screenshots/bill-detail.png`
