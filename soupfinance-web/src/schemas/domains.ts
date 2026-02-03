/**
 * Domain-specific Zod schemas for API response validation
 * Maps to Grails domain classes in soupmarkets-web
 *
 * These schemas validate API responses at runtime to catch
 * contract mismatches between frontend and backend.
 */
import { z } from 'zod';
import {
  baseEntitySchema,
  fkReferenceSchema,
  fkWithCodeSchema,
  ledgerGroupSchema,
  ledgerStateSchema,
  voucherTypeSchema,
  voucherToSchema,
  invoiceStatusSchema,
  billStatusSchema,
  transactionStatusSchema,
  voucherStatusSchema,
  optionalString,
} from './base';

// =============================================================================
// Vendor Schema
// =============================================================================

export const vendorSchema = baseEntitySchema.extend({
  name: z.string(),
  email: optionalString,
  phoneNumber: optionalString,
  address: optionalString,
  taxIdentificationNumber: optionalString,
  paymentTerms: z.number().optional().nullable(),
  notes: optionalString,
});

export type Vendor = z.infer<typeof vendorSchema>;

// =============================================================================
// Invoice Client Schema
// =============================================================================

export const invoiceClientTypeSchema = z.enum(['INDIVIDUAL', 'CORPORATE']);

export const invoiceClientSchema = baseEntitySchema.extend({
  clientType: invoiceClientTypeSchema,
  name: z.string(),
  email: z.string(),
  phone: optionalString,
  address: optionalString,
  // Individual fields
  firstName: optionalString,
  lastName: optionalString,
  // Corporate fields
  companyName: optionalString,
  contactPerson: optionalString,
  registrationNumber: optionalString,
  taxNumber: optionalString,
});

export type InvoiceClient = z.infer<typeof invoiceClientSchema>;

// =============================================================================
// Invoice Schema
// =============================================================================

export const invoiceItemSchema = baseEntitySchema.extend({
  invoice: fkReferenceSchema.optional(),
  description: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
  taxRate: z.number(),
  discountPercent: z.number().optional().default(0),
  amount: z.number(),
});

export const invoiceSchema = baseEntitySchema.extend({
  invoiceNumber: z.string(),
  client: fkReferenceSchema,
  issueDate: z.string(),
  dueDate: z.string(),
  status: invoiceStatusSchema,
  subtotal: z.number(),
  taxAmount: z.number(),
  discountAmount: z.number().optional().default(0),
  totalAmount: z.number(),
  amountPaid: z.number(),
  amountDue: z.number(),
  notes: optionalString,
  terms: optionalString,
  items: z.array(invoiceItemSchema).optional(),
});

export type Invoice = z.infer<typeof invoiceSchema>;
export type InvoiceItem = z.infer<typeof invoiceItemSchema>;

// =============================================================================
// Bill Schema
// =============================================================================

export const billItemSchema = baseEntitySchema.extend({
  bill: fkReferenceSchema.optional(),
  description: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
  taxRate: z.number(),
  amount: z.number(),
});

export const billSchema = baseEntitySchema.extend({
  billNumber: z.string(),
  vendor: fkReferenceSchema,
  issueDate: z.string(),
  dueDate: z.string(),
  status: billStatusSchema,
  subtotal: z.number(),
  taxAmount: z.number(),
  totalAmount: z.number(),
  amountPaid: z.number(),
  amountDue: z.number(),
  notes: optionalString,
  items: z.array(billItemSchema).optional(),
});

export type Bill = z.infer<typeof billSchema>;
export type BillItem = z.infer<typeof billItemSchema>;

// =============================================================================
// Ledger Account Schema
// =============================================================================

export const ledgerAccountCategorySchema = baseEntitySchema.extend({
  name: z.string(),
  code: z.string(),
  ledgerGroup: ledgerGroupSchema,
  description: optionalString,
});

export const ledgerAccountSchema = baseEntitySchema.extend({
  code: z.string(),
  name: z.string(),
  number: optionalString,
  description: optionalString,
  ledgerGroup: ledgerGroupSchema,
  ledgerAccountCategory: fkReferenceSchema.optional().nullable(),
  parentAccount: fkReferenceSchema.optional().nullable(),
  isActive: z.boolean().optional().default(true),
  balance: z.number().optional().default(0),
});

export type LedgerAccount = z.infer<typeof ledgerAccountSchema>;
export type LedgerAccountCategory = z.infer<typeof ledgerAccountCategorySchema>;

// =============================================================================
// Ledger Transaction Schema
// =============================================================================

export const journalEntryTypeSchema = z.enum(['DOUBLE_ENTRY', 'SINGLE_ENTRY']);

