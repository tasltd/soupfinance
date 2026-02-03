/**
 * Base Zod schemas for API response validation
 * These mirror the Grails domain base types (SbDomain)
 *
 * Usage:
 * - Import and extend these for domain-specific schemas
 * - Use for runtime validation of API responses
 * - Type inference with z.infer<typeof schema>
 */
import { z } from 'zod';

// =============================================================================
// Base Entity Schema (mirrors SbDomain)
// =============================================================================

/**
 * Base entity fields present on all domain objects
 * Backend: SbDomain.groovy
 */
export const baseEntitySchema = z.object({
  id: z.string().uuid(),
  archived: z.boolean().optional(),
  dateCreated: z.string().datetime({ offset: true }).optional().nullable(),
  lastUpdated: z.string().datetime({ offset: true }).optional().nullable(),
  tenantId: z.string().optional().nullable(),
});

export type BaseEntity = z.infer<typeof baseEntitySchema>;

// =============================================================================
// Foreign Key Reference Schema
// =============================================================================

/**
 * Foreign key reference pattern used throughout the API
 * Backend returns: { id: "uuid", name: "Display Name" }
 */
export const fkReferenceSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
});

/**
 * FK with additional code field (for ledger accounts)
 */
export const fkWithCodeSchema = fkReferenceSchema.extend({
  code: z.string().optional(),
});

export type FkReference = z.infer<typeof fkReferenceSchema>;

// =============================================================================
// Pagination Schema
// =============================================================================

/**
 * Paginated response wrapper (when backend returns paged results)
 */
export function paginatedSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    content: z.array(itemSchema),
    totalElements: z.number(),
    page: z.number(),
    size: z.number(),
    totalPages: z.number(),
  });
}

// =============================================================================
// Common Enums
// =============================================================================

export const ledgerGroupSchema = z.enum([
  'ASSET',
  'LIABILITY',
  'EQUITY',
  'INCOME',
  'EXPENSE',
  'REVENUE',
]);

export const ledgerStateSchema = z.enum(['DEBIT', 'CREDIT']);

export const voucherTypeSchema = z.enum(['PAYMENT', 'DEPOSIT', 'RECEIPT']);

export const voucherToSchema = z.enum(['CLIENT', 'VENDOR', 'STAFF', 'OTHER']);

export const invoiceStatusSchema = z.enum([
  'DRAFT',
  'SENT',
  'VIEWED',
  'PARTIAL',
  'PAID',
  'OVERDUE',
  'CANCELLED',
]);

export const billStatusSchema = z.enum([
  'DRAFT',
  'PENDING',
  'PARTIAL',
  'PAID',
  'OVERDUE',
  'CANCELLED',
]);

export const transactionStatusSchema = z.enum(['PENDING', 'POSTED', 'REVERSED']);

export const voucherStatusSchema = z.enum(['PENDING', 'APPROVED', 'POSTED', 'CANCELLED']);

// =============================================================================
// Utility: Coerce empty strings to undefined
// =============================================================================

/**
 * Schema that treats empty strings as undefined
 * Useful for optional string fields from the backend
 */
export const optionalString = z
  .string()
  .optional()
  .nullable()
  .transform((val) => (val === '' ? undefined : val));

/**
 * Schema for numeric fields that may come as strings from backend
 */
export const numericString = z.union([z.number(), z.string().transform((v) => parseFloat(v))]);
