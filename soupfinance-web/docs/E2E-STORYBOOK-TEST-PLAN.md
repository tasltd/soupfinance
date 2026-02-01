# Comprehensive E2E & Storybook Test Plan

## Executive Summary

This plan outlines the implementation of comprehensive user story E2E tests and Storybook component documentation for SoupFinance.

**Current State:**
- E2E Tests: 190 tests in 7 files (41 currently passing)
- Storybook: 14 component stories

**Target State:**
- E2E Tests: ~280+ tests covering ALL user stories
- Storybook: 40+ component stories with interaction tests

---

## Phase 1: E2E Test Gap Analysis

### Current Coverage (✅ Complete)

| Test File | Routes Covered | Tests | Status |
|-----------|---------------|-------|--------|
| `auth.spec.ts` | /login | 18 | ✅ Pass |
| `bills.spec.ts` | /bills/* | 45 | ✅ Pass |
| `dashboard.spec.ts` | /dashboard | 16 | ✅ Pass |
| `invoices.spec.ts` | /invoices/* | 22 | ✅ Pass |
| `onboarding.spec.ts` | /onboarding/* | 30 | ✅ Pass |
| `registration.spec.ts` | /register | 12 | ✅ Pass |
| `reports.spec.ts` | /reports/* | 47 | ✅ Pass |

### Missing Coverage (❌ To Implement)

| Test File | Routes to Cover | Estimated Tests | Priority |
|-----------|-----------------|-----------------|----------|
| `vendors.spec.ts` | /vendors, /vendors/new, /vendors/:id | ~25 | HIGH |
| `payments.spec.ts` | /payments, /payments/new | ~20 | HIGH |
| `ledger.spec.ts` | /ledger/accounts, /ledger/transactions | ~25 | MEDIUM |
| `accounting.spec.ts` | /accounting/* | ~20 | MEDIUM |

---

## Phase 2: User Story E2E Tests

### 2.1 Registration to Dashboard Flow (End-to-End)

**File:** `e2e/user-journey-registration.spec.ts`

```
User Story: New user can register and access dashboard
Flow: /register → Company Info → Directors → Documents → KYC Status → Dashboard
```

**Test Cases:**
1. Complete corporate registration with valid data
2. Navigate through all onboarding steps
3. Submit documents for KYC
4. View KYC status
5. Access dashboard after approval

### 2.2 Login to Feature Flows

**File:** `e2e/user-journey-authenticated.spec.ts`

```
User Story: Authenticated user can perform all core operations
Flow: /login → Dashboard → [Feature] → Success
```

**Test Cases for each feature:**

#### Invoice Flow
1. Login → Dashboard → Create Invoice → View in List
2. Login → Dashboard → Edit Invoice → Update Line Items
3. Login → Dashboard → View Invoice Detail → Send Invoice
4. Login → Dashboard → Record Payment Against Invoice

#### Bill Flow
1. Login → Dashboard → Create Bill → View in List
2. Login → Dashboard → Edit Bill → Update Details
3. Login → Dashboard → View Bill Detail → Mark as Paid

#### Vendor Flow
1. Login → Dashboard → Create Vendor → View in List
2. Login → Dashboard → Edit Vendor Details
3. Login → Dashboard → View Vendor Detail → See Payment History

#### Payment Flow
1. Login → Dashboard → Record Payment → Apply to Invoice
2. Login → Dashboard → View Payment History
3. Login → Dashboard → Create Payment → Verify in Reports

#### Ledger Flow
1. Login → Dashboard → View Chart of Accounts
2. Login → Dashboard → View Ledger Transactions
3. Login → Dashboard → Filter by Date Range

#### Accounting Flow
1. Login → Dashboard → Create Journal Entry
2. Login → Dashboard → Create Voucher
3. Login → Dashboard → View Transaction Register

#### Reports Flow
1. Login → Dashboard → Generate P&L Report
2. Login → Dashboard → Generate Balance Sheet
3. Login → Dashboard → Generate Cash Flow Statement
4. Login → Dashboard → Generate Aging Report
5. Login → Dashboard → Generate Trial Balance

---

## Phase 3: Vendors E2E Tests

**File:** `e2e/vendors.spec.ts`

### Test Sections

```typescript
test.describe('Vendor Management', () => {
  test.describe('Vendor List Page', () => {
    test('displays list of vendors');
    test('shows loading state while fetching');
    test('shows empty state when no vendors');
    test('search filters vendors by name');
    test('pagination works correctly');
    test('can navigate to create vendor');
  });

  test.describe('Create Vendor', () => {
    test('form validation shows errors for empty fields');
    test('can create vendor with valid data');
    test('navigates to list after successful creation');
    test('shows error toast on API failure');
  });

  test.describe('Edit Vendor', () => {
    test('loads existing vendor data');
    test('can update vendor details');
    test('shows success toast after update');
  });

  test.describe('Vendor Detail', () => {
    test('displays vendor information');
    test('shows payment history');
    test('can edit from detail page');
  });
});
```

---

## Phase 4: Payments E2E Tests

**File:** `e2e/payments.spec.ts`

### Test Sections

```typescript
test.describe('Payment Management', () => {
  test.describe('Payment List Page', () => {
    test('displays list of payments');
    test('shows loading state while fetching');
    test('shows empty state when no payments');
    test('filters by date range');
    test('filters by payment type');
  });

  test.describe('Create Payment', () => {
    test('form loads invoice selection');
    test('calculates amounts correctly');
    test('validates required fields');
    test('can create payment for invoice');
    test('can create payment for bill');
    test('shows success after creation');
  });

  test.describe('Payment Allocation', () => {
    test('shows outstanding invoices');
    test('can allocate to multiple invoices');
    test('updates remaining balance');
  });
});
```

---

## Phase 5: Ledger E2E Tests

**File:** `e2e/ledger.spec.ts`

### Test Sections

```typescript
test.describe('General Ledger', () => {
  test.describe('Chart of Accounts', () => {
    test('displays account hierarchy');
    test('shows asset accounts');
    test('shows liability accounts');
    test('shows equity accounts');
    test('shows revenue accounts');
    test('shows expense accounts');
    test('can expand/collapse sections');
    test('search filters accounts');
  });

  test.describe('Ledger Transactions', () => {
    test('displays transaction list');
    test('shows loading state');
    test('filters by date range');
    test('filters by account');
    test('shows debit and credit columns');
    test('shows running balance');
    test('pagination works correctly');
  });
});
```

---

## Phase 6: Accounting E2E Tests

**File:** `e2e/accounting.spec.ts`

### Test Sections

```typescript
test.describe('Accounting Transactions', () => {
  test.describe('Transaction Register', () => {
    test('displays all transaction types');
    test('filters by transaction type');
    test('filters by date range');
    test('shows status badges');
    test('can navigate to details');
  });

  test.describe('Journal Entry', () => {
    test('form shows debit/credit fields');
    test('validates balanced entries');
    test('can add multiple lines');
    test('can remove line items');
    test('creates entry with valid data');
    test('shows error for unbalanced entry');
  });

  test.describe('Voucher', () => {
    test('form loads with default values');
    test('validates required fields');
    test('can create payment voucher');
    test('can create receipt voucher');
    test('shows voucher number after creation');
  });
});
```

---

## Phase 7: Storybook Component Stories

### Current Stories (✅ Complete)

| Category | Components |
|----------|------------|
| Layout | SideNav, AuthLayout, TopNav, MainLayout |
| Feedback | AlertBanner, Spinner, Toast, Tooltip |
| Forms | Input, Select, Textarea, Checkbox, Radio, DatePicker |

### Missing Stories (❌ To Implement)

| Category | Components | Priority |
|----------|------------|----------|
| Tables | DataTable, InvoiceTable, VendorTable | HIGH |
| Charts | BarChart, LineChart, DonutChart | HIGH |
| Modals | ConfirmModal, FormModal, DetailModal | HIGH |
| Cards | StatCard, SummaryCard, KPICard | MEDIUM |
| States | LoadingState, EmptyState, ErrorState | MEDIUM |
| Navigation | Breadcrumbs, Pagination, TabNav | MEDIUM |
| Buttons | ButtonGroup, IconButton, ActionButton | LOW |

### Storybook Interaction Tests

Add play functions for interactive component testing:

```typescript
// Example: Toast interaction test
export const ToastWithDismiss: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Trigger toast
    await userEvent.click(canvas.getByRole('button', { name: /show toast/i }));

    // Verify toast appears
    await expect(canvas.getByText(/success/i)).toBeInTheDocument();

    // Dismiss toast
    await userEvent.click(canvas.getByRole('button', { name: /close/i }));

    // Verify toast disappears
    await waitFor(() => {
      expect(canvas.queryByText(/success/i)).not.toBeInTheDocument();
    });
  },
};
```

---

## Phase 8: Implementation Order

### Week 1: High Priority E2E Tests

| Day | Task | Files |
|-----|------|-------|
| 1 | Vendors List & Create | `vendors.spec.ts` |
| 2 | Vendors Edit & Detail | `vendors.spec.ts` |
| 3 | Payments List & Create | `payments.spec.ts` |
| 4 | Payments Allocation | `payments.spec.ts` |
| 5 | User Journey: Registration | `user-journey-registration.spec.ts` |

### Week 2: Medium Priority E2E Tests

| Day | Task | Files |
|-----|------|-------|
| 1 | Ledger Chart of Accounts | `ledger.spec.ts` |
| 2 | Ledger Transactions | `ledger.spec.ts` |
| 3 | Accounting Journal Entry | `accounting.spec.ts` |
| 4 | Accounting Vouchers | `accounting.spec.ts` |
| 5 | User Journey: Authenticated | `user-journey-authenticated.spec.ts` |

### Week 3: Storybook Stories

| Day | Task | Components |
|-----|------|------------|
| 1 | DataTable Stories | DataTable, InvoiceTable |
| 2 | Chart Stories | BarChart, LineChart, DonutChart |
| 3 | Modal Stories | ConfirmModal, FormModal |
| 4 | State Stories | LoadingState, EmptyState, ErrorState |
| 5 | Navigation Stories | Breadcrumbs, Pagination, TabNav |

### Week 4: Integration & Interaction Tests

| Day | Task | Details |
|-----|------|---------|
| 1 | Storybook Play Functions | Add interaction tests to all stories |
| 2 | Visual Regression Setup | Configure Chromatic or Percy |
| 3 | Full E2E Suite Run | Run all 280+ tests |
| 4 | Fix Failures | Address any test failures |
| 5 | Documentation | Update CLAUDE.md with test coverage |

---

## Mock Data Requirements

### Vendors Mock Data

```typescript
export const mockVendors = [
  {
    id: 'vendor-001',
    name: 'Office Supplies Co',
    email: 'contact@officesupplies.com',
    phone: '+1-555-0101',
    address: '123 Supply Street, Commerce City',
    taxId: 'TAX-123456',
    status: 'ACTIVE',
  },
  // ... more vendors
];
```

### Payments Mock Data

```typescript
export const mockPayments = [
  {
    id: 'payment-001',
    type: 'RECEIVED',
    amount: 2500.00,
    paymentDate: '2026-01-20',
    reference: 'CHK-12345',
    invoiceId: 'inv-001',
    vendorId: null,
    status: 'COMPLETED',
  },
  // ... more payments
];
```

### Ledger Mock Data

```typescript
export const mockLedgerAccounts = [
  { id: 'acc-001', code: '1000', name: 'Cash', type: 'ASSET', group: 'CURRENT_ASSETS' },
  { id: 'acc-002', code: '1100', name: 'Accounts Receivable', type: 'ASSET', group: 'CURRENT_ASSETS' },
  // ... more accounts
];

export const mockLedgerTransactions = [
  {
    id: 'txn-001',
    date: '2026-01-20',
    description: 'Invoice payment received',
    account: { id: 'acc-001', name: 'Cash' },
    debit: 2500.00,
    credit: 0,
    balance: 12500.00,
  },
  // ... more transactions
];
```

---

## Success Criteria

1. **E2E Coverage**: All routes have at least 3 tests each
2. **User Journeys**: 2 complete end-to-end user flows tested
3. **Storybook**: All reusable components documented
4. **Interaction Tests**: All interactive components have play functions
5. **Pass Rate**: 95%+ tests passing
6. **Documentation**: Test coverage documented in CLAUDE.md

---

## Commands

```bash
# Run all E2E tests
npm run test:e2e

# Run specific E2E file
npx playwright test e2e/vendors.spec.ts

# Run Storybook
npm run storybook

# Build Storybook
npm run build-storybook

# Run Storybook tests (if configured)
npm run test-storybook
```
