/**
 * Account Settings Page
 * PURPOSE: Configure company account settings and preferences
 */
import { useEffect, useRef, useState } from 'react';
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

// Form validation schema
// Changed: Added startOfFiscalYear for fiscal year configuration
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

// Fix (SOUPFIN-16): Upload constraints for Logo / Favicon branding assets.
// Backend SoupBrokerFileUtilityService accepts a base64-encoded data URL
// (auto-detected via Base64.isBase64()), a public URL, or a MultipartFile.
// We use the base64 path so the upload travels with the JSON PUT request.
const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_FAVICON_BYTES = 256 * 1024;   // 256 KB
const LOGO_ACCEPT = 'image/png,image/jpeg,image/svg+xml';
const FAVICON_ACCEPT = 'image/png,image/x-icon,image/vnd.microsoft.icon';

// Read a File as a base64 data URL the backend can ingest directly.
async function fileToBase64(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Unexpected file reader result'));
        return;
      }
      resolve(result);
    };
    reader.readAsDataURL(file);
  });
}

// Fix (SOUPFIN-14, hardened in SOUPFIN-16): Normalize startOfFiscalYear into
// ISO YYYY-MM-DD format the HTML5 <input type="date"> understands. The backend
// can return:
//   - undefined / null      → fall back to '' (empty input)
//   - "0000-00-00"          → MariaDB null sentinel; treat as empty so the
//                             picker doesn't render the "0/0/0" placeholder
//   - "2024-01-01T00:00:00" → ISO datetime; strip the time portion
//   - "2024-01-01"          → already valid; pass through
//   - "0"/"null"/"undefined"→ stringified nulls from buggy backends — drop them
//   - any year < 1900       → invalid sentinel (e.g. epoch overflow); drop it
// Exported for unit tests.
export function sanitizeFiscalYearDate(value?: string | null): string {
  if (value === null || value === undefined) return '';
  const trimmed = String(value).trim();
  if (!trimmed) return '';
  // Drop stringified null/undefined/0 sentinels and the MariaDB null-date marker.
  if (
    trimmed === '0' ||
    trimmed === 'null' ||
    trimmed === 'undefined' ||
    trimmed === '0/0/0' ||
    trimmed.startsWith('0000-')
  ) {
    return '';
  }
  // Strip time portion if present (e.g. "2024-01-01T00:00:00.000Z")
  const datePart = trimmed.split('T')[0];
  // Validate YYYY-MM-DD shape — anything else is unsafe to pass to type=date.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return '';
  // Reject implausibly old years (any year < 1900 is almost certainly a
  // sentinel value masquerading as a date — would render "0/0/0" in some
  // browsers' date pickers).
  const year = parseInt(datePart.slice(0, 4), 10);
  if (!Number.isFinite(year) || year < 1900) return '';
  return datePart;
}

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

  // Fix (SOUPFIN-16): Branding asset state (Logo / Favicon).
  // - `*Data` holds the base64 data URL when the user picks a new file (sent on save).
  // - `*Preview` is what the UI shows: either the freshly-picked data URL OR the
  //   existing file ID that the backend will resolve to /soupBrokerFile/show/{id}.
  // - `*Error` surfaces validation failures (size / type).
  const [logoData, setLogoData] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [faviconData, setFaviconData] = useState<string | null>(null);
  const [faviconPreview, setFaviconPreview] = useState<string | null>(null);
  const [faviconError, setFaviconError] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const faviconInputRef = useRef<HTMLInputElement | null>(null);

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
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
  });

  const {
    register,
    handleSubmit,
    reset,
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
    },
  });

  // Fix (SOUPFIN-16): Watch the SMS prefix so we can render a live character counter.
  // The user previously had no feedback on how close they were to the 11-char telco limit.
  const smsIdPrefixValue = watch('smsIdPrefix') ?? '';

  // Reset form when settings load
  useEffect(() => {
    if (currentSettings) {
      // Fix (SOUPFIN-16): Mirror current backend logo / favicon refs into the preview so
      // returning users see what is already on file. Backend SoupBrokerFile is served by
      // /soupBrokerFile/show/{id}; for now we just signal "an image exists" via a stub.
      if (currentSettings.logo?.id) {
        setLogoPreview(`/rest/soupBrokerFile/show/${currentSettings.logo.id}`);
      } else {
        setLogoPreview(null);
      }
      if (currentSettings.favicon?.id) {
        setFaviconPreview(`/rest/soupBrokerFile/show/${currentSettings.favicon.id}`);
      } else {
        setFaviconPreview(null);
      }
      setLogoData(null);
      setFaviconData(null);
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
        // Fix (SOUPFIN-14): Sanitize so a backend "0000-00-00" / null doesn't
        // render the picker as "0/0/0" — the date input expects YYYY-MM-DD
        // and silently falls back to that placeholder for invalid input.
        startOfFiscalYear: sanitizeFiscalYearDate(currentSettings.startOfFiscalYear),
      });
    }
  }, [currentSettings, reset]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (data: SettingsFormValues) => {
      logger.info('Updating account settings');
      // Fix (SOUPFIN-16): Include base64-encoded branding assets when the user
      // picked new ones. SoupBrokerFileUtilityService on the backend auto-detects
      // data URLs and stores them as SoupBrokerFile records.
      const updateData: Partial<AccountSettings> & { logo?: unknown; favicon?: unknown } = {
        id: currentSettings?.id,
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
      if (logoData) updateData.logo = logoData;
      if (faviconData) updateData.favicon = faviconData;
      return accountSettingsApi.update(updateData);
    },
    onSuccess: () => {
      logger.info('Account settings updated successfully');
      queryClient.invalidateQueries({ queryKey: ['accountSettings'] });
    },
    onError: (error) => {
      logger.error('Failed to update account settings', error);
    },
  });

  // Fix (SOUPFIN-16): Branding assets count as user changes too — without this
  // the Save button stayed disabled even after the user picked a new logo.
  const hasBrandingChanges = logoData !== null || faviconData !== null;
  const hasUnsavedChanges = isDirty || hasBrandingChanges;

  const onSubmit = (data: SettingsFormValues) => {
    // Fix (SOUPFIN-16): Buttons are visually enabled at all times now (see V2
    // feedback: users couldn't see the "active" button styling). If the form is
    // genuinely pristine the click is a no-op rather than a confusing error.
    if (!hasUnsavedChanges) {
      logger.info('Save clicked with no pending changes — ignoring');
      return;
    }
    saveMutation.mutate(data);
  };

  // Fix (SOUPFIN-16): Reset must also clear any picked branding assets so the
  // preview falls back to whatever is currently on the backend.
  const handleReset = () => {
    setLogoData(null);
    setFaviconData(null);
    setLogoError(null);
    setFaviconError(null);
    if (logoInputRef.current) logoInputRef.current.value = '';
    if (faviconInputRef.current) faviconInputRef.current.value = '';
    if (currentSettings?.logo?.id) {
      setLogoPreview(`/rest/soupBrokerFile/show/${currentSettings.logo.id}`);
    } else {
      setLogoPreview(null);
    }
    if (currentSettings?.favicon?.id) {
      setFaviconPreview(`/rest/soupBrokerFile/show/${currentSettings.favicon.id}`);
    } else {
      setFaviconPreview(null);
    }
    reset();
  };

  // Fix (SOUPFIN-16): Logo / Favicon file pickers. Validates type + size, converts to
  // base64 data URL, and stores both the raw upload (sent on save) and the preview.
  const handleBrandingPick = async (
    kind: 'logo' | 'favicon',
    file: File | undefined,
  ): Promise<void> => {
    const setError = kind === 'logo' ? setLogoError : setFaviconError;
    const setData = kind === 'logo' ? setLogoData : setFaviconData;
    const setPreview = kind === 'logo' ? setLogoPreview : setFaviconPreview;
    const maxBytes = kind === 'logo' ? MAX_LOGO_BYTES : MAX_FAVICON_BYTES;
    const accept = kind === 'logo' ? LOGO_ACCEPT : FAVICON_ACCEPT;
    const label = kind === 'logo' ? 'logo' : 'favicon';

    setError(null);
    if (!file) return;

    const acceptList = accept.split(',').map((t) => t.trim());
    if (!acceptList.includes(file.type)) {
      setError(`Unsupported ${label} type. Allowed: ${acceptList.join(', ')}.`);
      return;
    }
    if (file.size > maxBytes) {
      const maxKb = Math.round(maxBytes / 1024);
      setError(`File too large. Max size is ${maxKb} KB.`);
      return;
    }
    try {
      const dataUrl = await fileToBase64(file);
      setData(dataUrl);
      setPreview(dataUrl);
    } catch (err) {
      logger.error('Failed to read branding asset', err);
      setError('Could not read the selected file. Please try again.');
    }
  };

  // Fix (SOUPFIN-16): Allow the user to clear a freshly-picked asset and fall back
  // to the previously-stored one (or the empty placeholder).
  const handleBrandingClear = (kind: 'logo' | 'favicon') => {
    if (kind === 'logo') {
      setLogoData(null);
      setLogoError(null);
      if (logoInputRef.current) logoInputRef.current.value = '';
      setLogoPreview(
        currentSettings?.logo?.id ? `/rest/soupBrokerFile/show/${currentSettings.logo.id}` : null,
      );
    } else {
      setFaviconData(null);
      setFaviconError(null);
      if (faviconInputRef.current) faviconInputRef.current.value = '';
      setFaviconPreview(
        currentSettings?.favicon?.id
          ? `/rest/soupBrokerFile/show/${currentSettings.favicon.id}`
          : null,
      );
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-subtle-text">Loading account settings...</div>
      </div>
    );
  }

  if (error) {
    // Changed: Show actual error details and suggest common fixes
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return (
      <div className="p-8 sm:p-12 text-center bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark">
        <span className="material-symbols-outlined text-6xl text-danger/50 mb-4 block">error</span>
        <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">
          Failed to load account settings
        </h3>
        <p className="text-subtle-text mb-2">There was an error loading your account settings.</p>
        <p className="text-subtle-text text-xs mb-4 max-w-md mx-auto">
          {errorMessage === 'No account settings found'
            ? 'Your account may not be fully set up yet. Please contact support if this persists.'
            : 'Please check your connection and try again.'}
        </p>
        <button
          onClick={() => queryClient.invalidateQueries({ queryKey: ['accountSettings'] })}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm"
        >
          <span className="material-symbols-outlined text-lg">refresh</span>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      {/* Page Header */}
      <div>
        <h2 className="text-xl font-bold text-text-light dark:text-text-dark">
          Account Settings
        </h2>
        <p className="text-subtle-text text-sm">Configure your company profile and preferences</p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
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
            {/* Fix (SOUPFIN-16): Explicit min/max bounds so the browser's date
                picker never falls back to the "0/0/0" sentinel value when the
                form first renders. Lower bound of 1900-01-01 mirrors the same
                guard used in the Aging report page. */}
            <div>
              <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
                Start of Fiscal Year
              </label>
              <input
                {...register('startOfFiscalYear')}
                type="date"
                min="1900-01-01"
                max="2100-12-31"
                placeholder="YYYY-MM-DD"
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
            {/* Fix (SOUPFIN-16): Replaced "coming soon" placeholder with a real
                file picker. Pick a PNG/JPEG/SVG, see a preview, and save —
                the backend's SoupBrokerFileUtilityService accepts the data URL. */}
            <div data-testid="account-settings-logo-field">
              <label
                htmlFor="account-settings-logo-input"
                className="block text-sm font-medium text-text-light dark:text-text-dark mb-1"
              >
                Company Logo
              </label>
              <label
                htmlFor="account-settings-logo-input"
                className="block w-full h-24 rounded-lg border-2 border-dashed border-border-light dark:border-border-dark hover:border-primary/50 cursor-pointer transition-colors overflow-hidden"
              >
                {logoPreview ? (
                  <img
                    src={logoPreview}
                    alt="Company logo preview"
                    className="w-full h-full object-contain p-1"
                    data-testid="account-settings-logo-preview"
                  />
                ) : (
                  <span className="flex items-center justify-center gap-2 w-full h-full text-subtle-text">
                    <span className="material-symbols-outlined text-2xl">image</span>
                    <span className="text-sm">Click to upload logo</span>
                  </span>
                )}
              </label>
              <input
                id="account-settings-logo-input"
                ref={logoInputRef}
                type="file"
                accept={LOGO_ACCEPT}
                onChange={(event) => {
                  void handleBrandingPick('logo', event.target.files?.[0]);
                }}
                className="sr-only"
                data-testid="account-settings-logo-input"
              />
              <div className="flex items-center justify-between mt-1 gap-2">
                <p className="text-subtle-text text-xs flex-1">
                  Displayed on invoices and reports. PNG, JPEG, or SVG, max{' '}
                  {Math.round(MAX_LOGO_BYTES / 1024)} KB.
                </p>
                {(logoData || logoPreview) && (
                  <button
                    type="button"
                    onClick={() => handleBrandingClear('logo')}
                    className="text-xs text-danger hover:underline"
                    data-testid="account-settings-logo-clear"
                  >
                    Remove
                  </button>
                )}
              </div>
              {logoError && (
                <p
                  className="text-danger text-xs mt-1"
                  data-testid="account-settings-logo-error"
                >
                  {logoError}
                </p>
              )}
            </div>

            {/* Fix (SOUPFIN-16): Favicon picker — same pattern as the logo above. */}
            <div data-testid="account-settings-favicon-field">
              <label
                htmlFor="account-settings-favicon-input"
                className="block text-sm font-medium text-text-light dark:text-text-dark mb-1"
              >
                Favicon
              </label>
              <label
                htmlFor="account-settings-favicon-input"
                className="block w-full h-24 rounded-lg border-2 border-dashed border-border-light dark:border-border-dark hover:border-primary/50 cursor-pointer transition-colors overflow-hidden"
              >
                {faviconPreview ? (
                  <img
                    src={faviconPreview}
                    alt="Favicon preview"
                    className="w-full h-full object-contain p-1"
                    data-testid="account-settings-favicon-preview"
                  />
                ) : (
                  <span className="flex items-center justify-center gap-2 w-full h-full text-subtle-text">
                    <span className="material-symbols-outlined text-2xl">bookmark</span>
                    <span className="text-sm">Click to upload favicon</span>
                  </span>
                )}
              </label>
              <input
                id="account-settings-favicon-input"
                ref={faviconInputRef}
                type="file"
                accept={FAVICON_ACCEPT}
                onChange={(event) => {
                  void handleBrandingPick('favicon', event.target.files?.[0]);
                }}
                className="sr-only"
                data-testid="account-settings-favicon-input"
              />
              <div className="flex items-center justify-between mt-1 gap-2">
                <p className="text-subtle-text text-xs flex-1">
                  Browser tab icon. ICO or PNG (32×32 px recommended), max{' '}
                  {Math.round(MAX_FAVICON_BYTES / 1024)} KB.
                </p>
                {(faviconData || faviconPreview) && (
                  <button
                    type="button"
                    onClick={() => handleBrandingClear('favicon')}
                    className="text-xs text-danger hover:underline"
                    data-testid="account-settings-favicon-clear"
                  >
                    Remove
                  </button>
                )}
              </div>
              {faviconError && (
                <p
                  className="text-danger text-xs mt-1"
                  data-testid="account-settings-favicon-error"
                >
                  {faviconError}
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
              {/* Fix (SOUPFIN-14 + SOUPFIN-16): Native maxLength caps the field at 11 chars
                  (3GPP TS 23.038 telco limit); Zod re-validates on submit; a live counter
                  shows the user how close they are to the cap. */}
              <input
                {...register('smsIdPrefix')}
                maxLength={11}
                data-testid="account-settings-sms-prefix"
                aria-describedby="account-settings-sms-prefix-counter"
                className="w-full h-10 px-3 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-background-dark text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
                placeholder="e.g., MYCO"
              />
              <div className="flex items-center justify-between gap-2 mt-1">
                {errors.smsIdPrefix ? (
                  <p
                    className="text-danger text-xs"
                    data-testid="account-settings-sms-prefix-error"
                  >
                    {errors.smsIdPrefix.message}
                  </p>
                ) : (
                  <p className="text-subtle-text text-xs">
                    Max 11 characters for SMS sender ID
                  </p>
                )}
                <p
                  id="account-settings-sms-prefix-counter"
                  data-testid="account-settings-sms-prefix-counter"
                  className={`text-xs tabular-nums ${
                    smsIdPrefixValue.length >= 11
                      ? 'text-danger font-medium'
                      : 'text-subtle-text'
                  }`}
                >
                  {smsIdPrefixValue.length}/11
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Form Actions */}
        {/* Fix (SOUPFIN-16): Save / Reset are now always visually active.
            V2 user feedback: the disabled-by-default state hid the active button
            styling on initial load. We instead render an unobtrusive hint to
            explain what will happen when clicked while pristine. */}
        <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
          <div>
            {hasUnsavedChanges ? (
              <span className="text-sm text-warning" data-testid="account-settings-dirty-hint">
                You have unsaved changes
              </span>
            ) : (
              <span
                className="text-sm text-subtle-text"
                data-testid="account-settings-no-changes-hint"
              >
                No changes yet — edit a field, logo, or favicon to enable saving
              </span>
            )}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleReset}
              disabled={isSubmitting}
              className="h-10 px-4 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-medium text-sm hover:bg-primary/5 disabled:opacity-50"
              data-testid="account-settings-reset-button"
            >
              Reset
            </button>
            <button
              type="submit"
              disabled={isSubmitting || saveMutation.isPending}
              className="h-10 px-6 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
              data-testid="account-settings-save-button"
            >
              {(isSubmitting || saveMutation.isPending) && (
                <span className="material-symbols-outlined text-lg animate-spin">
                  progress_activity
                </span>
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
      </form>
    </div>
  );
}
