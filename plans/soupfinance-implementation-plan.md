# SoupFinance Implementation Plan

**Created**: 2026-01-20
**Status**: ARCHITECTURE REFACTOR COMPLETE - Implementation In Progress
**Version**: 5.0
**Last Updated**: 2026-01-30
**Validated**: 2026-01-30

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

**See [soupfinance-tenant-architecture-refactor.md](soupfinance-tenant-architecture-refactor.md) for full details.**

| Aspect | OLD (Deprecated) | NEW (Implemented) |
|--------|------------------|-------------------|
| Registration | Creates Corporate in TAS tenant | Creates new Tenant/Account |
| Invoice recipients | Corporates | Individual/Corporate Clients via InvoiceClient |
| KYC | Full 4-step onboarding | None (direct to dashboard) |
| Registration endpoint | `/client/register.json` | `/account/register.json` |
| Email confirmation | N/A | `/account/confirmEmail.json` (sets password) |
| Client endpoints | `/rest/client/*` | `/rest/invoiceClient/*` |

**Sections marked [DEPRECATED] below have been replaced.**

---

## Executive Summary

SoupFinance is a corporate accounting/invoicing platform built as a React frontend that integrates with the Soupmarkets Grails backend. It will use the existing finance modules (Invoice, Bill, LedgerAccount, LedgerTransaction).

~~and corporate KYC domains, operating under a new **TechAtScale** multi-tenant account.~~ **[DEPRECATED]**

**NEW**: Each SoupFinance customer gets their own Tenant/Account with isolated data.

### Key Decisions

| Decision | Choice | Rationale | Status |
|----------|--------|-----------|--------|
| Multi-tenancy | ~~TechAtScale shared tenant~~ | ~~Leverages existing infrastructure~~ | **DEPRECATED** |
| Multi-tenancy | Per-customer tenant | Full data isolation | **NEW** |
| User type | ~~Corporate clients only~~ | ~~B2B accounting software~~ | **DEPRECATED** |
| User type | Tenant admin users | Each customer is a tenant | **NEW** |
| Authentication | Spring Security REST + X-Auth-Token | Matches existing admin API pattern | ✅ |
| Client type | ~~ClientContact (client portal)~~ | ~~Corporate users are clients~~ | **DEPRECATED** |
| Client type | SbUser (tenant admin) | Standard user management | **NEW** |
| KYC workflow | ~~Full corporate KYC~~ | ~~Required for B2B compliance~~ | **DEPRECATED** |
| KYC workflow | None for registration | Simple signup | **NEW** |
| API layer | Admin API (`/rest/*`) | Uses existing finance controller endpoints | ✅ |

---

## Current Implementation Status (2026-01-20)

### Completed Features

