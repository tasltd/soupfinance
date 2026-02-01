# Vendor Management

[← Back to PRD Index](../../PRD.md)

---

## Purpose

Manage vendor contacts and track payables.

---

## User Stories

| ID | Story | Priority |
|----|-------|----------|
| VND-1 | As a user, I want to add vendors so I can track who I owe | P0 |
| VND-2 | As a user, I want to see vendor payment summary so I know my AP status | P1 |

---

## Functional Requirements

### Vendor Information

| Field | Required | Description |
|-------|----------|-------------|
| Name | Yes | Company/vendor name |
| Email | No | Contact email |
| Phone | No | Contact phone |
| Address | No | Business address |
| Tax ID | No | Tax identification number |
| Payment Terms | No | Default payment terms (days) |
| Notes | No | Additional notes |

### Vendor Summary

| Metric | Description |
|--------|-------------|
| Total Billed | Sum of all bills |
| Total Paid | Sum of all payments |
| Outstanding | Total billed - total paid |

---

## Pages

| Page | Route | Description |
|------|-------|-------------|
| VendorListPage | `/vendors` | Paginated list with search |
| VendorFormPage | `/vendors/new`, `/vendors/:id/edit` | Create/edit vendor |
| VendorDetailPage | `/vendors/:id` | View vendor with bill history |

---

## API Endpoints

```
GET    /rest/vendor/index.json              - List vendors (paginated)
POST   /rest/vendor/save.json               - Create vendor
GET    /rest/vendor/show/:id.json           - Get vendor details
PUT    /rest/vendor/update/:id.json         - Update vendor
DELETE /rest/vendor/delete/:id.json         - Delete vendor (soft)
GET    /rest/vendor/paymentSummary/:id.json - Get AP summary
```

---

## List View Features

- Search by name
- Sort by name, outstanding amount, last activity
- Filter by status (active/archived)
- Pagination (default 20 per page)

---

## Wireframe References

- `soupfinance-designs/screenshots/vendors-list.png`
- `soupfinance-designs/screenshots/vendor-create.png`
- `soupfinance-designs/screenshots/vendor-detail.png`
