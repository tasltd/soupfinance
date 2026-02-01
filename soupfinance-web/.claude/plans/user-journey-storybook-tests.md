# User Journey E2E Tests & Storybook Tests Plan

**Updated**: 2026-01-30

---

## Architecture Context (CRITICAL)

**SoupFinance follows a Tenant-per-Customer architecture:**

1. **SoupFinance registration creates NEW TENANTS (Accounts)**, not Corporate entities in a shared tenant
2. **Invoice clients are managed via `/rest/invoiceClient/*` endpoints** (NOT `/rest/client/*` which is for investment clients)
3. **Business types**: TRADING (inventory-based, has COGS) and SERVICES (no inventory, labor expenses)
4. **Password is NOT required during registration** - set during email confirmation
5. **Email verification required before login**

**NOTE**: The KYC Onboarding Journey tests (`onboarding.spec.ts`) are DEPRECATED. SoupFinance now uses simplified tenant registration.

---

## Current State Analysis

### E2E Tests (11 files, 63 passing, 1 skipped)
| File | Coverage |
|------|----------|
| auth.spec.ts | Login/logout flows |
| dashboard.spec.ts | Dashboard display |
| invoices.spec.ts | Invoice CRUD |
| bills.spec.ts | Bill CRUD |
| vendors.spec.ts | Vendor CRUD |
| payments.spec.ts | Payment flows |
| ledger.spec.ts | Chart of accounts, transactions |
| accounting.spec.ts | Journal entries, vouchers |
| reports.spec.ts | All financial reports |
| registration.spec.ts | Registration form |
| onboarding.spec.ts | KYC onboarding |

### Storybook Stories (14 files)
| Category | Components |
|----------|------------|
| Layout | SideNav, AuthLayout, TopNav, MainLayout |
| Feedback | AlertBanner, Spinner, Toast, Tooltip |
| Forms | Radio, DatePicker, Checkbox, Select, Textarea, Input |

### Feature Page Components (29 files)
- accounting: JournalEntryPage, TransactionRegisterPage, VoucherFormPage
- auth: LoginPage
- bills: BillDetailPage, BillFormPage, BillListPage
- corporate: CompanyInfoPage, DirectorsPage, DocumentsPage, KycStatusPage, RegistrationPage
- dashboard: DashboardPage
- invoices: InvoiceDetailPage, InvoiceFormPage, InvoiceListPage
- ledger: ChartOfAccountsPage, LedgerTransactionsPage
- payments: PaymentFormPage, PaymentListPage
- reports: AgingReportsPage, BalanceSheetPage, CashFlowPage, ProfitLossPage, ReportsPage, TrialBalancePage
- vendors: VendorDetailPage, VendorFormPage, VendorListPage

---

## Gap Analysis

### Missing User Journey Tests
Current tests are isolated per feature. Missing complete user flows:

1. **Accounts Receivable Journey** - Invoice creation to payment receipt
2. **Accounts Payable Journey** - Bill entry to payment disbursement
3. **Vendor Management Journey** - Full vendor lifecycle
4. **Financial Reporting Journey** - Generate and export reports
5. **KYC Onboarding Journey** - Complete registration flow
6. **Accounting Workflow Journey** - Journal entries and vouchers

### Missing Storybook Stories
1. **LanguageSwitcher** - No story yet
2. **ToastProvider** - Context provider (may not need story)
3. **Feature pages** - Complex pages typically don't have stories

### Missing Storybook Interaction Tests
Current stories are display-only. Need play() functions for:
- Form validation interactions
- Dropdown selections
- Error state triggers

---

## Implementation Plan

### Phase 1: User Journey E2E Tests

#### 1.1 Create user-journeys.spec.ts (Priority: HIGH)
Test complete user flows from login to feature completion.

**Tests to implement:**
```
describe('User Journey: Accounts Receivable')
  - Login → Dashboard → Navigate to Invoices
  - Create new invoice with line items
  - View invoice detail
  - Record payment against invoice
  - Verify dashboard updates

describe('User Journey: Accounts Payable')
  - Login → Navigate to Bills
  - Create new bill with line items
  - View bill detail
  - Record payment for bill
  - Verify ledger updates

describe('User Journey: Vendor Management')
  - Login → Navigate to Vendors
  - Create new vendor
  - Edit vendor details
  - Use vendor in bill creation
  - Delete vendor (cleanup)

describe('User Journey: Financial Reporting')
  - Login → Navigate to Reports
  - View Profit & Loss
  - View Balance Sheet
  - View Cash Flow
  - View Trial Balance
  - View Aging Reports
  - Export reports (verify buttons)

describe('User Journey: Tenant Registration') [UPDATED - replaces KYC Onboarding]
  - Start at registration page
  - Enter company name and business type (TRADING/SERVICES)
  - Enter admin name and email
  - Submit registration (no password required)
  - Receive confirmation email
  - Click email link, set password
  - Login with new credentials
  - Verify dashboard access

describe('User Journey: Accounting Workflow')
  - Login → Navigate to Transaction Register
  - Create journal entry
  - Create payment voucher
  - Create receipt voucher
  - Verify entries appear in register
```

