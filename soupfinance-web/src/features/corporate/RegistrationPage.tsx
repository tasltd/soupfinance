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
// Added (SOUPFIN-185): every visible string comes from the auth namespace
import { useTranslation, Trans } from 'react-i18next';
import { registerTenant } from '../../api/endpoints/registration';
// Added (SOUPFIN-29): friendly fallback message instead of raw "Request failed with status code 400"
// Changed (SOUPFIN-185): auth-page variant translates the connection and server copy
import { getAuthApiErrorMessage } from '../../api/errors';
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

/** Added (SOUPFIN-185): keys under register.errors used by client-side validation */
type RegisterErrorKey =
  | 'companyNameRequired'
  | 'businessTypeRequired'
  | 'countryRequired'
  | 'firstNameRequired'
  | 'lastNameRequired'
  | 'emailRequired'
  | 'emailInvalid'
  | 'passwordRequired'
  | 'passwordMinLength'
  | 'passwordUppercase'
  | 'passwordLowercase'
  | 'passwordNumber'
  | 'passwordsMismatch'
  | 'failed'
  | 'failedRetry';

/**
 * Added (SOUPFIN-185): a client-side message is kept as its key, so switching
 * language re-renders it; a message the backend wrote is kept as sent.
 */
type FormMessage = { key: RegisterErrorKey } | { text: string };

function backendMessages(errors: Record<string, string>): Record<string, FormMessage> {
  return Object.fromEntries(Object.entries(errors).map(([field, text]) => [field, { text }]));
}

