/**
 * User guide sections (SOUPFIN-81)
 *
 * Every anchor a "Need Help?" link may point at. Each entry is an element id
 * in public/user-guide/index.html; a unit test reads the guide and fails if
 * one goes missing, so a renamed heading cannot leave a link landing on the
 * top of the guide.
 */

// Point at index.html explicitly: a bare /user-guide/ falls through to the SPA
// fallback on the Vite dev server and would render the app inside itself.
export const USER_GUIDE_URL = '/user-guide/index.html';

export const HELP_SECTIONS = [
  'introduction',
  'getting-started',
  'register',
  'sign-in',
  'password',
  // Added (SOUPFIN-84): company verification (KYC) onboarding wizard
  'verify-company',
  'kyc-company-details',
  'kyc-directors',
  'kyc-documents',
  'kyc-status',
  'navigation',
  'dashboard',
  'dashboard-cards',
  'recent-invoices',
  'clients',
  'find-client',
  'add-client',
  'invoices',
  'create-invoice',
  'view-invoice',
  'vendors',
  'bills',
  'record-bill',
  'payments',
  'record-payment',
  'ledger',
  'chart-of-accounts',
  'ledger-transactions',
  'accounting',
  'transaction-register',
  'journal-entry',
  'vouchers',
  'reports',
  'report-basics',
  'profit-loss',
  'balance-sheet',
  'cash-flow',
  'aging',
  'trial-balance',
  'trial-balance-unbalanced',
  'scheduled-reports',
  'settings',
  'users',
  'bank-accounts',
  'account-settings',
  'support',
  'module-not-enabled',
] as const;

export type HelpSection = (typeof HELP_SECTIONS)[number];

/** URL of one section of the static guide. */
export function helpUrl(section: HelpSection): string {
  return `${USER_GUIDE_URL}#${section}`;
}

/**
 * Guide section for a sign-in, registration or password page.
 * These pages sit outside the app shell, so AuthLayout picks the section
 * from the route rather than each page carrying its own link.
 */
export function authHelpSection(pathname: string): HelpSection {
  if (pathname.startsWith('/register') || pathname.startsWith('/confirm-email') || pathname.startsWith('/resend-confirmation')) {
    return 'register';
  }
  if (pathname.startsWith('/forgot-password') || pathname.startsWith('/reset-password')) {
    return 'password';
  }
  return 'sign-in';
}

/** Guide section for a Settings tab; the tabs share one header in SettingsLayout. */
export function settingsHelpSection(pathname: string): HelpSection {
  if (pathname.startsWith('/settings/users')) return 'users';
  if (pathname.startsWith('/settings/bank-accounts')) return 'bank-accounts';
  if (pathname.startsWith('/settings/account')) return 'account-settings';
  return 'settings';
}