export const ledgerTransactionSchema = baseEntitySchema.extend({
  transactionNumber: z.string().optional(),
  transactionDate: z.string(),
  description: z.string(),
  amount: z.number(),
  reference: optionalString,
  status: transactionStatusSchema,
  // Double-entry fields
  debitLedgerAccount: fkWithCodeSchema.optional().nullable(),
  creditLedgerAccount: fkWithCodeSchema.optional().nullable(),
  // Single-entry fields
  ledgerAccount: fkWithCodeSchema.optional().nullable(),
  transactionState: ledgerStateSchema.optional(),
  journalEntryType: journalEntryTypeSchema.optional(),
  // Group reference
  ledgerTransactionGroup: fkReferenceSchema.optional().nullable(),
  // Legacy aliases for backwards compatibility
  debitAccount: fkReferenceSchema.optional().nullable(),
  creditAccount: fkReferenceSchema.optional().nullable(),
});

export type LedgerTransaction = z.infer<typeof ledgerTransactionSchema>;

// =============================================================================
// Ledger Transaction Group Schema
// =============================================================================

export const ledgerTransactionGroupSchema = baseEntitySchema.extend({
  description: z.string(),
  groupDate: z.string(),
  balanced: z.boolean(),
  totalDebit: z.number(),
  totalCredit: z.number(),
  ledgerTransactionList: z.array(ledgerTransactionSchema).optional(),
  status: transactionStatusSchema,
  reference: optionalString,
});

export type LedgerTransactionGroup = z.infer<typeof ledgerTransactionGroupSchema>;

// =============================================================================
// Voucher Schema
// =============================================================================

export const voucherSchema = baseEntitySchema.extend({
  voucherNumber: z.string(),
  voucherType: voucherTypeSchema,
  voucherTo: voucherToSchema,
  voucherDate: z.string(),
  beneficiaryName: optionalString,
  beneficiaryReference: optionalString,
  client: fkReferenceSchema.optional().nullable(),
  vendor: fkReferenceSchema.optional().nullable(),
  staff: fkReferenceSchema.optional().nullable(),
  amount: z.number(),
  description: z.string(),
  reference: optionalString,
  cashAccount: fkWithCodeSchema.optional().nullable(),
  expenseAccount: fkWithCodeSchema.optional().nullable(),
  incomeAccount: fkWithCodeSchema.optional().nullable(),
  ledgerTransaction: ledgerTransactionSchema.optional().nullable(),
  status: voucherStatusSchema,
});

export type Voucher = z.infer<typeof voucherSchema>;

// =============================================================================
// Payment Schemas (Invoice & Bill)
// =============================================================================

export const paymentMethodSchema = z.enum(['CASH', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'OTHER']);

export const invoicePaymentSchema = baseEntitySchema.extend({
  invoice: fkReferenceSchema,
  amount: z.number(),
  paymentDate: z.string(),
  paymentMethod: paymentMethodSchema,
  reference: optionalString,
  notes: optionalString,
});

export type InvoicePayment = z.infer<typeof invoicePaymentSchema>;

export const billPaymentSchema = baseEntitySchema.extend({
  bill: fkReferenceSchema,
  amount: z.number(),
  paymentDate: z.string(),
  paymentMethod: paymentMethodSchema,
  reference: optionalString,
  notes: optionalString,
});

export type BillPayment = z.infer<typeof billPaymentSchema>;

// =============================================================================
// Settings Schemas
// =============================================================================

// Email/Phone contact schemas
export const emailContactSchema = z.object({
  id: z.string(),
  email: z.string(),
  priority: z.enum(['PRIMARY', 'SECONDARY']).optional(),
});

export const phoneContactSchema = z.object({
  id: z.string(),
  phone: z.string(),
  priority: z.enum(['PRIMARY', 'SECONDARY']).optional(),
});

// Priority enum for bank accounts
export const prioritySchema = z.enum(['PRIMARY', 'SECONDARY']);

export const agentSchema = baseEntitySchema.extend({
  firstName: z.string(),
  lastName: z.string(),
  otherNames: optionalString,
  designation: optionalString,
  address: optionalString,
  emailContacts: z.array(emailContactSchema).optional(),
  phoneContacts: z.array(phoneContactSchema).optional(),
  userAccess: z
    .object({
      id: z.number().optional(),
      username: z.string(),
      enabled: z.boolean().optional(),
      accountLocked: z.boolean().optional(),
    })
    .optional()
    .nullable(),
  account: fkReferenceSchema.optional().nullable(),
  accountPerson: z.object({ id: z.string() }).optional().nullable(),
  authorities: z
    .array(
      z.object({
        id: z.number().optional(),
        authority: z.string(),
      })
    )
    .optional(),
  groupAuthorities: z
    .array(
      z.object({
        id: z.number(),
        name: z.string(),
        roles: z.array(z.object({ id: z.number(), authority: z.string() })).optional(),
      })
    )
    .optional(),
  disabled: z.boolean().optional(),
  lastSeen: optionalString,
});

