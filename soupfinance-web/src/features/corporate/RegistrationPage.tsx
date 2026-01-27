/**
 * Corporate Registration Page
 * Simplified registration form - collects only essential info for quick account creation.
 * Full KYC details are collected in post-registration onboarding steps.
 *
 * Required fields:
 * - Company name
 * - Contact person (first name, last name)
 * - Contact info (email and/or phone)
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { registerCorporate } from '../../api/endpoints/registration';
import type { CorporateRegistration } from '../../api/endpoints/registration';

export function RegistrationPage() {
  const navigate = useNavigate();

  // Form state - minimal fields only
  const [formData, setFormData] = useState<CorporateRegistration>({
    name: '',
    contactFirstName: '',
    contactLastName: '',
    email: '',
    phoneNumber: '',
  });

  // Error state for validation
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Mutation for registering corporate
  const registerMutation = useMutation({
    mutationFn: registerCorporate,
    onSuccess: (response) => {
      // Navigate to 2FA verification with contact info
      const contact = formData.phoneNumber || formData.email;
      navigate('/verify', {
        state: {
          contact,
          corporateId: response.client?.id,
          companyName: response.client?.name || formData.name,
        },
      });
    },
    onError: (error: Error & { response?: { data?: { message?: string; error?: number } } }) => {
      // Parse backend error message
      const backendMessage = error.response?.data?.message;
      const errorMessage = backendMessage || error.message || 'Registration failed. Please try again.';
      setValidationErrors({ form: errorMessage });
    },
  });

  // Form field change handler
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    // Clear validation error on field change
    if (validationErrors[name] || validationErrors.contact) {
      setValidationErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        delete next.contact;
        return next;
      });
    }
  };

  // Form validation - minimal required fields
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    // Company name - required
    if (!formData.name.trim()) {
      errors.name = 'Company name is required';
    }

    // Contact person - required
    if (!formData.contactFirstName?.trim()) {
      errors.contactFirstName = 'First name is required';
    }
    if (!formData.contactLastName?.trim()) {
      errors.contactLastName = 'Last name is required';
    }

    // At least one contact method - required
    if (!formData.email?.trim() && !formData.phoneNumber?.trim()) {
      errors.contact = 'Email or phone number is required';
    }

    // Email format validation (if provided)
    if (formData.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = 'Please enter a valid email address';
    }

    // Phone format validation (if provided)
    if (formData.phoneNumber?.trim() && !/^\+?\d{9,14}$/.test(formData.phoneNumber.replace(/\s/g, ''))) {
      errors.phoneNumber = 'Please enter a valid phone number';
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
        <h2
          className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark"
          data-testid="registration-heading"
        >
          Create Your Account
        </h2>
        <p className="mt-2 text-subtle-text">Get started in seconds. Complete your profile later.</p>
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
            name="name"
            value={formData.name}
            onChange={handleChange}
            placeholder="Enter your company name"
            data-testid="registration-company-name-input"
            className={`h-12 px-4 rounded-lg border ${
              validationErrors.name
                ? 'border-danger focus:border-danger focus:ring-danger/20'
                : 'border-border-light dark:border-border-dark focus:border-primary focus:ring-primary/20'
            } bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark placeholder:text-subtle-text focus:ring-2 focus:outline-none`}
          />
          {validationErrors.name && (
            <span className="text-xs text-danger" data-testid="registration-company-name-error">
              {validationErrors.name}
            </span>
          )}
        </label>

        {/* Contact Person - First & Last Name */}
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-text-light dark:text-text-dark">
            Primary Contact Person <span className="text-danger">*</span>
          </span>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <input
                type="text"
                name="contactFirstName"
                value={formData.contactFirstName}
                onChange={handleChange}
                placeholder="First name"
                data-testid="registration-contact-first-name"
                className={`h-12 px-4 rounded-lg border ${
                  validationErrors.contactFirstName
                    ? 'border-danger focus:border-danger focus:ring-danger/20'
                    : 'border-border-light dark:border-border-dark focus:border-primary focus:ring-primary/20'
                } bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark placeholder:text-subtle-text focus:ring-2 focus:outline-none`}
              />
              {validationErrors.contactFirstName && (
                <span className="text-xs text-danger">{validationErrors.contactFirstName}</span>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <input
                type="text"
                name="contactLastName"
                value={formData.contactLastName}
                onChange={handleChange}
                placeholder="Last name"
                data-testid="registration-contact-last-name"
                className={`h-12 px-4 rounded-lg border ${
                  validationErrors.contactLastName
                    ? 'border-danger focus:border-danger focus:ring-danger/20'
                    : 'border-border-light dark:border-border-dark focus:border-primary focus:ring-primary/20'
                } bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark placeholder:text-subtle-text focus:ring-2 focus:outline-none`}
              />
              {validationErrors.contactLastName && (
                <span className="text-xs text-danger">{validationErrors.contactLastName}</span>
              )}
            </div>
          </div>
        </div>

        {/* Contact Info - Email & Phone */}
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-text-light dark:text-text-dark">
            Contact Information <span className="text-danger">*</span>
          </span>
          <p className="text-xs text-subtle-text -mt-1">Provide at least email or phone number</p>
          {validationErrors.contact && (
            <span className="text-xs text-danger">{validationErrors.contact}</span>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="Email address"
                data-testid="registration-email-input"
                className={`h-12 px-4 rounded-lg border ${
                  validationErrors.email
                    ? 'border-danger focus:border-danger focus:ring-danger/20'
                    : 'border-border-light dark:border-border-dark focus:border-primary focus:ring-primary/20'
                } bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark placeholder:text-subtle-text focus:ring-2 focus:outline-none`}
              />
              {validationErrors.email && <span className="text-xs text-danger">{validationErrors.email}</span>}
            </div>
            <div className="flex flex-col gap-1">
              <input
                type="tel"
                name="phoneNumber"
                value={formData.phoneNumber}
                onChange={handleChange}
                placeholder="Phone number"
                data-testid="registration-phone-input"
                className={`h-12 px-4 rounded-lg border ${
                  validationErrors.phoneNumber
                    ? 'border-danger focus:border-danger focus:ring-danger/20'
                    : 'border-border-light dark:border-border-dark focus:border-primary focus:ring-primary/20'
                } bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark placeholder:text-subtle-text focus:ring-2 focus:outline-none`}
              />
              {validationErrors.phoneNumber && (
                <span className="text-xs text-danger">{validationErrors.phoneNumber}</span>
              )}
            </div>
          </div>
        </div>

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

        {/* Note about completing profile later */}
        <p className="text-xs text-center text-subtle-text">
          You can complete your company profile after registration
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
