# SoupFinance User Journeys

**Version**: 3.0
**Created**: 2026-01-20
**Updated**: 2026-01-30
**Status**: ARCHITECTURE REFACTOR COMPLETE

This document describes all user journeys in the SoupFinance corporate accounting platform, mapping UI flows to API endpoints and backend services.

---

## Architecture Context (CRITICAL)

**SoupFinance follows a Tenant-per-Account architecture:**

Each SoupFinance customer gets their own `Account` (the multi-tenant discriminator domain in soupmarkets-web).

1. **SoupFinance registration creates a NEW Account (tenant)**, not Corporate entities in a shared tenant
2. **Invoice clients are managed via `/rest/invoiceClient/*` endpoints** (NOT `/rest/client/*` which is for investment clients)
3. **Business types**: TRADING (inventory-based, has COGS) and SERVICES (no inventory, labor expenses)
4. **Password is NOT required during registration** - set during email confirmation
5. **Email verification required before login**

---

## Architecture Summary

**See [../plans/soupfinance-tenant-architecture-refactor.md](../plans/soupfinance-tenant-architecture-refactor.md) for full details.**

### Architecture Comparison

| OLD Architecture (Deprecated) | NEW Architecture (Implemented) |
|-------------------------------|--------------------------------|
| Registration creates **Corporate** in shared TAS tenant | Registration creates **new Tenant/Account** (isolated) |
| Invoice recipients are global Corporates | Invoice recipients are tenant's own **Clients** via `/rest/invoiceClient/*` |
| Full corporate KYC required (4-step onboarding) | No KYC required (direct to dashboard) |
| `/client/register.json` endpoint | `/account/register.json` endpoint |
| Password required at registration | Password set via email confirmation |

### Deprecated Journeys

The following sections are **DEPRECATED** and have been replaced:
- Section 2: Corporate Registration & KYC Onboarding (replaced by Tenant Registration)
- All `/onboarding/*` routes (removed)

### New Journeys

- **Tenant Registration**: Simple signup (no password) → email confirmation → set password → login
- **Client Management**: Add Individual/Corporate clients for invoicing via `/rest/invoiceClient/*`

---

---

## Table of Contents

