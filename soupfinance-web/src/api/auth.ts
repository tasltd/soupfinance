/**
 * Authentication API for SoupFinance
 * Uses AuthenticationToken from soupmarkets-web backend
 * Token-based stateless authentication via /rest/login endpoint
 *
 * Two authentication flows supported:
 * 1. Admin login: Direct username/password via login()
 * 2. Corporate 2FA: OTP-based via requestOTP() + verifyOTP()
 */
import apiClient, { toFormData } from './client';

// User type returned from login
export interface AuthUser {
  username: string;
  email: string;
  roles: string[];
  tenantId?: string;
  corporateId?: string;
}

// Login response from backend
interface LoginResponse {
  access_token: string;
  token_type: string;
  username: string;
  roles?: string[];
}

// Added: OTP verification response from /client/verifyCode.json
export interface OTPResponse {
  access_token: string;
  token_type: string;
  username: string;
  email?: string;
  roles?: string[];
  tenantId?: string;
  corporateId?: string;
}

/**
 * Login with email and password
 * POST /rest/api/login with JSON credentials
 * Changed (2026-01-21): Use /api/login endpoint (per Spring Security REST config)
 * Changed (2026-01-21): Use JSON body (useJsonCredentials = true in backend config)
 * Changed (2026-01-28): Added rememberMe parameter - uses localStorage (persistent) vs sessionStorage (session-only)
 * Returns access token and user info
 *
 * @param email - Username or email for login
 * @param password - User password
 * @param rememberMe - If true, stores credentials in localStorage (persists across browser sessions).
 *                     If false, uses sessionStorage (cleared when browser tab closes).
 *                     Security best practice per https://forbytes.com/blog/react-authentication-best-practices/
 */
export async function login(email: string, password: string, rememberMe: boolean = false): Promise<AuthUser> {
  // Use JSON format for login (backend config: useJsonCredentials = true)
  const response = await apiClient.post<LoginResponse>(
    '/api/login',
    { username: email, password },
    { headers: { 'Content-Type': 'application/json' } }
  );
  const { access_token, username, roles } = response.data;

  // Changed: Choose storage based on rememberMe preference
  // localStorage persists across browser sessions (remember me)
  // sessionStorage is cleared when browser tab closes (more secure for shared computers)
  const storage = rememberMe ? localStorage : sessionStorage;

  // Store token in chosen storage
  storage.setItem('access_token', access_token);

  // Create user object
  const user: AuthUser = {
    username,
    email,
    roles: roles || [],
  };

  // Store user info
  storage.setItem('user', JSON.stringify(user));

  // Added: Store rememberMe preference so we know where to look for token later
  localStorage.setItem('auth_storage_type', rememberMe ? 'local' : 'session');

  return user;
}

/**
 * Logout - clear stored credentials and redirect to login
 * Changed (2026-01-28): Clears both localStorage and sessionStorage to handle both remember me modes
 */
export function logout(): void {
  // Clear from both storages to ensure clean logout regardless of rememberMe mode
  localStorage.removeItem('access_token');
  localStorage.removeItem('user');
  localStorage.removeItem('auth_storage_type');
  sessionStorage.removeItem('access_token');
  sessionStorage.removeItem('user');
  window.location.href = '/login';
}

/**
 * Helper: Get the storage being used based on rememberMe preference
 * Changed (2026-01-28): Added to support dual storage strategy
 */
function getAuthStorage(): Storage {
  const storageType = localStorage.getItem('auth_storage_type');
  return storageType === 'session' ? sessionStorage : localStorage;
}

/**
 * Check if user is authenticated (has valid token)
 * Changed (2026-01-28): Checks appropriate storage based on rememberMe mode
 */
export function isAuthenticated(): boolean {
  // Check both storages - token could be in either depending on rememberMe
  return !!(localStorage.getItem('access_token') || sessionStorage.getItem('access_token'));
}

/**
 * Get current user from storage
 * Changed (2026-01-28): Checks appropriate storage based on rememberMe mode
 */
export function getCurrentUser(): AuthUser | null {
  // Try the storage indicated by auth_storage_type first, then fall back to the other
  const storage = getAuthStorage();
  let userJson = storage.getItem('user');

  // Fallback: check other storage if not found
  if (!userJson) {
    const otherStorage = storage === localStorage ? sessionStorage : localStorage;
    userJson = otherStorage.getItem('user');
  }

  if (!userJson) return null;

  try {
    return JSON.parse(userJson) as AuthUser;
  } catch {
    return null;
  }
}

/**
 * Get stored access token
 * Changed (2026-01-28): Checks appropriate storage based on rememberMe mode
 */
export function getAccessToken(): string | null {
  // Try the storage indicated by auth_storage_type first, then fall back to the other
  const storage = getAuthStorage();
  let token = storage.getItem('access_token');

  // Fallback: check other storage if not found
  if (!token) {
    const otherStorage = storage === localStorage ? sessionStorage : localStorage;
    token = otherStorage.getItem('access_token');
  }

  return token;
}

/**
 * Check if user has a specific role
 */
export function hasRole(role: string): boolean {
  const user = getCurrentUser();
  return user?.roles?.includes(role) ?? false;
}

/**
 * Check if user has any of the specified roles
 */
export function hasAnyRole(roles: string[]): boolean {
  const user = getCurrentUser();
  if (!user?.roles) return false;
  return roles.some((role) => user.roles.includes(role));
}

// ============================================================================
// 2FA Authentication Flow for Corporate Clients
// ============================================================================
//
// Step 1: Call requestOTP(contact) with email or phone number
// Step 2: User receives 5-digit OTP code via SMS or Email
// Step 3: Call verifyOTP(code) with the received code
// Step 4: Token is stored in localStorage, user redirected to dashboard
//
// Example usage:
//   await requestOTP('user@company.com');
//   // User enters code from email/SMS
//   const user = await verifyOTP('12345');
//   // User is now authenticated
// ============================================================================

/**
 * Request OTP code for 2FA authentication
 * POST /client/authenticate.json with contact (email or phone)
 *
 * @param contact - Email address or phone number to receive OTP
 * @returns Confirmation message that OTP was sent
 */
export async function requestOTP(contact: string): Promise<{ message: string }> {
  const formData = toFormData({ contact });

  const response = await apiClient.post<{ message: string }>(
    '/client/authenticate.json',
    formData
  );

  return response.data;
}

/**
 * Verify OTP code and complete 2FA authentication
 * POST /client/verifyCode.json with the 5-digit code
 *
 * On success: stores access_token and user in localStorage
 *
 * @param code - 5-digit OTP code received via SMS/Email
 * @returns AuthUser with user info and roles
 */
export async function verifyOTP(code: string): Promise<AuthUser> {
  const formData = toFormData({ code });

  const response = await apiClient.post<OTPResponse>(
    '/client/verifyCode.json',
    formData
  );

  const { access_token, username, email, roles, tenantId, corporateId } = response.data;

  // Store token in localStorage
  localStorage.setItem('access_token', access_token);

  // Create user object with corporate client fields
  const user: AuthUser = {
    username,
    email: email || username,
    roles: roles || [],
    tenantId,
    corporateId,
  };

  // Store user info
  localStorage.setItem('user', JSON.stringify(user));

  return user;
}
