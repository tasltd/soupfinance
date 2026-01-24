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
 * Returns access token and user info
 */
export async function login(email: string, password: string): Promise<AuthUser> {
  // Use JSON format for login (backend config: useJsonCredentials = true)
  const response = await apiClient.post<LoginResponse>(
    '/api/login',
    { username: email, password },
    { headers: { 'Content-Type': 'application/json' } }
  );
  const { access_token, username, roles } = response.data;

  // Store token in localStorage
  localStorage.setItem('access_token', access_token);

  // Create user object
  const user: AuthUser = {
    username,
    email,
    roles: roles || [],
  };

  // Store user info
  localStorage.setItem('user', JSON.stringify(user));

  return user;
}

/**
 * Logout - clear stored credentials and redirect to login
 */
export function logout(): void {
  localStorage.removeItem('access_token');
  localStorage.removeItem('user');
  window.location.href = '/login';
}

/**
 * Check if user is authenticated (has valid token)
 */
export function isAuthenticated(): boolean {
  return !!localStorage.getItem('access_token');
}

/**
 * Get current user from localStorage
 */
export function getCurrentUser(): AuthUser | null {
  const userJson = localStorage.getItem('user');
  if (!userJson) return null;

  try {
    return JSON.parse(userJson) as AuthUser;
  } catch {
    return null;
  }
}

/**
 * Get stored access token
 */
export function getAccessToken(): string | null {
  return localStorage.getItem('access_token');
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
