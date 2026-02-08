# SoupFinance SPA -- Multi-Invoice Payment Allocation Plan

**Created**: 2026-02-07
**Status**: Ready for implementation (requires backend plan executed first)
**Executor**: Separate Claude session with soupfinance-web context
**Prerequisite**: Backend plan (`soupmarkets-multi-invoice-payment.md`) must be executed FIRST

---

## 1. Goal

Enable SoupFinance SPA users to receive a single lump-sum payment from a client and allocate it across multiple outstanding invoices -- or make a single lump-sum payment to a vendor and allocate it across multiple outstanding bills. This replaces the current single-invoice-single-payment model with a multi-invoice allocation workflow.

### What Changes

| Current State | Target State |
|---------------|-------------|
| PaymentFormPage selects ONE invoice or bill | New allocation form selects MULTIPLE invoices or bills |
| Each InvoicePayment links to exactly one Invoice | PaymentAllocation links one Voucher/Payment to many Invoices |
| No auto-allocation logic | FIFO (oldest due date first) auto-allocation with manual override |
| No receipt voucher integration for payments | Receipt voucher optionally creates allocations against invoices |
| No payment voucher integration for bills | Payment voucher optionally creates allocations against bills |

---

## 2. Accounting Best Practices Summary

Based on research of QuickBooks, Xero, Sage, Tally, and Microsoft Dynamics 365:

### 2.1 Standard Journal Entry Pattern

**Receiving payment against multiple invoices (Accounts Receivable):**
```
Dr: Bank/Cash (ASSET)           $5,000.00
  Cr: Accounts Receivable (ASSET)  $3,000.00  (Invoice #101 - fully paid)
  Cr: Accounts Receivable (ASSET)  $2,000.00  (Invoice #102 - partially paid)
```

**Paying multiple bills (Accounts Payable):**
```
Dr: Accounts Payable (LIABILITY)   $3,000.00  (Bill #201 - fully paid)
Dr: Accounts Payable (LIABILITY)   $1,500.00  (Bill #202 - partially paid)
  Cr: Bank/Cash (ASSET)              $4,500.00
```

### 2.2 Allocation Strategies (Industry Standard)

| Strategy | Description | Used By |
|----------|-------------|---------|
| **FIFO (oldest first)** | Apply payment to invoices sorted by due date ascending | QuickBooks (default), Tally, Sage |
| **Manual selection** | User checks invoices and enters amounts per invoice | All major systems allow this |
| **Pro-rata** | Distribute proportionally based on outstanding balances | Some ERP systems, less common |
| **Specific reference** | Match by reference/PO number | Dynamics 365 batch settlement |

**Recommendation**: Implement FIFO as default with manual override (matches QuickBooks/Tally pattern).

### 2.3 Overpayment Handling

When payment exceeds total outstanding invoices:

| Approach | Description | Recommendation |
|----------|-------------|----------------|
| **Reject** | Block payment if amount > total outstanding | Simplest, implement first |
| **Credit balance** | Record excess as client credit (contra AR) | Phase 2 enhancement |
| **Refund** | Create a payment voucher to refund excess | Phase 3 enhancement |

**Phase 1 recommendation**: Reject overpayments (validate total allocated <= payment amount <= total outstanding).

### 2.4 Partial Payment Handling

When payment is less than total outstanding invoices:

- FIFO: Fully pay oldest invoices first, partially pay the next one, leave remaining unpaid
- Manual: User distributes as they see fit
- Remaining balance stays on the invoice as "amount due"
- Invoice status becomes PARTIAL (not PAID) until fully settled

---

## 3. New Feature: Multi-Invoice Payment Allocation

### 3.1 Feature Overview

Two new pages/flows:

1. **Receive Payment (Receipt Allocation)** -- Client pays against multiple invoices
2. **Make Payment (Payment Allocation)** -- Pay vendor against multiple bills

Both share the same underlying UI pattern: select party, enter amount, allocate to documents.

### 3.2 User Flow: Receive Payment

