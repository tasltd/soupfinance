/**
 * Account Settings Page
 * PURPOSE: Configure company account settings and preferences
 */
import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { accountSettingsApi } from '../../api/endpoints/settings';
import type { AccountSettings, BusinessLicenceCategory } from '../../types/settings';
import { logger } from '../../utils/logger';

// Form validation schema
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
  smsIdPrefix: z.string().optional(),
  slogan: z.string().optional(),
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

const CURRENCIES = [
  { value: 'GHS', label: 'GHS - Ghana Cedi' },
  { value: 'USD', label: 'USD - US Dollar' },
  { value: 'EUR', label: 'EUR - Euro' },
  { value: 'GBP', label: 'GBP - British Pound' },
  { value: 'NGN', label: 'NGN - Nigerian Naira' },
  { value: 'KES', label: 'KES - Kenyan Shilling' },
  { value: 'ZAR', label: 'ZAR - South African Rand' },
];

export default function AccountSettingsPage() {
  const queryClient = useQueryClient();

  // Fetch current settings
  const { data: currentSettings, isLoading, error } = useQuery({
    queryKey: ['accountSettings'],
    queryFn: () => {
      logger.info('Fetching account settings');
      return accountSettingsApi.get();
    },
  });

  const {
    register,
    handleSubmit,
    reset,
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
    },
  });

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
      });
    }
  }, [currentSettings, reset]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (data: SettingsFormValues) => {
      logger.info('Updating account settings');
      const updateData: Partial<AccountSettings> = {
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
      };
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

  if (error) {
    return (
      <div className="p-12 text-center bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark">
        <span className="material-symbols-outlined text-6xl text-danger/50 mb-4 block">error</span>
        <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">
          Failed to load account settings
        </h3>
        <p className="text-subtle-text mb-4">There was an error loading your account settings.</p>
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
                {CURRENCIES.map((curr) => (
                  <option key={curr.value} value={curr.value}>
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
              <input
                {...register('countryOfOrigin')}
                className="w-full h-10 px-3 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-background-dark text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
                placeholder="Country of operation"
              />
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
              <input
                {...register('smsIdPrefix')}
                className="w-full h-10 px-3 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-background-dark text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
                placeholder="e.g., MYCO"
              />
              <p className="text-subtle-text text-xs mt-1">Max 11 characters for SMS sender ID</p>
            </div>
          </div>
        </div>

        {/* Form Actions */}
        <div className="flex justify-between items-center">
          <div>
            {isDirty && (
              <span className="text-sm text-warning">You have unsaved changes</span>
            )}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => reset()}
              disabled={!isDirty || isSubmitting}
              className="h-10 px-4 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-medium text-sm hover:bg-primary/5 disabled:opacity-50"
            >
              Reset
            </button>
            <button
              type="submit"
              disabled={!isDirty || isSubmitting || saveMutation.isPending}
              className="h-10 px-6 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
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
      </form>
    </div>
  );
}
