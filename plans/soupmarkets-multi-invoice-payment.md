# Soupmarkets-Web Backend -- Multi-Invoice Payment Allocation Plan

**Created**: 2026-02-07
**Status**: Ready for implementation
**Executor**: Separate Claude session with soupmarkets-web context
**Consumers**: SSR admin app, SoupFinance SPA, other SPA clients
**Prerequisite**: Voucher type restructuring plan (`soupmarkets-voucher-type-restructuring.md`) should be completed first, but is not strictly required

---

## 1. Goal

Add multi-invoice payment allocation capability to the soupmarkets-web Grails backend. This allows a single payment (received from a client or made to a vendor) to be allocated across multiple outstanding invoices or bills, replacing the current one-payment-one-invoice limitation.

### What Changes

| Current State | Target State |
|---------------|-------------|
| InvoicePayment links to exactly one Invoice | PaymentAllocation links one payment to many Invoices |
| BillPayment links to exactly one Bill | PaymentAllocation links one payment to many Bills |
| No allocation logic in backend | AllocationService with FIFO and manual strategies |
| No grouping of related payments | PaymentAllocationGroup groups allocations for one payment event |
| Voucher created per individual payment | One Voucher per allocation group (one lump-sum payment) |
| No link between Voucher and InvoicePayment/BillPayment | Voucher -> PaymentAllocationGroup -> PaymentAllocation[] -> InvoicePayment[]/BillPayment[] |

---

## 2. Accounting Background

### 2.1 Standard Journal Entry: Receive Payment Against Multiple Invoices

When a client makes a single $5,000 payment covering Invoice #101 ($3,000 fully) and Invoice #102 ($2,000 partially):

```
Journal Entry:
  Dr: Bank Account (ASSET)         $5,000.00
    Cr: Accounts Receivable (ASSET)  $3,000.00  -- Invoice #101 (fully settled)
    Cr: Accounts Receivable (ASSET)  $2,000.00  -- Invoice #102 (partial)
```

The single debit to Bank represents the lump-sum deposit. The multiple credits to AR represent the reduction in each invoice's outstanding balance.

### 2.2 Standard Journal Entry: Pay Multiple Bills

When making a single $4,500 payment covering Bill #201 ($3,000 fully) and Bill #202 ($1,500 partially):

```
Journal Entry:
  Dr: Accounts Payable (LIABILITY)   $3,000.00  -- Bill #201 (fully settled)
  Dr: Accounts Payable (LIABILITY)   $1,500.00  -- Bill #202 (partial)
    Cr: Bank Account (ASSET)           $4,500.00
```

### 2.3 Allocation Strategies

| Strategy | Algorithm | Use Case |
|----------|-----------|----------|
| **FIFO** | Sort by due date ascending, allocate to oldest first, fully pay each before moving to next | Default for most systems (QuickBooks, Sage, Tally) |
| **PRO_RATA** | Distribute proportionally: `allocation = (invoiceDue / totalDue) * paymentAmount` | Used when partial payment should reduce all invoices equally |
| **MANUAL** | Frontend specifies exact amount per invoice/bill | Override when client specifies which invoices they are paying |

### 2.4 Edge Cases

| Scenario | Handling |
|----------|---------|
| **Exact match** | Payment = sum of all allocated invoices. All allocated invoices become PAID. |
| **Partial payment (underpayment)** | Payment < total outstanding. FIFO: last allocated invoice becomes PARTIAL. |
| **Overpayment** | Phase 1: Reject (validation error). Phase 2: Create credit balance / advance receipt. |
| **Zero allocation** | Skip invoice (amount = 0 in allocation array). |
| **Currency mismatch** | Phase 1: All allocations must be in same currency as payment. Phase 2: multi-currency support. |

---

## 3. Domain Model Design

### 3.1 New Domain: PaymentAllocationGroup

This is the top-level entity representing a single "receive payment" or "make payment" event that allocates across multiple documents.

```groovy
package soupbroker.finance

/**
 * PaymentAllocationGroup - Groups allocations for a single multi-invoice payment event.
 *
 * One PaymentAllocationGroup has:
 *   - One Voucher (the receipt or payment voucher for the lump sum)
 *   - Many PaymentAllocation records (one per invoice/bill)
 *   - Optionally many InvoicePayment/BillPayment records (created atomically)
 *
 * The group tracks the total amount, allocation strategy used, and the party.
 */
class PaymentAllocationGroup extends SbDomain implements MultiTenant<PaymentAllocationGroup> {

    // ---- Core Fields ----
    Voucher voucher                        // The underlying receipt/payment voucher
    AllocationDirection direction           // RECEIPT (money in) or PAYMENT (money out)
    AllocationStrategy strategy             // FIFO, PRO_RATA, or MANUAL
    BigDecimal totalAmount                  // Total payment amount
    BigDecimal allocatedAmount = 0          // Sum of all allocations (computed)
    Date paymentDate                        // Date of the payment
    PaymentMethod paymentMethod             // CASH, BANK_TRANSFER, etc.
    String reference                        // Check number, wire reference, etc.
    String notes

    // ---- Party References ----
    // For RECEIPT direction: client/accountServices (who paid us)
    // For PAYMENT direction: vendor (who we paid)
    AccountServices accountServices         // Invoice FK reference (for RECEIPT)
    Vendor vendor                           // Bill FK reference (for PAYMENT)

    // ---- Bank Account ----
    LedgerAccount cashAccount               // Bank/Cash account (ASSET)

    // ---- Status ----
    AllocationGroupStatus status = AllocationGroupStatus.DRAFT

    // ---- Child Allocations ----
    static hasMany = [paymentAllocationList: PaymentAllocation]

    static constraints = {
        voucher nullable: true              // Created during save, not provided by caller
        direction nullable: false
        strategy nullable: false
        totalAmount min: 0.01d
        allocatedAmount nullable: false
        paymentDate nullable: false
        paymentMethod nullable: false
        reference nullable: true, maxSize: 255
        notes nullable: true, maxSize: 2000
        accountServices nullable: true      // Required for RECEIPT, null for PAYMENT
        vendor nullable: true               // Required for PAYMENT, null for RECEIPT
        cashAccount nullable: false
        status nullable: false
    }

    static mapping = {
        paymentAllocationList cascade: 'all-delete-orphan', sort: 'dateCreated'
        notes type: 'text'
    }

    // ---- Computed Property ----
    BigDecimal getUnallocatedAmount() {
        return totalAmount - (allocatedAmount ?: 0)
    }
}

// ---- Supporting Enums ----

enum AllocationDirection {
    RECEIPT,    // Money received from client (reduces AR)
    PAYMENT     // Money paid to vendor (reduces AP)
}

enum AllocationStrategy {
    FIFO,       // Oldest due date first
    PRO_RATA,   // Proportional to outstanding balances
    MANUAL      // User-specified amounts
}

enum AllocationGroupStatus {
    DRAFT,      // Not yet posted to ledger
    POSTED,     // Posted to ledger (voucher + payments created)
    REVERSED    // Reversed (all allocations and payments reversed)
}
```

### 3.2 New Domain: PaymentAllocation

The junction entity linking a group to a specific invoice or bill with an allocated amount.