```
1. User navigates to Payments > Receive Payment
2. Selects a Client (from Client dropdown)
3. System loads all outstanding invoices for that client's AccountServices
4. User enters total payment amount, date, method, reference
5. System auto-allocates via FIFO (oldest due date first)
6. User can manually adjust per-invoice amounts
7. User reviews journal entry preview
8. User clicks "Record Payment"
9. System creates:
   a. One Voucher (type: RECEIPT) for the total amount
   b. Multiple PaymentAllocation records (one per allocated invoice)
   c. Multiple InvoicePayment records (one per allocated invoice, linked to voucher)
   d. Underlying LedgerTransaction(s) for the journal entry
10. Invoices update their status (PAID or PARTIAL)
```

### 3.3 User Flow: Make Payment (Bills)

Same pattern, reversed direction:
- Select Vendor instead of Client
- Load outstanding Bills instead of Invoices
- Voucher type: PAYMENT instead of RECEIPT
- Creates BillPayment records instead of InvoicePayment

---

## 4. UI Components

### 4.1 New Pages

| Page | Route | Description |
|------|-------|-------------|
| `ReceivePaymentPage.tsx` | `/payments/receive` | Multi-invoice receipt allocation |
| `MakePaymentPage.tsx` | `/payments/make` | Multi-bill payment allocation |
| `AllocationDetailPage.tsx` | `/payments/allocation/:id` | View allocation details after creation |

### 4.2 ReceivePaymentPage Layout

```
+-----------------------------------------------------------------------+
| Receive Payment                                              [Cancel] |
| Record a payment received from a client                               |
+-----------------------------------------------------------------------+

+-----------------------------------------------------------------------+
| Payment Details                                                       |
|-----------------------------------------------------------------------|
| Client*           [Client Dropdown - filters by AccountServices]      |
| Payment Date*     [2026-02-07]                                        |
| Payment Method*   [Bank Transfer v]                                   |
| Reference         [CHK-12345]                                         |
| Bank Account*     [1000 - Main Operating Account v]                   |
| Total Amount*     [$_____.__]                                         |
| Notes             [____________________]                              |
+-----------------------------------------------------------------------+

+-----------------------------------------------------------------------+
| Invoice Allocation                                    [Auto-Allocate] |
|-----------------------------------------------------------------------|
| [x] INV-001  | Due: 2026-01-15 | Total: $3,000 | Due: $3,000 | Allocate: [$3,000.00] |
| [x] INV-002  | Due: 2026-01-20 | Total: $2,500 | Due: $2,500 | Allocate: [$2,000.00] |
| [ ] INV-003  | Due: 2026-02-01 | Total: $1,000 | Due: $1,000 | Allocate: [$0.00]     |
|-----------------------------------------------------------------------|
| Total Outstanding: $6,500.00    Total Allocated: $5,000.00            |
| Unallocated: $0.00                                                    |
+-----------------------------------------------------------------------+

+-----------------------------------------------------------------------+
| Journal Entry Preview                                                 |
|-----------------------------------------------------------------------|
| Account                          | Debit      | Credit     |
|----------------------------------|------------|------------|
| 1000 - Main Operating Account    | $5,000.00  |            |
| 1200 - Accounts Receivable       |            | $5,000.00  |
|----------------------------------|------------|------------|
| Total                            | $5,000.00  | $5,000.00  |
+-----------------------------------------------------------------------+

                                        [Save Draft]  [Record Payment]
```

### 4.3 Invoice Selection Grid Component

A reusable `InvoiceAllocationGrid` component:

```tsx
interface InvoiceAllocationGridProps {
  invoices: Invoice[];
  allocations: Map<string, number>;  // invoiceId -> allocated amount
  onAllocationChange: (invoiceId: string, amount: number) => void;
  onAutoAllocate: (strategy: 'FIFO' | 'PRO_RATA') => void;
  totalPayment: number;
  readOnly?: boolean;
}
```