| Phase | Feature | Status | Files |
|-------|---------|--------|-------|
| **1. Foundation** | TechAtScale tenant | ✅ Done | TenantInitializationService.groovy |
| | Registration API | ✅ Done | registration.ts |
| | 2FA Login flow | ✅ Done | auth.ts, LoginPage.tsx |
| | authStore | ✅ Done | authStore.ts |
| | RegistrationPage | ✅ Done | RegistrationPage.tsx |
| **2. Corporate KYC** [DEPRECATED] | CompanyInfoPage | ~~✅ Done~~ | ~~CompanyInfoPage.tsx~~ |
| | DirectorsPage | ~~✅ Done~~ | ~~DirectorsPage.tsx~~ |
| | DocumentsPage | ~~✅ Done~~ | ~~DocumentsPage.tsx~~ |
| | KycStatusPage | ~~✅ Done~~ | ~~KycStatusPage.tsx~~ |
| | Corporate API | ~~✅ Done~~ | ~~corporate.ts~~ |
| **2. Clients (NEW)** | ClientListPage | 🔄 Pending | features/clients/ClientListPage.tsx |
| | ClientFormPage | 🔄 Pending | features/clients/ClientFormPage.tsx |
| | Client API | 🔄 Pending | api/endpoints/clients.ts |
| **3. Finance Core** | InvoiceListPage | ✅ Done | InvoiceListPage.tsx |
| | InvoiceFormPage | ✅ Done | InvoiceFormPage.tsx |
| | InvoiceDetailPage | ✅ Done | InvoiceDetailPage.tsx |
| | BillListPage | ✅ Done | BillListPage.tsx |
| | BillFormPage | ✅ Done | BillFormPage.tsx |
| | BillDetailPage | ✅ Done | BillDetailPage.tsx |
| | PaymentListPage | ✅ Done | PaymentListPage.tsx |
| | PaymentFormPage | ✅ Done | PaymentFormPage.tsx |
| **4. Ledger** | ChartOfAccountsPage | ✅ Done | ChartOfAccountsPage.tsx |
| | LedgerTransactionsPage | ✅ Done | LedgerTransactionsPage.tsx |
| **5. Accounting** | JournalEntryPage | ✅ Done | JournalEntryPage.tsx |
| | VoucherFormPage | ✅ Done | VoucherFormPage.tsx |
| | TransactionRegisterPage | ✅ Done | TransactionRegisterPage.tsx |
| **6. Reports** | TrialBalancePage | ✅ Done | TrialBalancePage.tsx |
| | BalanceSheetPage | ✅ Done | BalanceSheetPage.tsx |
| | ProfitLossPage | ✅ Done | ProfitLossPage.tsx |
| | CashFlowPage | ✅ Done | CashFlowPage.tsx |
| | AgingReportsPage | ✅ Done | AgingReportsPage.tsx |
| | ReportsPage (hub) | ✅ Done | ReportsPage.tsx |
| **7. Dashboard** | DashboardPage | ✅ Done | DashboardPage.tsx |
| **8. Vendors** | VendorListPage | ✅ Done | VendorListPage.tsx |
| | VendorFormPage | ✅ Done | VendorFormPage.tsx |

### Test Coverage

| Test Type | Count | Status |
|-----------|-------|--------|
| Unit Tests (Vitest) | 258 | ✅ All passing |
| Integration Tests | 93 | ✅ All passing |
| E2E Tests (Playwright) | ~190 | ✅ All implemented |
| Storybook Stories | 14 | ✅ Compiled |

**E2E Test Breakdown:**
- auth.spec.ts - Authentication tests
- dashboard.spec.ts - Dashboard tests
- invoices.spec.ts - Invoice CRUD tests
- bills.spec.ts - Bill CRUD tests (47 tests)
- onboarding.spec.ts - Corporate KYC flow tests (35 tests)
- registration.spec.ts - Registration tests
- reports.spec.ts - Financial reports tests (49 tests)

### Remaining Work (Future Enhancements)

| Task | Priority | Status |
|------|----------|--------|
| VendorListPage/VendorFormPage | P1 | ✅ Done |
| E2E: Onboarding flow tests | P2 | ✅ Done |
| E2E: Reports tests | P2 | ✅ Done |
| E2E: Bills tests | P2 | ✅ Done |
| Mobile responsive refinement | P3 | 🔄 Future |
| Dark mode polish | P3 | 🔄 Future |
| Backend integration testing | P2 | 🔄 Requires backend |

---

## 1. Backend Setup: TechAtScale Tenant

### 1.1 Create TechAtScale Account

The backend needs a new tenant account for SoupFinance users.

**Location**: `soupmarkets-web` database

```sql
-- Create TechAtScale tenant (run via Grails Bootstrap or migration)
INSERT INTO account (
    id, version, name, code, enabled, date_created, last_updated
) VALUES (
    'techatscale-uuid-here',  -- Generate UUID
    0,
    'TechAtScale',
    'TAS',
    true,
    NOW(),
    NOW()
);
```

### 1.2 Tenant Configuration

| Setting | Value | Purpose |
|---------|-------|---------|
| `name` | TechAtScale | Display name |
| `code` | TAS | Short code for URLs |
| `enabled` | true | Active tenant |
| `allowClientRegistration` | true | Enable self-signup |
| `requireCorporateKYC` | true | Only corporate clients |

### 1.3 Default Chart of Accounts

