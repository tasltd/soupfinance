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
 * 5. Expired or already-used link → "request a new link" screen (SOUPFIN-186)
 *
 * NOTE: Backend endpoint specified in plans/soupfin-186-password-reset-backend.md
 * (not deployed yet). It answers 400 with code TOKEN_EXPIRED / TOKEN_INVALID for
 * an unusable link, which getResetPasswordError() turns into that screen.
 */
import { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
// Added (SOUPFIN-185): every visible string comes from the auth namespace
import { useTranslation } from 'react-i18next';
import { resetPassword, getResetPasswordError } from '../../api/endpoints/registration';
import { Logo } from '../../components/Logo';

export function ResetPasswordPage() {
  const { t } = useTranslation('auth');
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

  // Added (SOUPFIN-186): an expired or used link cannot be retried with a new password
  const resetError = resetMutation.isError ? getResetPasswordError(resetMutation.error) : null;
  const linkUnusable = !token || (resetError !== null && resetError.kind !== 'form');

  const passwordsMatch = password === confirmPassword || confirmPassword === '';
  const passwordLongEnough = password.length >= 8 || password === '';

  // No token in URL, or the backend refused the link — show error
  // Changed (SOUPFIN-186): also covers expired and already-used links
  if (linkUnusable) {
    const expired = resetError?.kind === 'link_expired';
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
          <h2
            className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark"
            data-testid="reset-password-link-error-heading"
          >
            {expired ? t('resetPassword.linkExpiredTitle') : t('resetPassword.invalidLinkTitle')}
          </h2>
          <p className="mt-2 text-subtle-text" data-testid="reset-password-link-error-message">
            {resetError?.message ?? t('resetPassword.invalidLinkMessage')}
          </p>
          <p className="mt-2 text-subtle-text">
            {t('resetPassword.linkHelp')}
          </p>
        </div>

        <div className="flex flex-col gap-2 text-center text-sm text-subtle-text">
          <p>
            <Link
              to="/forgot-password"
              className="text-primary hover:underline font-medium"
              data-testid="reset-password-request-new-link"
            >
              {t('resetPassword.requestNewLink')}
            </Link>
          </p>
          <p>
            <Link to="/login" className="text-primary hover:underline font-medium">
              {t('resetPassword.backToSignIn')}
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
            {t('resetPassword.successTitle')}
          </h2>
          <p className="mt-2 text-subtle-text">
            {t('resetPassword.successMessage')}
          </p>
        </div>

        <Link
          to="/login"
          data-testid="reset-password-login-link"
          className="h-14 rounded-lg bg-primary text-white font-bold text-base hover:bg-primary/90 flex items-center justify-center gap-2 transition-colors"
        >
          {t('resetPassword.signIn')}
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
          {t('resetPassword.title')}
        </h2>
        <p className="mt-2 text-subtle-text">
          {t('resetPassword.subtitle')}
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
            <p className="font-medium">{t('resetPassword.errorTitle')}</p>
            <p className="mt-1 text-danger/80" data-testid="reset-password-error-message">
              {/* Changed (SOUPFIN-186): plain-language message, never "Request failed with status code 400" */}
              {resetError?.message ?? t('resetPassword.errorFallback')}
            </p>
          </div>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-6" data-testid="reset-password-form">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-text-light dark:text-text-dark">
            {t('resetPassword.password')}
          </span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('resetPassword.passwordPlaceholder')}
            required
            minLength={8}
            data-testid="reset-password-input"
            className="h-12 px-4 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark placeholder:text-subtle-text focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          {!passwordLongEnough && (
            <span className="text-xs text-danger">{t('resetPassword.passwordMinLength')}</span>
          )}
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-text-light dark:text-text-dark">
            {t('resetPassword.confirmPassword')}
          </span>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder={t('resetPassword.confirmPasswordPlaceholder')}
            required
            data-testid="reset-password-confirm-input"
            className="h-12 px-4 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark placeholder:text-subtle-text focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          {!passwordsMatch && (
            <span className="text-xs text-danger">{t('resetPassword.passwordsMismatch')}</span>
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
              {t('resetPassword.resetting')}
            </>
          ) : (
            t('resetPassword.submit')
          )}
        </button>
      </form>

      {/* Navigation links */}
      <div className="text-center text-sm text-subtle-text">
        <p>
          <Link to="/login" className="text-primary hover:underline font-medium">
            {t('resetPassword.backToSignIn')}
          </Link>
        </p>
      </div>
    </div>
  );
}