**Grid columns:**
| Column | Width | Description |
|--------|-------|-------------|
| Checkbox | 40px | Select/deselect invoice for allocation |
| Invoice # | 100px | Invoice number (clickable link to invoice detail) |
| Due Date | 120px | Payment due date (paymentDate field) |
| Total Amount | 120px | Invoice total |
| Amount Paid | 120px | Previously paid amount |
| Amount Due | 120px | Outstanding balance |
| Allocate | 140px | Editable input for allocation amount |

**Grid behaviors:**
- Checking a row auto-fills the Allocate field with the lesser of (amount due) or (remaining unallocated)
- Unchecking a row sets Allocate to 0
- Editing Allocate validates: 0 <= amount <= amountDue
- Total Allocated shown in footer, updated live
- Unallocated = totalPayment - totalAllocated (shows warning if > 0)
- Sort by due date ascending by default (FIFO visual order)

### 4.4 Bill Allocation Grid Component

Same component, parameterized for bills:

```tsx
interface BillAllocationGridProps {
  bills: Bill[];
  allocations: Map<string, number>;  // billId -> allocated amount
  onAllocationChange: (billId: string, amount: number) => void;
  onAutoAllocate: (strategy: 'FIFO' | 'PRO_RATA') => void;
  totalPayment: number;
  readOnly?: boolean;
}
```

### 4.5 Auto-Allocation Algorithm (Frontend)

```typescript
/**
 * FIFO allocation: Apply payment to invoices sorted by due date (oldest first).
 * Fully pays each invoice before moving to the next.
 * Returns a Map of invoiceId -> allocated amount.
 */
function allocateFIFO(
  invoices: Invoice[],
  totalPayment: number
): Map<string, number> {
  const allocations = new Map<string, number>();
  let remaining = totalPayment;

  // Sort by due date ascending (oldest first), then by invoice number
  const sorted = [...invoices]
    .filter(inv => (inv.amountDue ?? 0) > 0)
    .sort((a, b) => {
      const dateCompare = (a.paymentDate || '').localeCompare(b.paymentDate || '');
      if (dateCompare !== 0) return dateCompare;
      return (a.number || 0) - (b.number || 0);
    });

  for (const invoice of sorted) {
    if (remaining <= 0) break;
    const due = invoice.amountDue ?? 0;
    const allocate = Math.min(due, remaining);
    allocations.set(invoice.id, allocate);
    remaining -= allocate;
  }

  return allocations;
}

/**
 * Pro-rata allocation: Distribute payment proportionally across all invoices
 * based on their outstanding balances.
 */
function allocateProRata(
  invoices: Invoice[],
  totalPayment: number
): Map<string, number> {
  const allocations = new Map<string, number>();
  const unpaid = invoices.filter(inv => (inv.amountDue ?? 0) > 0);
  const totalDue = unpaid.reduce((sum, inv) => sum + (inv.amountDue ?? 0), 0);

  if (totalDue === 0) return allocations;

  const effectivePayment = Math.min(totalPayment, totalDue);
  let allocated = 0;

  for (let i = 0; i < unpaid.length; i++) {
    const invoice = unpaid[i];
    const due = invoice.amountDue ?? 0;
    const proportion = due / totalDue;

    if (i === unpaid.length - 1) {
      // Last invoice gets remainder to avoid rounding issues
      allocations.set(invoice.id, Math.round((effectivePayment - allocated) * 100) / 100);
    } else {
      const amount = Math.round(effectivePayment * proportion * 100) / 100;
      allocations.set(invoice.id, amount);
      allocated += amount;
    }
  }

  return allocations;
}
```

---

## 5. TypeScript Types

### 5.1 New Types (add to `src/types/index.ts`)

