/**
 * SoupFinance Main Application
 * Sets up routing, query client, and global providers
 *
 * Frontend error logging:
 * - FrontendLoggerService captures console errors, unhandled JS errors, and promise rejections
 * - ErrorBoundary catches React component errors
 * - All errors are sent to backend at /rest/frontendLog/batch.json with [SOUPFINANCE] tag
 */
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';

// Added: i18n initialization - must be imported before any component that uses translations
import './i18n';

// Frontend error logging - must be imported early to capture errors during initialization
import { frontendLogger } from './utils/frontendLogger';

// React Error Boundary - catches component errors
import { ErrorBoundary } from './components/ErrorBoundary';

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
// Resend confirmation email page
import { ResendConfirmationPage } from './features/auth/ResendConfirmationPage';
// Forgot password and reset password pages
import { ForgotPasswordPage } from './features/auth/ForgotPasswordPage';
import { ResetPasswordPage } from './features/auth/ResetPasswordPage';

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
// Added: Scheduled Reports page for automated report delivery
import { ScheduledReportsPage } from './features/reports/ScheduledReportsPage';

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
  RoleListPage,
  RoleFormPage,
} from './features/settings';
// Added (SOUPFIN-102): hides pages a custom role does not cover
import { RequirePermission } from './components/feedback/RequirePermission';

