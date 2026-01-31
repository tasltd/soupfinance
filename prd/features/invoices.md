# Invoice Management

[← Back to PRD Index](../../PRD.md)

---

## Purpose

Create, manage, send, and track customer invoices.

---

## User Stories

| ID | Story | Priority |
|----|-------|----------|
| INV-1 | As a user, I want to create invoices with line items so I can bill customers | P0 |
| INV-2 | As a user, I want to send invoices via email so customers receive them | P0 |
| INV-3 | As a user, I want to record payments so I can track what's been paid | P0 |
| INV-4 | As a user, I want to see invoice status so I know which need attention | P0 |
| INV-5 | As a user, I want to apply discounts and taxes so invoices are accurate | P1 |

---

## Invoice Statuses

```
DRAFT → SENT → VIEWED → PARTIAL/PAID
                    ↓
                OVERDUE (if past due date)
                    ↓
                CANCELLED (any time)
```

| Status | Description | Color |
|--------|-------------|-------|
| DRAFT | Created but not sent | Gray |
| SENT | Sent to customer | Blue |
| VIEWED | Customer viewed invoice | Purple |
| PARTIAL | Partially paid | Yellow |
| PAID | Fully paid | Green |
| OVERDUE | Past due date, unpaid | Red |
| CANCELLED | Voided | Gray |

---

## Functional Requirements

### Invoice Creation

- Select client from InvoiceClient list
- Set issue date, due date, payment terms
- Add line items: description, quantity, unit price, tax %, discount %
- Auto-calculate: subtotal, discounts, taxes, total
- Save as draft or send immediately

### Invoice Line Items

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| Description | Yes | - | Item description |
| Quantity | Yes | 1 | Number of units |
| Unit Price | Yes | - | Price per unit |
| Tax Rate | No | 0% | Tax percentage |
| Discount | No | 0% | Discount percentage |

### Payment Recording

- Amount (partial or full)
- Payment date
- Payment method: CASH, BANK_TRANSFER, CHEQUE, CARD, OTHER
- Reference number
- Auto-update invoice status based on payment

---

## Pages

| Page | Route | Description |
|------|-------|-------------|
| InvoiceListPage | `/invoices` | Paginated list with filtering |
| InvoiceFormPage | `/invoices/new`, `/invoices/:id/edit` | Create/edit invoice |
| InvoiceDetailPage | `/invoices/:id` | View invoice with payment history |

---

## API Endpoints

```
GET    /rest/invoice/index.json          - List invoices (paginated)
POST   /rest/invoice/save.json           - Create invoice
GET    /rest/invoice/show/:id.json       - Get invoice details
PUT    /rest/invoice/update/:id.json     - Update invoice
DELETE /rest/invoice/delete/:id.json     - Delete invoice (soft)
POST   /rest/invoice/send/:id.json       - Send to client via email
POST   /rest/invoice/cancel/:id.json     - Cancel invoice

POST   /rest/invoiceItem/save.json       - Add line item
PUT    /rest/invoiceItem/update/:id.json - Update line item
DELETE /rest/invoiceItem/delete/:id.json - Delete line item

GET    /rest/invoicePayment/index.json   - List payments
POST   /rest/invoicePayment/save.json    - Record payment
DELETE /rest/invoicePayment/delete/:id.json - Delete payment
```

---

## Calculations

```typescript
// Line item amount
lineAmount = quantity * unitPrice * (1 - discountPercent/100)

// Tax amount per line
lineTax = lineAmount * (taxRate/100)

// Invoice totals
subtotal = sum(lineAmounts)
discountAmount = sum(lineDiscounts)
taxAmount = sum(lineTaxes)
totalAmount = subtotal + taxAmount
amountDue = totalAmount - amountPaid
```

---

## Status Update Logic

```typescript
function updateInvoiceStatus(invoice: Invoice): InvoiceStatus {
  if (invoice.cancelled) return 'CANCELLED';
  if (invoice.amountPaid >= invoice.totalAmount) return 'PAID';
  if (invoice.amountPaid > 0) return 'PARTIAL';
  if (new Date() > invoice.dueDate) return 'OVERDUE';
  if (invoice.viewed) return 'VIEWED';
  if (invoice.sent) return 'SENT';
  return 'DRAFT';
}
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
| `generateInvoicePdf()` | Generate and download invoice PDF |
| `generateInvoicePdfBlob()` | Generate PDF as Blob for email attachment |
| `generateInvoiceHtml()` | HTML template for invoice rendering |

### PDF Template Content

- Company header with logo/name
- Invoice number, dates, status
- Client information
- Line items table with descriptions, quantities, prices
- Tax and discount breakdown
- Payment summary and total due
- Generated timestamp footer

---

## Frontend Email Sending

Invoices can be sent via email with frontend-generated PDF attachments:

### Email Dialog

When user clicks "Send", a dialog appears to:
1. Enter recipient name (pre-filled with client name)
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
    filename: string,    // e.g., "Invoice-INV-2024-001.pdf"
    content: string,     // Base64 encoded PDF
    contentType: "application/pdf"
  }],
  invoiceId: string      // For tracking
}
```

### Hooks

| Hook | Description |
|------|-------------|
| `usePdf()` | PDF generation for download |
| `useEmailSend()` | PDF generation + email sending |

---

## Wireframe References

- `soupfinance-designs/screenshots/invoices-list.png`
- `soupfinance-designs/screenshots/invoice-create.png`
- `soupfinance-designs/screenshots/invoice-detail.png`