Create default ledger accounts for TechAtScale:

```
ASSETS (DEBIT balance)
├── Current Assets
│   ├── Cash and Bank Accounts
│   ├── Accounts Receivable
│   └── Prepaid Expenses
├── Fixed Assets
│   ├── Equipment
│   └── Accumulated Depreciation

LIABILITIES (CREDIT balance)
├── Current Liabilities
│   ├── Accounts Payable
│   ├── Accrued Expenses
│   └── Taxes Payable
├── Long-term Liabilities
    └── Loans Payable

EQUITY (CREDIT balance)
├── Owner's Equity
├── Retained Earnings
├── INCOME (CREDIT sub-group)
│   ├── Sales Revenue
│   ├── Service Revenue
│   └── Other Income
├── EXPENSE (DEBIT sub-group)
    ├── Cost of Goods Sold
    ├── Operating Expenses
    ├── Salaries & Wages
    └── Utilities
```

---

## 2. Authentication Flow

### 2.1 Corporate Registration (Self-Signup)

**Flow**: `RegistrationPage → API → ClientContact + Corporate created`

```
User visits /register
    ↓
Enter company details (name, registration number, email, phone)
    ↓
POST /rest/client/register.json
    type: "CORPORATE"
    phoneNumber or email (required)
    ↓
Backend creates:
    1. Client record (base)
    2. Corporate record (company details)
    3. ClientContact (login user)
    ↓
Send verification email/SMS
    ↓
User verifies → Redirect to /login
```

### 2.2 Login Flow (2FA)

**Flow**: `LoginPage → 2FA → Dashboard`

```
User visits /login
    ↓
Enter email or phone
    ↓
POST /rest/client/authenticate.json
    contact: "email@company.com"
    ↓
Backend sends 5-digit OTP via SMS/Email
    ↓
User enters OTP code
    ↓
POST /rest/client/verifyCode.json
    code: "12345"
    ↓
Backend returns:
    - access_token (Bearer token)
    - user profile
    - tenant context (TechAtScale)
    ↓
Store token in localStorage
Redirect to /dashboard
```

### 2.3 Token Management

```typescript
// src/api/client.ts pattern
const apiClient = axios.create({
  baseURL: '/rest',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
});

// Attach X-Auth-Token to all requests (NOT Bearer - Spring Security REST pattern)
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers['X-Auth-Token'] = token;
  }
  return config;
});
```

**Token Format**: Plain UUID string (e.g., `550e8400-e29b-41d4-a716-446655440000`)
**Storage**: `localStorage.setItem('access_token', token)`
**Backend Storage**: `AuthenticationToken` domain (username → token mapping)

---

## 3. Feature-to-API Mapping

### 3.1 Corporate KYC (Onboarding)

| SoupFinance Page | API Endpoints | Domain |
|------------------|---------------|--------|
| `/register` | `POST /rest/client/register.json` | Client, Corporate |
| `/onboarding/company` | `PUT /rest/corporate/update/{id}.json` | Corporate |
| `/onboarding/directors` | `POST/PUT/DELETE /rest/corporateAccountPerson/*` | CorporateAccountPerson |
| `/onboarding/documents` | `POST /rest/corporateDocuments/save.json` (multipart) | CorporateDocuments |
| `/onboarding/status` | `GET /rest/corporate/show/{id}.json` | Corporate.client.state |

### 3.2 Invoices (Accounts Receivable)

| SoupFinance Page | API Endpoints | Domain |
|------------------|---------------|--------|
| `/invoices` | `GET /rest/invoice/index.json` | Invoice |
| `/invoices/new` | `POST /rest/invoice/save.json` | Invoice |
| `/invoices/:id` | `GET /rest/invoice/show/{id}.json` | Invoice |
| `/invoices/:id/edit` | `PUT /rest/invoice/update/{id}.json` | Invoice |
| (line items) | `POST/PUT/DELETE /rest/invoiceItem/*` | InvoiceItem |
| (payments) | `POST /rest/invoicePayment/save.json` | InvoicePayment |

