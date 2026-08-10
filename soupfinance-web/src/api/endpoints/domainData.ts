/**
 * Domain Data API endpoints for SoupFinance
 * Provides lookup data for dropdowns, autocomplete, and form fields
 *
 * Available endpoints:
 * - /rest/serviceDescription/index.json - Service/item descriptions for invoices/bills
 * - /rest/ledgerAccount/index.json - Chart of accounts (for expense/income categorization)
 */
import apiClient, { toQueryString, normalizeToArray } from '../client';
import type { ListParams, LedgerAccount, PaymentMethod } from '../../types';
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
 * Tax Rate - a selectable tax option backed by a real backend `TaxEntry`.
 *
 * Fix (SOUPFIN-37): `id` is now the real `TaxEntry` UUID, NOT a synthetic string.
 * The invoice line-item save sends this id as `taxEntries`, which the backend
 * resolves to a TaxEntry FK and uses to create the TaxEntryInvoiceItem join rows
 * that carry the computed tax. Synthetic ids (the old `tax-vat-15` style) could
 * never resolve, so any tax the user picked was silently discarded on save.
 */
export interface TaxRate {
  /** Real `TaxEntry` UUID. Empty string means "No Tax" (send no taxEntries). */
  id: string;
  name: string;
  rate: number;
  description?: string;
  isDefault?: boolean;
}

/**
 * Tax Entry - mirrors the Grails domain `soupbroker.finance.TaxEntry`
 * as returned by GET /rest/taxEntry/index.json
 */
export interface TaxEntry {
  id: string;
  name: string;
  abbreviation?: string;
  /** Percentage, e.g. 15.0 for 15% */
  taxRate: number;
  isTaxable?: boolean | null;
  isCompoundTax?: boolean | null;
  isWithholdingTax?: boolean | null;
  description?: string;
}

/**
 * The "no tax" sentinel. Its empty id means the line item is saved without any
 * `taxEntries`, which is exactly how the backend represents an untaxed item.
 */
export const NO_TAX_OPTION: TaxRate = {
  id: '',
  name: 'No Tax',
  rate: 0,
  description: 'No tax applied',
  isDefault: true,
};

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

/**
 * Country - for country selection dropdowns
 * Maps country to its default currency and display region
 */
export interface Country {
  code: string;
  name: string;
  currency: string;
  region: string;
}

/**
 * Currency - for currency selection dropdowns
 */
export interface Currency {
  code: string;
  label: string;
  symbol?: string;
}

// =============================================================================
// Default Countries (fallback data - loaded from backend utility controller when available)
// Backend endpoint: GET /rest/utility/enums.json (or similar)
// =============================================================================

export const DEFAULT_COUNTRIES: Country[] = [
  // Africa
  { code: 'GH', name: 'Ghana', currency: 'GHS', region: 'Africa' },
  { code: 'NG', name: 'Nigeria', currency: 'NGN', region: 'Africa' },
  { code: 'KE', name: 'Kenya', currency: 'KES', region: 'Africa' },
  { code: 'ZA', name: 'South Africa', currency: 'ZAR', region: 'Africa' },
  { code: 'TZ', name: 'Tanzania', currency: 'TZS', region: 'Africa' },
  { code: 'UG', name: 'Uganda', currency: 'UGX', region: 'Africa' },
  { code: 'RW', name: 'Rwanda', currency: 'RWF', region: 'Africa' },
  { code: 'CI', name: 'Côte d\'Ivoire', currency: 'XOF', region: 'Africa' },
  { code: 'SN', name: 'Senegal', currency: 'XOF', region: 'Africa' },
  { code: 'CM', name: 'Cameroon', currency: 'XAF', region: 'Africa' },
  { code: 'ET', name: 'Ethiopia', currency: 'ETB', region: 'Africa' },
  { code: 'EG', name: 'Egypt', currency: 'EGP', region: 'Africa' },
  // Americas
  { code: 'US', name: 'United States', currency: 'USD', region: 'Americas' },
  { code: 'CA', name: 'Canada', currency: 'CAD', region: 'Americas' },
  // Europe
  { code: 'GB', name: 'United Kingdom', currency: 'GBP', region: 'Europe' },
  { code: 'DE', name: 'Germany', currency: 'EUR', region: 'Europe' },
  { code: 'FR', name: 'France', currency: 'EUR', region: 'Europe' },
  { code: 'NL', name: 'Netherlands', currency: 'EUR', region: 'Europe' },
  // Asia-Pacific
  { code: 'IN', name: 'India', currency: 'INR', region: 'Asia-Pacific' },
  { code: 'AE', name: 'United Arab Emirates', currency: 'AED', region: 'Asia-Pacific' },
];

// =============================================================================
// Default Currencies (fallback data - loaded from backend utility controller when available)
// =============================================================================

