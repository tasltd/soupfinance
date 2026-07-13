/**
 * Settings-related Type Definitions
 *
 * Types for:
 * - Agent/Staff management
 * - Account Bank Details
 * - Account Persons (directors, signatories)
 * - Account configuration
 */

// ============================================================================
// Common Types
// ============================================================================

export interface EmailContact {
  id: string;
  email: string;
  priority?: 'PRIMARY' | 'SECONDARY';
}

export interface PhoneContact {
  id: string;
  phone: string;
  priority?: 'PRIMARY' | 'SECONDARY';
}

export interface SbRole {
  id: number;
  // NOTE: backend may omit `authority` and only send `serialised`
  // (e.g. "SbRole(authority:ROLE_USER)") — see getRoleAuthority() below.
  authority?: string;
  serialised?: string; // Grails serialised form, e.g. "SbRole(authority:ROLE_USER)"
  class?: string; // Grails domain class name on FK references
}

export interface SbRoleGroup {
  id: number;
  name: string;
  roles?: SbRole[];
}

export interface Bank {
  id: string;
  name: string;
  swiftCode?: string;
  country?: string;
}

export interface LedgerAccountRef {
  id: string;
  name: string;
  accountNumber?: string;
}

// ============================================================================
// Agent/Staff Types
// ============================================================================

export interface Agent {
  id: string;
  firstName: string;
  lastName: string;
  otherNames?: string;
  designation?: string;
  address?: string;
  emailContacts?: EmailContact[];
  phoneContacts?: PhoneContact[];
  userAccess?: {
    id: number;
    username: string;
    enabled: boolean;
    accountLocked?: boolean;
  };
  account?: { id: string; name?: string };
  accountPerson?: { id: string };
  authorities?: SbRole[];
  groupAuthorities?: SbRoleGroup[];
  disabled?: boolean;
  archived?: boolean;
  lastSeen?: string;
  dateCreated?: string;
  lastUpdated?: string;
}

export interface AgentFormData {
  firstName: string;
  lastName: string;
  otherNames?: string;
  designation?: string;
  address?: string;
  email?: string;
  phone?: string;
  username: string;
  password?: string;
  roles: string[]; // Role authorities (e.g., ['ROLE_ADMIN', 'ROLE_USER'])
  // Added: Account status toggles
  archived?: boolean;
  disabled?: boolean;
  // For auto-creating AccountPerson when staff is admin
  createAsAccountPerson?: boolean;
  isDirector?: boolean;
  isSignatory?: boolean;
}

// ============================================================================
// Account Bank Details Types
// ============================================================================

export interface AccountBankDetails {
  id: string;
  accountName: string;
  accountNumber: string;
  bank?: Bank;
  bankForOtherOption?: string;
  bankBranch?: string;
  priority: 'PRIMARY' | 'SECONDARY';
  currency?: string;
  ledgerAccount?: LedgerAccountRef;
  defaultClientDebtAccount?: boolean;
  defaultClientEquityAccount?: boolean;
  archived?: boolean;
  dateCreated?: string;
  lastUpdated?: string;
}

export interface AccountBankDetailsFormData {
  accountName: string;
  accountNumber: string;
  bankId?: string;
  bankForOtherOption?: string;
  bankBranch?: string;
  priority: 'PRIMARY' | 'SECONDARY';
  currency?: string;
  ledgerAccountId?: string;
  defaultClientDebtAccount?: boolean;
  defaultClientEquityAccount?: boolean;
}

// ============================================================================
// Account Person Types
// ============================================================================

export type Gender = 'MALE' | 'FEMALE' | 'OTHER';

