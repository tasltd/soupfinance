/**
 * Domain Data API endpoints for SoupFinance
 * Provides lookup data for dropdowns, autocomplete, and form fields
 *
 * Available endpoints:
 * - /rest/serviceDescription/index.json - Service/item descriptions for invoices/bills
 * - /rest/ledgerAccount/index.json - Chart of accounts (for expense/income categorization)
 */
import apiClient, { toQueryString } from '../client';
import type { ListParams, LedgerAccount } from '../../types';
import { listLedgerAccountsByGroup } from './ledger';

// =============================================================================
// Types
// =============================================================================

/**
 * Service Description - predefined invoice/bill line items
 * Used for quick item entry and ledger account mapping
 */
export interface ServiceDescription {
  id: string;
  name: string;
  type: 'INVOICE' | 'BILL';
  description?: string;
  ledgerAccount?: {
    id: string;
    name?: string;
  };
  /** Default tax rate for this service (if configured) */
  defaultTaxRate?: number;
  dateCreated?: string;
  lastUpdated?: string;
}

/**
 * Tax Rate - predefined tax rates for selection
 * Note: These are hardcoded as the backend doesn't have a dedicated tax endpoint.
 * In future, this could be fetched from a /rest/taxRate/index.json endpoint.
 */
export interface TaxRate {
  id: string;
  name: string;
  rate: number;
  description?: string;
  isDefault?: boolean;
}

/**
 * Payment Term - predefined payment terms
 * Note: These are hardcoded as the backend doesn't have a dedicated paymentTerm endpoint.
 */
export interface PaymentTerm {
  id: string;
  name: string;
  days: number;
  description?: string;
}

// =============================================================================
// Default Tax Rates (hardcoded until backend provides endpoint)
// Common tax rates used in Ghana and other jurisdictions
// =============================================================================

export const DEFAULT_TAX_RATES: TaxRate[] = [
  { id: 'tax-none', name: 'No Tax', rate: 0, description: 'Tax exempt', isDefault: true },
  { id: 'tax-vat-15', name: 'VAT 15%', rate: 15, description: 'Standard VAT rate (Ghana)' },
  { id: 'tax-vat-12.5', name: 'VAT 12.5%', rate: 12.5, description: 'Standard VAT rate' },
  { id: 'tax-vat-5', name: 'VAT 5%', rate: 5, description: 'Reduced VAT rate' },
  { id: 'tax-nhil-2.5', name: 'NHIL 2.5%', rate: 2.5, description: 'National Health Insurance Levy' },
  { id: 'tax-getfund-2.5', name: 'GETFund 2.5%', rate: 2.5, description: 'Ghana Education Trust Fund Levy' },
  { id: 'tax-covid-1', name: 'COVID Levy 1%', rate: 1, description: 'COVID-19 Health Recovery Levy' },
  { id: 'tax-wht-5', name: 'WHT 5%', rate: 5, description: 'Withholding Tax 5%' },
  { id: 'tax-wht-10', name: 'WHT 10%', rate: 10, description: 'Withholding Tax 10%' },
  { id: 'tax-wht-15', name: 'WHT 15%', rate: 15, description: 'Withholding Tax 15%' },
];

// =============================================================================
// Default Payment Terms (hardcoded until backend provides endpoint)
// =============================================================================

export const DEFAULT_PAYMENT_TERMS: PaymentTerm[] = [
  { id: 'term-due-receipt', name: 'Due on Receipt', days: 0, description: 'Payment due immediately' },
  { id: 'term-net-7', name: 'Net 7', days: 7, description: 'Payment due in 7 days' },
  { id: 'term-net-14', name: 'Net 14', days: 14, description: 'Payment due in 14 days' },
  { id: 'term-net-15', name: 'Net 15', days: 15, description: 'Payment due in 15 days' },
  { id: 'term-net-30', name: 'Net 30', days: 30, description: 'Payment due in 30 days' },
  { id: 'term-net-45', name: 'Net 45', days: 45, description: 'Payment due in 45 days' },
  { id: 'term-net-60', name: 'Net 60', days: 60, description: 'Payment due in 60 days' },
  { id: 'term-net-90', name: 'Net 90', days: 90, description: 'Payment due in 90 days' },
];

// =============================================================================
// Service Description API
// =============================================================================

/**
 * List service descriptions for invoices
 * GET /rest/serviceDescription/index.json?type=INVOICE
 */
export async function listInvoiceServices(params?: ListParams): Promise<ServiceDescription[]> {
  const queryParams = { ...params, type: 'INVOICE' };
  const query = toQueryString(queryParams);
  const response = await apiClient.get<ServiceDescription[]>(`/serviceDescription/index.json?${query}`);
  return response.data;
}

/**
 * List service descriptions for bills/expenses
 * GET /rest/serviceDescription/index.json?type=BILL
 */
export async function listBillServices(params?: ListParams): Promise<ServiceDescription[]> {
  const queryParams = { ...params, type: 'BILL' };
  const query = toQueryString(queryParams);
  const response = await apiClient.get<ServiceDescription[]>(`/serviceDescription/index.json?${query}`);
  return response.data;
}

/**
 * List all service descriptions
 * GET /rest/serviceDescription/index.json
 */
export async function listServiceDescriptions(params?: ListParams & { type?: 'INVOICE' | 'BILL' }): Promise<ServiceDescription[]> {
  const query = params ? `?${toQueryString(params)}` : '';
  const response = await apiClient.get<ServiceDescription[]>(`/serviceDescription/index.json${query}`);
  return response.data;
}

/**
 * Get a single service description by ID
 * GET /rest/serviceDescription/show/:id.json
 */
export async function getServiceDescription(id: string): Promise<ServiceDescription> {
  const response = await apiClient.get<ServiceDescription>(`/serviceDescription/show/${id}.json`);
  return response.data;
}

// =============================================================================
// Tax Rate API (returns hardcoded data until backend provides endpoint)
// =============================================================================

/**
 * Get available tax rates
 * Note: Returns hardcoded data until backend provides /rest/taxRate/index.json
 */
export async function listTaxRates(): Promise<TaxRate[]> {
  // TODO: Replace with API call when backend provides endpoint
  // const response = await apiClient.get<TaxRate[]>('/taxRate/index.json');
  // return response.data;
  return Promise.resolve(DEFAULT_TAX_RATES);
}

// =============================================================================
// Payment Terms API (returns hardcoded data until backend provides endpoint)
// =============================================================================

/**
 * Get available payment terms
 * Note: Returns hardcoded data until backend provides /rest/paymentTerm/index.json
 */
export async function listPaymentTerms(): Promise<PaymentTerm[]> {
  // TODO: Replace with API call when backend provides endpoint
  // const response = await apiClient.get<PaymentTerm[]>('/paymentTerm/index.json');
  // return response.data;
  return Promise.resolve(DEFAULT_PAYMENT_TERMS);
}

// =============================================================================
// Ledger Account API (for categorization dropdowns)
// Re-exports from ledger.ts for convenience
// =============================================================================

/**
 * List income accounts (for invoice line item categorization)
 */
export async function listIncomeAccounts(): Promise<LedgerAccount[]> {
  return listLedgerAccountsByGroup('INCOME');
}

/**
 * List expense accounts (for bill line item categorization)
 */
export async function listExpenseAccounts(): Promise<LedgerAccount[]> {
  return listLedgerAccountsByGroup('EXPENSE');
}
