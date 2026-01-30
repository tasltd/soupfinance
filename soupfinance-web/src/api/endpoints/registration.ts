/**
 * Registration API endpoints for SoupFinance
 * Maps to soupmarkets-web /account/* endpoints for tenant registration
 *
 * ARCHITECTURE (2026-01-30):
 * Registration creates a NEW TENANT (Account) with isolated data.
 * - No password during registration - set during email confirmation
 * - Email verification required before login
 * - Business type determines initial Chart of Accounts
 *
 * Endpoints:
 * - POST /account/register.json - Create tenant + admin user
 * - POST /account/confirmEmail.json - Verify email + set password
 * - POST /account/resendConfirmation.json - Resend confirmation email
 */
import axios from 'axios';

// Axios instance for /account/ endpoints (public, unauthenticated)
const accountApiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL?.replace('/rest', '') || '',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

// =============================================================================
// Types
// =============================================================================

/**
 * Business type - determines Chart of Accounts structure
 * - TRADING: Inventory-based, has COGS accounts
 * - SERVICES: No inventory, labor/operating expenses focus
 */
export type BusinessType = 'TRADING' | 'SERVICES';

/**
 * Tenant registration data
 * Password is NOT collected here - set during email confirmation
 */
export interface TenantRegistration {
  /** Company/business name - becomes tenant name */
  companyName: string;
  /** Business type - determines initial COA */
  businessType: BusinessType;
  /** Admin user first name */
  adminFirstName: string;
  /** Admin user last name */
  adminLastName: string;
  /** Admin email - used for login and confirmation */
  email: string;
  /** Base currency for the tenant (optional, defaults to USD) */
  currency?: string;
}

/**
 * Email confirmation data
 * Sets password after email verification
 */
export interface EmailConfirmation {
  /** Token from confirmation email */
  token: string;
  /** New password */
  password: string;
  /** Password confirmation */
  confirmPassword: string;
}

/**
 * Resend confirmation request
 */
export interface ResendConfirmation {
  /** Email to resend confirmation to */
  email: string;
}

/**
 * Response from registration endpoint
 */
export interface RegistrationResponse {
  success: boolean;
  message: string;
  accountId?: string;
  agentId?: string;
  email?: string;
  error?: string;
  errors?: Record<string, string>;
}

/**
 * Response from email confirmation endpoint
 */
export interface ConfirmationResponse {
  success: boolean;
  message: string;
  error?: string;
  errors?: Record<string, string>;
}

// =============================================================================
// API Functions
// =============================================================================

/**
 * Register a new tenant (Account)
 * POST /account/register.json
 *
 * Creates a new Account (tenant) with an admin user.
 * No password required - user sets password during email confirmation.
 *
 * @param data - Tenant registration data
 * @returns Registration response with account info
 * @throws AxiosError on validation or server errors
 *
 * @example
 * ```ts
 * const result = await registerTenant({
 *   companyName: 'Acme Trading Ltd',
 *   businessType: 'TRADING',
 *   adminFirstName: 'John',
 *   adminLastName: 'Doe',
 *   email: 'john@acmetrading.com',
 * });
 * ```
 */
export async function registerTenant(data: TenantRegistration): Promise<RegistrationResponse> {
  const response = await accountApiClient.post<RegistrationResponse>(
    '/account/register.json',
    data
  );

  return response.data;
}

/**
 * Confirm email and set password
 * POST /account/confirmEmail.json
 *
 * Verifies the user's email using the token from the confirmation link,
 * and sets their password for future logins.
 *
 * @param data - Token and new password
 * @returns Confirmation response
 * @throws AxiosError on invalid token or validation errors
 *
 * @example
 * ```ts
 * const result = await confirmEmail({
 *   token: 'abc123...',
 *   password: 'securePassword123',
 *   confirmPassword: 'securePassword123',
 * });
 * ```
 */
export async function confirmEmail(data: EmailConfirmation): Promise<ConfirmationResponse> {
  const response = await accountApiClient.post<ConfirmationResponse>(
    '/account/confirmEmail.json',
    data
  );

  return response.data;
}

/**
 * Resend confirmation email
 * POST /account/resendConfirmation.json
 *
 * Resends the confirmation email with a new token.
 *
 * @param email - Email address to resend to
 * @returns Confirmation response
 * @throws AxiosError if email not found or already confirmed
 *
 * @example
 * ```ts
 * const result = await resendConfirmation('john@acmetrading.com');
 * ```
 */
export async function resendConfirmation(email: string): Promise<ConfirmationResponse> {
  const response = await accountApiClient.post<ConfirmationResponse>(
    '/account/resendConfirmation.json',
    { email }
  );

  return response.data;
}

// =============================================================================
// Legacy Exports (Deprecated)
// =============================================================================

/**
 * @deprecated Use TenantRegistration instead
 * Kept for backwards compatibility during migration
 */
export type BusinessCategory =
  | 'LIMITED_LIABILITY'
  | 'PUBLIC_LIMITED'
  | 'PARTNERSHIP'
  | 'SOLE_PROPRIETORSHIP'
  | 'NON_PROFIT'
  | 'OTHER';

/**
 * @deprecated Use TenantRegistration instead
 * Old corporate registration structure
 */
export interface CorporateRegistration {
  name: string;
  contactFirstName: string;
  contactLastName: string;
  phoneNumber?: string;
  email?: string;
  contactPosition?: string;
  certificateOfIncorporationNumber?: string;
  businessCategory?: BusinessCategory;
}

/**
 * @deprecated Use registerTenant instead
 * Old registration function - maps to new API
 */
export async function registerCorporate(data: CorporateRegistration): Promise<RegistrationResponse> {
  // Map old format to new format
  const tenantData: TenantRegistration = {
    companyName: data.name,
    businessType: 'SERVICES', // Default for legacy calls
    adminFirstName: data.contactFirstName,
    adminLastName: data.contactLastName,
    email: data.email || '',
  };

  return registerTenant(tenantData);
}

/**
 * @deprecated These endpoints are not part of the new tenant flow
 */
export async function checkPhoneExists(_phoneNumber: string): Promise<boolean> {
  return false;
}

/**
 * @deprecated Use resendConfirmation instead for email-related checks
 */
export async function checkEmailExists(_email: string): Promise<boolean> {
  return false;
}
