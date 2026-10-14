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
 * PROXY CONFIGURATION (2026-02-03):
 * Requests go through the proxy (Vite dev / Apache prod) which:
 * 1. Injects Api-Authorization header (identifies SoupFinance app to backend)
 * 2. Forwards to backend (tas.soupmarkets.com in production)
 * The Api-Authorization header allows the backend to determine the correct
 * frontend URL (applicationUrl) for email confirmation links.
 *
 * Endpoints:
 * - POST /account/register.json - Create tenant + admin user
 * - POST /account/confirmEmail.json - Verify email + set password
 * - POST /account/resendConfirmation.json - Resend confirmation email
 * - POST /account/forgotPassword.json - Request password reset email
 * - POST /account/resetPassword.json - Reset password with token
 */
import axios from 'axios';
// Added (SOUPFIN-186): plain-language fallback for reset failures
// Changed (SOUPFIN-185): auth-page variant translates the connection and server copy
import { getAuthApiErrorMessage } from '../errors';
import { authText } from '../../i18n/authText';

// Axios instance for /account/ endpoints (public, unauthenticated)
// Uses empty baseURL so requests go through the proxy which injects Api-Authorization
// The proxy (Vite dev / Apache prod) handles routing to the backend
const accountApiClient = axios.create({
  baseURL: '',  // Empty = relative paths go through proxy
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
 *
 * Changed (2026-05-22): Password is now collected at registration when the
 * SoupFinance ApiConsumer has `requireEmailConfirmation = false` on the backend.
 * The backend returns `requiresConfirmation` on success so the frontend can
 * branch: redirect to login (single-step) vs show "Check Your Email" (legacy).
 * See plans/soupfinance-disable-email-confirmation.md.
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
  /** Country of operation - determines default currency */
  country?: string;
  /** Base currency for the tenant (auto-set from country, editable in settings) */
  currency?: string;
  /**
   * Admin password.
   * Sent unconditionally; backend rejects when `requireEmailConfirmation = true`
   * for the calling ApiConsumer, accepts when `false`. Validated against the
   * same rules as ConfirmEmailPage (≥8 chars, uppercase, lowercase, digit).
   */
  password?: string;
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
 * Password reset request (after receiving reset email)
 */
export interface PasswordReset {
  /** Token from password reset email */
  token: string;
  /** New password */
  password: string;
  /** Password confirmation */
  confirmPassword: string;
}

/**
 * Response from registration endpoint
 *
 * Changed (2026-05-22): Added `requiresConfirmation` flag.
 * - true  → legacy flow: user gets confirmation email, must click link
 * - false → single-step flow: account is enabled immediately, user logs in
 * See plans/soupfinance-disable-email-confirmation.md.
 */
export interface RegistrationResponse {
  success: boolean;
  message: string;
  accountId?: string;
  agentId?: string;
  email?: string;
  /**
   * Whether the user must still confirm their email before logging in.
   * When undefined, frontend falls back to legacy behaviour (show "Check Your Email").
   */
  requiresConfirmation?: boolean;
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
  /**
   * Added (SOUPFIN-186): machine-readable failure reason on the password
   * reset endpoints. See plans/soupfin-186-password-reset-backend.md.
   */
  code?: PasswordResetErrorCode;
}

/**
 * Added (SOUPFIN-186): failure codes from /account/forgotPassword.json and
 * /account/resetPassword.json (contract in plans/soupfin-186-password-reset-backend.md).
 */
export type PasswordResetErrorCode =
  | 'EMAIL_INVALID'
  | 'TOKEN_INVALID'
  | 'TOKEN_EXPIRED'
  | 'PASSWORD_TOO_SHORT'
  | 'PASSWORD_MISMATCH';

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

/**
 * Request password reset email
 * POST /account/forgotPassword.json
 *
 * Sends a password reset link to the user's email.
 * Returns 200 for every well-formed email, whether or not an account exists
 * (prevents email enumeration). Any error is therefore a real failure.
 *
 * Changed (SOUPFIN-186): the backend action is specified in
 * plans/soupfin-186-password-reset-backend.md. Until it ships, the backend
 * answers 302 to its login page; the browser follows it (CORS allows it) and
 * gets a 200 HTML page, so the body is checked before success is reported.
 *
 * @param email - Email address to send reset link to
 * @returns Confirmation response
 */
export async function forgotPassword(email: string): Promise<ConfirmationResponse> {
  const response = await accountApiClient.post<ConfirmationResponse>(
    '/account/forgotPassword.json',
    { email }
  );

  return requireSuccessBody(response.data);
}

/**
 * Reset password using token from email
 * POST /account/resetPassword.json
 *
 * Validates the reset token and sets a new password. Failures are 400 with a
 * `code` (see PasswordResetErrorCode); use getResetPasswordError() to read them.
 *
 * Changed (SOUPFIN-186): backend action specified in
 * plans/soupfin-186-password-reset-backend.md (not deployed yet).
 *
 * @param data - Token and new password
 * @returns Confirmation response
 * @throws AxiosError on invalid/expired token or validation errors
 */
export async function resetPassword(data: PasswordReset): Promise<ConfirmationResponse> {
  const response = await accountApiClient.post<ConfirmationResponse>(
    '/account/resetPassword.json',
    data
  );

  return requireSuccessBody(response.data);
}

/** Added (SOUPFIN-186): shown when a reset endpoint answers 2xx without its JSON contract. */
export const PASSWORD_RESET_UNAVAILABLE_MESSAGE =
  'Password reset is not available right now. Please try again later or contact support.';

/**
 * Added (SOUPFIN-186): a 2xx only counts as success when it carries the JSON
 * contract `{ success: true }`. A redirect to the backend's login page arrives
 * as 200 text/html and must not read as "link sent" or "password reset".
 */
function requireSuccessBody(data: unknown): ConfirmationResponse {
  if (data && typeof data === 'object' && (data as ConfirmationResponse).success === true) {
    return data as ConfirmationResponse;
  }
  // Changed (SOUPFIN-185): thrown in the user's language
  throw new Error(authText('resetPassword.unavailable', PASSWORD_RESET_UNAVAILABLE_MESSAGE));
}

/**
 * Added (SOUPFIN-186): what a failed reset means for the page.
 * - `link_expired` / `link_invalid`: the token cannot be used again; the page
 *   swaps the form for a "request a new link" screen.
 * - `form`: the token may still be fine (e.g. password too short); keep the form.
 */
export interface ResetPasswordError {
  kind: 'link_expired' | 'link_invalid' | 'form';
  message: string;
}

// Older backends answer 400 with only a sentence. A 400 that talks about the
// token or link is treated as an unusable link, never as a password problem.
const LINK_PROBLEM_TEXT = /\b(token|link)\b/i;
const MAX_SERVER_MESSAGE_LENGTH = 300;

/** Added (SOUPFIN-186): classify an error thrown by resetPassword(). */
export function getResetPasswordError(error: unknown): ResetPasswordError {
  // Duck-typed like parseApiError(): tests mock the axios module, so axios.isAxiosError may be absent
  const response = (error as { isAxiosError?: boolean; response?: { status?: number; data?: unknown } } | null)
    ?.isAxiosError === true
    ? (error as { response?: { status?: number; data?: unknown } }).response
    : undefined;
  const data = (response?.data ?? null) as Partial<ConfirmationResponse> | null;
  const rawMessage =
    data && typeof data === 'object'
      ? (typeof data.message === 'string' && data.message) ||
        (typeof data.error === 'string' && data.error) ||
        ''
      : '';
  // Same cap as extractServerMessage() in api/errors.ts: a page-sized body is not a sentence
  const serverMessage = rawMessage.length < MAX_SERVER_MESSAGE_LENGTH ? rawMessage : '';
  const code = data && typeof data === 'object' ? data.code : undefined;
  // Changed (SOUPFIN-185): fallback copy in the user's language; a server sentence stays as sent
  const expiredText = authText('resetPassword.linkExpiredMessage', 'This password reset link has expired.');
  const invalidText = authText(
    'resetPassword.linkUsedMessage',
    'This password reset link is invalid or has already been used.',
  );

  if (code === 'TOKEN_EXPIRED') {
    return { kind: 'link_expired', message: serverMessage || expiredText };
  }
  if (code === 'TOKEN_INVALID') {
    return { kind: 'link_invalid', message: serverMessage || invalidText };
  }
  if (response?.status === 400 && !code && LINK_PROBLEM_TEXT.test(rawMessage)) {
    return /expir/i.test(rawMessage)
      ? { kind: 'link_expired', message: serverMessage || expiredText }
      : { kind: 'link_invalid', message: serverMessage || invalidText };
  }
  if (response?.status === 400 && serverMessage) {
    return { kind: 'form', message: serverMessage };
  }
  return { kind: 'form', message: getAuthApiErrorMessage(error) };
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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function checkPhoneExists(_phoneNumber: string): Promise<boolean> {
  return false;
}

/**
 * @deprecated Use resendConfirmation instead for email-related checks
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function checkEmailExists(_email: string): Promise<boolean> {
  return false;
}