```groovy
package soupbroker.finance

/**
 * PaymentAllocation - Links a PaymentAllocationGroup to a specific Invoice or Bill
 * with the amount allocated.
 *
 * This is the many-to-many resolution table:
 *   - One PaymentAllocationGroup -> many PaymentAllocations
 *   - One Invoice/Bill -> many PaymentAllocations (from different payments)
 *
 * Each PaymentAllocation also links to the InvoicePayment or BillPayment record
 * that was created to record the payment against the specific document.
 */
class PaymentAllocation extends SbDomain implements MultiTenant<PaymentAllocation> {

    // ---- Parent Reference ----
    PaymentAllocationGroup allocationGroup

    // ---- Document Reference (exactly one must be set) ----
    Invoice invoice                         // For RECEIPT allocations
    Bill bill                               // For PAYMENT allocations

    // ---- Allocated Amount ----
    BigDecimal amount                       // Amount allocated to this document
    Date allocatedDate                      // Date of allocation (usually same as payment date)
    String notes

    // ---- Created Payment Record ----
    // When the allocation is posted, an InvoicePayment or BillPayment is created.
    // This back-reference allows tracing from allocation -> payment record.
    InvoicePayment invoicePayment           // Created on posting (for invoices)
    BillPayment billPayment                 // Created on posting (for bills)

    static constraints = {
        allocationGroup nullable: false
        invoice nullable: true              // Set for RECEIPT allocations
        bill nullable: true                 // Set for PAYMENT allocations
        amount min: 0.01d
        allocatedDate nullable: false
        notes nullable: true, maxSize: 1000
        invoicePayment nullable: true       // Created during posting
        billPayment nullable: true          // Created during posting
    }

    static mapping = {
        notes type: 'text'
    }

    // Validation: exactly one of invoice/bill must be set
    def beforeValidate() {
        if (!invoice && !bill) {
            errors.rejectValue('invoice', 'paymentAllocation.document.required',
                'Either invoice or bill must be set')
        }
        if (invoice && bill) {
            errors.rejectValue('bill', 'paymentAllocation.document.exclusive',
                'Cannot allocate to both invoice and bill')
        }
    }
}
```

### 3.3 Updated Domain: InvoicePayment

Add optional back-reference to PaymentAllocation:

```groovy
// Add to InvoicePayment.groovy:
PaymentAllocation paymentAllocation    // null for legacy single-invoice payments

static constraints = {
    // ... existing constraints ...
    paymentAllocation nullable: true
}
```

### 3.4 Updated Domain: BillPayment

Same pattern:

```groovy
// Add to BillPayment.groovy:
PaymentAllocation paymentAllocation    // null for legacy single-bill payments

static constraints = {
    // ... existing constraints ...
    paymentAllocation nullable: true
}
```

### 3.5 Entity Relationship Diagram (Text)

```
                           +---------------------------+
                           | PaymentAllocationGroup    |
                           |---------------------------|
                           | id (UUID, PK)             |
                           | voucher_id (FK -> Voucher)|
                           | direction (enum)          |
                           | strategy (enum)           |
                           | total_amount (decimal)    |
                           | allocated_amount (decimal)|
                           | payment_date (date)       |
                           | payment_method (enum)     |
                           | reference (varchar)       |
                           | notes (text)              |
                           | account_services_id (FK)  |
                           | vendor_id (FK)            |
                           | cash_account_id (FK)      |
                           | status (enum)             |
                           | tenant_id, archived, etc. |
                           +---------------------------+
                                      |
                                      | 1:N (hasMany)
                                      v
                           +---------------------------+
                           | PaymentAllocation         |
                           |---------------------------|
                           | id (UUID, PK)             |
                           | allocation_group_id (FK)  |
                           | invoice_id (FK, nullable) |
                           | bill_id (FK, nullable)    |
                           | amount (decimal)          |
                           | allocated_date (date)     |
                           | notes (text)              |
                           | invoice_payment_id (FK)   |
                           | bill_payment_id (FK)      |
                           | tenant_id, archived, etc. |
                           +---------------------------+
                              /                    \
                 (invoice_id FK)                  (bill_id FK)
                            /                        \
               +-----------------+          +-----------------+
               | Invoice         |          | Bill            |
               +-----------------+          +-----------------+
               | id (UUID, PK)   |          | id (UUID, PK)   |
               | number (int)    |          | billNumber      |
               | accountServices |          | vendor          |
               | invoiceDate     |          | billDate        |
               | paymentDate     |          | paymentDate     |
               | ...             |          | ...             |
               +-----------------+          +-----------------+
                      |                            |
                      v                            v
               +-----------------+          +-----------------+
               | InvoicePayment  |          | BillPayment     |
               +-----------------+          +-----------------+
               | id (UUID, PK)   |          | id (UUID, PK)   |
               | invoice_id (FK) |          | bill_id (FK)    |
               | amount          |          | amount          |
               | paymentDate     |          | paymentDate     |
               | paymentMethod   |          | paymentMethod   |
               | reference       |          | reference       |
               | paymentAlloc.   |          | paymentAlloc.   |
               |   _id (FK, null)|          |   _id (FK, null)|
               +-----------------+          +-----------------+
```

---

## 4. Service Layer: PaymentAllocationService

### 4.1 Service Class

