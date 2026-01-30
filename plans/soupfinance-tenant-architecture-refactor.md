# SoupFinance Tenant Architecture Refactor Plan

**Created**: 2026-01-30
**Updated**: 2026-01-30
**Status**: IN PROGRESS - Backend & Frontend Registration Complete, Client CRUD Pending
**Priority**: CRITICAL

---

## Implementation Progress

| Phase | Status | Notes |
|-------|--------|-------|
| Backend: BusinessLicenceCategory | ✅ Complete | Added TRADING, SERVICES |
| Backend: Registration endpoints | ✅ Complete | `/account/register.json`, `/account/confirmEmail.json` |
| Backend: COA seed data | ✅ Complete | TRADING and SERVICES charts included |
| Frontend: Registration page | ✅ Complete | Business type selector, no password |
| Frontend: Email confirmation page | ✅ Complete | Password setting after email verification |
| Frontend: Registration API | ✅ Complete | Updated endpoints, deprecated old functions |
| Frontend: Client CRUD | 🔄 Pending | New feature needed for invoice recipients |

**Backend Branch**: `feature/soupfinance-tenant-registration` (in soupmarkets-web worktree)

### Frontend Files Modified (2026-01-30)

| File | Description |
|------|-------------|
| `src/api/endpoints/registration.ts` | New tenant registration API, deprecated old functions |
| `src/features/corporate/RegistrationPage.tsx` | Simplified form with business type selector |
| `src/features/auth/ConfirmEmailPage.tsx` | New page for password setting |
| `src/App.tsx` | Added route for `/confirm-email` |

---

## Executive Summary

**ARCHITECTURAL CHANGE**: SoupFinance registration should create **new Tenants** (Accounts) in soupmarkets.com, NOT Corporate entities within a shared TAS tenant.

### Before (INCORRECT - Current Implementation)

```
TAS Tenant (shared)
├── Corporate A (SoupFinance Customer) ─── All data mixed
├── Corporate B (SoupFinance Customer) ─── No isolation
├── Corporate C (SoupFinance Customer) ─── Same database schema
└── (All invoices, bills, ledger mixed together)
```

### After (CORRECT - Target Architecture)

```
SoupFinance Platform (tas.soupmarkets.com)
├── Tenant A (Account) ─── Customer's own tenant
│   ├── Individual Clients (invoice recipients)
│   ├── Corporate Clients (invoice recipients)
│   ├── Invoices (scoped to tenant)
│   ├── Bills (scoped to tenant)
│   └── Ledger (scoped to tenant)
├── Tenant B (Account) ─── Fully isolated
├── Tenant C (Account) ─── Separate data
└── ...
```

---

## Backend Implementation (COMPLETE)

**Branch**: `feature/soupfinance-tenant-registration` (soupmarkets-web worktree)
**Location**: `/home/ddr/Documents/code/soupmarkets/soupmarkets-web-soupfinance-tenant/`

### Files Created/Modified

| File | Description |
|------|-------------|
| `src/main/groovy/soupbroker/BusinessLicenceCategory.groovy` | Added TRADING, SERVICES enums |
| `grails-app/controllers/soupbroker/AccountController.groovy` | Added registration endpoints |
| `grails-app/services/soupbroker/AccountRegistrationService.groovy` | Registration business logic |
| `grails-app/views/accountRegistration/confirmationEmail.gsp` | Email confirmation template |
| `grails-app/views/accountRegistration/welcomeEmail.gsp` | Welcome email template |

### API Endpoints (Implemented)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/account/register.json` | POST | Creates Account + Agent + SbUser (JSON) |
| `/account/confirmEmail.json` | POST | Sets password and enables user |
| `/account/resendConfirmation.json` | POST | Resends confirmation email |
| `/account/confirm` | GET | SSR redirect to frontend with token |

**Note on URL Mappings**: Grails UrlMappings has automatic catch-all routing `"/$controller/$action?/$id?(.$format)?"` so no explicit mapping needed for new controller actions.

### Registration Flow (Implemented)

```
User visits /register (SoupFinance frontend)
    ↓
Enter: Company name, Business type (TRADING/SERVICES), Admin name, Email
(NO password at this step)
    ↓
POST /account/register.json
    ↓
Backend creates:
    1. Account (new tenant) with businessLicenceCategory
    2. SbUser (admin user, DISABLED)
    3. Agent (links user to account)
    4. Default Chart of Accounts (based on businessLicenceCategory)
    ↓
Email confirmation sent with token
    ↓
User clicks link → /confirm-email?token=xxx (SoupFinance frontend)
    ↓
User sets password on confirmation page
    ↓
POST /account/confirmEmail.json with password
    ↓
User enabled + ROLE_ADMIN + ROLE_USER granted
    ↓
Redirect to /login
```

---

## Key Conceptual Changes