export function RegistrationPage() {
  const { t } = useTranslation('auth');
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
  const [validationErrors, setValidationErrors] = useState<Record<string, FormMessage>>({});
  const message = (m: FormMessage) => ('key' in m ? t(`register.errors.${m.key}`) : m.text);

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
          setValidationErrors(backendMessages(response.errors));
        } else {
          const text = response.error || response.message;
          setValidationErrors({ form: text ? { text } : { key: 'failed' } });
        }
      }
    },
    onError: (error: Error & { response?: { data?: { message?: string; error?: string; errors?: Record<string, string> } } }) => {
      // Parse backend error message
      const backendData = error.response?.data;
      if (backendData?.errors) {
        setValidationErrors(backendMessages(backendData.errors));
      } else {
        // Changed (SOUPFIN-29): prefer explicit backend message/error, then fall back to
        // getApiErrorMessage (never the raw "Request failed with status code 400"), and
        // finally to fixed copy so an empty parsed message can never render a blank banner.
        const text = backendData?.message || backendData?.error || getAuthApiErrorMessage(error);
        setValidationErrors({ form: text ? { text } : { key: 'failedRetry' } });
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
    const errors: Record<string, FormMessage> = {};

    // Company name - required
    if (!formData.companyName.trim()) {
      errors.companyName = { key: 'companyNameRequired' };
    }

    // Business type - required
    if (!formData.businessType) {
      errors.businessType = { key: 'businessTypeRequired' };
    }

    // Changed: Country is required - determines default currency for the account
    if (!formData.country) {
      errors.country = { key: 'countryRequired' };
    }

    // Admin first name - required
    if (!formData.adminFirstName?.trim()) {
      errors.adminFirstName = { key: 'firstNameRequired' };
    }

    // Admin last name - required
    if (!formData.adminLastName?.trim()) {
      errors.adminLastName = { key: 'lastNameRequired' };
    }

    // Email - required and must be valid
    if (!formData.email?.trim()) {
      errors.email = { key: 'emailRequired' };
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = { key: 'emailInvalid' };
    }

    // Added (2026-05-22): Password required + match ConfirmEmailPage rules
    // Backend may still reject it when requireEmailConfirmation=true; that's fine.
    const pwd = formData.password ?? '';
    if (!pwd) {
      errors.password = { key: 'passwordRequired' };
    } else if (pwd.length < 8) {
      errors.password = { key: 'passwordMinLength' };
    } else if (!/[A-Z]/.test(pwd)) {
      errors.password = { key: 'passwordUppercase' };
    } else if (!/[a-z]/.test(pwd)) {
      errors.password = { key: 'passwordLowercase' };
    } else if (!/\d/.test(pwd)) {
      errors.password = { key: 'passwordNumber' };
    }
    if (!errors.password && pwd !== confirmPassword) {
      errors.confirmPassword = { key: 'passwordsMismatch' };
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
            {t('register.success.title')}
          </h2>
          <p className="mt-4 text-subtle-text">
            {t('register.success.sentTo')}
          </p>
          <p className="mt-2 font-medium text-text-light dark:text-text-dark">
            {registeredEmail}
          </p>
        </div>

        {/* Instructions */}
        <div className="bg-surface-light dark:bg-surface-dark rounded-lg p-6 border border-border-light dark:border-border-dark">
          <h3 className="font-semibold text-text-light dark:text-text-dark mb-3">{t('register.success.nextSteps')}</h3>
          <ol className="space-y-3 text-sm text-subtle-text">
            <li className="flex gap-3">
              <span className="flex-shrink-0 size-6 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-xs">1</span>
              <span>{t('register.success.step1')}</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 size-6 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-xs">2</span>
              <span>{t('register.success.step2')}</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 size-6 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-xs">3</span>
              <span>{t('register.success.step3')}</span>
            </li>
          </ol>
        </div>

        {/* Didn't receive email */}
        <p className="text-center text-sm text-subtle-text">
          {t('register.success.noEmail')}{' '}
          <button
            type="button"
            onClick={() => navigate('/resend-confirmation', { state: { email: registeredEmail } })}
            className="text-primary hover:underline font-medium"
          >
            {t('register.success.resend')}
          </button>
        </p>

        {/* Back to login */}
        <p className="text-center text-sm text-subtle-text">
          {t('register.success.alreadyConfirmed')}{' '}
          <a href="/login" className="text-primary hover:underline font-medium">
            {t('register.success.signIn')}
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
          {t('register.title')}
        </h2>
        <p className="mt-2 text-subtle-text">{t('register.subtitle')}</p>
      </div>

      {/* Form error message */}
      {validationErrors.form && (
        <div
          className="p-4 rounded-lg bg-danger/10 border border-danger/30 text-danger text-sm"
          data-testid="registration-form-error"
        >
          {message(validationErrors.form)}
        </div>
      )}

      {/* Registration Form */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-6" data-testid="registration-form">
        {/* Company Name */}
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-text-light dark:text-text-dark">
            {t('register.companyName')} <span className="text-danger">*</span>
          </span>
          <input
            type="text"
            name="companyName"
            value={formData.companyName}
            onChange={handleChange}
            placeholder={t('register.companyNamePlaceholder')}
            data-testid="registration-company-name-input"
            className={`h-12 px-4 rounded-lg border ${
              validationErrors.companyName
                ? 'border-danger focus:border-danger focus:ring-danger/20'
                : 'border-border-light dark:border-border-dark focus:border-primary focus:ring-primary/20'
            } bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark placeholder:text-subtle-text focus:ring-2 focus:outline-none`}
          />
          {validationErrors.companyName && (
            <span className="text-xs text-danger" data-testid="registration-company-name-error">
              {message(validationErrors.companyName)}
            </span>
          )}
        </label>

        {/* Business Type */}
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-text-light dark:text-text-dark">
            {t('register.businessType')} <span className="text-danger">*</span>
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
                  {t('register.trading')}
                </span>
                <span className="text-xs text-subtle-text text-center">
                  {t('register.tradingHint')}
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
                  {t('register.services')}
                </span>
                <span className="text-xs text-subtle-text text-center">
                  {t('register.servicesHint')}
                </span>
              </div>
            </button>
          </div>
          {validationErrors.businessType && (
            <span className="text-xs text-danger" data-testid="registration-business-type-error">
              {message(validationErrors.businessType)}
            </span>
          )}
        </label>

        {/* Changed: Country selection - determines default currency (editable later in settings) */}
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-text-light dark:text-text-dark">
            {t('register.country')} <span className="text-danger">*</span>
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
            <option value="">{t('register.countryPlaceholder')}</option>
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
              {message(validationErrors.country)}
            </span>
          )}
          {/* Show auto-mapped currency as helpful feedback */}
          {formData.country && formData.currency && (
            <span className="text-xs text-subtle-text">
              <Trans
                t={t}
                i18nKey="register.defaultCurrency"
                values={{ currency: formData.currency }}
                components={{ strong: <strong /> }}
              />
            </span>
          )}
        </label>

        {/* Admin Name - First & Last Name */}
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-text-light dark:text-text-dark">
            {t('register.yourName')} <span className="text-danger">*</span>
          </span>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <input
                type="text"
                name="adminFirstName"
                value={formData.adminFirstName}
                onChange={handleChange}
                placeholder={t('register.firstName')}
                data-testid="registration-admin-first-name"
                className={`h-12 px-4 rounded-lg border ${
                  validationErrors.adminFirstName
                    ? 'border-danger focus:border-danger focus:ring-danger/20'
                    : 'border-border-light dark:border-border-dark focus:border-primary focus:ring-primary/20'
                } bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark placeholder:text-subtle-text focus:ring-2 focus:outline-none`}
              />
              {validationErrors.adminFirstName && (
                <span className="text-xs text-danger">{message(validationErrors.adminFirstName)}</span>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <input
                type="text"
                name="adminLastName"
                value={formData.adminLastName}
                onChange={handleChange}
                placeholder={t('register.lastName')}
                data-testid="registration-admin-last-name"
                className={`h-12 px-4 rounded-lg border ${
                  validationErrors.adminLastName
                    ? 'border-danger focus:border-danger focus:ring-danger/20'
                    : 'border-border-light dark:border-border-dark focus:border-primary focus:ring-primary/20'
                } bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark placeholder:text-subtle-text focus:ring-2 focus:outline-none`}
              />
              {validationErrors.adminLastName && (
                <span className="text-xs text-danger">{message(validationErrors.adminLastName)}</span>
              )}
            </div>
          </div>
        </div>

        {/* Email */}
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-text-light dark:text-text-dark">
            {t('register.email')} <span className="text-danger">*</span>
          </span>
          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            placeholder={t('register.emailPlaceholder')}
            data-testid="registration-email-input"
            className={`h-12 px-4 rounded-lg border ${
              validationErrors.email
                ? 'border-danger focus:border-danger focus:ring-danger/20'
                : 'border-border-light dark:border-border-dark focus:border-primary focus:ring-primary/20'
            } bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark placeholder:text-subtle-text focus:ring-2 focus:outline-none`}
          />
          {validationErrors.email && (
            <span className="text-xs text-danger" data-testid="registration-email-error">
              {message(validationErrors.email)}
            </span>
          )}
        </label>

        {/* Added (2026-05-22): Password + confirm fields for single-step registration */}
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-text-light dark:text-text-dark">
            {t('register.password')} <span className="text-danger">*</span>
          </span>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              name="password"
              value={formData.password ?? ''}
              onChange={handleChange}
              placeholder={t('register.passwordPlaceholder')}
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
              aria-label={showPassword ? t('register.hidePassword') : t('register.showPassword')}
              data-testid="registration-password-toggle"
            >
              <span className="material-symbols-outlined text-xl">
                {showPassword ? 'visibility_off' : 'visibility'}
              </span>
            </button>
          </div>
          {validationErrors.password && (
            <span className="text-xs text-danger" data-testid="registration-password-error">
              {message(validationErrors.password)}
            </span>
          )}
          <span className="text-xs text-subtle-text">
            {t('register.passwordHint')}
          </span>
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-text-light dark:text-text-dark">
            {t('register.confirmPassword')} <span className="text-danger">*</span>
          </span>
          <input
            type={showPassword ? 'text' : 'password'}
            name="confirmPassword"
            value={confirmPassword}
            onChange={handleChange}
            placeholder={t('register.confirmPasswordPlaceholder')}
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
              {message(validationErrors.confirmPassword)}
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
              {t('register.submitting')}
            </>
          ) : (
            t('register.submit')
          )}
        </button>

        {/* Terms note */}
        <p className="text-xs text-center text-subtle-text">
          {t('register.terms')}
        </p>
      </form>

      {/* Login link */}
      <p className="text-center text-sm text-subtle-text">
        {t('register.haveAccount')}{' '}
        <a href="/login" className="text-primary hover:underline font-medium" data-testid="registration-login-link">
          {t('register.signIn')}
        </a>
      </p>
    </div>
  );
}