```groovy
package soupbroker.finance

import grails.gorm.transactions.Transactional
import grails.gorm.multitenancy.CurrentTenant

/**
 * PaymentAllocationService - Handles multi-invoice/bill payment allocation.
 *
 * Core responsibilities:
 * 1. Validate allocation requests (amounts, document existence, overpayment prevention)
 * 2. Execute allocation strategies (FIFO, PRO_RATA, MANUAL)
 * 3. Create PaymentAllocationGroup + PaymentAllocation records
 * 4. Create underlying Voucher and LedgerTransaction
 * 5. Create individual InvoicePayment / BillPayment records
 * 6. Handle reversal of entire allocation groups
 *
 * All operations are transactional -- if any step fails, the entire allocation rolls back.
 */
@CurrentTenant
@Transactional
class PaymentAllocationService {

    VoucherService voucherService
    InvoicePaymentService invoicePaymentService  // or IInvoicePaymentService (GORM Data Service)
    BillPaymentService billPaymentService

    // =========================================================================
    // CREATE ALLOCATION
    // =========================================================================

    /**
     * Create a multi-invoice payment allocation.
     *
     * This is the primary entry point. It:
     * 1. Validates all inputs
     * 2. Creates the PaymentAllocationGroup
     * 3. Creates individual PaymentAllocation records
     * 4. Creates a Voucher (RECEIPT or PAYMENT)
     * 5. Creates InvoicePayment/BillPayment records for each allocation
     * 6. Updates the group's allocatedAmount
     *
     * @param cmd Command object with allocation details
     * @return The created PaymentAllocationGroup
     * @throws ValidationException if validation fails
     */
    PaymentAllocationGroup createAllocation(CreateAllocationCommand cmd) {
        // Step 1: Validate
        validateAllocationCommand(cmd)

        // Step 2: Create group
        PaymentAllocationGroup group = new PaymentAllocationGroup(
            direction: cmd.direction,
            strategy: cmd.strategy,
            totalAmount: cmd.totalAmount,
            paymentDate: cmd.paymentDate,
            paymentMethod: cmd.paymentMethod,
            reference: cmd.reference,
            notes: cmd.notes,
            accountServices: cmd.accountServicesId ? AccountServices.get(cmd.accountServicesId) : null,
            vendor: cmd.vendorId ? Vendor.get(cmd.vendorId) : null,
            cashAccount: LedgerAccount.get(cmd.cashAccountId),
            status: AllocationGroupStatus.POSTED
        )

        // Step 3: Create voucher
        Voucher voucher = createVoucherForAllocation(group, cmd)
        group.voucher = voucher

        group.save(failOnError: true)

        // Step 4: Create individual allocations and payment records
        BigDecimal totalAllocated = 0

        for (alloc in cmd.allocations) {
            PaymentAllocation allocation = new PaymentAllocation(
                allocationGroup: group,
                amount: alloc.amount,
                allocatedDate: cmd.paymentDate,
                notes: alloc.notes
            )

            if (cmd.direction == AllocationDirection.RECEIPT) {
                Invoice invoice = Invoice.get(alloc.invoiceId)
                if (!invoice) throw new ValidationException("Invoice not found: ${alloc.invoiceId}")
                allocation.invoice = invoice

                // Create InvoicePayment record
                InvoicePayment payment = createInvoicePayment(invoice, alloc.amount, cmd)
                allocation.invoicePayment = payment
            } else {
                Bill bill = Bill.get(alloc.billId)
                if (!bill) throw new ValidationException("Bill not found: ${alloc.billId}")
                allocation.bill = bill

                // Create BillPayment record
                BillPayment payment = createBillPayment(bill, alloc.amount, cmd)
                allocation.billPayment = payment
            }

            allocation.save(failOnError: true)
            group.addToPaymentAllocationList(allocation)
            totalAllocated += alloc.amount
        }

        // Step 5: Update group totals
        group.allocatedAmount = totalAllocated
        group.save(failOnError: true, flush: true)

        return group
    }

    // =========================================================================
    // ALLOCATION STRATEGIES
    // =========================================================================

    /**
     * Auto-allocate a payment amount across invoices using FIFO strategy.
     *
     * Sorts invoices by paymentDate (due date) ascending, then by number.
     * Fully pays each invoice before moving to the next.
     * Returns a list of (invoiceId, amount) tuples.
     *
     * This is a PURE computation method -- does not create any records.
     * Used by the frontend to pre-populate the allocation grid,
     * and by the backend to validate FIFO allocations.
     */
    List<Map> allocateFIFO(List<Invoice> invoices, BigDecimal totalPayment) {
        List<Map> allocations = []
        BigDecimal remaining = totalPayment

        // Sort by due date ascending, then invoice number
        List<Invoice> sorted = invoices
            .findAll { calculateAmountDue(it) > 0 }
            .sort { a, b ->
                int dateCompare = (a.paymentDate ?: new Date()) <=> (b.paymentDate ?: new Date())
                dateCompare != 0 ? dateCompare : (a.number ?: 0) <=> (b.number ?: 0)
            }

        for (Invoice invoice : sorted) {
            if (remaining <= 0) break
            BigDecimal due = calculateAmountDue(invoice)
            BigDecimal allocate = [due, remaining].min()
            allocations << [invoiceId: invoice.id, amount: allocate]
            remaining -= allocate
        }

        return allocations
    }

    /**
     * Auto-allocate using FIFO strategy for bills.
     */
    List<Map> allocateFIFOBills(List<Bill> bills, BigDecimal totalPayment) {
        List<Map> allocations = []
        BigDecimal remaining = totalPayment

        List<Bill> sorted = bills
            .findAll { calculateBillAmountDue(it) > 0 }
            .sort { a, b ->
                int dateCompare = (a.paymentDate ?: new Date()) <=> (b.paymentDate ?: new Date())
                dateCompare != 0 ? dateCompare : (a.billNumber ?: '') <=> (b.billNumber ?: '')
            }

        for (Bill bill : sorted) {
            if (remaining <= 0) break
            BigDecimal due = calculateBillAmountDue(bill)
            BigDecimal allocate = [due, remaining].min()
            allocations << [billId: bill.id, amount: allocate]
            remaining -= allocate
        }

        return allocations
    }

    /**
     * Auto-allocate using pro-rata strategy.
     * Distributes payment proportionally based on outstanding balances.
     */
    List<Map> allocateProRata(List<Invoice> invoices, BigDecimal totalPayment) {
        List<Invoice> unpaid = invoices.findAll { calculateAmountDue(it) > 0 }
        BigDecimal totalDue = unpaid.sum { calculateAmountDue(it) } ?: 0

        if (totalDue == 0) return []

        BigDecimal effectivePayment = [totalPayment, totalDue].min()
        List<Map> allocations = []
        BigDecimal allocated = 0

        for (int i = 0; i < unpaid.size(); i++) {
            Invoice invoice = unpaid[i]
            BigDecimal due = calculateAmountDue(invoice)

            BigDecimal amount
            if (i == unpaid.size() - 1) {
                // Last invoice gets remainder to avoid rounding issues
                amount = effectivePayment - allocated
            } else {
                BigDecimal proportion = due / totalDue
                amount = (effectivePayment * proportion).setScale(2, BigDecimal.ROUND_HALF_UP)
                allocated += amount
            }

            allocations << [invoiceId: invoice.id, amount: amount]
        }

        return allocations
    }

    // =========================================================================
    // REVERSAL
    // =========================================================================

    /**
     * Reverse an entire payment allocation group.
     *
     * This:
     * 1. Reverses each InvoicePayment/BillPayment
     * 2. Reverses the underlying Voucher and LedgerTransaction
     * 3. Marks the allocation group as REVERSED
     *
     * Invoice/bill statuses will be recalculated based on remaining payments.
     */
    PaymentAllocationGroup reverseAllocation(String groupId) {
        PaymentAllocationGroup group = PaymentAllocationGroup.get(groupId)
        if (!group) throw new NotFoundException("PaymentAllocationGroup not found: ${groupId}")
        if (group.status == AllocationGroupStatus.REVERSED) {
            throw new ValidationException("Allocation group is already reversed")
        }

        // Reverse each allocation's payment record
        for (PaymentAllocation alloc : group.paymentAllocationList) {
            if (alloc.invoicePayment) {
                alloc.invoicePayment.delete(flush: true)
                alloc.invoicePayment = null
            }
            if (alloc.billPayment) {
                alloc.billPayment.delete(flush: true)
                alloc.billPayment = null
            }
        }

        // Reverse the voucher (which reverses the ledger transaction)
        if (group.voucher) {
            voucherService.reverseVoucher(group.voucher)
        }

        group.status = AllocationGroupStatus.REVERSED
        group.save(failOnError: true, flush: true)

        return group
    }

    // =========================================================================
    // PRIVATE HELPERS
    // =========================================================================

    private void validateAllocationCommand(CreateAllocationCommand cmd) {
        // 1. Must have at least one allocation
        if (!cmd.allocations || cmd.allocations.isEmpty()) {
            throw new ValidationException("At least one allocation is required")
        }

        // 2. Total allocated must equal total payment amount (within rounding tolerance)
        BigDecimal totalAllocated = cmd.allocations.sum { it.amount } ?: 0
        if ((totalAllocated - cmd.totalAmount).abs() > 0.01) {
            throw new ValidationException(
                "Total allocated (${totalAllocated}) must equal payment amount (${cmd.totalAmount})")
        }

        // 3. Each allocation amount must be positive and not exceed document's amount due
        for (alloc in cmd.allocations) {
            if (alloc.amount <= 0) {
                throw new ValidationException("Allocation amount must be positive")
            }

            if (cmd.direction == AllocationDirection.RECEIPT) {
                Invoice invoice = Invoice.get(alloc.invoiceId)
                if (!invoice) throw new ValidationException("Invoice not found: ${alloc.invoiceId}")
                BigDecimal due = calculateAmountDue(invoice)
                if (alloc.amount > due + 0.01) {
                    throw new ValidationException(
                        "Allocation (${alloc.amount}) exceeds amount due (${due}) for invoice ${invoice.number}")
                }
            } else {
                Bill bill = Bill.get(alloc.billId)
                if (!bill) throw new ValidationException("Bill not found: ${alloc.billId}")
                BigDecimal due = calculateBillAmountDue(bill)
                if (alloc.amount > due + 0.01) {
                    throw new ValidationException(
                        "Allocation (${alloc.amount}) exceeds amount due (${due}) for bill ${bill.billNumber}")
                }
            }
        }

        // 4. Party reference must be set based on direction
        if (cmd.direction == AllocationDirection.RECEIPT && !cmd.accountServicesId) {
            throw new ValidationException("AccountServices is required for receipt allocations")
        }
        if (cmd.direction == AllocationDirection.PAYMENT && !cmd.vendorId) {
            throw new ValidationException("Vendor is required for payment allocations")
        }

        // 5. Cash account must be an ASSET account
        LedgerAccount cashAccount = LedgerAccount.get(cmd.cashAccountId)
        if (!cashAccount || cashAccount.ledgerGroup != LedgerGroup.ASSET) {
            throw new ValidationException("Cash account must be an ASSET account")
        }
    }

    /**
     * Create a Voucher for the allocation group.
     *
     * For RECEIPT: Dr Bank/Cash, Cr Accounts Receivable (or Income)
     * For PAYMENT: Dr Accounts Payable (or Expense), Cr Bank/Cash
     */
    private Voucher createVoucherForAllocation(PaymentAllocationGroup group, CreateAllocationCommand cmd) {
        VoucherType voucherType = (cmd.direction == AllocationDirection.RECEIPT)
            ? VoucherType.RECEIPT
            : VoucherType.PAYMENT

        VoucherTo voucherTo = (cmd.direction == AllocationDirection.RECEIPT)
            ? VoucherTo.CLIENT
            : VoucherTo.VENDOR

        // Determine the counter-account (AR for receipts, AP for payments)
        // The cash account (debit for RECEIPT, credit for PAYMENT) is the bank account
        // selected by the user (group.cashAccount).
        // The counter-account is Accounts Receivable (for RECEIPT) or Accounts Payable (for PAYMENT).
        //
        // Lookup: Find the default AR/AP ledger account by account type.
        // The existing Voucher/VoucherService pattern uses debitLedgerAccount and creditLedgerAccount.
        LedgerAccount counterAccount
        if (cmd.direction == AllocationDirection.RECEIPT) {
            // RECEIPT: Dr Bank/Cash, Cr Accounts Receivable
            counterAccount = LedgerAccount.findByAccountTypeAndAccount(
                LedgerAccountType.ACCOUNTS_RECEIVABLE, group.account
            )
        } else {
            // PAYMENT: Dr Accounts Payable, Cr Bank/Cash
            counterAccount = LedgerAccount.findByAccountTypeAndAccount(
                LedgerAccountType.ACCOUNTS_PAYABLE, group.account
            )
        }
        if (!counterAccount) {
            throw new IllegalStateException(
                "No default ${cmd.direction == AllocationDirection.RECEIPT ? 'Accounts Receivable' : 'Accounts Payable'} " +
                "ledger account found. Please configure one in Chart of Accounts."
            )
        }

        Voucher voucher = new Voucher(
            voucherType: voucherType,
            voucherTo: voucherTo,
            voucherDate: cmd.paymentDate,
            amount: cmd.totalAmount,
            description: generateDescription(cmd),
            reference: cmd.reference,
            // Set the debit and credit ledger accounts for the journal entry
            debitLedgerAccount: (cmd.direction == AllocationDirection.RECEIPT) ? group.cashAccount : counterAccount,
            creditLedgerAccount: (cmd.direction == AllocationDirection.RECEIPT) ? counterAccount : group.cashAccount
        )

        // Set party reference on voucher
        if (cmd.direction == AllocationDirection.RECEIPT && cmd.accountServicesId) {
            // NOTE: 'as' is a Groovy reserved word (type casting) — use 'acctSvcs' instead
            AccountServices acctSvcs = AccountServices.get(cmd.accountServicesId)
            // Voucher may reference client through accountServices
            if (acctSvcs?.client) voucher.client = acctSvcs.client
        }
        if (cmd.direction == AllocationDirection.PAYMENT && cmd.vendorId) {
            voucher.vendor = Vendor.get(cmd.vendorId)
        }

        // The underlying LedgerTransaction is created by Voucher's shared-ID
        // foreign key generator pattern. The voucher service handles this.
        voucher = voucherService.saveVoucher(voucher, group.cashAccount)

        return voucher
    }

    /**
     * Create an InvoicePayment record for a single allocation line.
     */
    private InvoicePayment createInvoicePayment(Invoice invoice, BigDecimal amount, CreateAllocationCommand cmd) {
        InvoicePayment payment = new InvoicePayment(
            invoice: invoice,
            amount: amount,
            paymentDate: cmd.paymentDate,
            paymentMethod: cmd.paymentMethod,
            reference: cmd.reference,
            notes: "Multi-invoice allocation"
        )
        payment.save(failOnError: true)
        return payment
    }

    /**
     * Create a BillPayment record for a single allocation line.
     */
    private BillPayment createBillPayment(Bill bill, BigDecimal amount, CreateAllocationCommand cmd) {
        BillPayment payment = new BillPayment(
            bill: bill,
            amount: amount,
            paymentDate: cmd.paymentDate,
            paymentMethod: cmd.paymentMethod,
            reference: cmd.reference,
            notes: "Multi-bill allocation"
        )
        payment.save(failOnError: true)
        return payment
    }

    /**
     * Calculate amount due on an invoice (total - paid).
     * NOTE: Not private — called from PaymentAllocationGroupController
     */
    BigDecimal calculateAmountDue(Invoice invoice) {
        BigDecimal total = invoice.invoiceItemList?.sum { it.quantity * it.unitPrice } ?: 0
        BigDecimal paid = invoice.invoicePaymentList?.sum { it.amount } ?: 0
        return total - paid
    }

    /**
     * Calculate amount due on a bill (total - paid).
     * NOTE: Not private — called from PaymentAllocationGroupController
     */
    BigDecimal calculateBillAmountDue(Bill bill) {
        BigDecimal total = bill.total ?: 0
        BigDecimal paid = bill.billPaymentList?.sum { it.amount } ?: 0
        return total - paid
    }

    /**
     * Generate a human-readable description for the allocation voucher.
     */
    private String generateDescription(CreateAllocationCommand cmd) {
        int count = cmd.allocations.size()
        String docType = (cmd.direction == AllocationDirection.RECEIPT) ? 'invoice' : 'bill'
        return "Payment allocated to ${count} ${docType}${count > 1 ? 's' : ''}"
    }
}
```