```typescript
// =============================================================================
// Finance Types - Payment Allocation (Multi-Invoice)
// =============================================================================

/**
 * Allocation strategy for distributing payment across invoices/bills.
 * FIFO: Oldest due date first (default, matches QuickBooks behavior)
 * PRO_RATA: Proportional to outstanding balances
 * MANUAL: User specifies exact amounts per document
 */
export type AllocationStrategy = 'FIFO' | 'PRO_RATA' | 'MANUAL';

/**
 * Direction of the allocation: receiving money (RECEIPT) or paying money (PAYMENT).
 */
export type AllocationDirection = 'RECEIPT' | 'PAYMENT';

/**
 * PaymentAllocation - junction entity linking a payment (Voucher) to a
 * specific Invoice or Bill with a partial or full amount.
 *
 * Backend domain: soupbroker.finance.PaymentAllocation
 *
 * One Voucher can have many PaymentAllocations (one per invoice/bill).
 * One Invoice/Bill can have many PaymentAllocations (from different payments).
 * This is the many-to-many resolution table.
 */
export interface PaymentAllocation extends BaseEntity {
  voucher: { id: string; voucherNumber?: string };
  invoice?: { id: string; number?: number };
  bill?: { id: string; billNumber?: string };
  amount: number;
  allocatedDate: string;
  notes?: string;
}

/**
 * PaymentAllocationGroup - groups all allocations for a single payment event.
 *
 * Backend domain: soupbroker.finance.PaymentAllocationGroup
 *
 * Represents the "receive payment" or "make payment" transaction as a whole:
 * the total amount, the strategy used, the party, and the list of per-invoice/bill
 * allocations.
 */
export interface PaymentAllocationGroup extends BaseEntity {
  voucher: { id: string; voucherNumber?: string };
  direction: AllocationDirection;
  strategy: AllocationStrategy;
  totalAmount: number;
  allocatedAmount: number;
  unallocatedAmount: number;
  paymentDate: string;
  paymentMethod: 'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'CARD' | 'OTHER';
  reference?: string;
  notes?: string;

  // Party reference (one of these will be set)
  client?: { id: string; name?: string };
  vendor?: { id: string; name?: string };
  accountServices?: { id: string; serialised?: string };

  // Bank/cash account used
  cashAccount?: { id: string; name?: string; code?: string };

  // Child allocations
  paymentAllocationList: PaymentAllocation[];

  status: 'DRAFT' | 'POSTED' | 'REVERSED';
}

/**
 * Request payload for creating a multi-invoice payment allocation.
 */
export interface CreatePaymentAllocationRequest {
  direction: AllocationDirection;
  strategy: AllocationStrategy;
  totalAmount: number;
  paymentDate: string;
  paymentMethod: 'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'CARD' | 'OTHER';
  reference?: string;
  notes?: string;

  // Party (one required)
  clientId?: string;
  vendorId?: string;
  accountServicesId?: string;

  // Bank/cash account
  cashAccountId: string;

  // Per-document allocations
  allocations: Array<{
    invoiceId?: string;
    billId?: string;
    amount: number;
    notes?: string;
  }>;
}
```

### 5.2 Updated Types

The existing `InvoicePayment` and `BillPayment` types gain an optional `paymentAllocation` back-reference:

```typescript
// Add to InvoicePayment interface:
export interface InvoicePayment extends BaseEntity {
  invoice: { id: string };
  amount: number;
  paymentDate: string;
  paymentMethod: 'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'CARD' | 'OTHER';
  reference?: string;
  notes?: string;
  // Added: Optional back-reference to allocation (null for legacy single payments)
  paymentAllocation?: { id: string };
}

// Add to BillPayment interface:
export interface BillPayment extends BaseEntity {
  bill: { id: string };
  amount: number;
  paymentDate: string;
  paymentMethod: 'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'CARD' | 'OTHER';
  reference?: string;
  notes?: string;
  // Added: Optional back-reference to allocation (null for legacy single payments)
  paymentAllocation?: { id: string };
}
```

---

## 6. API Endpoints

### 6.1 New API Functions (`src/api/endpoints/paymentAllocations.ts`)