// Added (SOUPFIN-75): In-app user guide
import { HelpPage } from './features/help/HelpPage';

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

  // Show loading only during initialization (token validation), NOT during
  // active login attempts. The login form manages its own loading state.
  // isInitialized stays false until initialize() completes, so this
  // properly blocks during token validation without unmounting the form
  // when authStore.login() sets isLoading: true.
  if (!isInitialized) {
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
  // Fix (SOUPFIN-10): Gate account-settings fetch on full auth initialization +
  // tenantId presence to avoid race-condition error "No tenant ID found".
  const authInitialized = useAuthStore((state) => state.isInitialized);
  const tenantId = useAuthStore((state) => state.user?.tenantId);
  const darkMode = useUIStore((state) => state.darkMode);
  const fetchAccountSettings = useAccountStore((state) => state.fetchSettings);
  const accountInitialized = useAccountStore((state) => state.isInitialized);

  // Initialize frontend logger on mount - captures console errors, JS errors, and promise rejections
  // This sends all errors to backend at /rest/frontendLog/batch.json with [SOUPFINANCE] tag
  useEffect(() => {
    frontendLogger.initialize();

    // Cleanup on unmount
    return () => {
      frontendLogger.destroy();
    };
  }, []);

  // Initialize auth state on mount
  // Changed: Now async - validates token with server
  useEffect(() => {
    initialize().catch((error) => {
      console.error('[App] Auth initialization failed:', error);
    });
  }, [initialize]);

  // Added: Fetch account settings when authenticated
  // This loads the tenant's currency and other settings
  // Fix (SOUPFIN-10): Only fetch after auth fully initialized AND tenantId is enriched.
  // Without this guard, fetchSettings runs on persisted-but-stale auth state before
  // validateToken() resolves, producing "No tenant ID found" errors.
  useEffect(() => {
    if (isAuthenticated && authInitialized && tenantId && !accountInitialized) {
      fetchAccountSettings().catch((error) => {
        console.error('[App] Failed to fetch account settings:', error);
      });
    }
  }, [isAuthenticated, authInitialized, tenantId, accountInitialized, fetchAccountSettings]);

  // Apply dark mode class — darkMode is resolved from themeMode (light/dark/system) in uiStore
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  return (
    <ErrorBoundary>
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
            {/* Resend confirmation email (public - accessible from registration success and login error) */}
            <Route path="/resend-confirmation" element={<ResendConfirmationPage />} />
            {/* Forgot password (public - accessible from login page) */}
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            {/* Reset password (public - accessed via email link with token query param) */}
            <Route path="/reset-password" element={<ResetPasswordPage />} />
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
            <Route path="/invoices" element={<RequirePermission area="invoices" action="view"><InvoiceListPage /></RequirePermission>} />
            <Route path="/invoices/new" element={<RequirePermission area="invoices" action="create"><InvoiceFormPage /></RequirePermission>} />
            <Route path="/invoices/:id" element={<RequirePermission area="invoices" action="view"><InvoiceDetailPage /></RequirePermission>} />
            <Route path="/invoices/:id/edit" element={<RequirePermission area="invoices" action="edit"><InvoiceFormPage /></RequirePermission>} />

            {/* Bills */}
            <Route path="/bills" element={<RequirePermission area="bills" action="view"><BillListPage /></RequirePermission>} />
            <Route path="/bills/new" element={<RequirePermission area="bills" action="create"><BillFormPage /></RequirePermission>} />
            <Route path="/bills/:id" element={<RequirePermission area="bills" action="view"><BillDetailPage /></RequirePermission>} />
            <Route path="/bills/:id/edit" element={<RequirePermission area="bills" action="edit"><BillFormPage /></RequirePermission>} />

            {/* Added: Vendors */}
            <Route path="/vendors" element={<RequirePermission area="vendors" action="view"><VendorListPage /></RequirePermission>} />
            <Route path="/vendors/new" element={<RequirePermission area="vendors" action="create"><VendorFormPage /></RequirePermission>} />
            {/* Changed: Use VendorDetailPage for viewing, VendorFormPage for editing */}
            <Route path="/vendors/:id" element={<RequirePermission area="vendors" action="view"><VendorDetailPage /></RequirePermission>} />
            <Route path="/vendors/:id/edit" element={<RequirePermission area="vendors" action="edit"><VendorFormPage /></RequirePermission>} />

            {/* Added (2026-01-30): Invoice Clients */}
            <Route path="/clients" element={<RequirePermission area="clients" action="view"><ClientListPage /></RequirePermission>} />
            <Route path="/clients/new" element={<RequirePermission area="clients" action="create"><ClientFormPage /></RequirePermission>} />
            <Route path="/clients/:id" element={<RequirePermission area="clients" action="view"><ClientDetailPage /></RequirePermission>} />
            <Route path="/clients/:id/edit" element={<RequirePermission area="clients" action="edit"><ClientFormPage /></RequirePermission>} />

            {/* Payments */}
            <Route path="/payments" element={<RequirePermission area="payments" action="view"><PaymentListPage /></RequirePermission>} />
            <Route path="/payments/new" element={<RequirePermission area="payments" action="create"><PaymentFormPage /></RequirePermission>} />

            {/* Ledger */}
            <Route path="/ledger/accounts" element={<RequirePermission area="ledger" action="view"><ChartOfAccountsPage /></RequirePermission>} />
            <Route path="/ledger/transactions" element={<RequirePermission area="ledger" action="view"><LedgerTransactionsPage /></RequirePermission>} />

            {/* Added: Accounting Transactions */}
            <Route path="/accounting/transactions" element={<RequirePermission area="ledger" action="view"><TransactionRegisterPage /></RequirePermission>} />
            {/* Changed: Added route for /accounting/journal-entry without /new to match navigation handler */}
            <Route path="/accounting/journal-entry" element={<RequirePermission area="ledger" action="create"><JournalEntryPage /></RequirePermission>} />
            <Route path="/accounting/journal-entry/new" element={<RequirePermission area="ledger" action="create"><JournalEntryPage /></RequirePermission>} />
            <Route path="/accounting/journal-entry/:id" element={<RequirePermission area="ledger" action="view"><JournalEntryPage /></RequirePermission>} />
            {/* Changed: Added routes for voucher type URLs to match navigation handlers */}
            <Route path="/accounting/voucher/payment" element={<RequirePermission area="ledger" action="create"><VoucherFormPage /></RequirePermission>} />
            <Route path="/accounting/voucher/receipt" element={<RequirePermission area="ledger" action="create"><VoucherFormPage /></RequirePermission>} />
            <Route path="/accounting/vouchers" element={<RequirePermission area="ledger" action="create"><VoucherFormPage /></RequirePermission>} />
            <Route path="/accounting/vouchers/new" element={<RequirePermission area="ledger" action="create"><VoucherFormPage /></RequirePermission>} />
            <Route path="/accounting/vouchers/:id" element={<RequirePermission area="ledger" action="view"><VoucherFormPage /></RequirePermission>} />

            {/* Reports */}
            <Route path="/reports" element={<RequirePermission area="reports" action="view"><ReportsPage /></RequirePermission>} />
            <Route path="/reports/pnl" element={<RequirePermission area="reports" action="view"><ProfitLossPage /></RequirePermission>} />
            <Route path="/reports/balance-sheet" element={<RequirePermission area="reports" action="view"><BalanceSheetPage /></RequirePermission>} />
            <Route path="/reports/cash-flow" element={<RequirePermission area="reports" action="view"><CashFlowPage /></RequirePermission>} />
            <Route path="/reports/aging" element={<RequirePermission area="reports" action="view"><AgingReportsPage /></RequirePermission>} />
            {/* Added: Trial Balance report */}
            <Route path="/reports/trial-balance" element={<RequirePermission area="reports" action="view"><TrialBalancePage /></RequirePermission>} />
            {/* Added: Scheduled Reports for automated report delivery */}
            <Route path="/reports/scheduled" element={<RequirePermission area="reports" action="view"><ScheduledReportsPage /></RequirePermission>} />

            {/* Added: Corporate KYC Onboarding (protected) */}
            <Route path="/onboarding/company" element={<CompanyInfoPage />} />
            <Route path="/onboarding/directors" element={<DirectorsPage />} />
            <Route path="/onboarding/documents" element={<DocumentsPage />} />
            <Route path="/onboarding/status" element={<KycStatusPage />} />

            {/* Added (2026-01-30): Settings */}
            <Route path="/settings" element={<SettingsLayout />}>
              <Route index element={null} />
              {/* User Management (agents with director/signatory managed inline) */}
              <Route path="users" element={<RequirePermission area="settings" action="view"><UserListPage /></RequirePermission>} />
              <Route path="users/new" element={<RequirePermission area="settings" action="create"><UserFormPage /></RequirePermission>} />
              <Route path="users/:id" element={<RequirePermission area="settings" action="view"><UserFormPage /></RequirePermission>} />
              {/* Bank Accounts */}
              <Route path="bank-accounts" element={<RequirePermission area="settings" action="view"><BankAccountListPage /></RequirePermission>} />
              <Route path="bank-accounts/new" element={<RequirePermission area="settings" action="create"><BankAccountFormPage /></RequirePermission>} />
              <Route path="bank-accounts/:id" element={<RequirePermission area="settings" action="view"><BankAccountFormPage /></RequirePermission>} />
              {/* Added (SOUPFIN-102): custom roles and their permission matrix */}
              <Route path="roles" element={<RequirePermission area="settings" action="view"><RoleListPage /></RequirePermission>} />
              <Route path="roles/new" element={<RequirePermission area="settings" action="create"><RoleFormPage /></RequirePermission>} />
              <Route path="roles/:id" element={<RequirePermission area="settings" action="view"><RoleFormPage /></RequirePermission>} />
              {/* Account Settings */}
              <Route path="account" element={<RequirePermission area="settings" action="view"><AccountSettingsPage /></RequirePermission>} />
            </Route>

            {/* Added (SOUPFIN-75): User guide, reached from the sidebar Help link */}
            <Route path="/help" element={<HelpPage />} />
          </Route>

            {/* Catch all */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
