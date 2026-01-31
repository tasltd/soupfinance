/**
 * SoupFinance Main Application
 * Sets up routing, query client, and global providers
 */
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';

// Added: i18n initialization - must be imported before any component that uses translations
import './i18n';

// Stores
import { useAuthStore, useUIStore, useAccountStore } from './stores';

// Layouts
import { MainLayout } from './components/layout/MainLayout';
import { AuthLayout } from './components/layout/AuthLayout';

// Auth Pages
import { LoginPage } from './features/auth/LoginPage';
// Added: OTP verification page for registration flow
import { VerifyPage } from './features/auth/VerifyPage';
// Added (2026-01-30): Email confirmation page for tenant registration
import { ConfirmEmailPage } from './features/auth/ConfirmEmailPage';

// Dashboard
import { DashboardPage } from './features/dashboard/DashboardPage';

// Invoices
import { InvoiceListPage } from './features/invoices/InvoiceListPage';
import { InvoiceFormPage } from './features/invoices/InvoiceFormPage';
import { InvoiceDetailPage } from './features/invoices/InvoiceDetailPage';

// Bills
import { BillListPage } from './features/bills/BillListPage';
import { BillFormPage } from './features/bills/BillFormPage';
import { BillDetailPage } from './features/bills/BillDetailPage';

// Added: Vendors
import { VendorListPage, VendorFormPage, VendorDetailPage } from './features/vendors';

// Added (2026-01-30): Invoice Clients for tenant billing
import { ClientListPage, ClientFormPage, ClientDetailPage } from './features/clients';

// Payments
import { PaymentListPage } from './features/payments/PaymentListPage';
import { PaymentFormPage } from './features/payments/PaymentFormPage';

// Ledger
import { ChartOfAccountsPage } from './features/ledger/ChartOfAccountsPage';
import { LedgerTransactionsPage } from './features/ledger/LedgerTransactionsPage';

// Added: Accounting Transactions (Journals, Vouchers)
import { JournalEntryPage } from './features/accounting/JournalEntryPage';
import { VoucherFormPage } from './features/accounting/VoucherFormPage';
import { TransactionRegisterPage } from './features/accounting/TransactionRegisterPage';

// Reports
import { ReportsPage } from './features/reports/ReportsPage';
import { ProfitLossPage } from './features/reports/ProfitLossPage';
import { BalanceSheetPage } from './features/reports/BalanceSheetPage';
import { CashFlowPage } from './features/reports/CashFlowPage';
import { AgingReportsPage } from './features/reports/AgingReportsPage';
// Added: Trial Balance report page
import { TrialBalancePage } from './features/reports/TrialBalancePage';

// Added: Corporate KYC Onboarding
import {
  RegistrationPage,
  CompanyInfoPage,
  DirectorsPage,
  DocumentsPage,
  KycStatusPage,
} from './features/corporate';

// Added (2026-01-30): Settings pages
import {
  SettingsLayout,
  UserListPage,
  UserFormPage,
  BankAccountListPage,
  BankAccountFormPage,
  AccountSettingsPage,
} from './features/settings';

// Added: Toast notifications provider
import { ToastProvider } from './components/feedback/ToastProvider';

// Create React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
    },
  },
});