### 3.3 Bills (Accounts Payable)

| SoupFinance Page | API Endpoints | Domain |
|------------------|---------------|--------|
| `/bills` | `GET /rest/bill/index.json` | Bill |
| `/bills/new` | `POST /rest/bill/save.json` | Bill |
| `/bills/:id` | `GET /rest/bill/show/{id}.json` | Bill |
| `/bills/:id/edit` | `PUT /rest/bill/update/{id}.json` | Bill |
| (line items) | `POST/PUT/DELETE /rest/billItem/*` | BillItem |
| (payments) | `POST /rest/billPayment/save.json` | BillPayment |

### 3.4 Payments/Vouchers

| SoupFinance Page | API Endpoints | Domain |
|------------------|---------------|--------|
| `/payments` | `GET /rest/voucher/index.json` | Voucher |
| `/payments/new` | `POST /rest/voucher/save.json` | Voucher |

### 3.5 Ledger (Chart of Accounts)

| SoupFinance Page | API Endpoints | Domain |
|------------------|---------------|--------|
| `/ledger/accounts` | `GET /rest/ledgerAccount/index.json` | LedgerAccount |
| (create account) | `POST /rest/ledgerAccount/save.json` | LedgerAccount |
| `/ledger/transactions` | `GET /rest/ledgerTransaction/index.json` | LedgerTransaction |
| (journal entry) | `POST /rest/ledgerTransaction/saveMultiple.json` | LedgerTransaction |

### 3.6 Reports

| SoupFinance Page | API Endpoints | Notes |
|------------------|---------------|-------|
| `/reports/pnl` | `GET /rest/financeReports/accountTransactions.json` | Filter by INCOME/EXPENSE |
| `/reports/balance-sheet` | `GET /rest/financeReports/accountBalances.json` | Filter by ASSET/LIABILITY/EQUITY |
| `/reports/cash-flow` | `GET /rest/ledgerAccount/balance/{id}.json` | cashFlow=true accounts |
| `/reports/aging` | `GET /rest/invoice/index.json` + aging fields | Client-side aging calculation |

---

## 4. Implementation Phases

### Phase 1: Foundation (Week 1-2)

**Goal**: Authentication and basic navigation working

| Task | Files | Priority |
|------|-------|----------|
| 1.1 Create TechAtScale tenant in backend | Migration script | P0 |
| 1.2 Implement client registration API | `api/endpoints/registration.ts` | P0 |
| 1.3 Implement 2FA login flow | `api/auth.ts`, `LoginPage.tsx` | P0 |
| 1.4 Update authStore for ClientContact | `stores/authStore.ts` | P0 |
| 1.5 Create RegistrationPage component | `features/auth/RegistrationPage.tsx` | P0 |

### Phase 2: Corporate KYC (Week 2-3)

**Goal**: Complete corporate onboarding flow

| Task | Files | Priority |
|------|-------|----------|
| 2.1 Company info page | `features/corporate/CompanyInfoPage.tsx` | P0 |
| 2.2 Directors management | `features/corporate/DirectorsPage.tsx` | P0 |
| 2.3 Document upload | `features/corporate/DocumentsPage.tsx` | P0 |
| 2.4 KYC status/approval | `features/corporate/KycStatusPage.tsx` | P1 |
| 2.5 Corporate API endpoints | `api/endpoints/corporate.ts` | P0 |

### Phase 3: Finance Core (Week 3-5)

**Goal**: Invoice and Bill CRUD fully working

| Task | Files | Priority |
|------|-------|----------|
| 3.1 Invoice list page | `features/invoices/InvoiceListPage.tsx` | P0 |
| 3.2 Invoice form (create/edit) | `features/invoices/InvoiceFormPage.tsx` | P0 |
| 3.3 Invoice detail + payments | `features/invoices/InvoiceDetailPage.tsx` | P0 |
| 3.4 Bill list page | `features/bills/BillListPage.tsx` | P0 |
| 3.5 Bill form (create/edit) | `features/bills/BillFormPage.tsx` | P0 |
| 3.6 Bill detail + payments | `features/bills/BillDetailPage.tsx` | P0 |
| 3.7 Payment recording modal | `components/modals/RecordPaymentModal.tsx` | P1 |

