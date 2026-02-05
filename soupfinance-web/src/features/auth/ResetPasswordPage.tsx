/**
 * Reset Password Page
 * Allows users to set a new password using the token from the reset email.
 *
 * FLOW:
 * 1. User clicks reset link in email → /reset-password?token=xxx
 * 2. User enters new password + confirmation
 * 3. POST /account/resetPassword.json { token, password, confirmPassword }
 * 4. Success → show success message with link to login
 *
 * NOTE: Backend endpoint may not yet exist. The frontend is ready; backend needs
 * POST /account/resetPassword.json to validate token and update password.
 */
import { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { resetPassword } from '../../api/endpoints/registration';
import { Logo } from '../../components/Logo';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [success, setSuccess] = useState(false);

  const resetMutation = useMutation({
    mutationFn: () => resetPassword({ token, password, confirmPassword }),
    onSuccess: () => {
      setSuccess(true);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !password || password !== confirmPassword) return;
    resetMutation.mutate();
  };

  const passwordsMatch = password === confirmPassword || confirmPassword === '';
  const passwordLongEnough = password.length >= 8 || password === '';

  // No token in URL — show error
  if (!token) {
    return (
      <div className="flex flex-col gap-8" data-testid="reset-password-page">
        <div className="lg:hidden flex items-center gap-3 justify-center mb-4">
          <Logo variant="full" size={48} />
        </div>

        <div className="flex justify-center">
          <div className="size-20 rounded-full bg-danger/10 flex items-center justify-center">
            <span className="material-symbols-outlined text-4xl text-danger">error</span>
          </div>
        </div>

        <div className="text-center">
          <h2 className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark">
            Invalid Reset Link
          </h2>
          <p className="mt-2 text-subtle-text">
            This password reset link is invalid or has expired.
          </p>
        </div>

        <div className="flex flex-col gap-2 text-center text-sm text-subtle-text">
          <p>
            <Link to="/forgot-password" className="text-primary hover:underline font-medium">
              Request a new reset link
            </Link>
          </p>
          <p>
            <Link to="/login" className="text-primary hover:underline font-medium">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div className="flex flex-col gap-8" data-testid="reset-password-page">
        <div className="lg:hidden flex items-center gap-3 justify-center mb-4">
          <Logo variant="full" size={48} />
        </div>

        <div className="flex justify-center">
          <div className="size-20 rounded-full bg-success/10 flex items-center justify-center">
            <span className="material-symbols-outlined text-4xl text-success">check_circle</span>
          </div>
        </div>

        <div className="text-center">
          <h2
            className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark"
            data-testid="reset-password-success-heading"
          >
            Password Reset Successfully
          </h2>
          <p className="mt-2 text-subtle-text">
            Your password has been updated. You can now sign in with your new password.
          </p>
        </div>

        <Link
          to="/login"
          data-testid="reset-password-login-link"
          className="h-14 rounded-lg bg-primary text-white font-bold text-base hover:bg-primary/90 flex items-center justify-center gap-2 transition-colors"
        >
          Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8" data-testid="reset-password-page">
      {/* Mobile logo */}
      <div className="lg:hidden flex items-center gap-3 justify-center mb-4">
        <Logo variant="full" size={48} />
      </div>

      {/* Icon */}
      <div className="flex justify-center">
        <div className="size-20 rounded-full bg-primary/10 flex items-center justify-center">
          <span className="material-symbols-outlined text-4xl text-primary">lock</span>
        </div>
      </div>

      {/* Header */}
      <div className="text-center">
        <h2
          className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark"
          data-testid="reset-password-heading"
        >
          Reset Your Password
        </h2>
        <p className="mt-2 text-subtle-text">
          Enter your new password below.
        </p>
      </div>

      {/* Error banner */}
      {resetMutation.isError && (
        <div
          className="p-4 rounded-lg bg-danger/10 border border-danger/30 text-danger text-sm flex items-start gap-3"
          data-testid="reset-password-error"
        >
          <span className="material-symbols-outlined text-lg flex-shrink-0 mt-0.5">error</span>
          <div>
            <p className="font-medium">Reset failed</p>
            <p className="mt-1 text-danger/80">
              {resetMutation.error instanceof Error
                ? resetMutation.error.message
                : 'The reset link may have expired. Please request a new one.'}
            </p>
          </div>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-6" data-testid="reset-password-form">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-text-light dark:text-text-dark">
            New Password
          </span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter new password"
            required
            minLength={8}
            data-testid="reset-password-input"
            className="h-12 px-4 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark placeholder:text-subtle-text focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          {!passwordLongEnough && (
            <span className="text-xs text-danger">Password must be at least 8 characters</span>
          )}
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-text-light dark:text-text-dark">
            Confirm New Password
          </span>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm new password"
            required
            data-testid="reset-password-confirm-input"
            className="h-12 px-4 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark placeholder:text-subtle-text focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          {!passwordsMatch && (
            <span className="text-xs text-danger">Passwords do not match</span>
          )}
        </label>

        <button
          type="submit"
          disabled={resetMutation.isPending || !password || !confirmPassword || !passwordsMatch || !passwordLongEnough}
          data-testid="reset-password-submit-button"
          className="h-14 rounded-lg bg-primary text-white font-bold text-base hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
        >
          {resetMutation.isPending ? (
            <>
              <span className="material-symbols-outlined animate-spin">progress_activity</span>
              Resetting...
            </>
          ) : (
            'Reset Password'
          )}
        </button>
      </form>

      {/* Navigation links */}
      <div className="text-center text-sm text-subtle-text">
        <p>
          <Link to="/login" className="text-primary hover:underline font-medium">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
