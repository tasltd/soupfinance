/**
 * Corporate Registration Page
 * Initial corporate registration form for KYC onboarding
 * Reference: soupfinance-designs/login-authentication/ (registration pattern)
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { createCorporate } from '../../api/endpoints/corporate';
import type { BusinessCategory } from '../../types';

// Added: Business category options for dropdown
const BUSINESS_CATEGORIES: { value: BusinessCategory; label: string }[] = [
  { value: 'LIMITED_LIABILITY', label: 'Limited Liability Company (LLC)' },
  { value: 'PUBLIC_LIMITED', label: 'Public Limited Company (PLC)' },
  { value: 'PARTNERSHIP', label: 'Partnership' },
  { value: 'SOLE_PROPRIETORSHIP', label: 'Sole Proprietorship' },
  { value: 'NON_PROFIT', label: 'Non-Profit Organization' },
];

export function RegistrationPage() {
  const navigate = useNavigate();

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    certificateOfIncorporationNumber: '',
    registrationDate: '',
    businessCategory: 'LIMITED_LIABILITY' as BusinessCategory,
    taxIdentificationNumber: '',
    email: '',
    phoneNumber: '',
  });

  // Added: Error state for validation
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Added: Mutation for creating corporate
  const createMutation = useMutation({
    mutationFn: createCorporate,
    onSuccess: (corporate) => {
      // Navigate to company info page after successful registration
      navigate(`/onboarding/company?id=${corporate.id}`);
    },
    onError: (error: Error) => {
      setValidationErrors({ form: error.message || 'Registration failed. Please try again.' });
    },
  });

  // Added: Form field change handler
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    // Clear validation error on field change
    if (validationErrors[name]) {
      setValidationErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  // Added: Form validation
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.name.trim()) {
      errors.name = 'Company name is required';
    }
    if (!formData.certificateOfIncorporationNumber.trim()) {
      errors.certificateOfIncorporationNumber = 'Registration number is required';
    }
    if (!formData.email.trim()) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = 'Please enter a valid email address';
    }
    if (!formData.phoneNumber.trim()) {
      errors.phoneNumber = 'Phone number is required';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Added: Form submission handler
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      createMutation.mutate(formData);
    }
  };

  // Added: data-testid attributes for E2E testing
  return (
    <div className="flex flex-col gap-8" data-testid="registration-page">
      {/* Mobile logo */}
      <div className="lg:hidden flex items-center gap-3 justify-center mb-4">
        <div className="size-12 rounded-full bg-primary flex items-center justify-center text-white font-bold text-xl">
          SF
        </div>
        <h1 className="text-2xl font-bold text-text-light dark:text-text-dark">SoupFinance</h1>
      </div>

      {/* Header */}
      <div>
        <h2 className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark" data-testid="registration-heading">
          Register Your Company
        </h2>
        <p className="mt-2 text-subtle-text">
          Start your corporate finance journey by providing basic company information
        </p>
      </div>

      {/* Form error message */}
      {validationErrors.form && (
        <div className="p-4 rounded-lg bg-danger/10 border border-danger/30 text-danger text-sm" data-testid="registration-form-error">
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
            name="name"
            value={formData.name}
            onChange={handleChange}
            placeholder="Enter your company name"
            data-testid="registration-company-name-input"
            className={`h-12 px-4 rounded-lg border ${
              validationErrors.name
                ? 'border-danger focus:border-danger focus:ring-danger/20'
                : 'border-border-light dark:border-border-dark focus:border-primary focus:ring-primary/20'
            } bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark placeholder:text-subtle-text focus:ring-2`}
          />
          {validationErrors.name && (
            <span className="text-xs text-danger" data-testid="registration-company-name-error">{validationErrors.name}</span>
          )}
        </label>

        {/* Registration Number & Business Category (2-column) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-text-light dark:text-text-dark">
              Registration Number <span className="text-danger">*</span>
            </span>
            <input
              type="text"
              name="certificateOfIncorporationNumber"
              value={formData.certificateOfIncorporationNumber}
              onChange={handleChange}
              placeholder="e.g., C-123456"
              data-testid="registration-reg-number-input"
              className={`h-12 px-4 rounded-lg border ${
                validationErrors.certificateOfIncorporationNumber
                  ? 'border-danger focus:border-danger focus:ring-danger/20'
                  : 'border-border-light dark:border-border-dark focus:border-primary focus:ring-primary/20'
              } bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark placeholder:text-subtle-text focus:ring-2`}
            />
            {validationErrors.certificateOfIncorporationNumber && (
              <span className="text-xs text-danger" data-testid="registration-reg-number-error">
                {validationErrors.certificateOfIncorporationNumber}
              </span>
            )}
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-text-light dark:text-text-dark">
              Business Type
            </span>
            <select
              name="businessCategory"
              value={formData.businessCategory}
              onChange={handleChange}
              data-testid="registration-business-type-select"
              className="h-12 px-4 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              {BUSINESS_CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Registration Date & Tax ID (2-column) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-text-light dark:text-text-dark">
              Registration Date
            </span>
            <input
              type="date"
              name="registrationDate"
              value={formData.registrationDate}
              onChange={handleChange}
              className="h-12 px-4 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-text-light dark:text-text-dark">
              Tax Identification Number (TIN)
            </span>
            <input
              type="text"
              name="taxIdentificationNumber"
              value={formData.taxIdentificationNumber}
              onChange={handleChange}
              placeholder="e.g., 12-3456789"
              className="h-12 px-4 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark placeholder:text-subtle-text focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>
        </div>

        {/* Contact Email */}
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-text-light dark:text-text-dark">
            Primary Contact Email <span className="text-danger">*</span>
          </span>
          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            placeholder="finance@yourcompany.com"
            data-testid="registration-email-input"
            className={`h-12 px-4 rounded-lg border ${
              validationErrors.email
                ? 'border-danger focus:border-danger focus:ring-danger/20'
                : 'border-border-light dark:border-border-dark focus:border-primary focus:ring-primary/20'
            } bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark placeholder:text-subtle-text focus:ring-2`}
          />
          {validationErrors.email && (
            <span className="text-xs text-danger" data-testid="registration-email-error">{validationErrors.email}</span>
          )}
        </label>

        {/* Contact Phone */}
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-text-light dark:text-text-dark">
            Primary Contact Phone <span className="text-danger">*</span>
          </span>
          <input
            type="tel"
            name="phoneNumber"
            value={formData.phoneNumber}
            onChange={handleChange}
            placeholder="+1 (555) 123-4567"
            data-testid="registration-phone-input"
            className={`h-12 px-4 rounded-lg border ${
              validationErrors.phoneNumber
                ? 'border-danger focus:border-danger focus:ring-danger/20'
                : 'border-border-light dark:border-border-dark focus:border-primary focus:ring-primary/20'
            } bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark placeholder:text-subtle-text focus:ring-2`}
          />
          {validationErrors.phoneNumber && (
            <span className="text-xs text-danger" data-testid="registration-phone-error">{validationErrors.phoneNumber}</span>
          )}
        </label>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={createMutation.isPending}
          data-testid="registration-submit-button"
          className="h-14 rounded-lg bg-primary text-white font-bold text-base hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {createMutation.isPending ? (
            <>
              <span className="material-symbols-outlined animate-spin">progress_activity</span>
              Registering...
            </>
          ) : (
            <>
              Continue to Company Details
              <span className="material-symbols-outlined">arrow_forward</span>
            </>
          )}
        </button>
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