### Phase 4: Ledger & Reports (Week 5-6)

**Goal**: Chart of accounts and financial reports

| Task | Files | Priority |
|------|-------|----------|
| 4.1 Chart of accounts page | `features/ledger/ChartOfAccountsPage.tsx` | P0 |
| 4.2 Ledger transactions page | `features/ledger/LedgerTransactionsPage.tsx` | P0 |
| 4.3 Journal entry form | `features/ledger/JournalEntryForm.tsx` | P1 |
| 4.4 P&L report | `features/reports/ProfitLossPage.tsx` | P0 |
| 4.5 Balance sheet report | `features/reports/BalanceSheetPage.tsx` | P0 |
| 4.6 Cash flow report | `features/reports/CashFlowPage.tsx` | P1 |
| 4.7 Aging reports (AR/AP) | `features/reports/AgingReportsPage.tsx` | P1 |

### Phase 5: Dashboard & Polish (Week 6-7)

**Goal**: Dashboard with KPIs and UI polish

| Task | Files | Priority |
|------|-------|----------|
| 5.1 Dashboard with stats | `features/dashboard/DashboardPage.tsx` | P0 |
| 5.2 Recent invoices widget | `features/dashboard/RecentInvoices.tsx` | P1 |
| 5.3 Cash flow chart | `features/dashboard/CashFlowChart.tsx` | P1 |
| 5.4 Overdue alerts | `features/dashboard/OverdueAlerts.tsx` | P1 |
| 5.5 Dark mode refinement | `index.css`, all components | P2 |
| 5.6 Mobile responsive | All layout components | P1 |

---

## 5. API Implementation Details

### 5.1 Registration Endpoint (New)

```typescript
// src/api/endpoints/registration.ts

export interface CorporateRegistration {
  // Contact (required)
  phoneNumber?: string;
  email?: string;

  // Company info
  companyName: string;
  registrationNumber?: string;
  taxIdentificationNumber?: string;
  countryOfIncorporation: string;

  // Contact person
  contactFirstName: string;
  contactLastName: string;
  contactPosition: string;
}

export async function registerCorporate(data: CorporateRegistration) {
  const formData = toFormData({
    type: 'CORPORATE',
    'corporate.name': data.companyName,
    'corporate.certificateOfIncorporationNumber': data.registrationNumber,
    'corporate.taxIdentificationNumber': data.taxIdentificationNumber,
    'corporate.countryOfIncorporation': data.countryOfIncorporation,
    phoneNumber: data.phoneNumber,
    email: data.email,
    firstName: data.contactFirstName,
    lastName: data.contactLastName,
    designation: data.contactPosition,
  });

  return apiClient.post('/client/register.json', formData);
}
```

### 5.2 2FA Authentication

```typescript
// src/api/auth.ts - Updated for 2FA

export async function requestOTP(contact: string) {
  // Step 1: Request OTP
  return apiClient.post('/client/authenticate.json', toFormData({ contact }));
}

export async function verifyOTP(code: string) {
  // Step 2: Verify OTP and get token
  const response = await apiClient.post('/client/verifyCode.json', toFormData({ code }));

  if (response.data.access_token) {
    localStorage.setItem('access_token', response.data.access_token);
    localStorage.setItem('user', JSON.stringify(response.data.user));
  }

  return response.data;
}
```

### 5.3 Invoice API Updates

```typescript
// src/api/endpoints/invoices.ts - Add missing methods

export interface InvoiceFilters {
  status?: 'PENDING' | 'PARTIAL' | 'PAID';
  from?: string;
  to?: string;
  search?: string;
  max?: number;
  offset?: number;
}

export async function getInvoices(filters: InvoiceFilters = {}) {
  const params = toQueryString(filters);
  return apiClient.get(`/invoice/index.json?${params}`);
}

export async function getInvoice(id: string) {
  return apiClient.get(`/invoice/show/${id}.json`);
}

export async function createInvoice(data: InvoiceCreateDTO) {
  return apiClient.post('/invoice/save.json', toFormData(data));
}

export async function recordPayment(invoiceId: string, payment: PaymentDTO) {
  return apiClient.post('/invoicePayment/save.json', toFormData({
    'invoice.id': invoiceId,
    ...payment
  }));
}
```