export interface AccountPerson {
  id: string;
  firstName?: string;
  surname?: string;
  otherNames?: string;
  dateOfBirth?: string;
  gender?: Gender;
  jobTitle?: string;
  keyContact?: boolean;
  director?: boolean;
  signatory?: boolean;
  contractNoteSignatory?: boolean;
  tradingReportsSignatory?: boolean;
  financeReportsSignatory?: boolean;
  complianceReportsSignatory?: boolean;
  emailContacts?: EmailContact[];
  phoneContacts?: PhoneContact[];
  // Identity documents
  identityType?: string;
  idNumber?: string;
  issueDate?: string;
  expiryDate?: string;
  placeOfIssue?: string;
  // Files
  proofOfIdentity?: { id: string };
  passportSizedPhoto?: { id: string };
  accountMandateSignature?: { id: string };
  // State
  archived?: boolean;
  dateCreated?: string;
  lastUpdated?: string;
}

export interface AccountPersonFormData {
  firstName: string;
  surname: string;
  otherNames?: string;
  dateOfBirth?: string;
  gender?: Gender;
  jobTitle?: string;
  keyContact?: boolean;
  director?: boolean;
  signatory?: boolean;
  contractNoteSignatory?: boolean;
  tradingReportsSignatory?: boolean;
  financeReportsSignatory?: boolean;
  complianceReportsSignatory?: boolean;
  email?: string;
  phone?: string;
}

// ============================================================================
// Account Settings Types
// ============================================================================

export type BusinessLicenceCategory =
  | 'BROKER'
  | 'ASSET_MANAGER'
  | 'CUSTODIAN'
  | 'TRUSTEE'
  | 'PRIMARY_DEALER'
  | 'TRADING'
  | 'SERVICES';

export interface AccountSettings {
  id: string;
  name: string;
  currency?: string;
  countryOfOrigin?: string;
  businessLicenceCategory?: BusinessLicenceCategory;
  designation?: string;
  address?: string;
  location?: string;
  website?: string;
  emailSubjectPrefix?: string;
  smsIdPrefix?: string;
  startOfFiscalYear?: string;
  // Logo and branding
  logo?: { id: string };
  favicon?: { id: string };
  slogan?: string;
  // Feature flags
  disabled?: boolean;
  archived?: boolean;
}

// ============================================================================
// Role Constants (commonly used roles in SoupFinance)
// ============================================================================

export const SOUPFINANCE_ROLES = {
  ADMIN: 'ROLE_ADMIN',
  USER: 'ROLE_USER',
  FINANCE_REPORTS: 'ROLE_FINANCE_REPORTS',
  INVOICE: 'ROLE_INVOICE',
  BILL: 'ROLE_BILL',
  LEDGER_TRANSACTION: 'ROLE_LEDGER_TRANSACTION',
  LEDGER_ACCOUNT: 'ROLE_LEDGER_ACCOUNT',
  VENDOR: 'ROLE_VENDOR',
} as const;

export const SOUPFINANCE_ROLE_LABELS: Record<string, string> = {
  ROLE_ADMIN: 'Administrator',
  ROLE_USER: 'User',
  ROLE_FINANCE_REPORTS: 'Finance Reports',
  ROLE_INVOICE: 'Invoices',
  ROLE_BILL: 'Bills',
  ROLE_LEDGER_TRANSACTION: 'Ledger Transactions',
  ROLE_LEDGER_ACCOUNT: 'Chart of Accounts',
  ROLE_VENDOR: 'Vendors',
};

// Added (SOUPFIN-24): the backend may return role objects without an `authority`
// field, only a `serialised` form like "SbRole(authority:ROLE_USER)". Reading
// `role.authority.replace(...)` directly crashes the User Management page.
// These helpers resolve the authority safely and return null when it can't be
// determined, so callers can skip the role instead of throwing.

/** Extracts a role's authority string, falling back to parsing `serialised`. */
export function getRoleAuthority(role: SbRole): string | null {
  if (role.authority) return role.authority;
  const match = role.serialised?.match(/authority:\s*([A-Za-z0-9_]+)/);
  return match ? match[1] : null;
}

/** Human-friendly label for a role, or null when the authority is unresolvable. */
export function getRoleLabel(role: SbRole): string | null {
  const authority = getRoleAuthority(role);
  if (!authority) return null;
  return SOUPFINANCE_ROLE_LABELS[authority] || authority.replace('ROLE_', '');
}