| Concept | OLD (Corporate) | NEW (Tenant/Account) |
|---------|-----------------|----------------------|
| **Registration creates** | Corporate entity in TAS tenant | New Tenant/Account with admin user |
| **Data isolation** | None (all data shared) | Full (tenant discriminator) |
| **Invoice recipient** | Selects from all Corporates | Creates own Individual/Corporate Clients |
| **KYC requirement** | Full corporate KYC | None (basic client info for invoicing) |
| **Onboarding flow** | 4 steps: Company, Directors, Docs, Status | None (direct to dashboard) |
| **API endpoint** | `/client/register.json` → Corporate | `/account/register.json` → Tenant |
| **Password** | Required on registration | Set during email confirmation |

---

## Invoice Client Model

### Design: Generic Command Object

Invoice recipients (Clients) use a simplified model with basic information. A command object/DTO handles both Individual and Corporate types generically.

```groovy
// Command Object for Client Creation
class InvoiceClientCommand {
    // Type discrimination
    String clientType  // 'INDIVIDUAL' or 'CORPORATE'

    // Common fields (used for both types)
    String name        // Display name (firstName + lastName for individual, companyName for corporate)
    String email       // Required
    String phone       // Optional
    String address     // Optional

    // Individual-specific (optional)
    String firstName
    String lastName

    // Corporate-specific (optional)
    String companyName
    String contactPerson
    String registrationNumber  // Optional
    String taxNumber           // Optional
}
```

### Service Layer

```groovy
class InvoiceClientService {

    def createClient(InvoiceClientCommand cmd) {
        if (cmd.clientType == 'INDIVIDUAL') {
            return createIndividualClient(cmd)
        } else {
            return createCorporateClient(cmd)
        }
    }

    private Individual createIndividualClient(InvoiceClientCommand cmd) {
        // Create Individual with basic info
        new Individual(
            firstName: cmd.firstName,
            lastName: cmd.lastName,
            // Create Client base record with contact info
        )
    }

    private Corporate createCorporateClient(InvoiceClientCommand cmd) {
        // Create Corporate with basic info
        new Corporate(
            name: cmd.companyName,
            // Create Client base record with contact info
        )
    }
}
```

### TypeScript Types (Frontend)

```typescript
// Generic Client DTO for invoice recipients
export interface InvoiceClient {
  id?: string;
  clientType: 'INDIVIDUAL' | 'CORPORATE';

  // Display name (computed from firstName+lastName or companyName)
  name: string;

  // Common fields
  email: string;
  phone?: string;
  address?: string;

  // Individual-specific
  firstName?: string;
  lastName?: string;

  // Corporate-specific
  companyName?: string;
  contactPerson?: string;
  registrationNumber?: string;
  taxNumber?: string;
}
```

---

## Business Type & Chart of Accounts

### Current BusinessLicenceCategory (Financial Institutions)

```groovy
// src/main/groovy/soupbroker/BusinessLicenceCategory.groovy
enum BusinessLicenceCategory {
    BROKER,         // Retail trade-focused
    ASSET_MANAGER,  // AUM/NAV/fund management-focused
    CUSTODIAN,
    TRUSTEE,
    PRIMARY_DEALER
}
```

### NEW: Add Non-Financial Categories

For SoupFinance (general business accounting), add:

```groovy
enum BusinessLicenceCategory {
    // Financial Institution categories (existing)
    BROKER,
    ASSET_MANAGER,
    CUSTODIAN,
    TRUSTEE,
    PRIMARY_DEALER,

    // Non-Financial Institution categories (NEW for SoupFinance)
    TRADING,    // Trading/retail business - inventory-based
    SERVICES    // Service business - no inventory
}
```

### Chart of Accounts by Business Type