### 5.4 Finance Reports API (New)

```typescript
// src/api/endpoints/reports.ts

export interface ReportFilters {
  from: string;  // ISO date
  to: string;    // ISO date
  ledgerAccount?: string;  // Optional account ID filter
}

export async function getAccountBalances(filters: ReportFilters) {
  const params = toQueryString(filters);
  return apiClient.get(`/financeReports/accountBalances.json?${params}`);
}

export async function getAccountTransactions(filters: ReportFilters) {
  const params = toQueryString(filters);
  return apiClient.get(`/financeReports/accountTransactions.json?${params}`);
}

// Export to PDF/Excel
export async function exportReport(
  reportType: 'accountBalances' | 'accountTransactions',
  filters: ReportFilters,
  format: 'pdf' | 'xlsx' | 'csv'
) {
  const params = toQueryString({ ...filters, f: format });
  return apiClient.get(`/financeReports/${reportType}.json?${params}`, {
    responseType: 'blob'
  });
}
```

---

## 6. TypeScript Types

### 6.1 Domain Types

```typescript
// src/types/index.ts

// Enums matching backend
export type PaymentStatus = 'PENDING' | 'PROCESSING' | 'PARTIAL' | 'PAID' | 'FAILED' | 'EXPIRED';
export type ApprovalState = 'PENDING' | 'CHECKED' | 'APPROVED' | 'COMPLIANCE' | 'EXECUTIVE' | 'REJECTED';
export type LedgerGroup = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';
export type LedgerState = 'DEBIT' | 'CREDIT';

// Corporate
export interface Corporate {
  id: string;
  name: string;
  businessCategory?: string;
  certificateOfIncorporationNumber?: string;
  taxIdentificationNumber?: string;
  countryOfIncorporation?: string;
  registrationDate?: string;
  natureOfBusiness?: string;
  industry?: string;
  annualTurnOver?: string;
  client: Client;
  signatoriesAndDirectorsList?: CorporateAccountPerson[];
}

export interface Client {
  id: string;
  state: ApprovalState;
  email?: string;
  phoneNumber?: string;
  investmentFundAccount?: LedgerAccount;
}

export interface CorporateAccountPerson {
  id: string;
  firstName: string;
  lastName: string;
  designation: string;
  email?: string;
  phoneNumber?: string;
  isSignatory: boolean;
  isDirector: boolean;
}

// Finance
export interface Invoice {
  id: string;
  number: number;
  numberPrefix: string;
  invoiceNumber: string;  // Computed: prefix + number
  invoiceDate: string;
  paymentDate: string;
  status: PaymentStatus;
  currency: Currency;
  exchangeRate: number;
  subTotal: number;
  total: number;
  paidAmount: number;
  amountDue: number;
  notes?: string;
  accountServices?: AccountServices;
  client?: Client;
  invoiceItemList: InvoiceItem[];
  invoicePaymentList: InvoicePayment[];
}

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  taxAmount: number;
  totalAmount: number;
  priority: number;
}

export interface InvoicePayment {
  id: string;
  amount: number;
  paymentDate: string;
  reference?: string;
  paymentMethod?: string;
}

export interface Bill {
  id: string;
  number: number;
  numberPrefix: string;
  billNumber: string;
  billDate: string;
  paymentDate: string;
  status: PaymentStatus;
  currency: Currency;
  vendor: Vendor;
  subTotal: number;
  total: number;
  paidAmount: number;
  amountDue: number;
  billItemList: BillItem[];
  billPaymentList: BillPayment[];
}

export interface Vendor {
  id: string;
  name: string;
  symbol?: string;
  vendorType: string;
  ledgerAccount?: LedgerAccount;
}

export interface LedgerAccount {
  id: string;
  name: string;
  number?: string;
  description?: string;
  ledgerAccountCategory: LedgerAccountCategory;
  parentAccount?: LedgerAccount;
  currency: Currency;
  calculatedBalance?: number;
  systemAccount: boolean;
}

export interface LedgerAccountCategory {
  id: string;
  name: string;
  ledgerGroup: LedgerGroup;
  ledgerSubGroup?: string;
}

export interface LedgerTransaction {
  id: string;
  transactionDate: string;
  amount: number;
  currency: Currency;
  description?: string;
  transactionState: LedgerState;
  ledgerAccount?: LedgerAccount;
  debitLedgerAccount?: LedgerAccount;
  creditLedgerAccount?: LedgerAccount;
  status: ApprovalState;
  relatedToId?: string;
  relatedToClass?: string;
}
```

