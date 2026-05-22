/**
 * Tenant Registration Page
 * Creates a new Account (tenant) with an admin user.
 *
 * ARCHITECTURE (2026-01-30):
 * - Registration creates a NEW TENANT (Account) with isolated data
 * - Business type (TRADING/SERVICES) determines initial Chart of Accounts
 *
 * Changed (2026-05-22): Password is now collected at registration.
 * Backend response includes `requiresConfirmation`:
 *  - false → single-step flow: redirect to /login with success banner
 *  - true  → legacy flow: show "Check Your Email" screen, keep ConfirmEmailPage path
 * See plans/soupfinance-disable-email-confirmation.md.
 *
 * Required fields:
 * - Company name
 * - Business type (TRADING or SERVICES)
 * - Country
 * - Admin name (first name, last name)
 * - Admin email
 * - Password + confirm password
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { registerTenant } from '../../api/endpoints/registration';
import type { TenantRegistration, BusinessType } from '../../api/endpoints/registration';
// Changed: Import shared country/currency data from domainData (single source of truth)
import {
  DEFAULT_COUNTRIES,
  getCountryRegions,
  getCurrencyForCountry,
  listCountries,
} from '../../api/endpoints/domainData';
import type { Country } from '../../api/endpoints/domainData';
import { Logo } from '../../components/Logo';

export function RegistrationPage() {
  const navigate = useNavigate();

  // Changed: Load country list from backend utility controller (falls back to defaults)
  const [countries, setCountries] = useState<Country[]>(DEFAULT_COUNTRIES);
  const countryRegions = getCountryRegions(countries);

  useEffect(() => {
    listCountries().then(setCountries);
  }, []);

  // Form state - matches TenantRegistration interface
  // Changed: Country selection auto-maps to currency (editable later in settings)
  // Changed (2026-05-22): Added password field + confirmPassword (form-only, not sent)
  const [formData, setFormData] = useState<TenantRegistration>({
    companyName: '',
    businessType: 'SERVICES',
    adminFirstName: '',
    adminLastName: '',
    email: '',
    country: '',
    currency: '',
    password: '',
  });
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Error state for validation
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Success state - shown only on legacy email-confirmation path
  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');

  // Mutation for registering tenant
  // Changed (2026-05-22): Branch on response.requiresConfirmation
  //  - false → account is enabled, redirect to /login with success banner
  //  - true / undefined → legacy email-confirmation flow (show "Check Your Email")
  const registerMutation = useMutation({
    mutationFn: registerTenant,
    onSuccess: (response) => {
      if (response.success) {
        if (response.requiresConfirmation === false) {
          // Single-step flow: account ready, go straight to login
          navigate('/login', {
            replace: true,
            state: { fromRegistration: true, registeredEmail: formData.email },
          });
        } else {
          // Legacy flow: user must click the email link before logging in
          setRegistrationSuccess(true);
          setRegisteredEmail(formData.email);
        }
      } else {
        // Handle backend validation errors
        if (response.errors) {
          setValidationErrors(response.errors);
        } else {
          setValidationErrors({ form: response.error || response.message || 'Registration failed' });
        }
      }
    },
    onError: (error: Error & { response?: { data?: { message?: string; error?: string; errors?: Record<string, string> } } }) => {
      // Parse backend error message
      const backendData = error.response?.data;
      if (backendData?.errors) {
        setValidationErrors(backendData.errors);
      } else {
        const errorMessage = backendData?.message || backendData?.error || error.message || 'Registration failed. Please try again.';
        setValidationErrors({ form: errorMessage });
      }
    },
  });

  // Form field change handler
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;

    // Changed: Country selection auto-maps to default currency via shared lookup
    if (name === 'country') {
      const mappedCurrency = getCurrencyForCountry(value, countries);
      setFormData((prev) => ({
        ...prev,
        country: value,
        currency: mappedCurrency || '',
      }));
    } else if (name === 'confirmPassword') {
      // confirmPassword is form-local state, not sent to backend
      setConfirmPassword(value);
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }

    // Clear validation error on field change
    if (validationErrors[name]) {
      setValidationErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  // Form validation
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    // Company name - required
    if (!formData.companyName.trim()) {
      errors.companyName = 'Company name is required';
    }

    // Business type - required
    if (!formData.businessType) {
      errors.businessType = 'Please select a business type';
    }

    // Changed: Country is required - determines default currency for the account
    if (!formData.country) {
      errors.country = 'Please select your country';
    }

    // Admin first name - required
    if (!formData.adminFirstName?.trim()) {
      errors.adminFirstName = 'First name is required';
    }

    // Admin last name - required
    if (!formData.adminLastName?.trim()) {
      errors.adminLastName = 'Last name is required';
    }

    // Email - required and must be valid
    if (!formData.email?.trim()) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = 'Please enter a valid email address';
    }

    // Added (2026-05-22): Password required + match ConfirmEmailPage rules
    // Backend may still reject it when requireEmailConfirmation=true; that's fine.
    const pwd = formData.password ?? '';
    if (!pwd) {
      errors.password = 'Password is required';
    } else if (pwd.length < 8) {
      errors.password = 'Password must be at least 8 characters';
    } else if (!/[A-Z]/.test(pwd)) {
      errors.password = 'Password must include an uppercase letter';
    } else if (!/[a-z]/.test(pwd)) {
      errors.password = 'Password must include a lowercase letter';
    } else if (!/\d/.test(pwd)) {
      errors.password = 'Password must include a number';
    }
    if (!errors.password && pwd !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Form submission handler
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      registerMutation.mutate(formData);
    }
  };

  // Success screen - show after registration
  if (registrationSuccess) {
    return (
      <div className="flex flex-col gap-8" data-testid="registration-success">
        {/* Mobile logo */}
        <div className="lg:hidden flex items-center gap-3 justify-center mb-4">
          <Logo variant="full" size={48} />
        </div>

        {/* Success icon */}
        <div className="flex justify-center">
          <div className="size-20 rounded-full bg-success/10 flex items-center justify-center">
            <span className="material-symbols-outlined text-4xl text-success">mark_email_read</span>
          </div>
        </div>

        {/* Header */}
        <div className="text-center">
          <h2
            className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark"
            data-testid="registration-success-heading"
          >
            Check Your Email
          </h2>
          <p className="mt-4 text-subtle-text">
            We've sent a confirmation email to:
          </p>
          <p className="mt-2 font-medium text-text-light dark:text-text-dark">
            {registeredEmail}
          </p>
        </div>

        {/* Instructions */}
        <div className="bg-surface-light dark:bg-surface-dark rounded-lg p-6 border border-border-light dark:border-border-dark">
          <h3 className="font-semibold text-text-light dark:text-text-dark mb-3">Next Steps:</h3>
          <ol className="space-y-3 text-sm text-subtle-text">
            <li className="flex gap-3">
              <span className="flex-shrink-0 size-6 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-xs">1</span>
              <span>Open the email from SoupFinance</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 size-6 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-xs">2</span>
              <span>Click the confirmation link</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 size-6 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-xs">3</span>
              <span>Set your password to complete setup</span>
            </li>
          </ol>
        </div>

        {/* Didn't receive email */}
        <p className="text-center text-sm text-subtle-text">
          Didn't receive the email?{' '}
          <button
            type="button"
            onClick={() => navigate('/resend-confirmation', { state: { email: registeredEmail } })}
            className="text-primary hover:underline font-medium"
          >
            Resend confirmation
          </button>
        </p>

        {/* Back to login */}
        <p className="text-center text-sm text-subtle-text">
          Already confirmed?{' '}
          <a href="/login" className="text-primary hover:underline font-medium">
            Sign in
          </a>
        </p>
      </div>
    );
  }

  // Registration form
  return (
    <div className="flex flex-col gap-8" data-testid="registration-page">
      {/* Mobile logo */}
      <div className="lg:hidden flex items-center gap-3 justify-center mb-4">
        <Logo variant="full" size={48} />
      </div>

      {/* Header */}
      <div>
        <h2
          className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark"
          data-testid="registration-heading"
        >
          Create Your Account
        </h2>
        <p className="mt-2 text-subtle-text">Start managing your business finances in minutes.</p>
      </div>

      {/* Form error message */}
      {validationErrors.form && (
        <div
          className="p-4 rounded-lg bg-danger/10 border border-danger/30 text-danger text-sm"
          data-testid="registration-form-error"
        >
          {validationErrors.form}
        </div>
      )}

      {/* Registration Form */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-6" data-testid="registration-form">
        {/* Company Name */}
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-text-light dark:text-text-dark">
            Company Name <span className="text-danger">*</span>
          </span>
          <input
            type="text"
            name="companyName"
            value={formData.companyName}
            onChange={handleChange}
            placeholder="Enter your company name"
            data-testid="registration-company-name-input"
            className={`h-12 px-4 rounded-lg border ${
              validationErrors.companyName
                ? 'border-danger focus:border-danger focus:ring-danger/20'
                : 'border-border-light dark:border-border-dark focus:border-primary focus:ring-primary/20'
            } bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark placeholder:text-subtle-text focus:ring-2 focus:outline-none`}
          />
          {validationErrors.companyName && (
            <span className="text-xs text-danger" data-testid="registration-company-name-error">
              {validationErrors.companyName}
            </span>
          )}
        </label>

        {/* Business Type */}
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-text-light dark:text-text-dark">
            Business Type <span className="text-danger">*</span>
          </span>
          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => setFormData((prev) => ({ ...prev, businessType: 'TRADING' as BusinessType }))}
              data-testid="registration-business-type-trading"
              className={`p-4 rounded-lg border-2 transition-all ${
                formData.businessType === 'TRADING'
                  ? 'border-primary bg-primary/5'
                  : 'border-border-light dark:border-border-dark hover:border-primary/50'
              }`}
            >
              <div className="flex flex-col items-center gap-2">
                <span className={`material-symbols-outlined text-2xl ${
                  formData.businessType === 'TRADING' ? 'text-primary' : 'text-subtle-text'
                }`}>
                  inventory_2
                </span>
                <span className={`font-medium text-sm ${
                  formData.businessType === 'TRADING' ? 'text-primary' : 'text-text-light dark:text-text-dark'
                }`}>
                  Trading
                </span>
                <span className="text-xs text-subtle-text text-center">
                  Retail, wholesale, inventory
                </span>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setFormData((prev) => ({ ...prev, businessType: 'SERVICES' as BusinessType }))}
              data-testid="registration-business-type-services"
              className={`p-4 rounded-lg border-2 transition-all ${
                formData.businessType === 'SERVICES'
                  ? 'border-primary bg-primary/5'
                  : 'border-border-light dark:border-border-dark hover:border-primary/50'
              }`}
            >
              <div className="flex flex-col items-center gap-2">
                <span className={`material-symbols-outlined text-2xl ${
                  formData.businessType === 'SERVICES' ? 'text-primary' : 'text-subtle-text'
                }`}>
                  handyman
                </span>
                <span className={`font-medium text-sm ${
                  formData.businessType === 'SERVICES' ? 'text-primary' : 'text-text-light dark:text-text-dark'
                }`}>
                  Services
                </span>
                <span className="text-xs text-subtle-text text-center">
                  Consulting, professional, labor
                </span>
              </div>
            </button>
          </div>
          {validationErrors.businessType && (
            <span className="text-xs text-danger" data-testid="registration-business-type-error">
              {validationErrors.businessType}
            </span>
          )}
        </label>

        {/* Changed: Country selection - determines default currency (editable later in settings) */}
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-text-light dark:text-text-dark">
            Country <span className="text-danger">*</span>
          </span>
          <select
            name="country"
            value={formData.country}
            onChange={handleChange}
            data-testid="registration-country-select"
            className={`h-12 px-4 rounded-lg border ${
              validationErrors.country
                ? 'border-danger focus:border-danger focus:ring-danger/20'
                : 'border-border-light dark:border-border-dark focus:border-primary focus:ring-primary/20'
            } bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark focus:ring-2 focus:outline-none`}
          >
            <option value="">Select your country</option>
            {countryRegions.map((region) => (
              <optgroup key={region} label={region}>
                {countries.filter(c => c.region === region).map((country) => (
                  <option key={country.code} value={country.code}>
                    {country.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {validationErrors.country && (
            <span className="text-xs text-danger" data-testid="registration-country-error">
              {validationErrors.country}
            </span>
          )}
          {/* Show auto-mapped currency as helpful feedback */}
          {formData.country && formData.currency && (
            <span className="text-xs text-subtle-text">
              Default currency: <strong>{formData.currency}</strong> (can be changed later in settings)
            </span>
          )}
        </label>

        {/* Admin Name - First & Last Name */}
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-text-light dark:text-text-dark">
            Your Name <span className="text-danger">*</span>
          </span>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <input
                type="text"
                name="adminFirstName"
                value={formData.adminFirstName}
                onChange={handleChange}
                placeholder="First name"
                data-testid="registration-admin-first-name"
                className={`h-12 px-4 rounded-lg border ${
                  validationErrors.adminFirstName
                    ? 'border-danger focus:border-danger focus:ring-danger/20'
                    : 'border-border-light dark:border-border-dark focus:border-primary focus:ring-primary/20'
                } bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark placeholder:text-subtle-text focus:ring-2 focus:outline-none`}
              />
              {validationErrors.adminFirstName && (
                <span className="text-xs text-danger">{validationErrors.adminFirstName}</span>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <input
                type="text"
                name="adminLastName"
                value={formData.adminLastName}
                onChange={handleChange}
                placeholder="Last name"
                data-testid="registration-admin-last-name"
                className={`h-12 px-4 rounded-lg border ${
                  validationErrors.adminLastName
                    ? 'border-danger focus:border-danger focus:ring-danger/20'
                    : 'border-border-light dark:border-border-dark focus:border-primary focus:ring-primary/20'
                } bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark placeholder:text-subtle-text focus:ring-2 focus:outline-none`}
              />
              {validationErrors.adminLastName && (
                <span className="text-xs text-danger">{validationErrors.adminLastName}</span>
              )}
            </div>
          </div>
        </div>

        {/* Email */}
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-text-light dark:text-text-dark">
            Email <span className="text-danger">*</span>
          </span>
          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            placeholder="Enter your email address"
            data-testid="registration-email-input"
            className={`h-12 px-4 rounded-lg border ${
              validationErrors.email
                ? 'border-danger focus:border-danger focus:ring-danger/20'
                : 'border-border-light dark:border-border-dark focus:border-primary focus:ring-primary/20'
            } bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark placeholder:text-subtle-text focus:ring-2 focus:outline-none`}
          />
          {validationErrors.email && (
            <span className="text-xs text-danger" data-testid="registration-email-error">
              {validationErrors.email}
            </span>
          )}
        </label>

        {/* Added (2026-05-22): Password + confirm fields for single-step registration */}
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-text-light dark:text-text-dark">
            Password <span className="text-danger">*</span>
          </span>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              name="password"
              value={formData.password ?? ''}
              onChange={handleChange}
              placeholder="At least 8 characters"
              data-testid="registration-password-input"
              autoComplete="new-password"
              className={`h-12 w-full pl-4 pr-12 rounded-lg border ${
                validationErrors.password
                  ? 'border-danger focus:border-danger focus:ring-danger/20'
                  : 'border-border-light dark:border-border-dark focus:border-primary focus:ring-primary/20'
              } bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark placeholder:text-subtle-text focus:ring-2 focus:outline-none`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-subtle-text hover:text-text-light dark:hover:text-text-dark"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              data-testid="registration-password-toggle"
            >
              <span className="material-symbols-outlined text-xl">
                {showPassword ? 'visibility_off' : 'visibility'}
              </span>
            </button>
          </div>
          {validationErrors.password && (
            <span className="text-xs text-danger" data-testid="registration-password-error">
              {validationErrors.password}
            </span>
          )}
          <span className="text-xs text-subtle-text">
            Must include uppercase, lowercase, and a number
          </span>
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-text-light dark:text-text-dark">
            Confirm Password <span className="text-danger">*</span>
          </span>
          <input
            type={showPassword ? 'text' : 'password'}
            name="confirmPassword"
            value={confirmPassword}
            onChange={handleChange}
            placeholder="Re-enter your password"
            data-testid="registration-confirm-password-input"
            autoComplete="new-password"
            className={`h-12 px-4 rounded-lg border ${
              validationErrors.confirmPassword
                ? 'border-danger focus:border-danger focus:ring-danger/20'
                : 'border-border-light dark:border-border-dark focus:border-primary focus:ring-primary/20'
            } bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark placeholder:text-subtle-text focus:ring-2 focus:outline-none`}
          />
          {validationErrors.confirmPassword && (
            <span className="text-xs text-danger" data-testid="registration-confirm-password-error">
              {validationErrors.confirmPassword}
            </span>
          )}
        </label>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={registerMutation.isPending}
          data-testid="registration-submit-button"
          className="h-14 rounded-lg bg-primary text-white font-bold text-base hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
        >
          {registerMutation.isPending ? (
            <>
              <span className="material-symbols-outlined animate-spin">progress_activity</span>
              Creating Account...
            </>
          ) : (
            'Create Account'
          )}
        </button>

        {/* Terms note */}
        <p className="text-xs text-center text-subtle-text">
          By creating an account, you agree to our Terms of Service and Privacy Policy
        </p>
      </form>

      {/* Login link */}
      <p className="text-center text-sm text-subtle-text">
        Already have an account?{' '}
        <a href="/login" className="text-primary hover:underline font-medium" data-testid="registration-login-link">
          Sign in
        </a>
      </p>
    </div>
  );
}
