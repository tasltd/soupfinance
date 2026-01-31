/**
 * Custom hooks for data fetching and state management
 * Added: Centralized exports for all custom hooks
 */

// Added: Dashboard statistics hook
export { useDashboardStats, getMockStats } from './useDashboardStats';
export type { DashboardStats } from './useDashboardStats';

// Added: Ledger accounts hook for dropdowns and forms
// Changed: Removed LedgerAccountOption export (type is defined locally in consuming components)
export { useLedgerAccounts, getMockAccounts } from './useLedgerAccounts';

// Added: Unified transactions hook for Transaction Register
export { useTransactions, getMockTransactions } from './useTransactions';
export type { UnifiedTransaction } from './useTransactions';

// Added: PDF generation hook for invoices, bills, and reports
export { usePdf } from './usePdf';
export type { UsePdfReturn } from './usePdf';

// Added: Email sending hook with frontend PDF generation
export { useEmailSend } from './useEmailSend';
export type { UseEmailSendReturn, EmailSendOptions, ReportEmailOptions } from './useEmailSend';
