/**
 * Registration API endpoints for SoupFinance
 * Maps to soupmarkets-web /client/register.json endpoint
 * Handles corporate registration/onboarding for new clients
 * 
 * NOTE: This endpoint uses /client/* path (public, unauthenticated)
 * unlike /rest/* endpoints which require authentication
 */
import axios from 'axios';

// Added: Separate axios instance for /client/ endpoints (unauthenticated)
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
 * Corporate registration data structure
 * Maps to soupmarkets-web Corporate domain fields
 */
export interface CorporateRegistration {
  /** Primary phone number for the corporate entity */
  phoneNumber?: string;
  /** Primary email for the corporate entity */
  email?: string;
  /** Legal company name */
  companyName: string;
  /** Company registration number (certificate of incorporation) */
  registrationNumber?: string;
  /** Tax Identification Number (TIN) */
  taxIdentificationNumber?: string;
  /** Country of incorporation (ISO country code or full name) */
  countryOfIncorporation: string;
  /** First name of primary contact person */
  contactFirstName: string;
  /** Last name of primary contact person */
  contactLastName: string;
  /** Position/title of primary contact person */
  contactPosition: string;
}

/**
 * Response from registration endpoint
 * Contains created client and corporate entities
 */
export interface RegistrationResponse {
  /** Created client entity */
  client?: {
    id: string;
    phoneNumber?: string;
    email?: string;
  };
  /** Created corporate entity */
  corporate?: {
    id: string;
    name: string;
    status?: string;
  };
  /** Success message from backend */
  message?: string;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Convert CorporateRegistration to FormData with Grails-compatible field names
 * Uses dot notation for nested domain objects (corporate.fieldName)
 * 
 * Added: Custom toFormData for registration-specific field mapping
 */
function toRegistrationFormData(data: CorporateRegistration): URLSearchParams {
  const params = new URLSearchParams();

  // Client-level fields (flat)
  if (data.phoneNumber) {
    params.append('phoneNumber', data.phoneNumber);
  }
  if (data.email) {
    params.append('email', data.email);
  }

  // Corporate-level fields (nested with corporate. prefix)
  // Changed: Using Grails nested binding syntax for corporate domain
  params.append('corporate.name', data.companyName);
  
  if (data.registrationNumber) {
    params.append('corporate.certificateOfIncorporationNumber', data.registrationNumber);
  }
  if (data.taxIdentificationNumber) {
    params.append('corporate.taxIdentificationNumber', data.taxIdentificationNumber);
  }
  params.append('corporate.countryOfIncorporation', data.countryOfIncorporation);

  // Contact person fields (nested with corporate. prefix)
  params.append('corporate.contactFirstName', data.contactFirstName);
  params.append('corporate.contactLastName', data.contactLastName);
  params.append('corporate.contactPosition', data.contactPosition);

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
 * Creates both a Client and Corporate entity in the soupmarkets backend.
 * 
 * @param data - Corporate registration data
 * @returns Created client and corporate entities
 * @throws AxiosError on validation or server errors
 * 
 * @example
 * ```ts
 * const result = await registerCorporate({
 *   companyName: 'Acme Corp',
 *   countryOfIncorporation: 'Kenya',
 *   contactFirstName: 'John',
 *   contactLastName: 'Doe',
 *   contactPosition: 'CFO',
 *   email: 'john@acme.com',
 *   phoneNumber: '+254700123456',
 * });
 * ```
 */
export async function registerCorporate(
  data: CorporateRegistration
): Promise<RegistrationResponse> {
  // Added: Convert registration data to FormData with proper field mapping
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