### 4.2 Command Object

```groovy
package soupbroker.finance

import grails.validation.Validateable

/**
 * Command object for creating a multi-invoice/bill payment allocation.
 * Validates all required fields before passing to the service.
 */
class CreateAllocationCommand implements Validateable {

    AllocationDirection direction
    AllocationStrategy strategy = AllocationStrategy.FIFO
    BigDecimal totalAmount
    Date paymentDate
    PaymentMethod paymentMethod
    String reference
    String notes

    // Party reference (one required based on direction)
    String accountServicesId    // For RECEIPT (client's account services ID)
    String vendorId             // For PAYMENT

    // Bank/cash account
    String cashAccountId

    // Per-document allocations
    List<AllocationLineCommand> allocations = []

    static constraints = {
        direction nullable: false
        strategy nullable: false
        totalAmount min: 0.01d
        paymentDate nullable: false
        paymentMethod nullable: false
        reference nullable: true
        notes nullable: true
        accountServicesId nullable: true
        vendorId nullable: true
        cashAccountId nullable: false
    }
}

class AllocationLineCommand implements Validateable {
    String invoiceId    // For RECEIPT direction
    String billId       // For PAYMENT direction
    BigDecimal amount
    String notes

    static constraints = {
        invoiceId nullable: true
        billId nullable: true
        amount min: 0.01d
        notes nullable: true
    }
}
```