**Based on research from [AccountingCoach](https://www.accountingcoach.com/chart-of-accounts/explanation), [NetSuite](https://www.netsuite.com/portal/resource/articles/accounting/chart-of-accounts.shtml), and [Strategic CFO](https://strategiccfo.com/articles/accounting/standard-chart-of-accounts/):**

#### TRADING Business (Inventory-Based)

```
ASSETS (1000-1999)
├── 1000 Cash and Cash Equivalents
├── 1100 Accounts Receivable
├── 1200 Inventory
│   ├── 1210 Finished Goods
│   ├── 1220 Work in Progress
│   └── 1230 Raw Materials
├── 1300 Prepaid Expenses
├── 1400 Fixed Assets
│   ├── 1410 Equipment
│   ├── 1420 Furniture & Fixtures
│   └── 1450 Accumulated Depreciation
└── 1500 Other Assets

LIABILITIES (2000-2999)
├── 2000 Accounts Payable
├── 2100 Accrued Expenses
├── 2200 Short-term Loans
├── 2300 Taxes Payable
│   ├── 2310 VAT/Sales Tax Payable
│   └── 2320 Income Tax Payable
└── 2400 Long-term Debt

EQUITY (3000-3999)
├── 3000 Owner's Capital / Share Capital
├── 3100 Retained Earnings
└── 3200 Current Year Earnings

REVENUE (4000-4999)
├── 4000 Sales Revenue
├── 4100 Sales Discounts (contra)
├── 4200 Sales Returns (contra)
└── 4900 Other Income

COST OF GOODS SOLD (5000-5499)
├── 5000 Cost of Goods Sold
├── 5100 Purchase Costs
├── 5200 Freight-In
└── 5300 Purchase Discounts (contra)

EXPENSES (5500-5999)
├── 5500 Salaries & Wages
├── 5600 Rent Expense
├── 5700 Utilities
├── 5800 Marketing & Advertising
├── 5850 Insurance
├── 5900 Depreciation Expense
└── 5950 Other Operating Expenses
```

#### SERVICES Business (No Inventory)

```
ASSETS (1000-1999)
├── 1000 Cash and Cash Equivalents
├── 1100 Accounts Receivable
├── 1200 Prepaid Expenses
├── 1300 Fixed Assets
│   ├── 1310 Equipment
│   ├── 1320 Furniture & Fixtures
│   └── 1350 Accumulated Depreciation
└── 1400 Other Assets

LIABILITIES (2000-2999)
├── 2000 Accounts Payable
├── 2100 Accrued Expenses
├── 2200 Unearned Revenue / Deferred Income
├── 2300 Taxes Payable
│   ├── 2310 VAT/Sales Tax Payable
│   └── 2320 Income Tax Payable
└── 2400 Long-term Debt

EQUITY (3000-3999)
├── 3000 Owner's Capital / Share Capital
├── 3100 Retained Earnings
└── 3200 Current Year Earnings

REVENUE (4000-4999)
├── 4000 Service Revenue
├── 4100 Consulting Revenue
├── 4200 Professional Fees
└── 4900 Other Income

EXPENSES (5000-5999)
├── 5000 Salaries & Wages
├── 5100 Professional Development
├── 5200 Rent Expense
├── 5300 Utilities
├── 5400 Marketing & Advertising
├── 5500 Travel & Entertainment
├── 5600 Insurance
├── 5700 Depreciation Expense
├── 5800 Office Supplies
└── 5900 Other Operating Expenses
```

**Note**: No COGS section for Services - labor is an operating expense, not cost of sales.

---

## Registration Flow (Updated)

### Email Confirmation with Password Setting

```
User visits /register
    ↓
Enter: Company name, Admin name, Email
(NO password required at this step)
    ↓
POST /account/register.json
    ↓
Backend creates:
    1. Account (new tenant) with businessLicenceCategory
    2. SbUser (admin user, DISABLED)
    3. Agent (links user to account)
    4. Default Chart of Accounts (based on businessLicenceCategory)
    ↓
Email confirmation sent with link
    ↓
User clicks link → /account/confirm?token=xxx
    ↓
User sets password on confirmation page
    ↓
POST /account/confirmEmail.json with password
    ↓
User enabled + ROLE_ADMIN granted + password set
    ↓
Redirect to /login
    ↓
User logs in → /dashboard (no onboarding needed)
```

---

## Changes Required

### 1. Backend (soupmarkets-web)

| Change | Status | Priority | Notes |
|--------|--------|----------|-------|
| Add TRADING, SERVICES to BusinessLicenceCategory | NOT DONE | P0 | Update enum |
| Create `/account/register.json` JSON endpoint | NOT DONE | P0 | Based on SignUpController pattern |
| Create `/account/confirmEmail.json` endpoint | NOT DONE | P0 | Accept password parameter |
| Create InvoiceClientCommand class | NOT DONE | P1 | Generic command for Individual/Corporate |
| Create InvoiceClientService | NOT DONE | P1 | Creates appropriate entity based on type |
| Create default COA for TRADING | NOT DONE | P1 | Seed data |
| Create default COA for SERVICES | NOT DONE | P1 | Seed data |

### 2. Frontend (soupfinance-web)

| Change | Files Affected | Priority |
|--------|----------------|----------|
| Update RegistrationPage - simpler form, no password | `RegistrationPage.tsx` | P0 |
| Add business type selection (Trading/Services) | `RegistrationPage.tsx` | P0 |
| Create email confirmation page with password | NEW: `ConfirmEmailPage.tsx` | P0 |
| Update registration API wrapper | `api/endpoints/registration.ts` | P0 |
| Add Client CRUD pages | NEW: `features/clients/*` | P1 |
| Update Invoice form - Client dropdown | `InvoiceFormPage.tsx` | P1 |
| REMOVE Corporate KYC onboarding | `features/corporate/*` | P2 |

### 3. Type Definitions (Frontend)

```typescript
// Business type for registration
export type BusinessType = 'TRADING' | 'SERVICES';

// Generic Client for invoicing
export interface InvoiceClient {
  id?: string;
  clientType: 'INDIVIDUAL' | 'CORPORATE';
  name: string;
  email: string;
  phone?: string;
  address?: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  contactPerson?: string;
  registrationNumber?: string;
  taxNumber?: string;
}

// Registration request (no password)
export interface AccountRegistration {
  companyName: string;
  businessType: BusinessType;
  adminFirstName: string;
  adminLastName: string;
  email: string;
}

// Email confirmation request (with password)
export interface EmailConfirmation {
  token: string;
  password: string;
  confirmPassword: string;
}
```

---

## API Endpoints Specification

### POST /account/register.json

Creates new tenant account. No authentication required.

**Request:**
```json
{
  "companyName": "Acme Trading Ltd",
  "businessType": "TRADING",
  "adminFirstName": "John",
  "adminLastName": "Doe",
  "email": "john@acmetrading.com"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Account created. Please check your email to confirm.",
  "account": {
    "id": "uuid",
    "name": "Acme Trading Ltd"
  }
}
```

### POST /account/confirmEmail.json

Confirms email and sets password. No authentication required.

**Request:**
```json
{
  "token": "confirmation-token-from-email",
  "password": "securePassword123",
  "confirmPassword": "securePassword123"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Email confirmed. You can now login.",
  "username": "john@acmetrading.com"
}
```

### POST /rest/invoiceClient/save.json

Creates a new client for invoicing. Requires authentication.

**Request:**
```json
{
  "clientType": "CORPORATE",
  "companyName": "Beta Services Inc",
  "contactPerson": "Jane Smith",
  "email": "billing@betaservices.com",
  "phone": "+1234567890",
  "address": "123 Business St"
}
```

**Response:**
```json
{
  "id": "client-uuid",
  "clientType": "CORPORATE",
  "name": "Beta Services Inc",
  "email": "billing@betaservices.com"
}
```

---

## Implementation Phases

### Phase 1: Backend Account Registration (P0)

1. Add TRADING, SERVICES to BusinessLicenceCategory enum
2. Create `/account/register.json` endpoint
3. Create `/account/confirmEmail.json` endpoint with password handling
4. Create default COA seed data for TRADING and SERVICES

### Phase 2: Frontend Registration (P0)

1. Simplify RegistrationPage (remove password, add business type)
2. Create ConfirmEmailPage (with password input)
3. Update registration API

### Phase 3: Client Management (P1)

1. Backend: Create InvoiceClientCommand + InvoiceClientService
2. Backend: Create `/rest/invoiceClient/*` endpoints
3. Frontend: Create Client CRUD pages
4. Frontend: Update Invoice form to use clients

### Phase 4: Cleanup (P2)

1. Remove deprecated /onboarding/* pages
2. Update tests
3. Update documentation

---

## Timeline Estimate

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| Backend: Registration endpoints | 3-4 hours | `/account/register.json`, `/account/confirmEmail.json` |
| Backend: COA seed data | 2-3 hours | Default accounts for TRADING/SERVICES |
| Frontend: Registration flow | 3-4 hours | Simplified registration + email confirm |
| Backend: Client service | 2-3 hours | InvoiceClientCommand, InvoiceClientService |
| Frontend: Client CRUD | 4-5 hours | /clients pages |
| Frontend: Invoice integration | 2-3 hours | Client dropdown in invoice form |
| Cleanup & testing | 3-4 hours | Remove old pages, update tests |

**Total: ~20-25 hours of work**

---

## Acceptance Criteria

- [ ] User registration creates new Tenant (not Corporate in shared tenant)
- [ ] Password is set during email confirmation (not during registration)
- [ ] Email verification required before login
- [ ] Business type selection (Trading/Services) on registration
- [ ] Default COA created based on business type
- [ ] Invoice recipients are tenant's own Clients (Individual/Corporate)
- [ ] Client creation uses generic command object
- [ ] Basic client info (name, email, phone) sufficient for invoicing
- [ ] No full corporate KYC required for registration
- [ ] Documentation updated

---

## Sources

Chart of Accounts best practices:
- [AccountingCoach - Chart of Accounts Explanation](https://www.accountingcoach.com/chart-of-accounts/explanation)
- [NetSuite - Chart of Accounts Guide](https://www.netsuite.com/portal/resource/articles/accounting/chart-of-accounts.shtml)
- [Strategic CFO - Standard Chart of Accounts](https://strategiccfo.com/articles/accounting/standard-chart-of-accounts/)
- [QuickBooks - Industry-Specific Charts](https://www.firmofthefuture.com/accounting/create-31-industry-specific-charts-of-accounts-in-quickbooks/)

---

**Status**: VALIDATED - Ready for Implementation
