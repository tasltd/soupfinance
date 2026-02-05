/**
 * Resend Confirmation Email Page
 * Allows users to request a new confirmation email if they didn't receive the original,
 * or if the confirmation token has expired.
 *
 * ENTRY POINTS:
 * 1. Post-registration: "Resend confirmation" link on RegistrationPage success screen
 *    (passes email via route state)
 * 2. Login error: "Resend confirmation" link when login fails with unconfirmed email error
 *    (passes email via route state)
 * 3. Direct navigation: User types /resend-confirmation directly
 *
 * FLOW:
 * 1. User enters email (or it's pre-filled from route state)
 * 2. POST /account/resendConfirmation.json
 * 3. Success → show confirmation message with cooldown before allowing resend again
 */
import { useState, useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { resendConfirmation } from '../../api/endpoints/registration';
import { Logo } from '../../components/Logo';

const RESEND_COOLDOWN_SECONDS = 60;

export function ResendConfirmationPage() {
  const location = useLocation();
  const emailFromState = (location.state as { email?: string } | null)?.email ?? '';

  const [email, setEmail] = useState(emailFromState);
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const resendMutation = useMutation({
    mutationFn: () => resendConfirmation(email),
    onSuccess: () => {
      setSent(true);
      setCooldown(RESEND_COOLDOWN_SECONDS);
    },
    onError: () => {
      // Even on error, show the generic "check your email" message.
      // This prevents leaking whether an email exists in the system.
      setSent(true);
      setCooldown(RESEND_COOLDOWN_SECONDS);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || cooldown > 0) return;
    resendMutation.mutate();
  };

  return (
    <div className="flex flex-col gap-8" data-testid="resend-confirmation-page">
      {/* Mobile logo */}
      <div className="lg:hidden flex items-center gap-3 justify-center mb-4">
        <Logo variant="full" size={48} />
      </div>

      {/* Icon */}
      <div className="flex justify-center">
        <div className="size-20 rounded-full bg-primary/10 flex items-center justify-center">
          <span className="material-symbols-outlined text-4xl text-primary">forward_to_inbox</span>
        </div>
      </div>

      {/* Header */}
      <div className="text-center">
        <h2
          className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark"
          data-testid="resend-confirmation-heading"
        >
          Resend Confirmation Email
        </h2>
        <p className="mt-2 text-subtle-text">
          Enter the email address you registered with and we'll send a new confirmation link.
        </p>
      </div>

      {/* Success banner */}
      {sent && (
        <div
          className="p-4 rounded-lg bg-success/10 border border-success/30 text-success text-sm flex items-start gap-3"
          data-testid="resend-confirmation-success"
        >
          <span className="material-symbols-outlined text-lg flex-shrink-0 mt-0.5">check_circle</span>
          <div>
            <p className="font-medium">Confirmation email sent</p>
            <p className="mt-1 text-success/80">
              If an account exists for <span className="font-medium">{email}</span>, a new confirmation link has been sent. Please check your inbox and spam folder.
            </p>
          </div>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-6" data-testid="resend-confirmation-form">
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
            data-testid="resend-confirmation-email-input"
            className="h-12 px-4 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark placeholder:text-subtle-text focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </label>

        <button
          type="submit"
          disabled={resendMutation.isPending || cooldown > 0 || !email.trim()}
          data-testid="resend-confirmation-submit-button"
          className="h-14 rounded-lg bg-primary text-white font-bold text-base hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
        >
          {resendMutation.isPending ? (
            <>
              <span className="material-symbols-outlined animate-spin">progress_activity</span>
              Sending...
            </>
          ) : cooldown > 0 ? (
            `Resend available in ${cooldown}s`
          ) : sent ? (
            'Resend Again'
          ) : (
            'Send Confirmation Email'
          )}
        </button>
      </form>

      {/* Navigation links */}
      <div className="flex flex-col gap-2 text-center text-sm text-subtle-text">
        <p>
          Already confirmed?{' '}
          <Link to="/login" className="text-primary hover:underline font-medium" data-testid="resend-confirmation-login-link">
            Sign in
          </Link>
        </p>
        <p>
          Don't have an account?{' '}
          <Link to="/register" className="text-primary hover:underline font-medium" data-testid="resend-confirmation-register-link">
            Register your company
          </Link>
        </p>
      </div>
    </div>
  );
}