---

## 7. Testing Strategy

### 7.1 Unit Tests (Vitest)

**Location**: `src/**/__tests__/*.test.ts`

| Category | Files | Coverage Target |
|----------|-------|-----------------|
| Stores | `authStore.test.ts`, `uiStore.test.ts` | 90% |
| API modules | `client.test.ts`, `invoices.test.ts` | 80% |
| Utilities | `toFormData.test.ts`, `formatters.test.ts` | 90% |
| Components | Form components, feedback components | 70% |

**Run**: `npm run test` (watch) or `npm run test:run` (CI)

### 7.2 Integration Tests

**Location**: `src/**/__tests__/*.integration.test.ts`

Test API endpoints against a running backend:

| Test Suite | Endpoints Tested |
|------------|------------------|
| Auth integration | `/client/register`, `/client/authenticate`, `/client/verifyCode` |
| Invoice integration | `/invoice/save`, `/invoice/show`, `/invoiceItem/*` |
| Bill integration | `/bill/save`, `/bill/show`, `/billItem/*` |
| Ledger integration | `/ledgerAccount/*`, `/ledgerTransaction/*` |

**Run**: `npm run test:integration` (requires backend on port 9090)

### 7.3 E2E Tests (Playwright)

**Location**: `e2e/*.spec.ts`

| Test Suite | Flows Covered |
|------------|---------------|
| `auth.spec.ts` | Registration, 2FA login, logout |
| `onboarding.spec.ts` | Company info, directors, documents upload |
| `invoices.spec.ts` | Create, edit, view, record payment |
| `bills.spec.ts` | Create, edit, view, record payment |
| `reports.spec.ts` | P&L, Balance Sheet, export to PDF |

**Run**: `npx playwright test`

### 7.4 Storybook Tests

**Location**: `src/**/*.stories.tsx`

All form and feedback components have Storybook stories:

| Component Category | Stories |
|-------------------|---------|
| Forms | Input, Select, Textarea, Checkbox, Radio, DatePicker |
| Feedback | AlertBanner, Spinner, Toast, Tooltip |
| Layout | SideNav, TopNav, MainLayout |
| Data Display | InvoiceTable, BillTable, LedgerTable |
| Modals | ConfirmDelete, RecordPayment, ExportOptions |

**Run**: `npm run storybook`

---

## 8. Validation Checklist

### 8.1 Authentication

- [ ] Corporate registration creates Client + Corporate + ClientContact
- [ ] OTP sent via SMS/Email
- [ ] OTP verification returns Bearer token
- [ ] Token attached to all API requests
- [ ] 401 redirects to login

### 8.2 Corporate KYC

- [ ] Company info saved correctly
- [ ] Directors can be added/edited/removed
- [ ] Documents upload works (multipart/form-data)
- [ ] KYC status reflects approval workflow

### 8.3 Invoices

- [ ] List shows all invoices with correct status badges
- [ ] Create invoice with line items
- [ ] Edit invoice updates correctly
- [ ] Record payment updates status
- [ ] PDF preview works

### 8.4 Bills

- [ ] List shows all bills with correct status badges
- [ ] Create bill with vendor and line items
- [ ] Edit bill updates correctly
- [ ] Record payment updates status