#### 1.2 Create cross-module-integration.spec.ts (Priority: MEDIUM)
Test data consistency across modules.

**Tests to implement:**
```
describe('Cross-Module: Invoice to Ledger')
  - Create invoice
  - Verify ledger transaction created
  - Verify accounts receivable updated

describe('Cross-Module: Bill to Ledger')
  - Create bill
  - Verify ledger transaction created
  - Verify accounts payable updated

describe('Cross-Module: Payment to Reports')
  - Record payment
  - Verify cash flow report reflects payment
  - Verify aging reports update
```

### Phase 2: Storybook Enhancements

#### 2.1 Add Missing Stories (Priority: MEDIUM)
```
src/components/layout/LanguageSwitcher.stories.tsx
  - Default state (English)
  - All languages displayed
  - Selection interaction
```

#### 2.2 Add Interaction Tests to Existing Stories (Priority: HIGH)
Add play() functions to test component behavior:

```
Input.stories.tsx
  - play: Focus, type, validate

Select.stories.tsx
  - play: Open dropdown, select option, verify selection

Checkbox.stories.tsx
  - play: Click to toggle, verify state

Radio.stories.tsx
  - play: Select options, verify selection

DatePicker.stories.tsx
  - play: Open calendar, select date, verify value

AlertBanner.stories.tsx
  - play: Click dismiss button, verify hidden

Toast.stories.tsx
  - play: Trigger toast, verify appears, auto-dismiss

Tooltip.stories.tsx
  - play: Hover trigger, verify tooltip appears
```

#### 2.3 Add Form Validation Stories (Priority: MEDIUM)
```
Input.stories.tsx
  - WithError: Show validation error state
  - WithHelperText: Show helper text
  - Required: Show required field behavior

Select.stories.tsx
  - WithError: Show validation error
  - Disabled: Show disabled state

All form components:
  - Dark mode variants
  - Mobile/responsive variants
```

---

## Execution Order

| Task | Priority | Est. Tests | Dependencies |
|------|----------|------------|--------------|
| user-journeys.spec.ts | HIGH | 6 test suites | None |
| Storybook interaction tests | HIGH | 8 stories | Storybook setup |
| cross-module-integration.spec.ts | MEDIUM | 3 test suites | user-journeys |
| LanguageSwitcher.stories.tsx | MEDIUM | 1 story | None |
| Form validation stories | LOW | 5 stories | Interaction tests |

---

## Success Criteria

1. **User Journey Tests**
   - All 6 journey tests pass
   - Coverage of login → feature → completion flows
   - Cross-module data consistency verified

2. **Storybook Tests**
   - All 8 existing stories have play() functions
   - LanguageSwitcher story added
   - `npm run storybook` builds without errors
   - `npm run test-storybook` passes (if configured)

3. **Total Test Count Target**
   - Current: 64 E2E tests
   - Target: 80+ E2E tests (16+ new journey tests)
   - Current: 14 Storybook stories
   - Target: 15+ Storybook stories with interactions

---

## Files to Create/Modify

### New Files
1. `e2e/user-journeys.spec.ts`
2. `e2e/cross-module-integration.spec.ts`
3. `src/components/layout/LanguageSwitcher.stories.tsx`

### Files to Modify (Add play() functions)
1. `src/components/forms/Input.stories.tsx`
2. `src/components/forms/Select.stories.tsx`
3. `src/components/forms/Checkbox.stories.tsx`
4. `src/components/forms/Radio.stories.tsx`
5. `src/components/forms/DatePicker.stories.tsx`
6. `src/components/forms/Textarea.stories.tsx`
7. `src/components/feedback/AlertBanner.stories.tsx`
8. `src/components/feedback/Toast.stories.tsx`
9. `src/components/feedback/Tooltip.stories.tsx`