```typescript
/**
 * Payment Allocation API endpoints
 * Maps to soupmarkets-web /rest/paymentAllocationGroup/* endpoints
 *
 * These endpoints handle multi-invoice/bill payment allocation.
 * A single API call creates the allocation group, individual allocations,
 * the underlying voucher, and per-invoice/bill payment records atomically.
 */

// List allocation groups (paginated)
export async function listPaymentAllocations(
  params?: ListParams & { direction?: AllocationDirection; status?: string }
): Promise<PaymentAllocationGroup[]>;

// Get single allocation group with all child allocations
export async function getPaymentAllocation(id: string): Promise<PaymentAllocationGroup>;

// Create multi-invoice payment allocation (atomic)
// Backend creates: Voucher + PaymentAllocationGroup + PaymentAllocation[] + InvoicePayment[]/BillPayment[]
export async function createPaymentAllocation(
  data: CreatePaymentAllocationRequest
): Promise<PaymentAllocationGroup>;

// Reverse an entire payment allocation group
// Backend reverses: Voucher + all InvoicePayment/BillPayment records + allocation records
export async function reversePaymentAllocation(id: string): Promise<PaymentAllocationGroup>;

// Get outstanding invoices for a client (filtered by accountServices)
// Used by the ReceivePaymentPage to populate the allocation grid
// NOTE: Backend expects accountServicesId (not clientId) — invoices reference accountServices as FK
export async function getOutstandingInvoicesForClient(
  accountServicesId: string
): Promise<Invoice[]>;

// Get outstanding bills for a vendor
// Used by the MakePaymentPage to populate the allocation grid
export async function getOutstandingBillsForVendor(
  vendorId: string
): Promise<Bill[]>;
```

### 6.2 Existing API Impact

The existing `recordInvoicePayment()` and `recordBillPayment()` functions remain for backward compatibility (single-invoice payments). The new `createPaymentAllocation()` endpoint handles the multi-invoice case.

---

## 7. Component Architecture

### 7.1 New Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `ReceivePaymentPage.tsx` | `src/features/payments/` | Full page for multi-invoice receipt |
| `MakePaymentPage.tsx` | `src/features/payments/` | Full page for multi-bill payment |
| `AllocationDetailPage.tsx` | `src/features/payments/` | View allocation after creation |
| `AllocationGrid.tsx` | `src/features/payments/components/` | Reusable invoice/bill allocation grid |
| `AllocationSummary.tsx` | `src/features/payments/components/` | Summary card (total, allocated, unallocated) |
| `AllocationJournalPreview.tsx` | `src/features/payments/components/` | Journal entry preview table |
| `ClientInvoiceSelector.tsx` | `src/features/payments/components/` | Client dropdown + invoice loading |
| `VendorBillSelector.tsx` | `src/features/payments/components/` | Vendor dropdown + bill loading |

### 7.2 Modified Components

| Component | Change |
|-----------|--------|
| `PaymentFormPage.tsx` | Add link/button to "Allocate to Multiple Invoices" |
| `PaymentListPage.tsx` | Show allocation groups alongside individual payments |
| `InvoiceDetailPage.tsx` | Show linked allocations in payment history section |
| `VoucherFormPage.tsx` | Add optional "Allocate Against Invoices" section for RECEIPT vouchers |

### 7.3 Component Hierarchy

```
ReceivePaymentPage
  +-- ClientInvoiceSelector
  |     +-- ClientDropdown (existing hook: useClients)
  |     +-- useQuery(getOutstandingInvoicesForClient)
  +-- PaymentDetailsForm
  |     +-- DatePicker
  |     +-- Select (paymentMethod)
  |     +-- Select (bankAccount via useLedgerAccounts)
  |     +-- Input (amount, reference)
  +-- AllocationGrid
  |     +-- AllocationRow (per invoice)
  |     +-- AutoAllocateButton (FIFO / Pro-rata toggle)
  +-- AllocationSummary
  |     +-- Total Outstanding
  |     +-- Total Allocated
  |     +-- Unallocated Balance (warning if > 0)
  +-- AllocationJournalPreview
  +-- ActionBar [Save Draft] [Record Payment]
```

