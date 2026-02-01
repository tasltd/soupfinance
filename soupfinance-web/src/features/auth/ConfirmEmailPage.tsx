/**
 * Email Confirmation Page
 * Allows users to set their password after clicking the confirmation link in their email.
 *
 * FLOW:
 * 1. User receives confirmation email with link to /confirm-email?token=xxx
 * 2. This page extracts the token from URL
 * 3. User enters and confirms their password
 * 4. On success, redirects to login page
 *
 * ARCHITECTURE (2026-01-30):
 * Part of the tenant registration flow. Password is NOT collected during registration -
 * it's set here after email verification.
 */
import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { confirmEmail } from '../../api/endpoints/registration';
import { Logo } from '../../components/Logo';

// Password requirements
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_REQUIREMENTS = [
  { key: 'length', label: 'At least 8 characters', test: (p: string) => p.length >= PASSWORD_MIN_LENGTH },
  { key: 'uppercase', label: 'One uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { key: 'lowercase', label: 'One lowercase letter', test: (p: string) => /[a-z]/.test(p) },
  { key: 'number', label: 'One number', test: (p: string) => /\d/.test(p) },
];

export function ConfirmEmailPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  // Form state
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Validation state
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState({ password: false, confirmPassword: false });

  // Success state
  const [confirmationSuccess, setConfirmationSuccess] = useState(false);

  // Redirect if no token
  useEffect(() => {
    if (!token) {
      navigate('/register', { replace: true });
    }
  }, [token, navigate]);

  // Confirmation mutation
  const confirmMutation = useMutation({
    mutationFn: () => confirmEmail({ token: token!, password, confirmPassword }),
    onSuccess: (response) => {
      if (response.success) {
        setConfirmationSuccess(true);
      } else {
        if (response.errors) {
          setValidationErrors(response.errors);
        } else {
          setValidationErrors({ form: response.error || response.message || 'Confirmation failed' });
        }
      }
    },
    onError: (error: Error & { response?: { data?: { message?: string; error?: string; errors?: Record<string, string> } } }) => {
      const backendData = error.response?.data;
      if (backendData?.errors) {
        setValidationErrors(backendData.errors);
      } else {
        const errorMessage = backendData?.message || backendData?.error || error.message || 'Confirmation failed. Please try again.';
        setValidationErrors({ form: errorMessage });
      }
    },
  });

  // Check password requirements
  const passwordChecks = PASSWORD_REQUIREMENTS.map((req) => ({
    ...req,
    passed: req.test(password),
  }));
  const allPasswordChecksPassed = passwordChecks.every((c) => c.passed);

  // Validate form
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!password) {
      errors.password = 'Password is required';
    } else if (!allPasswordChecksPassed) {
      errors.password = 'Password does not meet requirements';
    }

    if (!confirmPassword) {
      errors.confirmPassword = 'Please confirm your password';
    } else if (password !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ password: true, confirmPassword: true });
    if (validateForm()) {
      confirmMutation.mutate();
    }
  };

  // Don't render if no token
  if (!token) {
    return null;
  }

  // Success screen
  if (confirmationSuccess) {
    return (
      <div className="flex flex-col gap-8" data-testid="confirm-email-success">
        {/* Mobile logo */}
        <div className="lg:hidden flex items-center gap-3 justify-center mb-4">
          <Logo variant="full" size={48} />
        </div>

        {/* Success icon */}
        <div className="flex justify-center">
          <div className="size-20 rounded-full bg-success/10 flex items-center justify-center">
            <span className="material-symbols-outlined text-4xl text-success">check_circle</span>
          </div>
        </div>

        {/* Header */}
        <div className="text-center">
          <h2
            className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark"
            data-testid="confirm-email-success-heading"
          >
            Account Activated!
          </h2>
          <p className="mt-4 text-subtle-text">
            Your email has been confirmed and your password is set.
          </p>
          <p className="mt-2 text-subtle-text">
            You can now sign in to your account.
          </p>
        </div>

        {/* Sign in button */}
        <button
          onClick={() => navigate('/login')}
          className="h-14 rounded-lg bg-primary text-white font-bold text-base hover:bg-primary/90 transition-colors"
          data-testid="confirm-email-login-button"
        >
          Sign In
        </button>
      </div>
    );
  }

  // Confirmation form
  return (
    <div className="flex flex-col gap-8" data-testid="confirm-email-page">
      {/* Mobile logo */}
      <div className="lg:hidden flex items-center gap-3 justify-center mb-4">
        <Logo variant="full" size={48} />
      </div>

      {/* Header */}
      <div>
        <h2
          className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark"
          data-testid="confirm-email-heading"
        >
          Set Your Password
        </h2>
        <p className="mt-2 text-subtle-text">
          Create a secure password to complete your account setup.
        </p>
      </div>

      {/* Form error message */}
      {validationErrors.form && (
        <div
          className="p-4 rounded-lg bg-danger/10 border border-danger/30 text-danger text-sm"
          data-testid="confirm-email-form-error"
        >
          {validationErrors.form}
        </div>
      )}

      {/* Password Form */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-6" data-testid="confirm-email-form">
        {/* Password */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-text-light dark:text-text-dark">
            Password <span className="text-danger">*</span>
          </label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => setTouched((prev) => ({ ...prev, password: true }))}
              placeholder="Enter your password"
              data-testid="confirm-email-password-input"
              className={`h-12 w-full px-4 pr-12 rounded-lg border ${
                validationErrors.password && touched.password
                  ? 'border-danger focus:border-danger focus:ring-danger/20'
                  : 'border-border-light dark:border-border-dark focus:border-primary focus:ring-primary/20'
              } bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark placeholder:text-subtle-text focus:ring-2 focus:outline-none`}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-subtle-text hover:text-text-light dark:hover:text-text-dark"
              data-testid="confirm-email-toggle-password"
            >
              <span className="material-symbols-outlined text-xl">
                {showPassword ? 'visibility_off' : 'visibility'}
              </span>
            </button>
          </div>
          {validationErrors.password && touched.password && (
            <span className="text-xs text-danger">{validationErrors.password}</span>
          )}

          {/* Password requirements */}
          <div className="mt-2 space-y-1">
            {passwordChecks.map((check) => (
              <div
                key={check.key}
                className={`flex items-center gap-2 text-xs ${
                  check.passed ? 'text-success' : 'text-subtle-text'
                }`}
              >
                <span className="material-symbols-outlined text-sm">
                  {check.passed ? 'check_circle' : 'radio_button_unchecked'}
                </span>
                <span>{check.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Confirm Password */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-text-light dark:text-text-dark">
            Confirm Password <span className="text-danger">*</span>
          </label>
          <div className="relative">
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onBlur={() => setTouched((prev) => ({ ...prev, confirmPassword: true }))}
              placeholder="Confirm your password"
              data-testid="confirm-email-confirm-password-input"
              className={`h-12 w-full px-4 pr-12 rounded-lg border ${
                validationErrors.confirmPassword && touched.confirmPassword
                  ? 'border-danger focus:border-danger focus:ring-danger/20'
                  : 'border-border-light dark:border-border-dark focus:border-primary focus:ring-primary/20'
              } bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark placeholder:text-subtle-text focus:ring-2 focus:outline-none`}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-subtle-text hover:text-text-light dark:hover:text-text-dark"
              data-testid="confirm-email-toggle-confirm-password"
            >
              <span className="material-symbols-outlined text-xl">
                {showConfirmPassword ? 'visibility_off' : 'visibility'}
              </span>
            </button>
          </div>
          {validationErrors.confirmPassword && touched.confirmPassword && (
            <span className="text-xs text-danger">{validationErrors.confirmPassword}</span>
          )}
          {/* Password match indicator */}
          {confirmPassword && password && touched.confirmPassword && password === confirmPassword && (
            <span className="text-xs text-success flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">check_circle</span>
              Passwords match
            </span>
          )}
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={confirmMutation.isPending || !allPasswordChecksPassed || password !== confirmPassword}
          data-testid="confirm-email-submit-button"
          className="h-14 rounded-lg bg-primary text-white font-bold text-base hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
        >
          {confirmMutation.isPending ? (
            <>
              <span className="material-symbols-outlined animate-spin">progress_activity</span>
              Activating Account...
            </>
          ) : (
            'Activate Account'
          )}
        </button>
      </form>

      {/* Already have an account */}
      <p className="text-center text-sm text-subtle-text">
        Already activated?{' '}
        <a href="/login" className="text-primary hover:underline font-medium" data-testid="confirm-email-login-link">
          Sign in
        </a>
      </p>
    </div>
  );
}