// Protected route wrapper
// Changed: Also checks isInitialized to wait for token validation
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isInitialized = useAuthStore((state) => state.isInitialized);
  const isLoading = useAuthStore((state) => state.isLoading);

  // Added: Show loading while initializing auth
  if (!isInitialized || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background-light dark:bg-background-dark">
        <div className="flex flex-col items-center gap-4">
          <span className="material-symbols-outlined text-4xl text-primary animate-spin">progress_activity</span>
          <p className="text-subtle-text">Verifying authentication...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

// Public route wrapper (redirects to dashboard if already logged in)
// Changed: Also waits for initialization before redirect
function PublicRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isInitialized = useAuthStore((state) => state.isInitialized);
  const isLoading = useAuthStore((state) => state.isLoading);

  // Added: Show loading while initializing auth
  if (!isInitialized || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background-light dark:bg-background-dark">
        <div className="flex flex-col items-center gap-4">
          <span className="material-symbols-outlined text-4xl text-primary animate-spin">progress_activity</span>
          <p className="text-subtle-text">Loading...</p>
        </div>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  const initialize = useAuthStore((state) => state.initialize);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const darkMode = useUIStore((state) => state.darkMode);
  const fetchAccountSettings = useAccountStore((state) => state.fetchSettings);
  const accountInitialized = useAccountStore((state) => state.isInitialized);

  // Initialize auth state on mount
  // Changed: Now async - validates token with server
  useEffect(() => {
    initialize().catch((error) => {
      console.error('[App] Auth initialization failed:', error);
    });
  }, [initialize]);

  // Added: Fetch account settings when authenticated
  // This loads the tenant's currency and other settings
  useEffect(() => {
    if (isAuthenticated && !accountInitialized) {
      fetchAccountSettings().catch((error) => {
        console.error('[App] Failed to fetch account settings:', error);
      });
    }
  }, [isAuthenticated, accountInitialized, fetchAccountSettings]);

  // Apply dark mode class
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
          {/* Public routes */}
          <Route element={<AuthLayout />}>
            <Route
              path="/login"
              element={
                <PublicRoute>
                  <LoginPage />
                </PublicRoute>
              }
            />
            {/* Added: Corporate Registration (public) */}
            <Route path="/register" element={<RegistrationPage />} />
            {/* Added: OTP Verification (public - for registration flow) */}
            <Route path="/verify" element={<VerifyPage />} />
            {/* Added (2026-01-30): Email Confirmation (public - for tenant registration) */}
            <Route path="/confirm-email" element={<ConfirmEmailPage />} />
          </Route>

          {/* Protected routes */}
          <Route
            element={
              <ProtectedRoute>
                <MainLayout />
              </ProtectedRoute>
            }
          >
            {/* Dashboard */}
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />

            {/* Invoices */}
            <Route path="/invoices" element={<InvoiceListPage />} />
            <Route path="/invoices/new" element={<InvoiceFormPage />} />
            <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
            <Route path="/invoices/:id/edit" element={<InvoiceFormPage />} />

            {/* Bills */}
            <Route path="/bills" element={<BillListPage />} />
            <Route path="/bills/new" element={<BillFormPage />} />
            <Route path="/bills/:id" element={<BillDetailPage />} />
            <Route path="/bills/:id/edit" element={<BillFormPage />} />

            {/* Added: Vendors */}
            <Route path="/vendors" element={<VendorListPage />} />
            <Route path="/vendors/new" element={<VendorFormPage />} />
            {/* Changed: Use VendorDetailPage for viewing, VendorFormPage for editing */}
            <Route path="/vendors/:id" element={<VendorDetailPage />} />
            <Route path="/vendors/:id/edit" element={<VendorFormPage />} />

            {/* Added (2026-01-30): Invoice Clients */}
            <Route path="/clients" element={<ClientListPage />} />
            <Route path="/clients/new" element={<ClientFormPage />} />
            <Route path="/clients/:id" element={<ClientDetailPage />} />
            <Route path="/clients/:id/edit" element={<ClientFormPage />} />

            {/* Payments */}
            <Route path="/payments" element={<PaymentListPage />} />
            <Route path="/payments/new" element={<PaymentFormPage />} />

            {/* Ledger */}
            <Route path="/ledger/accounts" element={<ChartOfAccountsPage />} />
            <Route path="/ledger/transactions" element={<LedgerTransactionsPage />} />

            {/* Added: Accounting Transactions */}
            <Route path="/accounting/transactions" element={<TransactionRegisterPage />} />
            {/* Changed: Added route for /accounting/journal-entry without /new to match navigation handler */}
            <Route path="/accounting/journal-entry" element={<JournalEntryPage />} />
            <Route path="/accounting/journal-entry/new" element={<JournalEntryPage />} />
            <Route path="/accounting/journal-entry/:id" element={<JournalEntryPage />} />
            {/* Changed: Added routes for voucher type URLs to match navigation handlers */}
            <Route path="/accounting/voucher/payment" element={<VoucherFormPage />} />
            <Route path="/accounting/voucher/receipt" element={<VoucherFormPage />} />
            <Route path="/accounting/vouchers" element={<VoucherFormPage />} />
            <Route path="/accounting/vouchers/new" element={<VoucherFormPage />} />
            <Route path="/accounting/vouchers/:id" element={<VoucherFormPage />} />

            {/* Reports */}
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/reports/pnl" element={<ProfitLossPage />} />
            <Route path="/reports/balance-sheet" element={<BalanceSheetPage />} />
            <Route path="/reports/cash-flow" element={<CashFlowPage />} />
            <Route path="/reports/aging" element={<AgingReportsPage />} />
            {/* Added: Trial Balance report */}
            <Route path="/reports/trial-balance" element={<TrialBalancePage />} />

            {/* Added: Corporate KYC Onboarding (protected) */}
            <Route path="/onboarding/company" element={<CompanyInfoPage />} />
            <Route path="/onboarding/directors" element={<DirectorsPage />} />
            <Route path="/onboarding/documents" element={<DocumentsPage />} />
            <Route path="/onboarding/status" element={<KycStatusPage />} />

            {/* Added (2026-01-30): Settings */}
            <Route path="/settings" element={<SettingsLayout />}>
              <Route index element={null} />
              {/* User Management (agents with director/signatory managed inline) */}
              <Route path="users" element={<UserListPage />} />
              <Route path="users/new" element={<UserFormPage />} />
              <Route path="users/:id" element={<UserFormPage />} />
              {/* Bank Accounts */}
              <Route path="bank-accounts" element={<BankAccountListPage />} />
              <Route path="bank-accounts/new" element={<BankAccountFormPage />} />
              <Route path="bank-accounts/:id" element={<BankAccountFormPage />} />
              {/* Account Settings */}
              <Route path="account" element={<AccountSettingsPage />} />
            </Route>
          </Route>

          {/* Catch all */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}
