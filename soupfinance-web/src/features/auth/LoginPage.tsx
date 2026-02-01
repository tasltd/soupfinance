/**
 * Login Page
 * Uses Spring Security REST with X-Auth-Token authentication
 * Reference: soupfinance-designs/login-authentication/
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores';
import { Logo } from '../../components/Logo';

export function LoginPage() {
  const navigate = useNavigate();
  const { login, isLoading, error, clearError } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Added (2026-01-28): Remember Me state - uses localStorage (persistent) when true, sessionStorage (session-only) when false
  const [rememberMe, setRememberMe] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    try {
      // Changed (2026-01-28): Pass rememberMe to login for dual-storage strategy
      await login(email, password, rememberMe);
      navigate('/dashboard');
    } catch {
      // Error is handled by store
    }
  };

  // Added: data-testid attributes for E2E testing
  return (
    <div className="flex flex-col gap-8" data-testid="login-page">
      {/* Mobile logo */}
      <div className="lg:hidden flex items-center gap-3 justify-center mb-4">
        <Logo variant="full" size={48} />
      </div>

      {/* Header */}
      <div>
        <h2 className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark" data-testid="login-heading">
          Welcome back
        </h2>
        <p className="mt-2 text-subtle-text">
          Sign in to access your corporate finance dashboard
        </p>
      </div>

      {/* Error message */}
      {error && (
        <div className="p-4 rounded-lg bg-danger/10 border border-danger/30 text-danger text-sm" data-testid="login-error">
          {error}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-6" data-testid="login-form">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-text-light dark:text-text-dark">
            Username
          </span>
          <input
            type="text"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your username"
            required
            data-testid="login-email-input"
            className="h-12 px-4 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark placeholder:text-subtle-text focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-text-light dark:text-text-dark">
            Password
          </span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            required
            data-testid="login-password-input"
            className="h-12 px-4 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark placeholder:text-subtle-text focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </label>

        {/* Changed (2026-01-28): Wired up Remember Me checkbox, removed non-functional Forgot Password link */}
        <div className="flex items-center">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              data-testid="login-remember-checkbox"
              className="size-4 rounded border-border-light text-primary focus:ring-primary cursor-pointer"
            />
            <span className="text-sm text-subtle-text">Remember me</span>
          </label>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          data-testid="login-submit-button"
          className="h-14 rounded-lg bg-primary text-white font-bold text-base hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <span className="material-symbols-outlined animate-spin">progress_activity</span>
              Signing in...
            </>
          ) : (
            'Sign In'
          )}
        </button>
      </form>

      {/* Register link */}
      <p className="text-center text-sm text-subtle-text">
        Don't have an account?{' '}
        <a href="/register" className="text-primary hover:underline font-medium" data-testid="login-register-link">
          Register your company
        </a>
      </p>
    </div>
  );
}
