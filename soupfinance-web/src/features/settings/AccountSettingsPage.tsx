/**
 * Account Settings Page
 * PURPOSE: Configure company account settings and preferences
 */
import { useEffect, useState, type ChangeEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { accountSettingsApi } from '../../api/endpoints/settings';
import type { AccountSettings, BusinessLicenceCategory } from '../../types/settings';
// Changed: Import shared currency data from domainData (single source of truth)
import { DEFAULT_CURRENCIES, listCurrencies, DEFAULT_COUNTRIES, listCountries } from '../../api/endpoints/domainData';
import type { Currency as DomainCurrency, Country as DomainCountry } from '../../api/endpoints/domainData';
import { logger } from '../../utils/logger';
// Fix (SOUPFIN-10): Gate query on auth + tenantId readiness
import { useAuthStore } from '../../stores/authStore';
// SOUPFIN-19: shared date-input sanitiser (single source of truth)
import { sanitizeDateInputValue } from '../../utils/date';

// Form validation schema
// Changed: Added startOfFiscalYear for fiscal year configuration
// Fix (SOUPFIN-16): Added logoFile/faviconFile for base64-encoded image uploads.
//   Backend SoupBrokerFileUtilityService auto-detects base64 strings on any
//   SoupBrokerFile property (see CLAUDE.md "File/Image Upload").
const settingsSchema = z.object({
  name: z.string().min(1, 'Company name is required'),
  currency: z.string().optional(),
  countryOfOrigin: z.string().optional(),
  businessLicenceCategory: z.string().optional(),
  designation: z.string().optional(),
  address: z.string().optional(),
  location: z.string().optional(),
  website: z.string().url('Invalid URL').optional().or(z.literal('')),
  emailSubjectPrefix: z.string().optional(),
  // Fix (SOUPFIN-14): Client-side max length validation for SMS Sender ID.
  // Telco SMS sender IDs are limited to 11 alphanumeric characters by industry
  // standard (3GPP TS 23.038). The backend rejects longer values with a generic
  // "Failed to save" toast; enforce locally so the user sees the specific reason.
  smsIdPrefix: z
    .string()
    .max(11, 'SMS Sender ID Prefix must be 11 characters or less')
    .optional(),
  slogan: z.string().optional(),
  startOfFiscalYear: z.string().optional(),
  // Fix (SOUPFIN-16): Image uploads — stored as data:image/...;base64,... URIs
  // until save. Backend resolves them into SoupBrokerFile records on PUT.
  logoFile: z.string().optional(),
  faviconFile: z.string().optional(),
});

type SettingsFormValues = z.infer<typeof settingsSchema>;

const BUSINESS_CATEGORIES: { value: BusinessLicenceCategory; label: string }[] = [
  { value: 'SERVICES', label: 'Services' },
  { value: 'TRADING', label: 'Trading' },
  { value: 'BROKER', label: 'Broker' },
  { value: 'ASSET_MANAGER', label: 'Asset Manager' },
  { value: 'CUSTODIAN', label: 'Custodian' },
  { value: 'TRUSTEE', label: 'Trustee' },
  { value: 'PRIMARY_DEALER', label: 'Primary Dealer' },
];

// Removed: Hardcoded CURRENCIES list - now loaded from shared domainData source

export default function AccountSettingsPage() {
  const queryClient = useQueryClient();

  // Changed: Load currencies from shared domainData source (loads from backend when available)
  const [currencies, setCurrencies] = useState<DomainCurrency[]>(DEFAULT_CURRENCIES);
  // Fix (SOUPFIN-14): Load country list for the Country dropdown (was previously a free-text input).
  const [countries, setCountries] = useState<DomainCountry[]>(DEFAULT_COUNTRIES);
  useEffect(() => {
    listCurrencies().then(setCurrencies);
    listCountries().then(setCountries);
  }, []);

  // Fix (SOUPFIN-10): Gate the query on auth-init + tenantId presence so the
  // settings fetch never fires before the auth store has resolved tenantId from
  // /rest/user/current.json. Avoids the "No tenant ID found" race condition.
  const authInitialized = useAuthStore((state) => state.isInitialized);
  const tenantId = useAuthStore((state) => state.user?.tenantId);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const canLoadSettings = isAuthenticated && authInitialized && Boolean(tenantId);

  // Fetch current settings
  // Changed: Added retry and better error handling for account settings loading
  const { data: currentSettings, isLoading, error } = useQuery({
    queryKey: ['accountSettings', tenantId],
    queryFn: () => {
      logger.info('Fetching account settings');
      return accountSettingsApi.get();
    },
    enabled: canLoadSettings,
    // Fix (SOUPFIN-18): Do NOT retry definite server/client error responses
    // (4xx/5xx). A 500 from the profile API won't recover on immediate retry —
    // retrying only prolongs the "Loading account settings..." state the user
    // reported as a hang. Retry transient network errors (no response) up to twice.
    retry: (failureCount, err) => {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status && status >= 400) return false;
      return failureCount < 2;
    },
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
  });

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      name: '',
      currency: 'GHS',
      countryOfOrigin: '',
      businessLicenceCategory: '',
      designation: '',
      address: '',
      location: '',
      website: '',
      emailSubjectPrefix: '',
      smsIdPrefix: '',
      slogan: '',
      startOfFiscalYear: '',
      logoFile: '',
      faviconFile: '',
    },
  });

  // Fix (SOUPFIN-16): Watch logo/favicon for live preview as the user picks files.
  const logoPreview = watch('logoFile');
  const faviconPreview = watch('faviconFile');

  // Fix (SOUPFIN-16): Validation errors surfaced from the file <input> handlers.
  // RHF schema only validates strings, not the File object itself.
  const [logoUploadError, setLogoUploadError] = useState<string | null>(null);
  const [faviconUploadError, setFaviconUploadError] = useState<string | null>(null);

  // Fix (SOUPFIN-16): Read a File from a hidden <input type="file"> into a
  // base64 data URI so it can be sent as JSON. Backend SoupBrokerFileUtilityService
  // accepts data:image/...;base64,... values on any SoupBrokerFile property.
  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });

  const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2 MB
  const MAX_FAVICON_BYTES = 256 * 1024; // 256 KB
  const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon', 'image/webp'];

  const handleLogoUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    setLogoUploadError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setLogoUploadError('Logo must be PNG, JPG, SVG, or WebP');
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setLogoUploadError('Logo must be 2MB or smaller');
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setValue('logoFile', dataUrl, { shouldDirty: true });
    } catch (err) {
      setLogoUploadError(err instanceof Error ? err.message : 'Failed to read file');
    }
  };

  const handleFaviconUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    setFaviconUploadError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setFaviconUploadError('Favicon must be PNG, ICO, or SVG');
      return;
    }
    if (file.size > MAX_FAVICON_BYTES) {
      setFaviconUploadError('Favicon must be 256KB or smaller');
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setValue('faviconFile', dataUrl, { shouldDirty: true });
    } catch (err) {
      setFaviconUploadError(err instanceof Error ? err.message : 'Failed to read file');
    }
  };

  const handleLogoClear = () => {
    setLogoUploadError(null);
    setValue('logoFile', '', { shouldDirty: true });
  };

  const handleFaviconClear = () => {
    setFaviconUploadError(null);
    setValue('faviconFile', '', { shouldDirty: true });
  };

  // Reset form when settings load
  useEffect(() => {
    if (currentSettings) {
      reset({
        name: currentSettings.name || '',
        currency: currentSettings.currency || 'GHS',
        countryOfOrigin: currentSettings.countryOfOrigin || '',
        businessLicenceCategory: currentSettings.businessLicenceCategory || '',
        designation: currentSettings.designation || '',
        address: currentSettings.address || '',
        location: currentSettings.location || '',
        website: currentSettings.website || '',
        emailSubjectPrefix: currentSettings.emailSubjectPrefix || '',
        smsIdPrefix: currentSettings.smsIdPrefix || '',
        slogan: currentSettings.slogan || '',
        // Fix (SOUPFIN-14 / SOUPFIN-19): Sanitize so a backend "0000-00-00" / null
        // doesn't render the picker as "0/0/0" — the date input expects YYYY-MM-DD
        // and silently falls back to that placeholder for invalid input.
        startOfFiscalYear: sanitizeDateInputValue(currentSettings.startOfFiscalYear),
      });
    }
  }, [currentSettings, reset]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (data: SettingsFormValues) => {
      logger.info('Updating account settings');
      const updateData: Partial<Omit<AccountSettings, 'logo' | 'favicon'>> & {
        logo?: string;
        favicon?: string;
      } = {
        // Fix (SOUPFIN-18): Fall back to tenantId (= account id) when the settings
        // GET failed, so the user can still save edits when the profile API returned
        // a 500 on load. account.id === tenant_id, so either source is the same id.
        id: currentSettings?.id ?? tenantId,
        name: data.name,
        currency: data.currency,
        countryOfOrigin: data.countryOfOrigin,
        businessLicenceCategory: data.businessLicenceCategory as BusinessLicenceCategory,
        designation: data.designation,
        address: data.address,
        location: data.location,
        website: data.website,
        emailSubjectPrefix: data.emailSubjectPrefix,
        smsIdPrefix: data.smsIdPrefix,
        slogan: data.slogan,
        startOfFiscalYear: data.startOfFiscalYear,
      };
      // Fix (SOUPFIN-16): Only include logo/favicon when the user picked a new image.
      // An empty string means "no change"; sending an unchanged FK would overwrite
      // the existing SoupBrokerFile with a no-op record.
      if (data.logoFile && data.logoFile.startsWith('data:')) {
        updateData.logo = data.logoFile;
      }
      if (data.faviconFile && data.faviconFile.startsWith('data:')) {
        updateData.favicon = data.faviconFile;
      }
      // Fix (SOUPFIN-16): Cast to Partial<AccountSettings> for the API call. At runtime
      // the backend SoupBrokerFileUtilityService accepts a base64 data: URI string on
      // any SoupBrokerFile property and resolves it into a SoupBrokerFile record. The
      // frontend type only describes the read shape ({ id: string }), so we widen here.
      return accountSettingsApi.update(updateData as Partial<AccountSettings>);
    },
    onSuccess: () => {
      logger.info('Account settings updated successfully');
      queryClient.invalidateQueries({ queryKey: ['accountSettings'] });
    },
    onError: (error) => {
      logger.error('Failed to update account settings', error);
    },
  });

  const onSubmit = (data: SettingsFormValues) => {
    saveMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-subtle-text">Loading account settings...</div>
      </div>
    );
  }

  // Fix (SOUPFIN-18): The settings GET failing (e.g. the profile API returns a
  // 500) must NOT block the entire page. Previously this returned a full-screen
  // error and the form never rendered — the exact "stuck, no form content"
  // symptom reported on production. Instead we render the editable form with a
  // non-blocking warning banner so the user can still update and re-save their
  // settings (the save path falls back to tenantId for the account id).
  const loadError = error
    ? error instanceof Error
      ? error.message
      : 'Unknown error'
    : null;

  // Fix (SOUPFIN-21): Distinguish a genuinely-empty account (new tenant, 404 — safe
  // to edit a fresh form) from a real load failure (5xx / network error) where the
  // account's settings DO exist on the server but couldn't be fetched. In the latter
  // case the previous behaviour (SOUPFIN-18) left the empty/default form editable,
  // so a user could unknowingly Save it and overwrite their real saved settings with
  // blanks. We now LOCK the form until a successful Retry loads the actual values.
  const loadErrorStatus = (error as { response?: { status?: number } })?.response?.status;
  const settingsLoadFailed = Boolean(error) && loadErrorStatus !== 404;

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      {/* Page Header */}
      <div>
        <h2 className="text-xl font-bold text-text-light dark:text-text-dark">
          Account Settings
        </h2>
        <p className="text-subtle-text text-sm">Configure your company profile and preferences</p>
      </div>

      {/* Non-blocking load-error banner (SOUPFIN-18) */}
      {loadError && (
        <div
          className="flex items-start gap-3 p-4 rounded-lg bg-warning/10 border border-warning/30"
          data-testid="account-settings-load-error"
          role="alert"
        >
          <span className="material-symbols-outlined text-xl text-warning">warning</span>
          <div className="flex-1">
            <p className="font-medium text-text-light dark:text-text-dark">
              Couldn't load your saved settings
            </p>
            <p className="text-subtle-text text-sm">
              {settingsLoadFailed
                ? 'We couldn’t fetch your current settings. The form is locked to avoid overwriting your saved values with a blank one — please retry to load them.'
                : 'Your account may not be fully set up yet. You can still enter and save your details below.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => queryClient.invalidateQueries({ queryKey: ['accountSettings'] })}
            className="inline-flex items-center gap-2 h-9 px-3 rounded-lg bg-primary text-white font-bold text-sm shrink-0"
            data-testid="account-settings-load-error-retry"
          >
            <span className="material-symbols-outlined text-lg">refresh</span>
            Retry
          </button>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
        {/* Fix (SOUPFIN-21): A native disabled <fieldset> locks every field AND the
            Save/Reset buttons when the settings failed to load (server/network error),
            preventing the user from overwriting their real saved settings with a blank
            form. `display: contents` keeps the existing layout intact. The Retry button
            lives in the banner outside this fieldset, so it stays clickable. */}
        <fieldset
          disabled={settingsLoadFailed}
          className="contents"
          data-testid="account-settings-fieldset"
          aria-disabled={settingsLoadFailed}
        >
        {/* Company Information */}
        <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-6">
          <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-4">
            Company Information
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
                Company Name <span className="text-danger">*</span>
              </label>
              <input
                {...register('name')}
                className="w-full h-10 px-3 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-background-dark text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
                placeholder="Your company name"
              />
              {errors.name && <p className="text-danger text-xs mt-1">{errors.name.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
                Business Type
              </label>
              <select
                {...register('businessLicenceCategory')}
                className="w-full h-10 px-3 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-background-dark text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
              >
                <option value="">Select business type</option>
                {BUSINESS_CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
                Default Currency
              </label>
              <select
                {...register('currency')}
                className="w-full h-10 px-3 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-background-dark text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
              >
                {currencies.map((curr) => (
                  <option key={curr.code} value={curr.code}>
                    {curr.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
                Designation/Title
              </label>
              <input
                {...register('designation')}
                className="w-full h-10 px-3 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-background-dark text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
                placeholder="e.g., Licensed Trading Company"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
                Country
              </label>
              {/* Fix (SOUPFIN-14): Changed from free-text input to standardized dropdown
                  so the value matches a known ISO country and reliably maps to a currency. */}
              <select
                {...register('countryOfOrigin')}
                data-testid="account-settings-country"
                className="w-full h-10 px-3 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-background-dark text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
              >
                <option value="">Select country of operation</option>
                {countries.map((country) => (
                  <option key={country.code} value={country.code}>
                    {country.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
                Address
              </label>
              <input
                {...register('address')}
                className="w-full h-10 px-3 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-background-dark text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
                placeholder="Company address"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
                Location/City
              </label>
              <input
                {...register('location')}
                className="w-full h-10 px-3 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-background-dark text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
                placeholder="City or region"
              />
            </div>

            {/* Added: Start of Fiscal Year */}
            <div>
              <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
                Start of Fiscal Year
              </label>
              <input
                {...register('startOfFiscalYear')}
                type="date"
                className="w-full h-10 px-3 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-background-dark text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
                data-testid="account-settings-fiscal-year"
              />
              <p className="text-subtle-text text-xs mt-1">
                The date your financial year begins (used for reports)
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
                Website
              </label>
              <input
                {...register('website')}
                type="url"
                className="w-full h-10 px-3 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-background-dark text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
                placeholder="https://www.company.com"
              />
              {errors.website && (
                <p className="text-danger text-xs mt-1">{errors.website.message}</p>
              )}
            </div>
          </div>
        </div>

        {/* Branding & Communication */}
        <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-6">
          <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-4">
            Branding & Communication
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Fix (SOUPFIN-16): Functional logo upload replacing "coming soon" placeholder.
                Files are read into base64 data URIs and sent to the backend on save —
                SoupBrokerFileUtilityService converts them to SoupBrokerFile records. */}
            <div>
              <label
                htmlFor="account-settings-logo-input"
                className="block text-sm font-medium text-text-light dark:text-text-dark mb-1"
              >
                Company Logo
              </label>
              <label
                htmlFor="account-settings-logo-input"
                className="block w-full h-24 rounded-lg border-2 border-dashed border-border-light dark:border-border-dark cursor-pointer hover:border-primary/50 transition-colors overflow-hidden"
                data-testid="account-settings-logo-dropzone"
              >
                {logoPreview ? (
                  <div className="relative w-full h-full flex items-center justify-center bg-background-light dark:bg-background-dark">
                    <img
                      src={logoPreview}
                      alt="Logo preview"
                      className="max-h-20 max-w-full object-contain"
                      data-testid="account-settings-logo-preview"
                    />
                  </div>
                ) : (
                  <div className="w-full h-full flex items-center justify-center gap-2 text-subtle-text">
                    <span className="material-symbols-outlined text-2xl">image</span>
                    <span className="text-sm">Click to upload logo</span>
                  </div>
                )}
              </label>
              <input
                id="account-settings-logo-input"
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                onChange={handleLogoUpload}
                className="hidden"
                data-testid="account-settings-logo-input"
              />
              <div className="flex items-center justify-between mt-1 gap-2">
                <p className="text-subtle-text text-xs">
                  Displayed on invoices and reports. PNG, JPG, SVG or WebP up to 2MB.
                </p>
                {logoPreview && (
                  <button
                    type="button"
                    onClick={handleLogoClear}
                    className="text-xs text-danger hover:underline"
                    data-testid="account-settings-logo-clear"
                  >
                    Remove
                  </button>
                )}
              </div>
              {logoUploadError && (
                <p
                  className="text-danger text-xs mt-1"
                  data-testid="account-settings-logo-error"
                >
                  {logoUploadError}
                </p>
              )}
            </div>

            {/* Fix (SOUPFIN-16): Functional favicon upload replacing "coming soon" placeholder. */}
            <div>
              <label
                htmlFor="account-settings-favicon-input"
                className="block text-sm font-medium text-text-light dark:text-text-dark mb-1"
              >
                Favicon
              </label>
              <label
                htmlFor="account-settings-favicon-input"
                className="block w-full h-24 rounded-lg border-2 border-dashed border-border-light dark:border-border-dark cursor-pointer hover:border-primary/50 transition-colors overflow-hidden"
                data-testid="account-settings-favicon-dropzone"
              >
                {faviconPreview ? (
                  <div className="relative w-full h-full flex items-center justify-center bg-background-light dark:bg-background-dark">
                    <img
                      src={faviconPreview}
                      alt="Favicon preview"
                      className="max-h-16 max-w-16 object-contain"
                      data-testid="account-settings-favicon-preview"
                    />
                  </div>
                ) : (
                  <div className="w-full h-full flex items-center justify-center gap-2 text-subtle-text">
                    <span className="material-symbols-outlined text-2xl">bookmark</span>
                    <span className="text-sm">Click to upload favicon</span>
                  </div>
                )}
              </label>
              <input
                id="account-settings-favicon-input"
                type="file"
                accept="image/png,image/x-icon,image/vnd.microsoft.icon,image/svg+xml"
                onChange={handleFaviconUpload}
                className="hidden"
                data-testid="account-settings-favicon-input"
              />
              <div className="flex items-center justify-between mt-1 gap-2">
                <p className="text-subtle-text text-xs">
                  Browser tab icon. ICO, PNG or SVG, 32x32px recommended (max 256KB).
                </p>
                {faviconPreview && (
                  <button
                    type="button"
                    onClick={handleFaviconClear}
                    className="text-xs text-danger hover:underline"
                    data-testid="account-settings-favicon-clear"
                  >
                    Remove
                  </button>
                )}
              </div>
              {faviconUploadError && (
                <p
                  className="text-danger text-xs mt-1"
                  data-testid="account-settings-favicon-error"
                >
                  {faviconUploadError}
                </p>
              )}
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
                Company Slogan
              </label>
              <input
                {...register('slogan')}
                className="w-full h-10 px-3 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-background-dark text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
                placeholder="Your company tagline"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
                Email Subject Prefix
              </label>
              <input
                {...register('emailSubjectPrefix')}
                className="w-full h-10 px-3 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-background-dark text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
                placeholder="e.g., [CompanyName]"
              />
              <p className="text-subtle-text text-xs mt-1">
                Added to the beginning of email subject lines
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
                SMS Sender ID Prefix
              </label>
              {/* Fix (SOUPFIN-14): Cap input length at 11 + show validation error before submit. */}
              <input
                {...register('smsIdPrefix')}
                maxLength={11}
                data-testid="account-settings-sms-prefix"
                className="w-full h-10 px-3 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-background-dark text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
                placeholder="e.g., MYCO"
              />
              {errors.smsIdPrefix ? (
                <p className="text-danger text-xs mt-1" data-testid="account-settings-sms-prefix-error">
                  {errors.smsIdPrefix.message}
                </p>
              ) : (
                <p className="text-subtle-text text-xs mt-1">Max 11 characters for SMS sender ID</p>
              )}
            </div>
          </div>
        </div>

        {/* Form Actions */}
        {/* Changed: Stack vertically on mobile for better touch targets */}
        {/* Fix (SOUPFIN-16): Save/Reset are always enabled on initial load so users can
            see the active state of the form and re-save existing settings (e.g. to
            re-trigger backend-side recompute). The dirty-state hint still communicates
            whether there are pending changes. */}
        <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
          <div>
            {isDirty ? (
              <span className="text-sm text-warning" data-testid="account-settings-dirty-hint">
                You have unsaved changes
              </span>
            ) : (
              <span className="text-sm text-subtle-text" data-testid="account-settings-no-changes-hint">
                No unsaved changes
              </span>
            )}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => reset()}
              disabled={isSubmitting || saveMutation.isPending}
              className="h-10 px-4 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-medium text-sm hover:bg-primary/5 disabled:opacity-50"
              data-testid="account-settings-reset"
            >
              Reset
            </button>
            <button
              type="submit"
              disabled={isSubmitting || saveMutation.isPending}
              className="h-10 px-6 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
              data-testid="account-settings-save"
            >
              {(isSubmitting || saveMutation.isPending) && (
                <span className="material-symbols-outlined text-lg animate-spin">progress_activity</span>
              )}
              Save Changes
            </button>
          </div>
        </div>

        {/* Success Message */}
        {saveMutation.isSuccess && (
          <div className="bg-success/10 border border-success/20 rounded-lg p-4">
            <p className="text-success text-sm flex items-center gap-2">
              <span className="material-symbols-outlined text-lg">check_circle</span>
              Account settings saved successfully.
            </p>
          </div>
        )}

        {/* Error Display */}
        {saveMutation.isError && (
          <div className="bg-danger/10 border border-danger/20 rounded-lg p-4">
            <p className="text-danger text-sm">
              Failed to save account settings. Please try again.
            </p>
          </div>
        )}
        </fieldset>
      </form>
    </div>
  );
}