---

## 5. REST Controller: PaymentAllocationGroupController

```groovy
package soupbroker.finance

import grails.rest.RestfulController
import grails.gorm.multitenancy.CurrentTenant
import grails.plugin.springsecurity.annotation.Secured

/**
 * REST controller for PaymentAllocationGroup CRUD.
 *
 * Endpoints:
 *   GET    /rest/paymentAllocationGroup/index.json     - List allocation groups
 *   GET    /rest/paymentAllocationGroup/show/:id.json  - Get single group with allocations
 *   POST   /rest/paymentAllocationGroup/save.json      - Create allocation (multi-invoice payment)
 *   POST   /rest/paymentAllocationGroup/reverse/:id.json - Reverse allocation
 *   GET    /rest/paymentAllocationGroup/create.json    - CSRF token endpoint
 *
 * Additional endpoints:
 *   GET    /rest/paymentAllocationGroup/outstandingInvoices.json?accountServicesId=X
 *   GET    /rest/paymentAllocationGroup/outstandingBills.json?vendorId=X
 *   GET    /rest/paymentAllocationGroup/previewFIFO.json?accountServicesId=X&amount=Y
 */
@CurrentTenant
@Secured(['ROLE_USER'])
class PaymentAllocationGroupController extends RestfulController<PaymentAllocationGroup> {

    PaymentAllocationService paymentAllocationService

    static responseFormats = ['json']

    PaymentAllocationGroupController() {
        super(PaymentAllocationGroup)
    }

    /**
     * GET /rest/paymentAllocationGroup/index.json
     * List allocation groups with optional filters.
     *
     * Params: direction (RECEIPT/PAYMENT), status, max, offset, sort, order
     */
    @Override
    def index() {
        params.max = Math.min(params.int('max', 20), 100)
        def criteria = PaymentAllocationGroup.createCriteria()
        def results = criteria.list(max: params.max, offset: params.int('offset', 0)) {
            if (params.direction) {
                eq('direction', AllocationDirection.valueOf(params.direction))
            }
            if (params.status) {
                eq('status', AllocationGroupStatus.valueOf(params.status))
            }
            order(params.sort ?: 'dateCreated', params.order ?: 'desc')
        }
        respond results
    }

    /**
     * GET /rest/paymentAllocationGroup/show/:id.json
     * Returns the group with all child allocations eagerly loaded.
     */
    @Override
    def show() {
        PaymentAllocationGroup group = PaymentAllocationGroup.get(params.id)
        if (!group) {
            render status: 404
            return
        }
        // Eagerly initialize allocations to avoid lazy loading issues
        group.paymentAllocationList?.size()
        respond group
    }

    /**
     * POST /rest/paymentAllocationGroup/save.json
     * Create a multi-invoice/bill payment allocation.
     *
     * Request body: CreateAllocationCommand as JSON
     */
    def save(CreateAllocationCommand cmd) {
        withForm {
            if (cmd.hasErrors()) {
                respond cmd.errors, status: 422
                return
            }

            try {
                PaymentAllocationGroup group = paymentAllocationService.createAllocation(cmd)
                respond group, status: 201
            } catch (ValidationException e) {
                respond([message: e.message], status: 422)
            }
        }.invalidToken {
            respond([message: 'Invalid or missing CSRF token'], status: 403)
        }
    }

    /**
     * POST /rest/paymentAllocationGroup/reverse/:id.json
     * Reverse an entire allocation group.
     */
    def reverse() {
        try {
            PaymentAllocationGroup group = paymentAllocationService.reverseAllocation(params.id)
            respond group
        } catch (NotFoundException e) {
            render status: 404
        } catch (ValidationException e) {
            respond([message: e.message], status: 422)
        }
    }

    /**
     * GET /rest/paymentAllocationGroup/outstandingInvoices.json?accountServicesId=X
     * Returns invoices with outstanding balances for a given client (via accountServices).
     *
     * Used by the SPA to populate the allocation grid when a client is selected.
     */
    def outstandingInvoices() {
        String accountServicesId = params.accountServicesId
        if (!accountServicesId) {
            respond([message: 'accountServicesId is required'], status: 400)
            return
        }

        def invoices = Invoice.createCriteria().list {
            eq('accountServices.id', accountServicesId)
            eq('archived', false)
            order('paymentDate', 'asc')  // Oldest due date first
        }

        // Filter to invoices with outstanding balance
        def outstanding = invoices.findAll { invoice ->
            paymentAllocationService.calculateAmountDue(invoice) > 0
        }

        respond outstanding
    }

    /**
     * GET /rest/paymentAllocationGroup/outstandingBills.json?vendorId=X
     * Returns bills with outstanding balances for a given vendor.
     */
    def outstandingBills() {
        String vendorId = params.vendorId
        if (!vendorId) {
            respond([message: 'vendorId is required'], status: 400)
            return
        }

        def bills = Bill.createCriteria().list {
            eq('vendor.id', vendorId)
            eq('archived', false)
            order('paymentDate', 'asc')
        }

        def outstanding = bills.findAll { bill ->
            paymentAllocationService.calculateBillAmountDue(bill) > 0
        }

        respond outstanding
    }

    /**
     * GET /rest/paymentAllocationGroup/previewFIFO.json?accountServicesId=X&amount=Y
     * Preview FIFO allocation without creating any records.
     *
     * Returns: [{invoiceId, invoiceNumber, dueDate, amountDue, allocatedAmount}]
     */
    def previewFIFO() {
        String accountServicesId = params.accountServicesId
        BigDecimal amount = params.bigDecimal('amount')

        if (!accountServicesId || !amount) {
            respond([message: 'accountServicesId and amount are required'], status: 400)
            return
        }

        def invoices = Invoice.createCriteria().list {
            eq('accountServices.id', accountServicesId)
            eq('archived', false)
        }.findAll { paymentAllocationService.calculateAmountDue(it) > 0 }

        def allocations = paymentAllocationService.allocateFIFO(invoices, amount)

        def preview = allocations.collect { alloc ->
            Invoice inv = Invoice.get(alloc.invoiceId)
            [
                invoiceId: inv.id,
                invoiceNumber: inv.number,
                dueDate: inv.paymentDate,
                amountDue: paymentAllocationService.calculateAmountDue(inv),
                allocatedAmount: alloc.amount
            ]
        }

        respond preview
    }
}
```

---

## 6. URL Mappings

Add to `UrlMappings.groovy`:

```groovy
// Payment Allocation Group REST endpoints
"/rest/paymentAllocationGroup/index"(controller: 'paymentAllocationGroup', action: 'index', method: 'GET')
"/rest/paymentAllocationGroup/show/$id"(controller: 'paymentAllocationGroup', action: 'show', method: 'GET')
"/rest/paymentAllocationGroup/create"(controller: 'paymentAllocationGroup', action: 'create', method: 'GET')
"/rest/paymentAllocationGroup/save"(controller: 'paymentAllocationGroup', action: 'save', method: 'POST')
"/rest/paymentAllocationGroup/reverse/$id"(controller: 'paymentAllocationGroup', action: 'reverse', method: 'POST')
"/rest/paymentAllocationGroup/outstandingInvoices"(controller: 'paymentAllocationGroup', action: 'outstandingInvoices', method: 'GET')
"/rest/paymentAllocationGroup/outstandingBills"(controller: 'paymentAllocationGroup', action: 'outstandingBills', method: 'GET')
"/rest/paymentAllocationGroup/previewFIFO"(controller: 'paymentAllocationGroup', action: 'previewFIFO', method: 'GET')

// Payment Allocation (individual) REST endpoints (read-only, managed via group)
"/rest/paymentAllocation/index"(controller: 'paymentAllocation', action: 'index', method: 'GET')
"/rest/paymentAllocation/show/$id"(controller: 'paymentAllocation', action: 'show', method: 'GET')
```