1. [Authentication Flow](#1-authentication-flow)
2. [Corporate Registration & KYC Onboarding](#2-corporate-registration--kyc-onboarding)
3. [Dashboard](#3-dashboard)
4. [Invoice Management](#4-invoice-management)
5. [Bill Management](#5-bill-management)
6. [Vendor Management](#6-vendor-management)
7. [Payment Processing](#7-payment-processing)
8. [Chart of Accounts & Ledger](#8-chart-of-accounts--ledger)
9. [Accounting Transactions](#9-accounting-transactions)
10. [Financial Reports](#10-financial-reports)

---

## 1. Authentication Flow

### 1.1 Login Journey (2FA with OTP)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           LOGIN FLOW (2FA)                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │  Login   │───▶│ Enter Phone/ │───▶│  Enter OTP   │───▶│  Dashboard   │  │
│  │   Page   │    │    Email     │    │    Code      │    │    Page      │  │
│  └──────────┘    └──────────────┘    └──────────────┘    └──────────────┘  │
│       │                 │                   │                   │          │
│       ▼                 ▼                   ▼                   ▼          │
│  /login          POST /rest/          POST /rest/         GET /rest/      │
│                  otp/request.json     otp/verify.json     dashboard.json   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Route**: `/login`
**Component**: `LoginPage.tsx`

| Step | User Action | API Endpoint | Description |
|------|-------------|--------------|-------------|
| 1 | Enter phone/email | - | User enters contact information |
| 2 | Click "Send OTP" | `POST /rest/otp/request.json` | System sends OTP to phone/email |
| 3 | Enter OTP code | - | User enters received 6-digit code |
| 4 | Click "Verify" | `POST /rest/otp/verify.json` | Validates OTP, returns auth token |
| 5 | Redirect | - | Navigate to `/dashboard` |

**API Functions**:
- `requestOTP(contact: string)` → Sends OTP to user
- `verifyOTP(code: string)` → Validates OTP, returns `AuthUser` with `access_token`

**Auth Storage**:
- Token stored in `localStorage` as `auth_token`
- User data stored via Zustand `authStore`

---

### 1.2 Logout Journey

| Step | User Action | API Endpoint | Description |
|------|-------------|--------------|-------------|
| 1 | Click user menu | - | Opens profile dropdown |
| 2 | Click "Logout" | - | Clears local auth state |
| 3 | Redirect | - | Navigate to `/login` |

**API Function**: `logout()` → Clears `localStorage` and Zustand store

---

## 2. Corporate Registration & KYC Onboarding [DEPRECATED]

> ⚠️ **DEPRECATED**: This entire section is being replaced by the Tenant Registration flow.
> See [../plans/soupfinance-tenant-architecture-refactor.md](../plans/soupfinance-tenant-architecture-refactor.md) for the new approach.

### 2.1 Registration Flow [DEPRECATED]

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        REGISTRATION FLOW                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │ Register │───▶│ Company Info │───▶│   Verify     │───▶│   Login      │  │
│  │   Page   │    │    Form      │    │   Phone      │    │    Page      │  │
│  └──────────┘    └──────────────┘    └──────────────┘    └──────────────┘  │
│       │                 │                   │                              │
│       ▼                 ▼                   ▼                              │
│  /register       POST /rest/         POST /rest/                          │
│                  corporate/save.json otp/verify.json                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Route**: `/register`
**Component**: `RegistrationPage.tsx`

| Step | User Action | API Endpoint | Description |
|------|-------------|--------------|-------------|
| 1 | Enter company name | - | Basic company information |
| 2 | Enter admin email | `GET /rest/user/checkEmail.json` | Check if email exists |
| 3 | Enter admin phone | `GET /rest/user/checkPhone.json` | Check if phone exists |
| 4 | Select business category | - | LLC, Partnership, Sole Proprietorship, etc. |
| 5 | Enter registration number | - | Certificate of Incorporation number |
| 6 | Enter TIN (optional) | - | Tax Identification Number |
| 7 | Click "Register" | `POST /rest/corporate/save.json` | Creates corporate account |
| 8 | Verify phone via OTP | `POST /rest/otp/verify.json` | Confirms phone ownership |

**API Functions**:
- `checkEmailExists(email)` → Returns `boolean`
- `checkPhoneExists(phone)` → Returns `boolean`
- `registerCorporate(data)` → Creates `Corporate` entity

---

### 2.2 KYC Onboarding Journey

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        KYC ONBOARDING FLOW                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │ Company  │───▶│  Directors   │───▶│  Documents   │───▶│    KYC       │  │
│  │   Info   │    │    Page      │    │    Upload    │    │   Status     │  │
│  └──────────┘    └──────────────┘    └──────────────┘    └──────────────┘  │
│       │                 │                   │                   │          │
│       ▼                 ▼                   ▼                   ▼          │
│  /onboarding/    /onboarding/       /onboarding/         /onboarding/     │
│  company         directors          documents            status           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Step 1: Company Information

**Route**: `/onboarding/company`
**Component**: `CompanyInfoPage.tsx`

| Field | Required | API |
|-------|----------|-----|
| Company Name | ✅ | - |
| Business Category | ✅ | - |
| Registration Number | ✅ | - |
| Registration Date | ✅ | - |
| Tax ID (TIN) | ❌ | - |
| Address | ❌ | - |
| Phone | ✅ | - |
| Email | ✅ | - |

**API Endpoints**:
- `GET /rest/corporate/current.json` → Get current corporate
- `PUT /rest/corporate/update/{id}.json` → Update corporate info

---

#### Step 2: Directors & Key Personnel

**Route**: `/onboarding/directors`
**Component**: `DirectorsPage.tsx`

| Field | Required | Description |
|-------|----------|-------------|
| First Name | ✅ | Director's first name |
| Last Name | ✅ | Director's last name |
| Email | ✅ | Contact email |
| Phone | ✅ | Contact phone |
| Role | ✅ | DIRECTOR, SIGNATORY, BENEFICIAL_OWNER |

**API Endpoints**:
- `GET /rest/corporateAccountPerson/index.json?corporateId={id}` → List directors
- `POST /rest/corporateAccountPerson/save.json` → Add director
- `PUT /rest/corporateAccountPerson/update/{id}.json` → Update director
- `DELETE /rest/corporateAccountPerson/delete/{id}.json` → Remove director

**Minimum Requirements**:
- At least 1 Director
- At least 1 Beneficial Owner (>25% ownership)

---

#### Step 3: Document Upload

**Route**: `/onboarding/documents`
**Component**: `DocumentsPage.tsx`

| Document Type | Required | Description |
|---------------|----------|-------------|
| Certificate of Incorporation | ✅ | Company registration certificate |
| Board Resolution | ✅ | Authorization to open account |
| Memorandum & Articles | ✅ | Company bylaws |
| Proof of Address | ✅ | Utility bill or bank statement |

**API Endpoints**:
- `GET /rest/corporateDocuments/index.json?corporateId={id}` → List documents
- `POST /rest/corporateDocuments/save.json` → Upload document (multipart/form-data)
- `DELETE /rest/corporateDocuments/delete/{id}.json` → Remove document

---

#### Step 4: KYC Status & Submission

**Route**: `/onboarding/status`
**Component**: `KycStatusPage.tsx`

| Status | Description |
|--------|-------------|
| `PENDING` | KYC not yet submitted |
| `SUBMITTED` | Under review |
| `APPROVED` | KYC approved, full access |
| `REJECTED` | KYC rejected, needs revision |

**API Endpoints**:
- `GET /rest/corporate/current.json` → Get KYC status
- `POST /rest/corporate/submitKyc/{id}.json` → Submit for review

---

## 3. Dashboard

**Route**: `/dashboard`
**Component**: `DashboardPage.tsx`

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DASHBOARD                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   Revenue   │  │  Expenses   │  │  Outstanding│  │   Overdue   │        │
│  │    $XXX     │  │    $XXX     │  │     $XXX    │  │    $XXX     │        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
│                                                                             │
│  ┌────────────────────────────────┐  ┌────────────────────────────────┐    │
│  │     Revenue vs Expenses        │  │      Recent Invoices           │    │
│  │         (Chart)                │  │         (Table)                │    │
│  └────────────────────────────────┘  └────────────────────────────────┘    │
│                                                                             │
│  ┌────────────────────────────────┐  ┌────────────────────────────────┐    │
│  │       Recent Bills             │  │      Quick Actions             │    │
│  │         (Table)                │  │   [New Invoice] [New Bill]     │    │
│  └────────────────────────────────┘  └────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**API Endpoints**:
- `GET /rest/financeReports/dashboardStats.json` → KPI metrics
- `GET /rest/invoice/index.json?max=5&sort=dateCreated&order=desc` → Recent invoices
- `GET /rest/bill/index.json?max=5&sort=dateCreated&order=desc` → Recent bills

**Dashboard Metrics**:
| Metric | Source |
|--------|--------|
| Total Revenue | Sum of paid invoices |
| Total Expenses | Sum of paid bills |
| Outstanding Receivables | Unpaid invoice amounts |
| Overdue Invoices | Invoices past due date |
| Outstanding Payables | Unpaid bill amounts |
| Overdue Bills | Bills past due date |

---

## 4. Invoice Management

### 4.1 Invoice List Journey

**Route**: `/invoices`
**Component**: `InvoiceListPage.tsx`

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           INVOICE LIST                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│  [Search...] [Status ▼] [Date Range] [+ New Invoice]                        │
├─────────────────────────────────────────────────────────────────────────────┤
│  Invoice #  │ Client      │ Issue Date │ Due Date  │ Amount   │ Status     │
│─────────────┼─────────────┼────────────┼───────────┼──────────┼────────────│
│  INV-0001   │ Acme Corp   │ 2026-01-15 │ 2026-02-14│ $5,000   │ ● SENT     │
│  INV-0002   │ Beta Inc    │ 2026-01-14 │ 2026-02-13│ $3,200   │ ● PAID     │
│  INV-0003   │ Gamma LLC   │ 2026-01-13 │ 2026-02-12│ $7,500   │ ● OVERDUE  │
├─────────────────────────────────────────────────────────────────────────────┤
│  < Prev  [1] [2] [3] ... [10]  Next >                                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

**API Endpoint**: `GET /rest/invoice/index.json`

**Query Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| `max` | number | Items per page (default: 20) |
| `offset` | number | Pagination offset |
| `sort` | string | Sort field |
| `order` | asc/desc | Sort direction |
| `status` | string | Filter by status |
| `clientId` | string | Filter by client |
| `q` | string | Search query |

**Status Values**:
| Status | Color | Description |
|--------|-------|-------------|
| `DRAFT` | Gray | Not yet sent |
| `SENT` | Blue | Sent to client |
| `VIEWED` | Cyan | Client viewed |
| `PARTIAL` | Yellow | Partially paid |
| `PAID` | Green | Fully paid |
| `OVERDUE` | Red | Past due date |
| `CANCELLED` | Gray | Cancelled |

---

### 4.2 Create Invoice Journey

**Route**: `/invoices/new`
**Component**: `InvoiceFormPage.tsx`

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         NEW INVOICE FORM                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Invoice Details                                                            │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │ Client ▼        │  │ Issue Date      │  │ Due Date        │             │
│  │ [Select...]     │  │ [2026-01-20]    │  │ [2026-02-19]    │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
│                                                                             │
│  Line Items                                                     [+ Add Row] │
│  ┌────────────────────┬────────┬───────────┬─────────┬──────────┬─────────┐│
│  │ Description        │ Qty    │ Unit Price│ Tax %   │ Discount │ Amount  ││
│  ├────────────────────┼────────┼───────────┼─────────┼──────────┼─────────┤│
│  │ Consulting Service │ 10     │ $150.00   │ 10%     │ 0%       │ $1,650  ││
│  │ Software License   │ 1      │ $500.00   │ 10%     │ 5%       │ $522.50 ││
│  └────────────────────┴────────┴───────────┴─────────┴──────────┴─────────┘│
│                                                                             │
│  Notes & Terms                                          Summary             │
│  ┌────────────────────────────────────┐     ┌───────────────────────────┐  │
│  │ Thank you for your business...     │     │ Subtotal:      $2,000.00  │  │
│  │ Payment due within 30 days...      │     │ Tax (10%):       $200.00  │  │
│  └────────────────────────────────────┘     │ Discount:        -$27.50  │  │
│                                             │ ─────────────────────────  │  │
│                                             │ TOTAL:         $2,172.50  │  │
│                                             └───────────────────────────┘  │
│                                                                             │
│                                      [Cancel] [Save Draft] [Save & Send]   │
└─────────────────────────────────────────────────────────────────────────────┘
```

**API Flow**:

| Step | Action | API Endpoint |
|------|--------|--------------|
| 1 | Load clients | `GET /rest/client/index.json` |
| 2 | Fill form | - |
| 3 | Save draft | `POST /rest/invoice/save.json` (status=DRAFT) |
| 4 | Save & send | `POST /rest/invoice/save.json` + `POST /rest/invoice/send/{id}.json` |

**Invoice Data Model**:
```typescript
interface Invoice {
  id: string;
  invoiceNumber: string;      // Auto-generated: INV-YYYY-NNNN
  client: { id: string };     // FK to Client
  issueDate: string;          // ISO date
  dueDate: string;            // ISO date
  status: InvoiceStatus;
  subtotal: number;           // Calculated
  taxAmount: number;          // Calculated
  discountAmount: number;     // Calculated
  totalAmount: number;        // Calculated
  amountPaid: number;         // From payments
  amountDue: number;          // totalAmount - amountPaid
  notes?: string;
  terms?: string;
  items: InvoiceItem[];
}

interface InvoiceItem {
  id: string;
  invoice: { id: string };
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;            // Percentage (e.g., 10 for 10%)
  discountPercent: number;    // Percentage
  amount: number;             // Calculated: qty * price * (1 + tax) * (1 - discount)
}
```

---

### 4.3 Invoice Detail Journey

**Route**: `/invoices/:id`
**Component**: `InvoiceDetailPage.tsx`

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ← Back to Invoices                              [Edit] [Send] [More ▼]    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  INVOICE #INV-2026-0001                                    Status: ● SENT  │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  Bill To:                                    Invoice Date: Jan 15, 2026    │
│  Acme Corporation                            Due Date: Feb 14, 2026        │
│  123 Business St.                                                          │
│  New York, NY 10001                                                        │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ Description              │ Qty │ Rate     │ Tax   │ Discount │ Total │  │
│  ├──────────────────────────┼─────┼──────────┼───────┼──────────┼───────┤  │
│  │ Consulting Services      │ 10  │ $150.00  │ 10%   │ 0%       │$1,650 │  │
│  │ Software License         │ 1   │ $500.00  │ 10%   │ 5%       │$522.50│  │
│  └──────────────────────────┴─────┴──────────┴───────┴──────────┴───────┘  │
│                                                                             │
│                                             Subtotal:         $2,000.00    │
│                                             Tax:                $200.00    │
│                                             Discount:           -$27.50    │
│                                             ───────────────────────────    │
│                                             TOTAL:            $2,172.50    │
│                                             Amount Paid:           $0.00   │
│                                             BALANCE DUE:      $2,172.50    │
│                                                                             │
│  Payment History                                        [+ Record Payment] │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ No payments recorded                                                 │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**API Endpoints**:
- `GET /rest/invoice/show/{id}.json` → Invoice with items
- `GET /rest/invoicePayment/index.json?invoiceId={id}` → Payment history

**Actions**:
| Action | API Endpoint | Result |
|--------|--------------|--------|
| Edit | Navigate to `/invoices/:id/edit` | - |
| Send | `POST /rest/invoice/send/{id}.json` | Status → SENT |
| Mark Viewed | `POST /rest/invoice/markViewed/{id}.json` | Status → VIEWED |
| Cancel | `POST /rest/invoice/cancel/{id}.json` | Status → CANCELLED |
| Record Payment | `POST /rest/invoicePayment/save.json` | Updates amountPaid |
| Delete | `DELETE /rest/invoice/delete/{id}.json` | Soft delete |
| Download PDF | `GET /rest/invoice/pdf/{id}.json` | PDF download |

---

### 4.4 Record Invoice Payment Journey

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       RECORD PAYMENT MODAL                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Invoice: INV-2026-0001          Balance Due: $2,172.50                    │
│                                                                             │
│  ┌─────────────────────┐  ┌─────────────────────┐                          │
│  │ Payment Amount      │  │ Payment Date        │                          │
│  │ [$2,172.50      ]   │  │ [2026-01-20    ]    │                          │
│  └─────────────────────┘  └─────────────────────┘                          │
│                                                                             │
│  ┌─────────────────────┐  ┌─────────────────────┐                          │
│  │ Payment Method  ▼   │  │ Reference #         │                          │
│  │ [Bank Transfer  ]   │  │ [TXN-123456     ]   │                          │
│  └─────────────────────┘  └─────────────────────┘                          │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │ Notes                                                       │           │
│  │ [Payment received via wire transfer                      ]  │           │
│  └─────────────────────────────────────────────────────────────┘           │
│                                                                             │
│                                              [Cancel] [Record Payment]     │
└─────────────────────────────────────────────────────────────────────────────┘
```

**API Endpoint**: `POST /rest/invoicePayment/save.json`

**Payment Methods**:
- `CASH`
- `BANK_TRANSFER`
- `CHEQUE`
- `CARD`
- `OTHER`

**Status Updates**:
- If `amountPaid < totalAmount` → Status = `PARTIAL`
- If `amountPaid >= totalAmount` → Status = `PAID`

---

## 5. Bill Management

### 5.1 Bill List Journey

**Route**: `/bills`
**Component**: `BillListPage.tsx`

**API Endpoint**: `GET /rest/bill/index.json`

**Status Values**:
| Status | Color | Description |
|--------|-------|-------------|
| `DRAFT` | Gray | Not yet submitted |
| `PENDING` | Blue | Awaiting payment |
| `PARTIAL` | Yellow | Partially paid |
| `PAID` | Green | Fully paid |
| `OVERDUE` | Red | Past due date |
| `CANCELLED` | Gray | Cancelled |

---

### 5.2 Create Bill Journey

**Route**: `/bills/new`
**Component**: `BillFormPage.tsx`

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           NEW BILL FORM                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Bill Details                                                               │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │ Vendor ▼        │  │ Issue Date      │  │ Due Date        │             │
│  │ [Select...]     │  │ [2026-01-20]    │  │ [2026-02-19]    │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
│                                                                             │
│  Bill Number (optional)                                                     │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │ [Vendor's invoice/bill number                            ]  │           │
│  └─────────────────────────────────────────────────────────────┘           │
│                                                                             │
│  Line Items                                                     [+ Add Row] │
│  ┌────────────────────┬────────┬───────────┬─────────┬──────────┐          │
│  │ Description        │ Qty    │ Unit Price│ Tax %   │ Amount   │          │
│  ├────────────────────┼────────┼───────────┼─────────┼──────────┤          │
│  │ Office Supplies    │ 1      │ $500.00   │ 10%     │ $550.00  │          │
│  └────────────────────┴────────┴───────────┴─────────┴──────────┘          │
│                                                                             │
│                                             Subtotal:      $500.00         │
│                                             Tax:            $50.00         │
│                                             TOTAL:         $550.00         │
│                                                                             │
│                                         [Cancel] [Save Draft] [Save Bill]  │
└─────────────────────────────────────────────────────────────────────────────┘
```

**API Flow**:
| Step | Action | API Endpoint |
|------|--------|--------------|
| 1 | Load vendors | `GET /rest/vendor/index.json` |
| 2 | Fill form | - |
| 3 | Save | `POST /rest/bill/save.json` |

**Bill Data Model**:
```typescript
interface Bill {
  id: string;
  billNumber: string;         // Auto or vendor's number
  vendor: { id: string };     // FK to Vendor
  issueDate: string;
  dueDate: string;
  status: BillStatus;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  amountPaid: number;
  amountDue: number;
  notes?: string;
  items: BillItem[];
}
```

---

### 5.3 Bill Detail Journey

**Route**: `/bills/:id`
**Component**: `BillDetailPage.tsx`

**API Endpoints**:
- `GET /rest/bill/show/{id}.json` → Bill with items
- `GET /rest/billPayment/index.json?billId={id}` → Payment history

**Actions**:
| Action | API Endpoint |
|--------|--------------|
| Edit | Navigate to `/bills/:id/edit` |
| Record Payment | `POST /rest/billPayment/save.json` |
| Delete | `DELETE /rest/bill/delete/{id}.json` |

---

## 6. Vendor Management

### 6.1 Vendor List Journey

**Route**: `/vendors`
**Component**: `VendorListPage.tsx`

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           VENDOR LIST                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│  [Search vendors...]                                      [+ New Vendor]    │
├─────────────────────────────────────────────────────────────────────────────┤
│  Name           │ Email              │ Phone         │ Payment Terms │ ⋮   │
│─────────────────┼────────────────────┼───────────────┼───────────────┼─────│
│  Acme Supplies  │ ap@acme.com        │ +1 555-1234   │ Net 30        │ [⋮]│
│  Beta Services  │ billing@beta.io    │ +1 555-5678   │ Net 45        │ [⋮]│
│  Gamma Corp     │ accounts@gamma.com │ +1 555-9012   │ Net 60        │ [⋮]│
└─────────────────────────────────────────────────────────────────────────────┘
```

**API Endpoint**: `GET /rest/vendor/index.json`

---

### 6.2 Create/Edit Vendor Journey

**Route**: `/vendors/new` or `/vendors/:id/edit`
**Component**: `VendorFormPage.tsx`

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           NEW VENDOR                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Basic Information                                                          │
│  ┌─────────────────────┐  ┌─────────────────────┐                          │
│  │ Vendor Name *       │  │ Email               │                          │
│  │ [                ]  │  │ [                ]  │                          │
│  └─────────────────────┘  └─────────────────────┘                          │
│                                                                             │
│  ┌─────────────────────┐  ┌─────────────────────┐                          │
│  │ Phone Number        │  │ Tax ID (TIN)        │                          │
│  │ [                ]  │  │ [                ]  │                          │
│  └─────────────────────┘  └─────────────────────┘                          │
│                                                                             │
│  Payment Terms                                                              │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │ Payment Terms (Days)                                        │           │
│  │ [30                                                      ]  │           │
│  │ Number of days until payment is due (e.g., Net 30)         │           │
│  └─────────────────────────────────────────────────────────────┘           │
│                                                                             │
│  Address                                                                    │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │ [                                                        ]  │           │
│  │ [                                                        ]  │           │
│  └─────────────────────────────────────────────────────────────┘           │
│                                                                             │
│  Notes                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │ [                                                        ]  │           │
│  └─────────────────────────────────────────────────────────────┘           │
│                                                                             │
│                                              [Cancel] [Create Vendor]      │
└─────────────────────────────────────────────────────────────────────────────┘
```

**API Endpoints**:
- `POST /rest/vendor/save.json` → Create vendor
- `GET /rest/vendor/show/{id}.json` → Get vendor
- `PUT /rest/vendor/update/{id}.json` → Update vendor
- `DELETE /rest/vendor/delete/{id}.json` → Delete vendor

**Vendor Data Model**:
```typescript
interface Vendor {
  id: string;
  name: string;           // Required
  email?: string;
  phoneNumber?: string;
  address?: string;
  taxIdentificationNumber?: string;
  paymentTerms?: number;  // Days (e.g., 30 for Net 30)
  notes?: string;
}
```

---

## 7. Payment Processing

### 7.1 Payment List Journey

**Route**: `/payments`
**Component**: `PaymentListPage.tsx`

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PAYMENTS                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│  [Search...] [Type ▼] [Date Range]                          [+ New Payment] │
├─────────────────────────────────────────────────────────────────────────────┤
│  Date       │ Type     │ Reference      │ Method       │ Amount   │ Status │
│─────────────┼──────────┼────────────────┼──────────────┼──────────┼────────│
│  2026-01-20 │ Received │ INV-2026-0001  │ Bank Transfer│ $2,172.50│ Posted │
│  2026-01-19 │ Made     │ BILL-2026-0005 │ Cheque       │ $550.00  │ Posted │
│  2026-01-18 │ Received │ INV-2026-0002  │ Card         │ $1,000.00│ Pending│
└─────────────────────────────────────────────────────────────────────────────┘
```

**API Endpoints**:
- `GET /rest/invoicePayment/index.json` → Received payments
- `GET /rest/billPayment/index.json` → Made payments

---

### 7.2 New Payment Journey

**Route**: `/payments/new`
**Component**: `PaymentFormPage.tsx`

**Payment Type Selection**:
1. **Payment Received** → Against an invoice
2. **Payment Made** → Against a bill

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           NEW PAYMENT                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────┐  ┌─────────────────────────┐                  │
│  │ ○ Payment Received      │  │ ● Payment Made          │                  │
│  │   (Invoice Payment)     │  │   (Bill Payment)        │                  │
│  └─────────────────────────┘  └─────────────────────────┘                  │
│                                                                             │
│  Select Bill                                                                │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │ [BILL-0005 - Acme Supplies - $550.00 due           ▼]       │           │
│  └─────────────────────────────────────────────────────────────┘           │
│                                                                             │
│  ┌─────────────────────┐  ┌─────────────────────┐                          │
│  │ Amount              │  │ Payment Date        │                          │
│  │ [$550.00        ]   │  │ [2026-01-20     ]   │                          │
│  └─────────────────────┘  └─────────────────────┘                          │
│                                                                             │
│  ┌─────────────────────┐  ┌─────────────────────┐                          │
│  │ Payment Method  ▼   │  │ Reference           │                          │
│  │ [Cheque         ]   │  │ [CHQ-12345      ]   │                          │
│  └─────────────────────┘  └─────────────────────┘                          │
│                                                                             │
│                                              [Cancel] [Record Payment]     │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Chart of Accounts & Ledger

### 8.1 Chart of Accounts Journey

**Route**: `/ledger/accounts`
**Component**: `ChartOfAccountsPage.tsx`

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CHART OF ACCOUNTS                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│  [Search accounts...]  [Group ▼]                          [+ New Account]   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ▼ ASSETS                                                                   │
│    ├── 1000 - Cash                                            $25,000.00   │
│    ├── 1010 - Accounts Receivable                            $45,000.00   │
│    ├── 1020 - Inventory                                      $15,000.00   │
│    └── 1100 - Fixed Assets                                  $100,000.00   │
│                                                            ─────────────   │
│                                               Total Assets: $185,000.00   │
│                                                                             │
│  ▼ LIABILITIES                                                              │
│    ├── 2000 - Accounts Payable                               $12,000.00   │
│    ├── 2010 - Accrued Expenses                                $3,000.00   │
│    └── 2100 - Long-term Debt                                 $50,000.00   │
│                                                            ─────────────   │
│                                          Total Liabilities:  $65,000.00   │
│                                                                             │
│  ▼ EQUITY                                                                   │
│    ├── 3000 - Common Stock                                   $50,000.00   │
│    └── 3100 - Retained Earnings                              $70,000.00   │
│                                                            ─────────────   │
│                                               Total Equity: $120,000.00   │
│                                                                             │
│  ▼ REVENUE                                                                  │
│    ├── 4000 - Sales Revenue                                 $150,000.00   │
│    └── 4100 - Service Revenue                                $50,000.00   │
│                                                                             │
│  ▼ EXPENSE                                                                  │
│    ├── 5000 - Cost of Goods Sold                             $80,000.00   │
│    ├── 5100 - Salaries & Wages                               $40,000.00   │
│    └── 5200 - Rent Expense                                   $12,000.00   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**API Endpoints**:
- `GET /rest/ledgerAccount/index.json` → All accounts
- `GET /rest/ledgerAccount/index.json?ledgerGroup=ASSET` → By group
- `POST /rest/ledgerAccount/save.json` → Create account
- `PUT /rest/ledgerAccount/update/{id}.json` → Update account
- `DELETE /rest/ledgerAccount/delete/{id}.json` → Delete account

**Ledger Groups**:
| Group | Normal Balance | Description |
|-------|----------------|-------------|
| `ASSET` | Debit | Company resources |
| `LIABILITY` | Credit | Company obligations |
| `EQUITY` | Credit | Owner's stake |
| `REVENUE` | Credit | Income earned |
| `EXPENSE` | Debit | Costs incurred |

---

### 8.2 Ledger Transactions Journey

**Route**: `/ledger/transactions`
**Component**: `LedgerTransactionsPage.tsx`

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        LEDGER TRANSACTIONS                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│  [Search...] [Account ▼] [Date Range] [Status ▼]                           │
├─────────────────────────────────────────────────────────────────────────────┤
│  Date       │ Ref #       │ Description          │ Debit    │ Credit  │ Bal│
│─────────────┼─────────────┼──────────────────────┼──────────┼─────────┼────│
│  2026-01-20 │ JE-0001     │ Opening Balance      │$25,000.00│         │ Dr │
│  2026-01-19 │ INV-0001    │ Invoice Payment Rcvd │ $2,172.50│         │ Dr │
│  2026-01-18 │ BILL-0005   │ Bill Payment Made    │          │$550.00  │ Cr │
│  2026-01-17 │ JE-0002     │ Salary Payment       │          │$5,000.00│ Cr │
└─────────────────────────────────────────────────────────────────────────────┘
```

**API Endpoint**: `GET /rest/ledgerTransaction/index.json`

**Filter Parameters**:
| Parameter | Description |
|-----------|-------------|
| `accountId` | Filter by account |
| `startDate` | From date |
| `endDate` | To date |
| `status` | PENDING, POSTED, REVERSED |

---

## 9. Accounting Transactions

### 9.1 Transaction Register Journey

**Route**: `/accounting/transactions`
**Component**: `TransactionRegisterPage.tsx`

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      TRANSACTION REGISTER                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  [Search...] [Type ▼] [Date Range] [Status ▼]     [+ Journal] [+ Voucher]  │
├─────────────────────────────────────────────────────────────────────────────┤
│  □ │ Date       │ Number    │ Type     │ Description      │ Amount  │Status│
│────┼────────────┼───────────┼──────────┼──────────────────┼─────────┼──────│
│  □ │ 2026-01-20 │ JE-0001   │ Journal  │ Opening Balance  │$25,000  │Posted│
│  □ │ 2026-01-19 │ PV-0001   │ Payment  │ Supplier Payment │ $2,500  │Posted│
│  □ │ 2026-01-18 │ RV-0001   │ Receipt  │ Client Payment   │ $5,000  │Pendng│
│  □ │ 2026-01-17 │ JE-0002   │ Journal  │ Accrual Entry    │ $1,200  │Draft │
├─────────────────────────────────────────────────────────────────────────────┤
│  [Post Selected] [Delete Selected]                                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

**API Endpoints**:
- `GET /rest/ledgerTransaction/index.json` → List transactions
- `GET /rest/voucher/index.json` → List vouchers
- `POST /rest/ledgerTransaction/post/{id}.json` → Post transaction
- `POST /rest/ledgerTransaction/reverse/{id}.json` → Reverse transaction

---

### 9.2 Journal Entry Journey

**Route**: `/accounting/journal-entry/new`
**Component**: `JournalEntryPage.tsx`

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         NEW JOURNAL ENTRY                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐ │
│  │ Entry Date          │  │ Reference           │  │ Description         │ │
│  │ [2026-01-20     ]   │  │ [JE-2026-0001   ]   │  │ [Opening Balance ]  │ │
│  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘ │
│                                                                             │
│  Journal Lines                                                  [+ Add Line]│
│  ┌──────────────────────────────┬────────────────┬────────────────┬───────┐│
│  │ Account                      │ Debit          │ Credit         │       ││
│  ├──────────────────────────────┼────────────────┼────────────────┼───────┤│
│  │ [1000 - Cash            ▼]   │ [$25,000.00 ]  │ [           ]  │ [×]   ││
│  │ [3000 - Common Stock    ▼]   │ [           ]  │ [$25,000.00 ]  │ [×]   ││
│  └──────────────────────────────┴────────────────┴────────────────┴───────┘│
│                                                                             │
│                                                   Debit Total:  $25,000.00 │
│                                                   Credit Total: $25,000.00 │
│                                                   Difference:        $0.00 │
│                                                   ✓ Entry is balanced      │
│                                                                             │
│                                       [Cancel] [Save Draft] [Save & Post]  │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Validation Rules**:
- Minimum 2 lines
- Each line must have either Debit OR Credit (not both)
- Total Debits must equal Total Credits
- Account must be selected for each line

**API Endpoints**:
- `GET /rest/ledgerAccount/index.json` → Load accounts for dropdown
- `POST /rest/ledgerTransactionGroup/save.json` → Create journal entry group
- `POST /rest/ledgerTransactionGroup/post/{id}.json` → Post entry

**Journal Entry Model**:
```typescript
interface JournalEntry {
  entryDate: string;
  description: string;
  reference?: string;
  lines: JournalEntryLine[];
  status: 'DRAFT' | 'PENDING' | 'POSTED' | 'REVERSED';
}

interface JournalEntryLine {
  accountId: string;
  debitAmount: number;   // Either this OR creditAmount
  creditAmount: number;
  description?: string;
}
```

---

### 9.3 Voucher Journey

**Route**: `/accounting/vouchers/new?type=PAYMENT`
**Component**: `VoucherFormPage.tsx`

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         NEW PAYMENT VOUCHER                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐ │
│  │ [● Payment]         │  │ [○ Receipt]         │  │ [○ Deposit]         │ │
│  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘ │
│                                                                             │
│  ┌─────────────────────┐  ┌─────────────────────┐                          │
│  │ Voucher Date        │  │ Reference           │                          │
│  │ [2026-01-20     ]   │  │ [PV-2026-0001   ]   │                          │
│  └─────────────────────┘  └─────────────────────┘                          │
│                                                                             │
│  Beneficiary Type                                                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐                   │
│  │ ○ Client │  │ ● Vendor │  │ ○ Staff  │  │ ○ Other  │                   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘                   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │ Select Vendor                                            ▼  │           │
│  │ [Acme Supplies                                           ]  │           │
│  └─────────────────────────────────────────────────────────────┘           │
│                                                                             │
│  ┌─────────────────────┐  ┌─────────────────────┐                          │
│  │ Amount              │  │ Bank/Cash Account ▼ │                          │
│  │ [$2,500.00      ]   │  │ [1000 - Cash     ]  │                          │
│  └─────────────────────┘  └─────────────────────┘                          │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │ Expense Account                                          ▼  │           │
│  │ [5000 - Operating Expenses                               ]  │           │
│  └─────────────────────────────────────────────────────────────┘           │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │ Description                                                 │           │
│  │ [Payment to Acme Supplies for office supplies           ]   │           │
│  └─────────────────────────────────────────────────────────────┘           │
│                                                                             │
│  Transaction Preview                                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ Dr. 5000 - Operating Expenses     $2,500.00                          │  │
│  │ Cr. 1000 - Cash                                $2,500.00             │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│                                              [Cancel] [Save] [Save & Post] │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Voucher Types**:
| Type | Description | Journal Effect |
|------|-------------|----------------|
| `PAYMENT` | Pay vendor/expense | Dr. Expense, Cr. Cash |
| `RECEIPT` | Receive from client | Dr. Cash, Cr. Revenue |
| `DEPOSIT` | Bank deposit | Dr. Bank, Cr. Cash |

**Beneficiary Types**:
| Type | Lookup |
|------|--------|
| `CLIENT` | Client dropdown |
| `VENDOR` | Vendor dropdown |
| `STAFF` | Staff dropdown |
| `OTHER` | Manual name entry |

**API Endpoints**:
- `POST /rest/voucher/save.json` → Create voucher
- `POST /rest/voucher/approve/{id}.json` → Approve voucher
- `POST /rest/voucher/post/{id}.json` → Post to ledger
- `POST /rest/voucher/cancel/{id}.json` → Cancel voucher

---

## 10. Financial Reports

### 10.1 Reports Hub

**Route**: `/reports`
**Component**: `ReportsPage.tsx`

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FINANCIAL REPORTS                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────┐  ┌─────────────────────────────┐          │
│  │ ◉ Trial Balance             │  │ ◉ Profit & Loss             │          │
│  │   View account balances     │  │   Revenue & expenses        │          │
│  │   [View Report →]           │  │   [View Report →]           │          │
│  └─────────────────────────────┘  └─────────────────────────────┘          │
│                                                                             │
│  ┌─────────────────────────────┐  ┌─────────────────────────────┐          │
│  │ ◉ Balance Sheet             │  │ ◉ Cash Flow Statement       │          │
│  │   Assets & liabilities      │  │   Cash movements            │          │
│  │   [View Report →]           │  │   [View Report →]           │          │
│  └─────────────────────────────┘  └─────────────────────────────┘          │
│                                                                             │
│  ┌─────────────────────────────┐                                           │
│  │ ◉ Aging Reports             │                                           │
│  │   A/R & A/P aging           │                                           │
│  │   [View Report →]           │                                           │
│  └─────────────────────────────┘                                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 10.2 Trial Balance Report

**Route**: `/reports/trial-balance`
**Component**: `TrialBalancePage.tsx`

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          TRIAL BALANCE                                      │
│                        As of January 20, 2026                               │
├─────────────────────────────────────────────────────────────────────────────┤
│  As of Date: [2026-01-20 📅]                         [PDF] [Excel] [Print] │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ▼ ASSETS                                                                   │
│  ┌────────────────────────────────────────┬────────────┬────────────┐      │
│  │ Account                                │ Debit      │ Credit     │      │
│  ├────────────────────────────────────────┼────────────┼────────────┤      │
│  │ 1000 - Cash                            │ $25,000.00 │            │      │
│  │ 1010 - Accounts Receivable             │ $45,000.00 │            │      │
│  │ 1020 - Inventory                       │ $15,000.00 │            │      │
│  │ 1100 - Fixed Assets                    │$100,000.00 │            │      │
│  ├────────────────────────────────────────┼────────────┼────────────┤      │
│  │ Total Assets                           │$185,000.00 │            │      │
│  └────────────────────────────────────────┴────────────┴────────────┘      │
│                                                                             │
│  ▼ LIABILITIES                                                              │
│  ┌────────────────────────────────────────┬────────────┬────────────┐      │
│  │ 2000 - Accounts Payable                │            │ $12,000.00 │      │
│  │ 2100 - Long-term Debt                  │            │ $50,000.00 │      │
│  ├────────────────────────────────────────┼────────────┼────────────┤      │
│  │ Total Liabilities                      │            │ $62,000.00 │      │
│  └────────────────────────────────────────┴────────────┴────────────┘      │
│                                                                             │
│  [Similar sections for EQUITY, REVENUE, EXPENSE...]                        │
│                                                                             │
│  ═══════════════════════════════════════════════════════════════════════   │
│  TOTAL                                    │$385,000.00 │$385,000.00 │      │
│  ═══════════════════════════════════════════════════════════════════════   │
│  ✓ Trial Balance is in balance                                             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**API Endpoint**: `GET /rest/financeReports/trialBalance.json?asOf=2026-01-20`

**Response Model**:
```typescript
interface TrialBalance {
  asOf: string;
  accounts: {
    ASSET: TrialBalanceItem[];
    LIABILITY: TrialBalanceItem[];
    EQUITY: TrialBalanceItem[];
    REVENUE: TrialBalanceItem[];
    EXPENSE: TrialBalanceItem[];
  };
  totalDebit: number;
  totalCredit: number;
}

interface TrialBalanceItem {
  id: string;
  name: string;
  currency: string;
  ledgerGroup: LedgerGroup;
  endingDebit: number;
  endingCredit: number;
}
```

---

### 10.3 Profit & Loss Report

**Route**: `/reports/pnl`
**Component**: `ProfitLossPage.tsx`

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PROFIT & LOSS STATEMENT                             │
│                    January 1 - January 31, 2026                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  From: [2026-01-01 📅]  To: [2026-01-31 📅]          [PDF] [Excel] [Print] │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  INCOME                                                                     │
│  ┌────────────────────────────────────────────────────────────┬───────────┐│
│  │ 4000 - Sales Revenue                                       │$150,000.00││
│  │ 4100 - Service Revenue                                     │ $50,000.00││
│  │ 4200 - Interest Income                                     │  $1,500.00││
│  ├────────────────────────────────────────────────────────────┼───────────┤│
│  │ Total Income                                               │$201,500.00││
│  └────────────────────────────────────────────────────────────┴───────────┘│
│                                                                             │
│  EXPENSES                                                                   │
│  ┌────────────────────────────────────────────────────────────┬───────────┐│
│  │ 5000 - Cost of Goods Sold                                  │ $80,000.00││
│  │ 5100 - Salaries & Wages                                    │ $40,000.00││
│  │ 5200 - Rent Expense                                        │ $12,000.00││
│  │ 5300 - Utilities                                           │  $2,500.00││
│  │ 5400 - Depreciation                                        │  $5,000.00││
│  ├────────────────────────────────────────────────────────────┼───────────┤│
│  │ Total Expenses                                             │$139,500.00││
│  └────────────────────────────────────────────────────────────┴───────────┘│
│                                                                             │
│  ═══════════════════════════════════════════════════════════════════════   │
│  NET PROFIT                                                   │ $62,000.00 │
│  ═══════════════════════════════════════════════════════════════════════   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**API Endpoint**: `GET /rest/financeReports/incomeStatement.json?startDate=2026-01-01&endDate=2026-01-31`

---

### 10.4 Balance Sheet Report

**Route**: `/reports/balance-sheet`
**Component**: `BalanceSheetPage.tsx`

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            BALANCE SHEET                                    │
│                         As of January 31, 2026                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  As of Date: [2026-01-31 📅]                         [PDF] [Excel] [Print] │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ASSETS                                                                     │
│  ┌────────────────────────────────────────────────────────────────────────┐│
│  │ Current Assets                                                         ││
│  │   Cash and Cash Equivalents                           $25,000.00       ││
│  │   Accounts Receivable                                 $45,000.00       ││
│  │   Inventory                                           $15,000.00       ││
│  │   Prepaid Expenses                                     $3,000.00       ││
│  │                                                      ───────────       ││
│  │   Total Current Assets                                $88,000.00       ││
│  │                                                                        ││
│  │ Non-Current Assets                                                     ││
│  │   Property, Plant & Equipment                        $100,000.00       ││
│  │   Less: Accumulated Depreciation                     ($10,000.00)      ││
│  │                                                      ───────────       ││
│  │   Total Non-Current Assets                            $90,000.00       ││
│  │                                                                        ││
│  │ TOTAL ASSETS                                         $178,000.00       ││
│  └────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  LIABILITIES                                                                │
│  ┌────────────────────────────────────────────────────────────────────────┐│
│  │ Current Liabilities                                                    ││
│  │   Accounts Payable                                    $12,000.00       ││
│  │   Accrued Expenses                                     $3,000.00       ││
│  │                                                      ───────────       ││
│  │   Total Current Liabilities                           $15,000.00       ││
│  │                                                                        ││
│  │ Non-Current Liabilities                                                ││
│  │   Long-term Debt                                      $50,000.00       ││
│  │                                                      ───────────       ││
│  │   Total Non-Current Liabilities                       $50,000.00       ││
│  │                                                                        ││
│  │ TOTAL LIABILITIES                                     $65,000.00       ││
│  └────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  EQUITY                                                                     │
│  ┌────────────────────────────────────────────────────────────────────────┐│
│  │   Common Stock                                        $50,000.00       ││
│  │   Retained Earnings                                   $63,000.00       ││
│  │                                                      ───────────       ││
│  │ TOTAL EQUITY                                         $113,000.00       ││
│  └────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ═══════════════════════════════════════════════════════════════════════   │
│  TOTAL LIABILITIES + EQUITY                             $178,000.00       │
│  ═══════════════════════════════════════════════════════════════════════   │
│  ✓ Balance Sheet is in balance (Assets = Liabilities + Equity)             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**API Endpoint**: `GET /rest/financeReports/balanceSheet.json?asOf=2026-01-31`

---

### 10.5 Cash Flow Statement

**Route**: `/reports/cash-flow`
**Component**: `CashFlowPage.tsx`

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CASH FLOW STATEMENT                                  │
│                    January 1 - January 31, 2026                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  From: [2026-01-01 📅]  To: [2026-01-31 📅]          [PDF] [Excel] [Print] │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  OPERATING ACTIVITIES                                                       │
│  ┌────────────────────────────────────────────────────────────────────────┐│
│  │ Net Income                                            $62,000.00       ││
│  │ Adjustments:                                                           ││
│  │   Depreciation                                         $5,000.00       ││
│  │   Increase in Accounts Receivable                    ($10,000.00)      ││
│  │   Decrease in Inventory                                $2,000.00       ││
│  │   Increase in Accounts Payable                         $3,000.00       ││
│  │                                                      ───────────       ││
│  │ Net Cash from Operating Activities                    $62,000.00       ││
│  └────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  INVESTING ACTIVITIES                                                       │
│  ┌────────────────────────────────────────────────────────────────────────┐│
│  │ Purchase of Equipment                                ($15,000.00)      ││
│  │ Sale of Investments                                    $5,000.00       ││
│  │                                                      ───────────       ││
│  │ Net Cash from Investing Activities                   ($10,000.00)      ││
│  └────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  FINANCING ACTIVITIES                                                       │
│  ┌────────────────────────────────────────────────────────────────────────┐│
│  │ Loan Repayment                                        ($5,000.00)      ││
│  │ Dividends Paid                                       ($10,000.00)      ││
│  │                                                      ───────────       ││
│  │ Net Cash from Financing Activities                   ($15,000.00)      ││
│  └────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ═══════════════════════════════════════════════════════════════════════   │
│  Net Change in Cash                                      $37,000.00       │
│  Beginning Cash Balance                                  $13,000.00       │
│  ───────────────────────────────────────────────────────────────────────   │
│  ENDING CASH BALANCE                                     $50,000.00       │
│  ═══════════════════════════════════════════════════════════════════════   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**API Endpoint**: `GET /rest/financeReports/cashFlow.json?startDate=2026-01-01&endDate=2026-01-31`

---

### 10.6 Aging Reports

**Route**: `/reports/aging`
**Component**: `AgingReportsPage.tsx`

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          AGING REPORTS                                      │
│                        As of January 31, 2026                               │
├─────────────────────────────────────────────────────────────────────────────┤
│  As of Date: [2026-01-31 📅]                         [PDF] [Excel] [Print] │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ACCOUNTS RECEIVABLE AGING                                                  │
│  ┌────────────────┬─────────┬─────────┬─────────┬─────────┬────────┬──────┐│
│  │ Client         │ Current │ 1-30    │ 31-60   │ 61-90   │ 90+    │ Total││
│  ├────────────────┼─────────┼─────────┼─────────┼─────────┼────────┼──────┤│
│  │ Acme Corp      │ $5,000  │ $2,000  │ $1,000  │ $0      │ $0     │$8,000││
│  │ Beta Inc       │ $3,000  │ $0      │ $0      │ $500    │ $0     │$3,500││
│  │ Gamma LLC      │ $0      │ $0      │ $2,500  │ $1,500  │ $750   │$4,750││
│  ├────────────────┼─────────┼─────────┼─────────┼─────────┼────────┼──────┤│
│  │ TOTAL          │ $8,000  │ $2,000  │ $3,500  │ $2,000  │ $750   │$16,250│
│  └────────────────┴─────────┴─────────┴─────────┴─────────┴────────┴──────┘│
│                                                                             │
│  ACCOUNTS PAYABLE AGING                                                     │
│  ┌────────────────┬─────────┬─────────┬─────────┬─────────┬────────┬──────┐│
│  │ Vendor         │ Current │ 1-30    │ 31-60   │ 61-90   │ 90+    │ Total││
│  ├────────────────┼─────────┼─────────┼─────────┼─────────┼────────┼──────┤│
│  │ Acme Supplies  │ $3,000  │ $1,500  │ $0      │ $0      │ $0     │$4,500││
│  │ Beta Services  │ $2,000  │ $0      │ $500    │ $0      │ $0     │$2,500││
│  ├────────────────┼─────────┼─────────┼─────────┼─────────┼────────┼──────┤│
│  │ TOTAL          │ $5,000  │ $1,500  │ $500    │ $0      │ $0     │$7,000││
│  └────────────────┴─────────┴─────────┴─────────┴─────────┴────────┴──────┘│
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**API Endpoints**:
- `GET /rest/financeReports/agedReceivables.json?asOf=2026-01-31` → A/R Aging
- `GET /rest/financeReports/agedPayables.json?asOf=2026-01-31` → A/P Aging

---

## Appendix A: Complete API Reference

### Authentication APIs

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/rest/otp/request.json` | Request OTP |
| POST | `/rest/otp/verify.json` | Verify OTP |

### Registration APIs

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/rest/corporate/save.json` | Register corporate |
| GET | `/rest/user/checkEmail.json` | Check email exists |
| GET | `/rest/user/checkPhone.json` | Check phone exists |

### Corporate KYC APIs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/rest/corporate/current.json` | Get current corporate |
| GET | `/rest/corporate/show/{id}.json` | Get corporate by ID |
| PUT | `/rest/corporate/update/{id}.json` | Update corporate |
| POST | `/rest/corporate/submitKyc/{id}.json` | Submit KYC |
| GET | `/rest/corporateAccountPerson/index.json` | List directors |
| POST | `/rest/corporateAccountPerson/save.json` | Add director |
| PUT | `/rest/corporateAccountPerson/update/{id}.json` | Update director |
| DELETE | `/rest/corporateAccountPerson/delete/{id}.json` | Delete director |
| GET | `/rest/corporateDocuments/index.json` | List documents |
| POST | `/rest/corporateDocuments/save.json` | Upload document |
| DELETE | `/rest/corporateDocuments/delete/{id}.json` | Delete document |

### Invoice APIs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/rest/invoice/index.json` | List invoices |
| GET | `/rest/invoice/show/{id}.json` | Get invoice |
| POST | `/rest/invoice/save.json` | Create invoice |
| PUT | `/rest/invoice/update/{id}.json` | Update invoice |
| DELETE | `/rest/invoice/delete/{id}.json` | Delete invoice |
| POST | `/rest/invoice/send/{id}.json` | Send invoice |
| POST | `/rest/invoice/markViewed/{id}.json` | Mark viewed |
| POST | `/rest/invoice/cancel/{id}.json` | Cancel invoice |
| POST | `/rest/invoiceItem/save.json` | Add line item |
| PUT | `/rest/invoiceItem/update/{id}.json` | Update line item |
| DELETE | `/rest/invoiceItem/delete/{id}.json` | Delete line item |
| GET | `/rest/invoicePayment/index.json` | List payments |
| POST | `/rest/invoicePayment/save.json` | Record payment |
| DELETE | `/rest/invoicePayment/delete/{id}.json` | Delete payment |

### Bill APIs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/rest/bill/index.json` | List bills |
| GET | `/rest/bill/show/{id}.json` | Get bill |
| POST | `/rest/bill/save.json` | Create bill |
| PUT | `/rest/bill/update/{id}.json` | Update bill |
| DELETE | `/rest/bill/delete/{id}.json` | Delete bill |
| POST | `/rest/billItem/save.json` | Add line item |
| PUT | `/rest/billItem/update/{id}.json` | Update line item |
| DELETE | `/rest/billItem/delete/{id}.json` | Delete line item |
| GET | `/rest/billPayment/index.json` | List payments |
| POST | `/rest/billPayment/save.json` | Record payment |
| DELETE | `/rest/billPayment/delete/{id}.json` | Delete payment |

### Vendor APIs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/rest/vendor/index.json` | List vendors |
| GET | `/rest/vendor/show/{id}.json` | Get vendor |
| POST | `/rest/vendor/save.json` | Create vendor |
| PUT | `/rest/vendor/update/{id}.json` | Update vendor |
| DELETE | `/rest/vendor/delete/{id}.json` | Delete vendor |

### Ledger APIs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/rest/ledgerAccount/index.json` | List accounts |
| GET | `/rest/ledgerAccount/show/{id}.json` | Get account |
| POST | `/rest/ledgerAccount/save.json` | Create account |
| PUT | `/rest/ledgerAccount/update/{id}.json` | Update account |
| DELETE | `/rest/ledgerAccount/delete/{id}.json` | Delete account |
| GET | `/rest/ledgerTransaction/index.json` | List transactions |
| GET | `/rest/ledgerTransaction/show/{id}.json` | Get transaction |
| POST | `/rest/ledgerTransaction/save.json` | Create transaction |
| POST | `/rest/ledgerTransaction/post/{id}.json` | Post transaction |
| POST | `/rest/ledgerTransaction/reverse/{id}.json` | Reverse transaction |
| DELETE | `/rest/ledgerTransaction/delete/{id}.json` | Delete transaction |

### Voucher APIs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/rest/voucher/index.json` | List vouchers |
| GET | `/rest/voucher/show/{id}.json` | Get voucher |
| POST | `/rest/voucher/save.json` | Create voucher |
| PUT | `/rest/voucher/update/{id}.json` | Update voucher |
| POST | `/rest/voucher/approve/{id}.json` | Approve voucher |
| POST | `/rest/voucher/post/{id}.json` | Post voucher |
| POST | `/rest/voucher/cancel/{id}.json` | Cancel voucher |
| DELETE | `/rest/voucher/delete/{id}.json` | Delete voucher |

### Report APIs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/rest/financeReports/trialBalance.json` | Trial Balance |
| GET | `/rest/financeReports/incomeStatement.json` | Profit & Loss |
| GET | `/rest/financeReports/balanceSheet.json` | Balance Sheet |
| GET | `/rest/financeReports/cashFlow.json` | Cash Flow Statement |
| GET | `/rest/financeReports/agedReceivables.json` | A/R Aging |
| GET | `/rest/financeReports/agedPayables.json` | A/P Aging |
| GET | `/rest/financeReports/accountBalances.json` | Account Balances |
| GET | `/rest/financeReports/accountTransactions.json` | Account Transactions |
| GET | `/rest/financeReports/dashboardStats.json` | Dashboard KPIs |

---

## Appendix B: Route Summary

| Route | Component | Auth Required | Description |
|-------|-----------|---------------|-------------|
| `/login` | LoginPage | ❌ | User authentication |
| `/register` | RegistrationPage | ❌ | Corporate registration |
| `/dashboard` | DashboardPage | ✅ | Main dashboard |
| `/invoices` | InvoiceListPage | ✅ | Invoice list |
| `/invoices/new` | InvoiceFormPage | ✅ | Create invoice |
| `/invoices/:id` | InvoiceDetailPage | ✅ | View invoice |
| `/invoices/:id/edit` | InvoiceFormPage | ✅ | Edit invoice |
| `/bills` | BillListPage | ✅ | Bill list |
| `/bills/new` | BillFormPage | ✅ | Create bill |
| `/bills/:id` | BillDetailPage | ✅ | View bill |
| `/bills/:id/edit` | BillFormPage | ✅ | Edit bill |
| `/vendors` | VendorListPage | ✅ | Vendor list |
| `/vendors/new` | VendorFormPage | ✅ | Create vendor |
| `/vendors/:id` | VendorFormPage | ✅ | View vendor |
| `/vendors/:id/edit` | VendorFormPage | ✅ | Edit vendor |
| `/payments` | PaymentListPage | ✅ | Payment list |
| `/payments/new` | PaymentFormPage | ✅ | Record payment |
| `/ledger/accounts` | ChartOfAccountsPage | ✅ | Chart of accounts |
| `/ledger/transactions` | LedgerTransactionsPage | ✅ | Ledger transactions |
| `/accounting/transactions` | TransactionRegisterPage | ✅ | Transaction register |
| `/accounting/journal-entry/new` | JournalEntryPage | ✅ | New journal entry |
| `/accounting/journal-entry/:id` | JournalEntryPage | ✅ | Edit journal entry |
| `/accounting/vouchers/new` | VoucherFormPage | ✅ | New voucher |
| `/accounting/vouchers/:id` | VoucherFormPage | ✅ | Edit voucher |
| `/reports` | ReportsPage | ✅ | Reports hub |
| `/reports/trial-balance` | TrialBalancePage | ✅ | Trial balance |
| `/reports/pnl` | ProfitLossPage | ✅ | Profit & Loss |
| `/reports/balance-sheet` | BalanceSheetPage | ✅ | Balance sheet |
| `/reports/cash-flow` | CashFlowPage | ✅ | Cash flow |
| `/reports/aging` | AgingReportsPage | ✅ | Aging reports |
| `/onboarding/company` | CompanyInfoPage | ✅ | KYC: Company info |
| `/onboarding/directors` | DirectorsPage | ✅ | KYC: Directors |
| `/onboarding/documents` | DocumentsPage | ✅ | KYC: Documents |
| `/onboarding/status` | KycStatusPage | ✅ | KYC: Status |

---

**Document Version**: 1.0
**Generated**: 2026-01-20
**Total Routes**: 34
**Total API Endpoints**: 70+