### 8.5 Ledger

- [ ] Chart of accounts shows hierarchy
- [ ] Account balances display correctly
- [ ] Journal entry creates balanced transaction
- [ ] Transactions list filters work

### 8.6 Reports

- [ ] P&L shows income - expenses = net
- [ ] Balance sheet balances (assets = liabilities + equity)
- [ ] Aging report shows correct buckets
- [ ] Export to PDF/Excel works

---

## 9. Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Backend API changes | Low | High | Pin to specific API version, integration tests |
| 2FA delivery failures | Medium | High | Fallback to email, retry mechanism |
| Multi-tenant data leakage | Low | Critical | Test tenant isolation, code review |
| Performance with large datasets | Medium | Medium | Pagination, virtual scrolling, caching |
| Mobile responsiveness issues | Medium | Medium | Mobile-first design, responsive testing |

---

## 10. Files to Create/Modify

### New Files

| Path | Purpose |
|------|---------|
| `src/api/endpoints/registration.ts` | Corporate registration API |
| `src/api/endpoints/reports.ts` | Finance reports API |
| `src/features/auth/RegistrationPage.tsx` | Corporate signup form |
| `src/components/modals/RecordPaymentModal.tsx` | Payment recording modal |
| `src/components/modals/ExportOptionsModal.tsx` | Export format selection |
| `e2e/auth.spec.ts` | E2E auth tests |
| `e2e/invoices.spec.ts` | E2E invoice tests |

### Modified Files

| Path | Changes |
|------|---------|
| `src/api/auth.ts` | Add 2FA flow (requestOTP, verifyOTP) |
| `src/stores/authStore.ts` | Update for ClientContact instead of Agent |
| `src/App.tsx` | Already has routes, may need adjustments |
| `src/components/layout/SideNav.tsx` | Match design mockups |

---

## 11. Design Mockup Mapping

| Page | Design Mockup | Implementation Status |
|------|---------------|----------------------|
| Login | `login-authentication/` | Partial |
| Registration | (create new based on login) | Not started |
| Dashboard | `financial-overview-dashboard/` | Partial |
| Invoices List | `invoice-management/` | Partial |
| Invoice Form | `new-invoice-form/` | Partial |
| Invoice Detail | `invoice-draft-preview/` | Not started |
| Bills List | (similar to invoices) | Partial |
| Bill Form | (similar to invoice form) | Partial |
| Payments | `payment-entry-form/`, `payment-history-report/` | Not started |
| Chart of Accounts | `general-ledger-entries/` | Partial |
| P&L Report | `report-pnl-*` (6 variants) | Not started |
| Balance Sheet | `balance-sheet-report/` | Not started |
| A/R Aging | `ar-aging-report/` | Not started |
| A/P Aging | `ap-aging-report/` | Not started |
| Onboarding | `form-*` components | Partial |

---

## Appendix A: Backend Dependencies

**Soupmarkets Version**: Grails 6.2.3
**Required Modules**: `finance`, `kyc`, `security`
**Database**: MariaDB with multi-tenant discriminator

**Backend Startup**:
```bash
cd /home/ddr/Documents/code/soupmarkets/soupmarkets-web
source env-variables.sh
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
./gradlew bootRun  # Port 9090
```

---

## Appendix B: Environment Variables

```bash
# SoupFinance Web (.env or vite environment)
VITE_API_URL=/rest                    # Proxied to backend
VITE_TENANT_CODE=TAS                  # TechAtScale tenant code
VITE_ENABLE_REGISTRATION=true         # Allow self-signup
```

---

## Appendix C: Related Documentation

| Document | Location | Purpose |
|----------|----------|---------|
| Design System | `.claude/rules/soupfinance-design-system.md` | UI patterns and tokens |
| Backend Research | `.claude/research/2026-01-20_soupmarkets-backend-*.md` | API structure details |
| Soupmarkets CLAUDE.md | `../CLAUDE.md` | Ecosystem overview |

---

**Last Updated**: 2026-01-20
**Author**: Claude Code
**Review Status**: Pending
