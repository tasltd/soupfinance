/**
 * i18n Configuration for SoupFinance
 * Supports: English (en), German (de), French (fr), Dutch (nl)
 * Uses browser language detection with fallback to English
 *
 * Namespaces (12 total):
 * - common: Shared UI elements
 * - auth: Authentication/login
 * - navigation: Menu and nav items
 * - invoices: Invoice management
 * - reports: Financial reports
 * - accounting: Journal entries, vouchers, transactions (core feature)
 * - bills: Vendor bills management
 * - payments: Payment tracking
 * - ledger: Chart of accounts, GL transactions
 * - vendors: Vendor management
 * - dashboard: Dashboard overview
 * - corporate: KYC onboarding
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import translation files - English
import enCommon from './locales/en/common.json';
import enAuth from './locales/en/auth.json';
import enNav from './locales/en/navigation.json';
import enInvoices from './locales/en/invoices.json';
import enReports from './locales/en/reports.json';
import enAccounting from './locales/en/accounting.json';
import enBills from './locales/en/bills.json';
import enPayments from './locales/en/payments.json';
import enLedger from './locales/en/ledger.json';
import enVendors from './locales/en/vendors.json';
import enDashboard from './locales/en/dashboard.json';
import enCorporate from './locales/en/corporate.json';

// Import translation files - German
import deCommon from './locales/de/common.json';
import deAuth from './locales/de/auth.json';
import deNav from './locales/de/navigation.json';
import deInvoices from './locales/de/invoices.json';
import deReports from './locales/de/reports.json';
import deAccounting from './locales/de/accounting.json';
import deBills from './locales/de/bills.json';
import dePayments from './locales/de/payments.json';
import deLedger from './locales/de/ledger.json';
import deVendors from './locales/de/vendors.json';
import deDashboard from './locales/de/dashboard.json';
import deCorporate from './locales/de/corporate.json';

// Import translation files - French
import frCommon from './locales/fr/common.json';
import frAuth from './locales/fr/auth.json';
import frNav from './locales/fr/navigation.json';
import frInvoices from './locales/fr/invoices.json';
import frReports from './locales/fr/reports.json';
import frAccounting from './locales/fr/accounting.json';
import frBills from './locales/fr/bills.json';
import frPayments from './locales/fr/payments.json';
import frLedger from './locales/fr/ledger.json';
import frVendors from './locales/fr/vendors.json';
import frDashboard from './locales/fr/dashboard.json';
import frCorporate from './locales/fr/corporate.json';

// Import translation files - Dutch
import nlCommon from './locales/nl/common.json';
import nlAuth from './locales/nl/auth.json';
import nlNav from './locales/nl/navigation.json';
import nlInvoices from './locales/nl/invoices.json';
import nlReports from './locales/nl/reports.json';
import nlAccounting from './locales/nl/accounting.json';
import nlBills from './locales/nl/bills.json';
import nlPayments from './locales/nl/payments.json';
import nlLedger from './locales/nl/ledger.json';
import nlVendors from './locales/nl/vendors.json';
import nlDashboard from './locales/nl/dashboard.json';
import nlCorporate from './locales/nl/corporate.json';

// Supported languages
export const supportedLanguages = {
  en: { name: 'English', nativeName: 'English', flag: '🇬🇧' },
  de: { name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' },
  fr: { name: 'French', nativeName: 'Français', flag: '🇫🇷' },
  nl: { name: 'Dutch', nativeName: 'Nederlands', flag: '🇳🇱' },
} as const;

export type SupportedLanguage = keyof typeof supportedLanguages;

// Namespaces used in the app (12 total)
// Note: 'accounting' is a core feature for integrations
export const namespaces = [
  'common',
  'auth',
  'navigation',
  'invoices',
  'reports',
  'accounting',  // Core: journal entries, vouchers, transactions
  'bills',       // Vendor bills management
  'payments',    // Payment tracking
  'ledger',      // Chart of accounts, GL
  'vendors',     // Vendor management
  'dashboard',   // Dashboard overview
  'corporate',   // KYC onboarding
] as const;
export type Namespace = (typeof namespaces)[number];

// Resources object with all translations
const resources = {
  en: {
    common: enCommon,
    auth: enAuth,
    navigation: enNav,
    invoices: enInvoices,
    reports: enReports,
    accounting: enAccounting,
    bills: enBills,
    payments: enPayments,
    ledger: enLedger,
    vendors: enVendors,
    dashboard: enDashboard,
    corporate: enCorporate,
  },
  de: {
    common: deCommon,
    auth: deAuth,
    navigation: deNav,
    invoices: deInvoices,
    reports: deReports,
    accounting: deAccounting,
    bills: deBills,
    payments: dePayments,
    ledger: deLedger,
    vendors: deVendors,
    dashboard: deDashboard,
    corporate: deCorporate,
  },
  fr: {
    common: frCommon,
    auth: frAuth,
    navigation: frNav,
    invoices: frInvoices,
    reports: frReports,
    accounting: frAccounting,
    bills: frBills,
    payments: frPayments,
    ledger: frLedger,
    vendors: frVendors,
    dashboard: frDashboard,
    corporate: frCorporate,
  },
  nl: {
    common: nlCommon,
    auth: nlAuth,
    navigation: nlNav,
    invoices: nlInvoices,
    reports: nlReports,
    accounting: nlAccounting,
    bills: nlBills,
    payments: nlPayments,
    ledger: nlLedger,
    vendors: nlVendors,
    dashboard: nlDashboard,
    corporate: nlCorporate,
  },
};

i18n
  // Detect user language from browser
  .use(LanguageDetector)
  // Pass the i18n instance to react-i18next
  .use(initReactI18next)
  // Initialize i18next
  .init({
    resources,
    fallbackLng: 'en',
    defaultNS: 'common',
    ns: namespaces,

    // Language detection options
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
      lookupLocalStorage: 'soupfinance_language',
    },

    interpolation: {
      // React already escapes values
      escapeValue: false,
    },

    // Debug mode in development
    debug: import.meta.env.DEV,
  });

export default i18n;