---

## 7. Impact on Existing InvoicePayment / BillPayment Behavior

### 7.1 Backward Compatibility (CRITICAL)

The existing single-invoice payment flow (POST /rest/invoicePayment/save.json) **MUST continue to work exactly as before**. The new multi-invoice allocation is an additional capability, not a replacement.

| Flow | Endpoint | Behavior | Changed? |
|------|----------|----------|----------|
| Single invoice payment | POST /rest/invoicePayment/save.json | Creates one InvoicePayment with `paymentAllocation: null` | NO |
| Single bill payment | POST /rest/billPayment/save.json | Creates one BillPayment with `paymentAllocation: null` | NO |
| Multi-invoice allocation | POST /rest/paymentAllocationGroup/save.json | Creates group + N InvoicePayments with `paymentAllocation` set | NEW |
| Multi-bill allocation | POST /rest/paymentAllocationGroup/save.json | Creates group + N BillPayments with `paymentAllocation` set | NEW |

### 7.2 InvoicePaymentLedgerTransactionListenerService Impact

Currently, when an InvoicePayment is saved, the `InvoicePaymentLedgerTransactionListenerService` auto-creates a Voucher and LedgerTransaction for each individual payment.

**For multi-invoice allocations, this listener should NOT create individual vouchers.** The PaymentAllocationService already creates one Voucher for the entire group.