---

## 8. Form Validation (Zod Schema)

```typescript
// NOTE: User selects a Client from dropdown, but we resolve and send
// accountServicesId to the backend (invoices reference accountServices as FK).
// The Client → AccountServices resolution happens in the form's onClientChange handler.
const receivePaymentSchema = z.object({
  accountServicesId: z.string().min(1, 'Client is required'),
  totalAmount: z.number().min(0.01, 'Amount must be greater than 0'),
  paymentDate: z.string().min(1, 'Payment date is required'),
  paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'OTHER']),
  cashAccountId: z.string().min(1, 'Bank/cash account is required'),
  reference: z.string().optional(),
  notes: z.string().optional(),
  allocations: z.array(z.object({
    invoiceId: z.string().min(1),
    amount: z.number().min(0),
  })).min(1, 'At least one invoice must be allocated'),
}).refine(
  (data) => {
    const totalAllocated = data.allocations.reduce((sum, a) => sum + a.amount, 0);
    return Math.abs(totalAllocated - data.totalAmount) < 0.01; // Allow rounding tolerance
  },
  { message: 'Total allocated must equal payment amount', path: ['totalAmount'] }
);
```

---

## 9. State Management

### 9.1 Page State (React useState + useForm)

The ReceivePaymentPage uses a combination of:
- `react-hook-form` for the payment details fields (date, method, reference, amount)
- `useState` for the allocation map (`Map<string, number>`)
- `useQuery` for fetching invoices when client changes
- `useMutation` for the final submission

```typescript
// Core state in ReceivePaymentPage
const [allocations, setAllocations] = useState<Map<string, number>>(new Map());
const [strategy, setStrategy] = useState<AllocationStrategy>('FIFO');

// Derived values (useMemo)
const totalAllocated = useMemo(() =>
  Array.from(allocations.values()).reduce((sum, v) => sum + v, 0),
  [allocations]
);
const unallocated = totalPayment - totalAllocated;
const isBalanced = Math.abs(unallocated) < 0.01;
```

### 9.2 Query Cache Invalidation

On successful payment allocation creation:
```typescript
onSuccess: () => {
  // Invalidate all related queries
  queryClient.invalidateQueries({ queryKey: ['invoices'] });
  queryClient.invalidateQueries({ queryKey: ['invoice-payments'] });
  queryClient.invalidateQueries({ queryKey: ['payment-allocations'] });
  queryClient.invalidateQueries({ queryKey: ['vouchers'] });
  queryClient.invalidateQueries({ queryKey: ['ledger-transactions'] });
  // Navigate to allocation detail or payment list
  navigate(`/payments/allocation/${result.id}`);
},
```

---

## 10. Routing Updates

Add to the router configuration:

```typescript
// New routes for multi-invoice payment allocation
{ path: 'payments/receive', element: <ReceivePaymentPage /> },
{ path: 'payments/make', element: <MakePaymentPage /> },
{ path: 'payments/allocation/:id', element: <AllocationDetailPage /> },
```

Update navigation:
- Payments list page header: Add "Receive Payment" and "Make Payment" buttons alongside existing "Record Payment"
- Invoice detail page: Add "Receive Payment" button in the payments section that pre-selects the client

---

## 11. Integration with VoucherFormPage

### 11.1 Receipt Voucher + Invoice Allocation

When creating a RECEIPT voucher where `voucherTo === 'CLIENT'`, add an optional "Allocate Against Invoices" section that:

1. Shows after the Amount section when client and amount are filled
2. Loads outstanding invoices for the selected client
3. Uses the same `AllocationGrid` component
4. On save, creates both the Voucher AND the PaymentAllocationGroup atomically

This is a Phase 2 enhancement. Phase 1 separates the allocation flow into its own pages.

### 11.2 Payment Voucher + Bill Allocation

Same pattern for PAYMENT vouchers where `voucherTo === 'VENDOR'`:
- Show outstanding bills for the selected vendor
- Allocate payment voucher amount against bills

