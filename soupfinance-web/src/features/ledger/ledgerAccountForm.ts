/**
 * Added (SOUPFIN-149): Ledger account form schema and the save/update payload.
 * Kept out of LedgerAccountFormPage.tsx so that file only exports components.
 */
import { z } from 'zod';
import type { LedgerAccount } from '../../types';

// Constraints follow the domain: name required (unique per tenant), number
// optional (unique per tenant if given), category required.
export const ledgerAccountSchema = z.object({
  number: z.string().trim().max(50, 'Code is too long'),
  name: z.string().trim().min(1, 'Account name is required').max(255, 'Name is too long'),
  ledgerAccountCategoryId: z.string().min(1, 'Category is required'),
  parentAccountId: z.string(),
  currency: z.string().min(1, 'Currency is required'),
  cashFlow: z.boolean(),
  description: z.string().max(2000, 'Description is too long'),
});

export type LedgerAccountFormData = z.infer<typeof ledgerAccountSchema>;

/**
 * Build the JSON body for save/update. Uses domain field names and nested FK
 * objects (dot-notation FKs do not bind from a JSON body). parentAccount is
 * sent as null when cleared so an update can detach it.
 */
export function toLedgerAccountPayload(data: LedgerAccountFormData): Partial<LedgerAccount> {
  return {
    number: data.number.trim() || undefined,
    name: data.name.trim(),
    description: data.description.trim() || undefined,
    ledgerAccountCategory: { id: data.ledgerAccountCategoryId },
    parentAccount: data.parentAccountId ? { id: data.parentAccountId } : null,
    currency: data.currency,
    cashFlow: data.cashFlow,
  };
}
