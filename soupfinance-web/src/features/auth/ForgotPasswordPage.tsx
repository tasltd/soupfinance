/**
 * Forgot Password Page
 * Allows users to request a password reset email by entering their email address.
 *
 * FLOW:
 * 1. User clicks "Forgot password?" on LoginPage
 * 2. User enters their email address
 * 3. POST /account/forgotPassword.json
 * 4. Success → show confirmation message (generic, doesn't reveal if email exists)
 * 5. User receives email with reset link → navigates to /reset-password?token=xxx
 *
 * NOTE: Backend endpoint may not yet exist. The frontend is ready; backend needs
 * POST /account/forgotPassword.json to send reset emails.
 */
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { forgotPassword } from '../../api/endpoints/registration';
import { Logo } from '../../components/Logo';

const RESEND_COOLDOWN_SECONDS = 60;

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Cooldown timer to prevent spamming reset requests
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const forgotMutation = useMutation({
    mutationFn: () => forgotPassword(email),
    onSuccess: () => {
      setSent(true);
      setCooldown(RESEND_COOLDOWN_SECONDS);
    },
    onError: () => {
      // Show generic success message even on error to prevent email enumeration
      setSent(true);
      setCooldown(RESEND_COOLDOWN_SECONDS);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || cooldown > 0) return;
    forgotMutation.mutate();
  };

  return (
    <div className="flex flex-col gap-8" data-testid="forgot-password-page">
      {/* Mobile logo */}
      <div className="lg:hidden flex items-center gap-3 justify-center mb-4">
        <Logo variant="full" size={48} />
      </div>

      {/* Icon */}
      <div className="flex justify-center">
        <div className="size-20 rounded-full bg-primary/10 flex items-center justify-center">
          <span className="material-symbols-outlined text-4xl text-primary">lock_reset</span>
        </div>
      </div>

      {/* Header */}
      <div className="text-center">
        <h2
          className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark"
          data-testid="forgot-password-heading"
        >
          Forgot Password?
        </h2>
        <p className="mt-2 text-subtle-text">
          Enter your email address and we'll send you a link to reset your password.
        </p>
      </div>

      {/* Success banner */}
      {sent && (
        <div
          className="p-4 rounded-lg bg-success/10 border border-success/30 text-success text-sm flex items-start gap-3"
          data-testid="forgot-password-success"
        >
          <span className="material-symbols-outlined text-lg flex-shrink-0 mt-0.5">check_circle</span>
          <div>
            <p className="font-medium">Reset link sent</p>
            <p className="mt-1 text-success/80">
              If an account exists for <span className="font-medium">{email}</span>, a password reset link has been sent. Please check your inbox and spam folder.
            </p>
          </div>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-6" data-testid="forgot-password-form">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-text-light dark:text-text-dark">
            Email Address
          </span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email address"
            required
            data-testid="forgot-password-email-input"
            className="h-12 px-4 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark placeholder:text-subtle-text focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </label>

        <button
          type="submit"
          disabled={forgotMutation.isPending || cooldown > 0 || !email.trim()}
          data-testid="forgot-password-submit-button"
          className="h-14 rounded-lg bg-primary text-white font-bold text-base hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
        >
          {forgotMutation.isPending ? (
            <>
              <span className="material-symbols-outlined animate-spin">progress_activity</span>
              Sending...
            </>
          ) : cooldown > 0 ? (
            `Resend available in ${cooldown}s`
          ) : sent ? (
            'Resend Reset Link'
          ) : (
            'Send Reset Link'
          )}
        </button>
      </form>

      {/* Navigation links */}
      <div className="flex flex-col gap-2 text-center text-sm text-subtle-text">
        <p>
          Remember your password?{' '}
          <Link to="/login" className="text-primary hover:underline font-medium" data-testid="forgot-password-login-link">
            Sign in
          </Link>
        </p>
        <p>
          Don't have an account?{' '}
          <Link to="/register" className="text-primary hover:underline font-medium" data-testid="forgot-password-register-link">
            Register your company
          </Link>
        </p>
      </div>
    </div>
  );
}
