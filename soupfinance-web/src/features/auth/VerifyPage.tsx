/**
 * OTP Verification Page
 * Displays after successful registration - user enters code sent to email/phone
 * Uses /client/authenticate.json to request OTP and /client/verifyCode.json to verify
 *
 * Flow:
 * 1. Registration completes → navigates here with contact info in state
 * 2. Page mounts → calls /client/authenticate.json to send OTP to contact
 * 3. User enters 5-digit code
 * 4. On successful verification, user is authenticated and redirected to dashboard
 *
 * Changed (2026-01-28): Fixed OTP not being sent - now automatically requests OTP on mount
 * The backend does NOT auto-send OTP during registration; it must be explicitly requested.
 */
import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { requestOTP, verifyOTP } from '../../api/auth';
import { useAuthStore } from '../../stores';

// State passed from registration page
interface VerifyLocationState {
  contact: string;
  corporateId?: string;
  companyName?: string;
}

export function VerifyPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as VerifyLocationState | null;

  // Zustand auth store for updating auth state after verification
  const setAuthenticated = useAuthStore((state) => state.setAuthenticated);

  // OTP input state - 5 separate inputs for better UX
  const [otp, setOtp] = useState(['', '', '', '', '']);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Error state
  const [error, setError] = useState<string | null>(null);

  // Resend cooldown
  const [resendCooldown, setResendCooldown] = useState(0);

  // Added (2026-01-28): Track if initial OTP request has been made
  const [initialOtpRequested, setInitialOtpRequested] = useState(false);

  // Redirect to register if no contact info
  useEffect(() => {
    if (!state?.contact) {
      navigate('/register', { replace: true });
    }
  }, [state, navigate]);

  // Cooldown timer for resend
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // Request OTP mutation (for initial send and resend)
  const requestOtpMutation = useMutation({
    mutationFn: () => requestOTP(state?.contact || ''),
    onSuccess: () => {
      setResendCooldown(60); // 60 second cooldown
      setError(null);
    },
    onError: (error: Error) => {
      setError(error.message || 'Failed to send verification code. Please try again.');
    },
  });

  // Added (2026-01-28): Automatically request OTP when page mounts with valid contact
  // Fix: OTP was not being sent after registration because backend does NOT auto-send
  useEffect(() => {
    if (state?.contact && !initialOtpRequested) {
      setInitialOtpRequested(true);
      requestOtpMutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.contact, initialOtpRequested]);

  // Verify OTP mutation
  const verifyMutation = useMutation({
    mutationFn: () => verifyOTP(otp.join('')),
    onSuccess: (user) => {
      // Update auth store
      setAuthenticated(true, user);
      // Navigate to dashboard
      navigate('/dashboard', { replace: true });
    },
    onError: (error: Error & { response?: { data?: { message?: string } } }) => {
      const backendMessage = error.response?.data?.message;
      setError(backendMessage || error.message || 'Invalid verification code. Please try again.');
      // Clear OTP inputs on error
      setOtp(['', '', '', '', '']);
      inputRefs.current[0]?.focus();
    },
  });

  // Handle individual OTP input change
  const handleOtpChange = (index: number, value: string) => {
    // Only allow digits
    if (value && !/^\d+$/.test(value)) return;

    const newOtp = [...otp];
    // Handle paste - spread across inputs
    if (value.length > 1) {
      const digits = value.slice(0, 5).split('');
      digits.forEach((digit, i) => {
        if (index + i < 5) {
          newOtp[index + i] = digit;
        }
      });
      setOtp(newOtp);
      // Focus last filled input or next empty
      const nextIndex = Math.min(index + digits.length, 4);
      inputRefs.current[nextIndex]?.focus();
      return;
    }

    newOtp[index] = value;
    setOtp(newOtp);

    // Auto-focus next input
    if (value && index < 4) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  // Handle backspace - move to previous input
  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = otp.join('');
    if (code.length !== 5) {
      setError('Please enter the complete 5-digit code');
      return;
    }
    setError(null);
    verifyMutation.mutate();
  };

  // Handle resend
  const handleResend = () => {
    if (resendCooldown > 0) return;
    requestOtpMutation.mutate();
  };

  // Don't render if no state
  if (!state?.contact) {
    return null;
  }

  // Mask contact for display (show partial email/phone)
  const maskedContact = state.contact.includes('@')
    ? state.contact.replace(/(.{2})(.*)(@.*)/, '$1***$3')
    : state.contact.replace(/(.{4})(.*)(.{3})/, '$1***$3');

  return (
    <div className="flex flex-col gap-8" data-testid="verify-page">
      {/* Mobile logo */}
      <div className="lg:hidden flex items-center gap-3 justify-center mb-4">
        <div className="size-12 rounded-full bg-primary flex items-center justify-center text-white font-bold text-xl">
          SF
        </div>
        <h1 className="text-2xl font-bold text-text-light dark:text-text-dark">SoupFinance</h1>
      </div>

      {/* Header */}
      <div>
        <h2
          className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark"
          data-testid="verify-heading"
        >
          Verify Your Account
        </h2>
        <p className="mt-2 text-subtle-text">
          We've sent a 5-digit code to <span className="font-medium text-text-light dark:text-text-dark">{maskedContact}</span>
        </p>
        {state.companyName && (
          <p className="mt-1 text-sm text-subtle-text">
            Setting up <span className="font-medium">{state.companyName}</span>
          </p>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div
          className="p-4 rounded-lg bg-danger/10 border border-danger/30 text-danger text-sm"
          data-testid="verify-error"
        >
          {error}
        </div>
      )}

      {/* OTP Form */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-6" data-testid="verify-form">
        {/* OTP Inputs */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-text-light dark:text-text-dark">
            Verification Code
          </label>
          <div className="flex gap-3 justify-center" data-testid="verify-otp-inputs">
            {otp.map((digit, index) => (
              <input
                key={index}
                ref={(el) => { inputRefs.current[index] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={5}
                value={digit}
                onChange={(e) => handleOtpChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                data-testid={`verify-otp-input-${index}`}
                className="w-14 h-16 text-center text-2xl font-bold rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
                autoFocus={index === 0}
              />
            ))}
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={verifyMutation.isPending || otp.join('').length !== 5}
          data-testid="verify-submit-button"
          className="h-14 rounded-lg bg-primary text-white font-bold text-base hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
        >
          {verifyMutation.isPending ? (
            <>
              <span className="material-symbols-outlined animate-spin">progress_activity</span>
              Verifying...
            </>
          ) : (
            'Verify & Continue'
          )}
        </button>

        {/* Resend Code */}
        <div className="text-center">
          <p className="text-sm text-subtle-text">
            Didn't receive the code?{' '}
            {resendCooldown > 0 ? (
              <span className="text-subtle-text">Resend in {resendCooldown}s</span>
            ) : (
              <button
                type="button"
                onClick={handleResend}
                disabled={requestOtpMutation.isPending}
                className="text-primary hover:underline font-medium disabled:opacity-50"
                data-testid="verify-resend-button"
              >
                {requestOtpMutation.isPending ? 'Sending...' : 'Resend Code'}
              </button>
            )}
          </p>
        </div>
      </form>

      {/* Back to registration link */}
      <p className="text-center text-sm text-subtle-text">
        Wrong contact info?{' '}
        <a
          href="/register"
          className="text-primary hover:underline font-medium"
          data-testid="verify-back-link"
        >
          Go back to registration
        </a>
      </p>
    </div>
  );
}