export type Agent = z.infer<typeof agentSchema>;

export const bankSchema = baseEntitySchema.extend({
  name: z.string(),
  swiftCode: optionalString,
  country: optionalString,
});

export type Bank = z.infer<typeof bankSchema>;

export const accountBankDetailsSchema = baseEntitySchema.extend({
  accountName: z.string(),
  accountNumber: z.string(),
  bank: z
    .object({
      id: z.string(),
      name: z.string().optional(),
      swiftCode: z.string().optional().nullable(),
      country: z.string().optional().nullable(),
    })
    .optional()
    .nullable(),
  bankForOtherOption: optionalString,
  bankBranch: optionalString,
  priority: prioritySchema.optional(),
  currency: optionalString,
  ledgerAccount: z
    .object({
      id: z.string(),
      name: z.string().optional(),
      accountNumber: z.string().optional().nullable(),
    })
    .optional()
    .nullable(),
  defaultClientDebtAccount: z.boolean().optional(),
  defaultClientEquityAccount: z.boolean().optional(),
});

export type AccountBankDetails = z.infer<typeof accountBankDetailsSchema>;

export const genderSchema = z.enum(['MALE', 'FEMALE', 'OTHER']);

export const accountPersonSchema = baseEntitySchema.extend({
  firstName: z.string().optional(),
  surname: z.string().optional(),
  otherNames: optionalString,
  dateOfBirth: optionalString,
  gender: genderSchema.optional(),
  jobTitle: optionalString,
  keyContact: z.boolean().optional(),
  director: z.boolean().optional(),
  signatory: z.boolean().optional(),
  contractNoteSignatory: z.boolean().optional(),
  tradingReportsSignatory: z.boolean().optional(),
  financeReportsSignatory: z.boolean().optional(),
  complianceReportsSignatory: z.boolean().optional(),
  emailContacts: z.array(emailContactSchema).optional(),
  phoneContacts: z.array(phoneContactSchema).optional(),
  // Identity documents
  identityType: optionalString,
  idNumber: optionalString,
  issueDate: optionalString,
  expiryDate: optionalString,
  placeOfIssue: optionalString,
  // File references
  proofOfIdentity: z.object({ id: z.string() }).optional().nullable(),
  passportSizedPhoto: z.object({ id: z.string() }).optional().nullable(),
  accountMandateSignature: z.object({ id: z.string() }).optional().nullable(),
});

export type AccountPerson = z.infer<typeof accountPersonSchema>;

// =============================================================================
// Corporate KYC Schemas
// =============================================================================

export const businessCategorySchema = z.enum([
  'LIMITED_LIABILITY',
  'PARTNERSHIP',
  'SOLE_PROPRIETORSHIP',
  'PUBLIC_LIMITED',
  'NON_PROFIT',
]);

export const kycStatusSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED']);

export const corporateSchema = baseEntitySchema.extend({
  name: z.string(),
  certificateOfIncorporationNumber: z.string(),
  registrationDate: z.string(),
  businessCategory: businessCategorySchema,
  taxIdentificationNumber: optionalString,
  email: z.string(),
  phoneNumber: z.string(),
  address: optionalString,
  kycStatus: kycStatusSchema.optional(),
});

export type Corporate = z.infer<typeof corporateSchema>;

// Corporate Account Person (Directors/Signatories)
export const corporatePersonRoleSchema = z.enum(['DIRECTOR', 'SIGNATORY', 'BENEFICIAL_OWNER']);

export const corporateAccountPersonSchema = baseEntitySchema.extend({
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  phoneNumber: z.string(),
  role: corporatePersonRoleSchema,
  corporate: fkReferenceSchema,
});

export type CorporateAccountPerson = z.infer<typeof corporateAccountPersonSchema>;

// Corporate Documents
export const corporateDocumentTypeSchema = z.enum([
  'CERTIFICATE_OF_INCORPORATION',
  'BOARD_RESOLUTION',
  'MEMORANDUM',
  'PROOF_OF_ADDRESS',
]);

export const corporateDocumentsSchema = baseEntitySchema.extend({
  documentType: corporateDocumentTypeSchema,
  fileName: z.string(),
  fileUrl: z.string(),
  corporate: fkReferenceSchema,
});

export type CorporateDocuments = z.infer<typeof corporateDocumentsSchema>;