---

## 12. Impact on Accounts Receivable Aging Report

The AR Aging Report groups outstanding invoices by age buckets (Current, 30, 60, 90, 90+). Multi-invoice allocation affects aging because:

1. **Fully allocated invoices** drop out of the aging report (amountDue = 0)
2. **Partially allocated invoices** show reduced amountDue in their appropriate bucket
3. **The allocation date** (not the original invoice date) determines when the AR balance changed

No frontend changes needed for the AR aging report itself -- it already uses `amountDue` which is computed from `totalAmount - amountPaid`. The backend creates InvoicePayment records that increase `amountPaid`, so the existing computation works.

---

## 13. E2E Test Requirements

### 13.1 New E2E Test File

`e2e/integration/06-payment-allocations.integration.spec.ts`

### 13.2 Test Scenarios

**Receipt Allocation (Invoices):**

| # | Test | Expected |
|---|------|----------|
| 1 | Navigate to /payments/receive | Page loads with client dropdown |
| 2 | Select client with outstanding invoices | Invoice grid populates |
| 3 | Enter payment amount, click Auto-Allocate (FIFO) | Oldest invoices allocated first |
| 4 | Manually adjust allocation amounts | Grid updates, totals recalculate |
| 5 | Submit allocation with balanced amounts | Success, redirects to allocation detail |
| 6 | Verify created InvoicePayment records | Each allocated invoice has a payment |
| 7 | Verify invoice statuses updated | Fully paid = PAID, partial = PARTIAL |
| 8 | Verify voucher created | RECEIPT voucher with correct amount |
| 9 | Submit with unbalanced amounts | Validation error shown |
| 10 | Submit with no allocations | Validation error shown |
| 11 | Submit with amount > total outstanding | Validation error (overpayment rejected) |
| 12 | Submit with amount < total allocated | Validation error |

**Payment Allocation (Bills):**

| # | Test | Expected |
|---|------|----------|
| 13 | Navigate to /payments/make | Page loads with vendor dropdown |
| 14 | Select vendor with outstanding bills | Bill grid populates |
| 15 | Enter payment amount, FIFO auto-allocate | Oldest bills allocated first |
| 16 | Submit allocation | Success, creates BillPayment records |
| 17 | Verify PAYMENT voucher created | Correct amount and accounts |

**Backward Compatibility:**

| # | Test | Expected |
|---|------|----------|
| 18 | Record single invoice payment (old flow) | Still works as before |
| 19 | Record single bill payment (old flow) | Still works as before |

### 13.3 Mock Test Requirements

Unit tests for the allocation algorithms:

| # | Test | Expected |
|---|------|----------|
| 1 | allocateFIFO with exact payment | All invoices fully allocated |
| 2 | allocateFIFO with partial payment | Oldest fully paid, last partially |
| 3 | allocateFIFO with excess payment | All invoices fully allocated, remainder unallocated |
| 4 | allocateFIFO with no invoices | Empty map returned |
| 5 | allocateProRata with exact payment | Proportional distribution |
| 6 | allocateProRata rounding | Last invoice gets remainder |
| 7 | AllocationGrid renders correctly | All columns visible |
| 8 | AllocationGrid checkbox toggle | Allocates/deallocates amount |
| 9 | AllocationGrid manual edit | Updates allocation map |
| 10 | AllocationSummary shows correct totals | Matches allocation state |

---

## 14. Internationalization (i18n)

### New locale keys

Add `src/i18n/locales/en/paymentAllocations.json`:

