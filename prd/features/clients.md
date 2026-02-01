# Client Management

[← Back to PRD Index](../../PRD.md)

---

## Purpose

Manage invoice recipients (customers).

**Important:** Use `/rest/invoiceClient/*` endpoints, NOT `/rest/client/*` (which is for investment trading clients in the parent soupmarkets system).

---

## User Stories

| ID | Story | Priority |
|----|-------|----------|
| CLT-1 | As a user, I want to add individual clients so I can invoice them | P0 |
| CLT-2 | As a user, I want to add corporate clients with company details | P0 |
| CLT-3 | As a user, I want to see client invoice summary so I know AR status | P1 |

---

## Client Types

### Individual

| Field | Required | Description |
|-------|----------|-------------|
| First Name | Yes | Client first name |
| Last Name | Yes | Client last name |
| Email | Yes | Contact email |
| Phone | No | Contact phone |
| Address | No | Mailing address |

### Corporate

| Field | Required | Description |
|-------|----------|-------------|
| Company Name | Yes | Business name |
| Contact Person | No | Primary contact |
| Registration # | No | Business registration |
| Tax Number | No | Tax ID / VAT number |
| Email | Yes | Business email |
| Phone | No | Business phone |
| Address | No | Business address |

---

## Functional Requirements

### Client Information

- Client type selection (Individual/Corporate)
- Type-specific form fields
- Contact information
- Optional tax details for invoicing

### Client Summary

| Metric | Description |
|--------|-------------|
| Total Invoiced | Sum of all invoices |
| Total Paid | Sum of all payments |
| Outstanding | Total invoiced - total paid |

---

## Pages

| Page | Route | Description |
|------|-------|-------------|
| ClientListPage | `/clients` | Paginated list with search |
| ClientFormPage | `/clients/new`, `/clients/:id/edit` | Create/edit client |
| ClientDetailPage | `/clients/:id` | View client with invoice history |

---

## API Endpoints

```
GET    /rest/invoiceClient/index.json              - List clients (paginated)
POST   /rest/invoiceClient/save.json               - Create client
GET    /rest/invoiceClient/show/:id.json           - Get client details
PUT    /rest/invoiceClient/update/:id.json         - Update client
DELETE /rest/invoiceClient/delete/:id.json         - Delete client (soft)
GET    /rest/invoiceClient/invoiceSummary/:id.json - Get AR summary
```

---

## List View Features

- Search by name/company name
- Filter by client type (Individual/Corporate)
- Sort by name, outstanding amount
- Pagination (default 20 per page)

---

## Wireframe References

- `soupfinance-designs/screenshots/clients-list.png`
- `soupfinance-designs/screenshots/client-create.png`
- `soupfinance-designs/screenshots/client-detail.png`