**Solution**: Check if `invoicePayment.paymentAllocation != null` in the listener. If set, skip voucher creation (the group's voucher handles it):

```groovy
// In InvoicePaymentLedgerTransactionListenerService:
void afterInsert(InvoicePayment payment) {
    // Skip voucher creation for allocation-managed payments
    if (payment.paymentAllocation != null) {
        return  // Voucher already created by PaymentAllocationService
    }

    // ... existing single-payment voucher creation logic ...
}
```

### 7.3 BillPaymentService Impact

Same pattern for bill payments:

```groovy
// Skip voucher creation for allocation-managed payments
if (payment.paymentAllocation != null) {
    return
}
```

---

## 8. Accounts Receivable / Payable Ledger Entry Patterns

### 8.1 Receipt Allocation Ledger Entry

When a $5,000 payment is received and allocated to Invoice #101 ($3,000) and Invoice #102 ($2,000):

**Option A: Single journal entry (recommended)**
```
LedgerTransaction (via Voucher, type: RECEIPT):
  Dr: Bank Account (ASSET)           $5,000.00
  Cr: Accounts Receivable (ASSET)    $5,000.00
```

The individual invoice-level tracking is handled by the InvoicePayment records, not by separate ledger transactions. The AR subledger (invoice list with amountDue) provides the per-invoice detail.

**Option B: Per-invoice journal entries (more granular, not recommended for Phase 1)**
```
LedgerTransaction Group:
  Dr: Bank Account (ASSET)           $5,000.00
  Cr: AR - Invoice #101              $3,000.00
  Cr: AR - Invoice #102              $2,000.00
```

**Recommendation**: Option A for Phase 1. The single journal entry is simpler and matches how most small-business accounting systems work. The per-invoice breakdown is visible in the PaymentAllocationGroup detail, not in the general ledger.

### 8.2 Payment Allocation Ledger Entry

When a $4,500 payment is made to a vendor for Bill #201 ($3,000) and Bill #202 ($1,500):

```
LedgerTransaction (via Voucher, type: PAYMENT):
  Dr: Accounts Payable (LIABILITY)   $4,500.00
  Cr: Bank Account (ASSET)           $4,500.00
```

### 8.3 Impact on Aging Reports

The aging report endpoints (`/financeReports/agedReceivables`, `/financeReports/agedPayables`) should continue to work correctly because they compute outstanding balances from the invoice/bill records. As InvoicePayment/BillPayment records are created, the outstanding balance decreases, and the aging report reflects this.

**No changes needed** to the aging report logic.

---

## 9. SSR Form Updates (Grails Admin App)

### 9.1 New GSP Pages

| File | Purpose |
|------|---------|
| `grails-app/views/paymentAllocationGroup/index.gsp` | List allocation groups |
| `grails-app/views/paymentAllocationGroup/show.gsp` | View allocation detail |
| `grails-app/views/paymentAllocationGroup/create.gsp` | Create allocation form |
| `grails-app/views/paymentAllocationGroup/_form.gsp` | Shared form partial |

### 9.2 SSR Form Layout

The SSR create form should include:

1. **Direction selector**: RECEIPT or PAYMENT (radio buttons)
2. **Party selector**: Client/AccountServices dropdown (RECEIPT) or Vendor dropdown (PAYMENT)
3. **Payment details**: Date, method, reference, bank account, total amount
4. **Invoice/Bill grid**: Table showing outstanding documents with allocation amounts
5. **Auto-allocate button**: JavaScript that calls `/rest/paymentAllocationGroup/previewFIFO.json` and populates the allocation amounts
6. **Journal entry preview**: Shows the debit/credit entries

### 9.3 GSP JavaScript for Auto-Allocation

```javascript
// In _form.gsp:
function autoAllocateFIFO() {
    var accountServicesId = document.getElementById('accountServices').value;
    var amount = document.getElementById('totalAmount').value;

    fetch('/rest/paymentAllocationGroup/previewFIFO.json' +
        '?accountServicesId=' + accountServicesId + '&amount=' + amount)
        .then(response => response.json())
        .then(data => {
            data.forEach(function(alloc) {
                var input = document.getElementById('alloc-' + alloc.invoiceId);
                if (input) input.value = alloc.allocatedAmount;
            });
            updateTotals();
        });
}
```

### 9.4 Navigation Updates

Add to the SSR sidebar navigation:
- Under "Payments": Add "Receive Payment" and "Make Payment" links
- Under "Reports": The existing aging reports already work

---

## 10. GSON Templates

### 10.1 PaymentAllocationGroup Template

Create `grails-app/views/paymentAllocationGroup/_paymentAllocationGroup.gson`:

```groovy
import soupbroker.finance.PaymentAllocationGroup

model {
    PaymentAllocationGroup paymentAllocationGroup
}

json {
    id paymentAllocationGroup.id
    direction paymentAllocationGroup.direction?.name()
    strategy paymentAllocationGroup.strategy?.name()
    totalAmount paymentAllocationGroup.totalAmount
    allocatedAmount paymentAllocationGroup.allocatedAmount
    unallocatedAmount paymentAllocationGroup.unallocatedAmount
    paymentDate paymentAllocationGroup.paymentDate
    paymentMethod paymentAllocationGroup.paymentMethod?.name()
    reference paymentAllocationGroup.reference
    notes paymentAllocationGroup.notes
    status paymentAllocationGroup.status?.name()

    if (paymentAllocationGroup.voucher) {
        voucher {
            id paymentAllocationGroup.voucher.id
            voucherNumber paymentAllocationGroup.voucher.voucherNumber
        }
    }

    if (paymentAllocationGroup.accountServices) {
        accountServices {
            id paymentAllocationGroup.accountServices.id
            serialised paymentAllocationGroup.accountServices.serialised
        }
    }

    if (paymentAllocationGroup.vendor) {
        vendor {
            id paymentAllocationGroup.vendor.id
            name paymentAllocationGroup.vendor.name
        }
    }

    if (paymentAllocationGroup.cashAccount) {
        cashAccount {
            id paymentAllocationGroup.cashAccount.id
            name paymentAllocationGroup.cashAccount.name
            code paymentAllocationGroup.cashAccount.code
        }
    }

    paymentAllocationList paymentAllocationGroup.paymentAllocationList?.collect { alloc ->
        [
            id: alloc.id,
            amount: alloc.amount,
            allocatedDate: alloc.allocatedDate,
            notes: alloc.notes,
            invoice: alloc.invoice ? [
                id: alloc.invoice.id,
                number: alloc.invoice.number,
                paymentDate: alloc.invoice.paymentDate
            ] : null,
            bill: alloc.bill ? [
                id: alloc.bill.id,
                billNumber: alloc.bill.billNumber,
                paymentDate: alloc.bill.paymentDate
            ] : null
        ]
    }

    dateCreated paymentAllocationGroup.dateCreated
    lastUpdated paymentAllocationGroup.lastUpdated
}
```

**Important**: This custom GSON template avoids the lazy loading issue documented in Issue #1 of `SOUPFINANCE_BACKEND_CHANGES_NEEDED.md`. It renders only scalar fields and explicitly controlled FK references, preventing `LazyInitializationException` in the stateless REST filter chain.

---

## 11. Database Migration

### 11.1 New Tables

Grails GORM will auto-create these tables from the domain classes. However, for production environments, create a Liquibase or Flyway migration:

```sql
-- payment_allocation_group table
CREATE TABLE payment_allocation_group (
    id VARCHAR(36) PRIMARY KEY,
    version BIGINT NOT NULL DEFAULT 0,
    voucher_id VARCHAR(36),
    direction VARCHAR(10) NOT NULL,         -- RECEIPT or PAYMENT
    strategy VARCHAR(10) NOT NULL,          -- FIFO, PRO_RATA, MANUAL
    total_amount DECIMAL(19,2) NOT NULL,
    allocated_amount DECIMAL(19,2) NOT NULL DEFAULT 0,
    payment_date DATE NOT NULL,
    payment_method VARCHAR(20) NOT NULL,
    reference VARCHAR(255),
    notes TEXT,
    account_services_id VARCHAR(36),
    vendor_id VARCHAR(36),
    cash_account_id VARCHAR(36) NOT NULL,
    status VARCHAR(10) NOT NULL DEFAULT 'DRAFT',
    tenant_id VARCHAR(36),
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    date_created TIMESTAMP,
    last_updated TIMESTAMP,

    FOREIGN KEY (voucher_id) REFERENCES voucher(id),
    FOREIGN KEY (account_services_id) REFERENCES account_services(id),
    FOREIGN KEY (vendor_id) REFERENCES vendor(id),
    FOREIGN KEY (cash_account_id) REFERENCES ledger_account(id)
);

-- payment_allocation table
CREATE TABLE payment_allocation (
    id VARCHAR(36) PRIMARY KEY,
    version BIGINT NOT NULL DEFAULT 0,
    allocation_group_id VARCHAR(36) NOT NULL,
    invoice_id VARCHAR(36),
    bill_id VARCHAR(36),
    amount DECIMAL(19,2) NOT NULL,
    allocated_date DATE NOT NULL,
    notes TEXT,
    invoice_payment_id VARCHAR(36),
    bill_payment_id VARCHAR(36),
    tenant_id VARCHAR(36),
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    date_created TIMESTAMP,
    last_updated TIMESTAMP,

    FOREIGN KEY (allocation_group_id) REFERENCES payment_allocation_group(id),
    FOREIGN KEY (invoice_id) REFERENCES invoice(id),
    FOREIGN KEY (bill_id) REFERENCES bill(id),
    FOREIGN KEY (invoice_payment_id) REFERENCES invoice_payment(id),
    FOREIGN KEY (bill_payment_id) REFERENCES bill_payment(id),

    -- Exactly one of invoice_id or bill_id must be set
    CHECK (
        (invoice_id IS NOT NULL AND bill_id IS NULL) OR
        (invoice_id IS NULL AND bill_id IS NOT NULL)
    )
);

-- Add paymentAllocation FK to existing tables
ALTER TABLE invoice_payment
    ADD COLUMN payment_allocation_id VARCHAR(36),
    ADD FOREIGN KEY (payment_allocation_id) REFERENCES payment_allocation(id);

ALTER TABLE bill_payment
    ADD COLUMN payment_allocation_id VARCHAR(36),
    ADD FOREIGN KEY (payment_allocation_id) REFERENCES payment_allocation(id);

-- Indexes for common queries
CREATE INDEX idx_pag_direction ON payment_allocation_group(direction);
CREATE INDEX idx_pag_status ON payment_allocation_group(status);
CREATE INDEX idx_pag_tenant ON payment_allocation_group(tenant_id);
CREATE INDEX idx_pag_account_services ON payment_allocation_group(account_services_id);
CREATE INDEX idx_pag_vendor ON payment_allocation_group(vendor_id);
CREATE INDEX idx_pa_group ON payment_allocation(allocation_group_id);
CREATE INDEX idx_pa_invoice ON payment_allocation(invoice_id);
CREATE INDEX idx_pa_bill ON payment_allocation(bill_id);
```

### 11.2 No Data Migration Needed

This is purely additive -- no existing data needs to be migrated. Existing InvoicePayment and BillPayment records will have `payment_allocation_id = NULL`, which correctly identifies them as legacy single-document payments.

---

## 12. Security Configuration

### 12.1 Spring Security URL Mappings

Add to `application.groovy` filter chain configuration:

```groovy
// PaymentAllocationGroup REST endpoints
[pattern: '/rest/paymentAllocationGroup/**', access: ['ROLE_USER']]
[pattern: '/rest/paymentAllocation/**', access: ['ROLE_USER']]
```

Ensure these patterns are in the stateless REST filter chain (the one that uses `X-Auth-Token` without session):

```groovy
[pattern: '/rest/paymentAllocationGroup/**/**.json',
 filters: 'JOINED_FILTERS,-exceptionTranslationFilter,-authenticationProcessingFilter,-securityContextPersistenceFilter,-rememberMeAuthenticationFilter']
[pattern: '/rest/paymentAllocation/**/**.json',
 filters: 'JOINED_FILTERS,-exceptionTranslationFilter,-authenticationProcessingFilter,-securityContextPersistenceFilter,-rememberMeAuthenticationFilter']
```

---

## 13. Testing Requirements

### 13.1 Unit Tests

| # | Test | Expected |
|---|------|----------|
| 1 | allocateFIFO with exact payment matches all invoices | All invoices fully allocated |
| 2 | allocateFIFO with partial payment | Oldest invoices fully paid, last partially |
| 3 | allocateFIFO with excess payment | All invoices allocated, remainder unallocated |
| 4 | allocateFIFO with no outstanding invoices | Empty list returned |
| 5 | allocateFIFO with single invoice | Full allocation to one invoice |
| 6 | allocateProRata distributes proportionally | Each invoice gets proportional share |
| 7 | allocateProRata rounding | Last invoice gets remainder, total matches |
| 8 | allocateProRata with single invoice | Full allocation to one invoice |
| 9 | Validate: total allocated != payment amount | ValidationException |
| 10 | Validate: allocation exceeds invoice amountDue | ValidationException |
| 11 | Validate: no allocations provided | ValidationException |
| 12 | Validate: zero or negative allocation amount | ValidationException |
| 13 | Validate: RECEIPT without accountServicesId | ValidationException |
| 14 | Validate: PAYMENT without vendorId | ValidationException |
| 15 | Validate: cash account is not ASSET type | ValidationException |
| 16 | PaymentAllocation: invoice and bill both null | Validation error |
| 17 | PaymentAllocation: invoice and bill both set | Validation error |
| 18 | PaymentAllocationGroup: status lifecycle DRAFT -> POSTED -> REVERSED | Correct |

### 13.2 Integration Tests

| # | Test | Expected |
|---|------|----------|
| 1 | POST save with RECEIPT direction and 2 invoices | 201, group created with 2 allocations |
| 2 | POST save with PAYMENT direction and 2 bills | 201, group created with 2 allocations |
| 3 | GET show returns group with all allocations | Full allocation list in response |
| 4 | GET outstandingInvoices returns unpaid invoices | Only invoices with amountDue > 0 |
| 5 | GET outstandingBills returns unpaid bills | Only bills with amountDue > 0 |
| 6 | GET previewFIFO returns correct allocation preview | Oldest first, amounts correct |
| 7 | POST reverse marks group as REVERSED | Status changes, payments deleted |
| 8 | Verify InvoicePayment records created for each allocation | paymentAllocation FK set |
| 9 | Verify BillPayment records created for each allocation | paymentAllocation FK set |
| 10 | Verify Voucher created with correct type and amount | RECEIPT for invoices, PAYMENT for bills |
| 11 | Verify LedgerTransaction created | Dr: Bank, Cr: AR (or Dr: AP, Cr: Bank) |
| 12 | Single InvoicePayment (legacy) still works | paymentAllocation = null, voucher auto-created |
| 13 | Single BillPayment (legacy) still works | paymentAllocation = null, voucher auto-created |
| 14 | Allocation listener skip: multi-payment doesn't double-create voucher | Only one voucher per group |

### 13.3 SSR Form Tests

| # | Test | Expected |
|---|------|----------|
| 1 | Create allocation form loads | All fields visible |
| 2 | Client dropdown loads outstanding invoices | Ajax grid populates |
| 3 | Auto-allocate FIFO fills allocation amounts | Correct distribution |
| 4 | Submit creates allocation group | Redirect to show page |
| 5 | Show page displays all allocation details | Voucher, allocations, totals |

---

## 14. Files to Create/Modify Summary

### New Files

| File | Type | Description |
|------|------|-------------|
| `PaymentAllocationGroup.groovy` | Domain | Allocation group entity |
| `PaymentAllocation.groovy` | Domain | Individual allocation entity |
| `AllocationDirection.groovy` | Enum (or inner enum) | RECEIPT / PAYMENT |
| `AllocationStrategy.groovy` | Enum (or inner enum) | FIFO / PRO_RATA / MANUAL |
| `AllocationGroupStatus.groovy` | Enum (or inner enum) | DRAFT / POSTED / REVERSED |
| `PaymentAllocationService.groovy` | Service | Core allocation business logic |
| `CreateAllocationCommand.groovy` | Command | Validation command object |
| `AllocationLineCommand.groovy` | Command | Per-line validation |
| `PaymentAllocationGroupController.groovy` | Controller | REST controller |
| `_paymentAllocationGroup.gson` | GSON template | JSON rendering |
| `paymentAllocationGroup/index.gsp` | GSP | SSR list page |
| `paymentAllocationGroup/show.gsp` | GSP | SSR detail page |
| `paymentAllocationGroup/create.gsp` | GSP | SSR create form |
| `paymentAllocationGroup/_form.gsp` | GSP | SSR form partial |

### Modified Files

| File | Change |
|------|--------|
| `InvoicePayment.groovy` | Add `paymentAllocation` FK (nullable) |
| `BillPayment.groovy` | Add `paymentAllocation` FK (nullable) |
| `InvoicePaymentLedgerTransactionListenerService.groovy` | Skip voucher creation if `paymentAllocation != null` |
| `BillPaymentService.groovy` (or listener) | Skip voucher creation if `paymentAllocation != null` |
| `UrlMappings.groovy` | Add REST endpoints for new controllers |
| `application.groovy` | Add security rules for new endpoints |

---

## 15. Implementation Phases

### Phase 1: Core Domain + Service (No UI)

1. Create `PaymentAllocationGroup` domain class
2. Create `PaymentAllocation` domain class
3. Create enums (`AllocationDirection`, `AllocationStrategy`, `AllocationGroupStatus`)
4. Create `CreateAllocationCommand` and `AllocationLineCommand`
5. Create `PaymentAllocationService` with FIFO and validation
6. Update `InvoicePayment` and `BillPayment` with optional FK
7. Update InvoicePayment listener to skip voucher creation for allocations
8. Write unit tests for service
9. Verify database tables auto-created

### Phase 2: REST Controller + GSON

10. Create `PaymentAllocationGroupController`
11. Create GSON template for PaymentAllocationGroup
12. Add URL mappings
13. Add security configuration
14. Write integration tests for REST endpoints
15. Test with SoupFinance SPA (frontend team can start integration)

### Phase 3: SSR Forms

16. Create GSP pages (index, show, create, _form)
17. Add navigation links to SSR sidebar
18. Add JavaScript for auto-allocation in create form
19. Write SSR form tests

### Phase 4: Advanced Features

20. Pro-rata allocation strategy
21. Overpayment handling (client credit balance)
22. Multi-currency allocation support
23. Batch allocation import (CSV)

---

## 16. Rollback Plan

If issues arise after deployment:

1. **Domain additions are safe** -- PaymentAllocationGroup and PaymentAllocation are new tables that don't affect existing data
2. **InvoicePayment/BillPayment FK addition is safe** -- nullable column, existing records have NULL
3. **Listener guard clause** (`if paymentAllocation != null`) is backward compatible -- existing single payments still create vouchers
4. **If service has bugs**: Disable the REST endpoints by removing URL mappings. Existing single-payment flow is unaffected.
5. **Database rollback**: Drop the two new tables and the added FK columns if needed:
   ```sql
   ALTER TABLE invoice_payment DROP COLUMN payment_allocation_id;
   ALTER TABLE bill_payment DROP COLUMN payment_allocation_id;
   DROP TABLE payment_allocation;
   DROP TABLE payment_allocation_group;
   ```

---

## 17. Acceptance Criteria

- [ ] PaymentAllocationGroup and PaymentAllocation domains created and validated
- [ ] PaymentAllocationService.createAllocation() works for RECEIPT direction (invoices)
- [ ] PaymentAllocationService.createAllocation() works for PAYMENT direction (bills)
- [ ] FIFO allocation correctly pays oldest invoices first
- [ ] Pro-rata allocation distributes proportionally
- [ ] Validation rejects: unbalanced allocations, overpayments, missing party
- [ ] One Voucher created per allocation group (not per invoice)
- [ ] InvoicePayment records created for each allocation line
- [ ] BillPayment records created for each allocation line
- [ ] Existing single-invoice payment flow still works (backward compatible)
- [ ] InvoicePayment listener does NOT create duplicate voucher for allocation-managed payments
- [ ] REST endpoints work with SoupFinance SPA (X-Auth-Token + Json)
- [ ] REST endpoints work with SSR admin app (session-based auth)
- [ ] Reversal deletes all related payment records and reverses voucher
- [ ] GSON template renders without LazyInitializationException
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] SSR forms functional (list, create, show)
