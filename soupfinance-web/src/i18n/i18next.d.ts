// Type definitions for i18next with SoupFinance translation resources
// This enables type-safe translations with autocomplete support

import 'i18next';

// Import translation resources for type inference
import common from './locales/en/common.json';
import auth from './locales/en/auth.json';
import navigation from './locales/en/navigation.json';
import invoices from './locales/en/invoices.json';
import reports from './locales/en/reports.json';
import accounting from './locales/en/accounting.json';
import bills from './locales/en/bills.json';
import payments from './locales/en/payments.json';
import ledger from './locales/en/ledger.json';
import vendors from './locales/en/vendors.json';
import dashboard from './locales/en/dashboard.json';
import corporate from './locales/en/corporate.json';

// Define the resources structure based on English translations (source of truth)
declare module 'i18next' {
  interface CustomTypeOptions {
    // Enable type-safe translations
    defaultNS: 'common';
    // Define resource types from actual JSON files (12 namespaces)
    resources: {
      common: typeof common;
      auth: typeof auth;
      navigation: typeof navigation;
      invoices: typeof invoices;
      reports: typeof reports;
      accounting: typeof accounting;  // Core: journal entries, vouchers, transactions
      bills: typeof bills;            // Vendor bills management
      payments: typeof payments;      // Payment tracking
      ledger: typeof ledger;          // Chart of accounts, GL
      vendors: typeof vendors;        // Vendor management
      dashboard: typeof dashboard;    // Dashboard overview
      corporate: typeof corporate;    // KYC onboarding
    };
  }
}

// Export namespace types for use in components
export type TranslationNamespace =
  | 'common'
  | 'auth'
  | 'navigation'
  | 'invoices'
  | 'reports'
  | 'accounting'
  | 'bills'
  | 'payments'
  | 'ledger'
  | 'vendors'
  | 'dashboard'
  | 'corporate';

// Utility type for extracting translation keys from a namespace
export type TranslationKeys<NS extends TranslationNamespace> =
  NS extends 'common' ? keyof typeof common :
  NS extends 'auth' ? keyof typeof auth :
  NS extends 'navigation' ? keyof typeof navigation :
  NS extends 'invoices' ? keyof typeof invoices :
  NS extends 'reports' ? keyof typeof reports :
  NS extends 'accounting' ? keyof typeof accounting :
  NS extends 'bills' ? keyof typeof bills :
  NS extends 'payments' ? keyof typeof payments :
  NS extends 'ledger' ? keyof typeof ledger :
  NS extends 'vendors' ? keyof typeof vendors :
  NS extends 'dashboard' ? keyof typeof dashboard :
  NS extends 'corporate' ? keyof typeof corporate :
  never;
