/**
 * Registration API endpoints for SoupFinance
 * Maps to soupmarkets-web /client/register.json endpoint
 * Handles corporate registration/onboarding for new clients
 *
 * NOTE: This endpoint uses /client/* path (public, unauthenticated)
 * unlike /rest/* endpoints which require authentication
 *
 * DESIGN: Minimal registration - collect only essential info for account creation.
 * Full KYC details are collected in post-registration onboarding steps.
 */
import axios from 'axios';

// Separate axios instance for /client/ endpoints (unauthenticated)
const clientApiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL?.replace('/rest', '') || '',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  timeout: 30000,
});

// =============================================================================
// Types
// =============================================================================

/**
 * Business category types supported by the backend
 */
export type BusinessCategory =
  | 'LIMITED_LIABILITY'
  | 'PUBLIC_LIMITED'
  | 'PARTNERSHIP'
  | 'SOLE_PROPRIETORSHIP'
  | 'NON_PROFIT'
  | 'OTHER';

/**
 * Corporate registration data structure.
 * Collects MINIMAL information for quick account creation.
 * Full KYC details are collected in post-registration onboarding.
 *
 * Required: name + contactFirstName + contactLastName + (phoneNumber OR email)
 */
export interface CorporateRegistration {
  // ===== REQUIRED =====
  /** Legal company name */
  name: string;
  /** Key contact first name */
  contactFirstName: string;
  /** Key contact last name */
  contactLastName: string;

  // At least one contact method required
  /** Primary contact phone (required if no email) */
  phoneNumber?: string;
  /** Primary contact email (required if no phone) */
  email?: string;

  // ===== OPTIONAL (commonly known at registration) =====
  /** Key contact title/position */
  contactPosition?: string;
  /** Company registration number (if known) */
  certificateOfIncorporationNumber?: string;
  /** Business type (if known) */
  businessCategory?: BusinessCategory;
}

/**
 * Response from registration endpoint
 * Contains created client and corporate entities
 */
export interface RegistrationResponse {
  /** Created client entity */
  client?: {
    id: string;
    name?: string;
    phoneNumber?: string;
    email?: string;
    phoneContacts?: Array<{ phone: string; priority: string }>;
    emailContacts?: Array<{ email: string; priority: string }>;
    accountServicesList?: Array<{ id: string; quickReference: string }>;
    signatoriesAndDirectorsList?: Array<{
      firstName: string;
      lastName: string;
      position: string;
      keyContact: boolean;
    }>;
  };
  /** Success message from backend */
  message?: string;
  /** Error code from backend (if error) */
  error?: number;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Convert CorporateRegistration to URLSearchParams for backend.
 * Uses flat field names matching CorporateRegisterCommand in backend.
 */
function toRegistrationFormData(data: CorporateRegistration): URLSearchParams {
  const params = new URLSearchParams();

  // Type - always CORPORATE for SoupFinance
  params.append('type', 'CORPORATE');

  // Required fields
  params.append('name', data.name);
  params.append('contactFirstName', data.contactFirstName);
  params.append('contactLastName', data.contactLastName);

  // Contact methods (at least one required)
  if (data.phoneNumber) {
    params.append('phoneNumber', data.phoneNumber);
  }
  if (data.email) {
    params.append('email', data.email);
  }

  // Optional fields (only include if provided)
  if (data.contactPosition) {
    params.append('contactPosition', data.contactPosition);
  }
  if (data.certificateOfIncorporationNumber) {
    params.append('certificateOfIncorporationNumber', data.certificateOfIncorporationNumber);
  }
  if (data.businessCategory) {
    params.append('businessCategory', data.businessCategory);
  }

  return params;
}

// =============================================================================
// API Functions
// =============================================================================

/**
 * Register a new corporate entity
 * POST /client/register.json
 *
 * This is a public endpoint that does not require authentication.
 * Creates a Corporate entity with minimal info for quick account creation.
 * Full KYC details can be added later via /rest/corporate/update/:id.json
 *
 * @param data - Corporate registration data (minimal fields)
 * @returns Created client/corporate entity
 * @throws AxiosError on validation or server errors
 *
 * @example
 * ```ts
 * const result = await registerCorporate({
 *   name: 'Acme Corp',
 *   contactFirstName: 'John',
 *   contactLastName: 'Doe',
 *   email: 'john@acme.com',
 *   phoneNumber: '+233244123456',
 * });
 * ```
 */
export async function registerCorporate(
  data: CorporateRegistration
): Promise<RegistrationResponse> {
  const formData = toRegistrationFormData(data);

  const response = await clientApiClient.post<RegistrationResponse>(
    '/client/register.json',
    formData
  );

  return response.data;
}

/**
 * Check if a phone number is already registered
 * GET /client/checkPhone.json?phoneNumber=xxx
 *
 * @param phoneNumber - Phone number to check
 * @returns true if phone number exists, false otherwise
 */
export async function checkPhoneExists(phoneNumber: string): Promise<boolean> {
  try {
    const response = await clientApiClient.get<{ exists: boolean }>(
      '/client/checkPhone.json?phoneNumber=' + encodeURIComponent(phoneNumber)
    );
    return response.data.exists;
  } catch {
    // NOTE: Endpoint may not exist - return false to allow registration attempt
    return false;
  }
}

/**
 * Check if an email is already registered
 * GET /client/checkEmail.json?email=xxx
 *
 * @param email - Email to check
 * @returns true if email exists, false otherwise
 */
export async function checkEmailExists(email: string): Promise<boolean> {
  try {
    const response = await clientApiClient.get<{ exists: boolean }>(
      '/client/checkEmail.json?email=' + encodeURIComponent(email)
    );
    return response.data.exists;
  } catch {
    // NOTE: Endpoint may not exist - return false to allow registration attempt
    return false;
  }
}