```json
{
  "receivePayment": {
    "title": "Receive Payment",
    "subtitle": "Record a payment received from a client and allocate against invoices",
    "selectClient": "Select Client",
    "noOutstandingInvoices": "No outstanding invoices for this client",
    "autoAllocate": "Auto-Allocate",
    "fifo": "Oldest First (FIFO)",
    "proRata": "Proportional",
    "manual": "Manual",
    "totalOutstanding": "Total Outstanding",
    "totalAllocated": "Total Allocated",
    "unallocated": "Unallocated",
    "recordPayment": "Record Payment",
    "saveDraft": "Save Draft"
  },
  "makePayment": {
    "title": "Make Payment",
    "subtitle": "Record a payment made to a vendor and allocate against bills",
    "selectVendor": "Select Vendor"
  },
  "allocationGrid": {
    "invoiceNumber": "Invoice #",
    "billNumber": "Bill #",
    "dueDate": "Due Date",
    "totalAmount": "Total",
    "amountPaid": "Paid",
    "amountDue": "Due",
    "allocate": "Allocate"
  },
  "validation": {
    "clientRequired": "Please select a client",
    "vendorRequired": "Please select a vendor",
    "amountRequired": "Payment amount is required",
    "atLeastOneAllocation": "At least one invoice must be allocated",
    "allocationMustBalance": "Total allocated must equal payment amount",
    "overpaymentNotAllowed": "Payment amount cannot exceed total outstanding",
    "allocationExceedsAmountDue": "Allocation cannot exceed amount due on invoice"
  }
}
```

Also add equivalent files for `de`, `fr`, `nl` locale directories.

---

## 15. Implementation Phases

### Phase 1: Core Multi-Invoice Allocation (MVP)

1. Add new TypeScript types to `src/types/index.ts`
2. Create `paymentAllocations.ts` API endpoint file
3. Build `AllocationGrid` component
4. Build `ReceivePaymentPage` with FIFO auto-allocation
5. Build `MakePaymentPage` (mirrors receive)
6. Build `AllocationDetailPage` (read-only view)
7. Update routing and navigation
8. Add i18n locale keys
9. Write unit tests for allocation algorithms
10. Write E2E integration tests

### Phase 2: Voucher Integration

11. Add "Allocate Against Invoices" section to VoucherFormPage (RECEIPT type)
12. Add "Allocate Against Bills" section to VoucherFormPage (PAYMENT type)
13. Show allocation history on InvoiceDetailPage
14. Show allocation history on BillDetailPage (when bill endpoints work)

### Phase 3: Advanced Features

15. Overpayment handling (client credit balance)
16. Allocation reversal UI
17. Batch payment import (CSV upload with invoice references)
18. Payment reminders with outstanding balance

---

## 16. Dependencies

| Dependency | Status | Needed For |
|------------|--------|------------|
| Backend PaymentAllocation domain | NOT YET BUILT | All features |
| Backend allocation REST endpoints | NOT YET BUILT | API calls |
| Backend allocation service (FIFO logic) | NOT YET BUILT | Server-side validation |
| Client dropdown (existing) | EXISTS | Party selection |
| Vendor dropdown (existing) | EXISTS | Party selection |
| useLedgerAccounts hook (existing) | EXISTS | Bank account selection |
| Invoice list API (existing) | EXISTS | Loading outstanding invoices |
| Bill list API (existing) | PARTIAL (Issue #1) | Loading outstanding bills |

**Critical path**: Backend plan must be executed first to provide the REST endpoints. Frontend can be developed in parallel using mock data.

---

## 17. Acceptance Criteria

- [ ] ReceivePaymentPage loads and shows client dropdown
- [ ] Selecting a client loads their outstanding invoices in AllocationGrid
- [ ] FIFO auto-allocation distributes payment oldest-first
- [ ] Manual override allows editing per-invoice amounts
- [ ] Validation prevents overpayment and unbalanced allocations
- [ ] Journal entry preview shows correct Dr: Bank, Cr: AR
- [ ] "Record Payment" creates allocation group + individual payments atomically
- [ ] Invoice statuses update correctly (PAID/PARTIAL)
- [ ] MakePaymentPage works the same way for bills
- [ ] Existing single-invoice payment flow still works
- [ ] AllocationDetailPage shows full breakdown after creation
- [ ] All E2E tests pass
- [ ] All unit tests for allocation algorithms pass
