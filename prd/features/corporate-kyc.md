# Corporate KYC

[← Back to PRD Index](../../PRD.md)

---

## Purpose

Corporate registration and KYC document collection for compliance.

---

## User Stories

| ID | Story | Priority |
|----|-------|----------|
| KYC-1 | As a corporate user, I want to submit company information for verification | P1 |
| KYC-2 | As a corporate user, I want to add company directors and officers | P1 |
| KYC-3 | As a corporate user, I want to upload required documents | P1 |
| KYC-4 | As a corporate user, I want to track my KYC approval status | P1 |

---

## Business Categories

| Category | Code | Description |
|----------|------|-------------|
| Limited Liability | LIMITED_LIABILITY | LLC, Ltd companies |
| Partnership | PARTNERSHIP | General/limited partnerships |
| Sole Proprietorship | SOLE_PROPRIETORSHIP | Individual business owner |
| Public Limited | PUBLIC_LIMITED | Publicly traded companies |
| Non-Profit | NON_PROFIT | Charitable organizations |

---

## Required Documents

| Document | Code | Description |
|----------|------|-------------|
| Certificate of Incorporation | CERTIFICATE_OF_INCORPORATION | Company registration certificate |
| Board Resolution | BOARD_RESOLUTION | Resolution authorizing account |
| Memorandum | MEMORANDUM | Memorandum of Association |
| Proof of Address | PROOF_OF_ADDRESS | Utility bill, bank statement |

---

## KYC Workflow

```
Company Info → Directors → Documents → Submit → PENDING → APPROVED/REJECTED
```

| Step | Description |
|------|-------------|
| 1. Company Info | Enter incorporation details, tax ID |
| 2. Directors | Add directors, signatories, beneficial owners |
| 3. Documents | Upload required documents |
| 4. Submit | Submit for review |
| 5. Review | Admin reviews and approves/rejects |

---

## Functional Requirements

### Company Information

| Field | Required | Description |
|-------|----------|-------------|
| Name | Yes | Legal company name |
| Incorporation # | Yes | Certificate number |
| Registration Date | Yes | Date of incorporation |
| Business Category | Yes | Type of business entity |
| Tax ID | No | Tax identification number |
| Email | Yes | Business email |
| Phone | Yes | Business phone |
| Address | No | Registered address |

### Directors/Officers

| Field | Required | Description |
|-------|----------|-------------|
| First Name | Yes | Person's first name |
| Last Name | Yes | Person's last name |
| Email | Yes | Contact email |
| Phone | Yes | Contact phone |
| Role | Yes | DIRECTOR, SIGNATORY, BENEFICIAL_OWNER |

### Document Upload

- Multiple documents per type allowed
- Supported formats: PDF, JPG, PNG
- Max file size: 10MB per file
- Required documents vary by business category

---

## Pages

| Page | Route | Description |
|------|-------|-------------|
| CompanyInfoPage | `/onboarding/company` | Company details form |
| DirectorsPage | `/onboarding/directors` | Manage directors/officers |
| DocumentsPage | `/onboarding/documents` | Upload KYC documents |
| KycStatusPage | `/onboarding/status` | View approval status |

---

## API Endpoints

```
POST /rest/corporate/save.json              - Create corporate
GET  /rest/corporate/show/:id.json          - Get corporate details
PUT  /rest/corporate/update/:id.json        - Update corporate
GET  /rest/corporate/current.json           - Get current user's corporate

GET  /rest/corporateAccountPerson/index.json    - List directors
POST /rest/corporateAccountPerson/save.json     - Add director
GET  /rest/corporateAccountPerson/show/:id.json - Get person details
PUT  /rest/corporateAccountPerson/update/:id.json - Update person
DELETE /rest/corporateAccountPerson/delete/:id.json - Delete person

GET  /rest/corporateDocuments/index.json    - List documents
POST /rest/corporateDocuments/save.json     - Upload document (multipart)
DELETE /rest/corporateDocuments/delete/:id.json - Delete document

POST /rest/corporate/submitKyc/:id.json     - Submit for KYC review
```

---

## KYC Status

| Status | Description | Next Action |
|--------|-------------|-------------|
| NOT_STARTED | KYC not initiated | Complete company info |
| IN_PROGRESS | Partially completed | Continue with remaining steps |
| PENDING | Submitted for review | Wait for admin review |
| APPROVED | KYC approved | Full access granted |
| REJECTED | KYC rejected | Review rejection reason, resubmit |

---

## Wireframe References

- `soupfinance-designs/screenshots/onboarding-company.png`
- `soupfinance-designs/screenshots/onboarding-directors.png`
- `soupfinance-designs/screenshots/onboarding-documents.png`
- `soupfinance-designs/screenshots/onboarding-status.png`