export const DEFAULT_CURRENCIES: Currency[] = [
  { code: 'GHS', label: 'GHS - Ghana Cedi', symbol: 'GH₵' },
  { code: 'NGN', label: 'NGN - Nigerian Naira', symbol: '₦' },
  { code: 'KES', label: 'KES - Kenyan Shilling', symbol: 'KSh' },
  { code: 'ZAR', label: 'ZAR - South African Rand', symbol: 'R' },
  { code: 'TZS', label: 'TZS - Tanzanian Shilling', symbol: 'TSh' },
  { code: 'UGX', label: 'UGX - Ugandan Shilling', symbol: 'USh' },
  { code: 'RWF', label: 'RWF - Rwandan Franc', symbol: 'FRw' },
  { code: 'XOF', label: 'XOF - West African CFA Franc', symbol: 'CFA' },
  { code: 'XAF', label: 'XAF - Central African CFA Franc', symbol: 'FCFA' },
  { code: 'ETB', label: 'ETB - Ethiopian Birr', symbol: 'Br' },
  { code: 'EGP', label: 'EGP - Egyptian Pound', symbol: 'E£' },
  { code: 'USD', label: 'USD - US Dollar', symbol: '$' },
  { code: 'CAD', label: 'CAD - Canadian Dollar', symbol: 'CA$' },
  { code: 'GBP', label: 'GBP - British Pound', symbol: '£' },
  { code: 'EUR', label: 'EUR - Euro', symbol: '€' },
  { code: 'INR', label: 'INR - Indian Rupee', symbol: '₹' },
  { code: 'AED', label: 'AED - UAE Dirham', symbol: 'د.إ' },
];

// =============================================================================
// Default Tax Rates (hardcoded until backend provides endpoint)
// Common tax rates used in Ghana and other jurisdictions
// =============================================================================

/**
 * @deprecated (SOUPFIN-37) These ids are synthetic and do NOT exist in the
 * backend `TaxEntry` table, so a line item saved against them persists with
 * zero tax. Use `listTaxRates()`, which reads the real records. Retained only
 * so any remaining caller keeps compiling — do not use for anything that saves.
 */
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
// Payment Method API (real domain class, fetched from backend)
// Mirrors: soupbroker.finance.PaymentMethod
// =============================================================================

/**
 * List payment methods from backend
 * GET /rest/paymentMethod/index.json
 *
 * Added: PaymentMethod is a domain class (not enum), fetched dynamically
 */
export async function listPaymentMethods(params?: ListParams): Promise<PaymentMethod[]> {
  const query = params ? `?${toQueryString(params)}` : '';
  const response = await apiClient.get<PaymentMethod[]>(`/paymentMethod/index.json${query}`);
  return response.data;
}

// =============================================================================
// Tax Rate API (real backend TaxEntry records)
// =============================================================================

/**
 * Get available tax rates from the backend `TaxEntry` table.
 *
 * Fix (SOUPFIN-37): this previously returned DEFAULT_TAX_RATES — hardcoded
 * entries with synthetic ids like `tax-vat-15`. Those ids do not exist in the
 * backend, so a line item could never be linked to a TaxEntry and every invoice
 * saved with zero tax. The controller (`/rest/taxEntry/index.json`) exposes the
 * real records, which carry the correct Ghana structure (NHIL, GETFund, VAT,
 * CST, WHT) along with the UUIDs the save path needs.
 *
 * The "No Tax" sentinel is prepended so the dropdown always has a valid
 * zero-tax choice regardless of what the tenant has configured.
 */
export async function listTaxRates(): Promise<TaxRate[]> {
  const response = await apiClient.get<TaxEntry[]>('/taxEntry/index.json?max=100');
  const entries = normalizeToArray<TaxEntry>(response.data);

  const rates = entries
    // Withholding tax is deducted by the payer, not added to the invoice total.
    // Including it in the same dropdown would overstate the amount receivable.
    .filter((entry) => entry && entry.id && !entry.isWithholdingTax)
    .map((entry) => ({
      id: entry.id,
      name: entry.name || entry.abbreviation || 'Tax',
      rate: Number(entry.taxRate) || 0,
      description: entry.description,
    }));

  return [NO_TAX_OPTION, ...rates];
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
// Country & Currency API (loads from backend utility controller, falls back to defaults)
// Backend endpoint: GET /rest/utility/enums.json (returns countries, currencies, etc.)
// =============================================================================

/**
 * Get available countries for selection dropdowns
 * Tries to load from backend utility controller first, falls back to defaults
 * Used by: RegistrationPage (country selection), AccountSettingsPage
 */
export async function listCountries(): Promise<Country[]> {
  try {
    // TODO: Replace with actual backend enum endpoint when confirmed
    // Expected: GET /rest/utility/enums.json → response.countries
    // const response = await apiClient.get<{ countries: Country[] }>('/utility/enums.json');
    // return response.data.countries;
    return Promise.resolve(DEFAULT_COUNTRIES);
  } catch {
    // Fallback to defaults if backend endpoint not available
    return DEFAULT_COUNTRIES;
  }
}

/**
 * Get available currencies for selection dropdowns
 * Tries to load from backend utility controller first, falls back to defaults
 * Used by: AccountSettingsPage (currency dropdown), BankAccountFormPage
 */
export async function listCurrencies(): Promise<Currency[]> {
  try {
    // TODO: Replace with actual backend enum endpoint when confirmed
    // Expected: GET /rest/utility/enums.json → response.currencies
    // const response = await apiClient.get<{ currencies: Currency[] }>('/utility/enums.json');
    // return response.data.currencies;
    return Promise.resolve(DEFAULT_CURRENCIES);
  } catch {
    // Fallback to defaults if backend endpoint not available
    return DEFAULT_CURRENCIES;
  }
}

/**
 * Helper: Get unique country regions for grouped dropdowns
 */
export function getCountryRegions(countries: Country[] = DEFAULT_COUNTRIES): string[] {
  return [...new Set(countries.map(c => c.region))];
}

/**
 * Helper: Look up default currency for a country code
 */
export function getCurrencyForCountry(countryCode: string, countries: Country[] = DEFAULT_COUNTRIES): string | undefined {
  return countries.find(c => c.code === countryCode)?.currency;
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
