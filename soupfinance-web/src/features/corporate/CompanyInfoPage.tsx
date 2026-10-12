/**
 * Company Information Page
 * Detailed company information for KYC onboarding
 * Reference: soupfinance-designs/new-invoice-form/ (multi-section form pattern)
 */
import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getCorporate, updateCorporate } from '../../api/endpoints/corporate';
// Added (SOUPFIN-151): industry is stored on the tenant Account, not in corporate metadata
import { accountSettingsApi } from '../../api/endpoints/settings';
import { useAuthStore } from '../../stores';
import { isIndustryCode } from '../../utils/industry';
import type { IndustryCode } from '../../utils/industry';
import type { BusinessType } from '../../api/endpoints/registration';
import { IndustrySelect } from './IndustrySelect';
// Added (SOUPFIN-84): "Need Help?" link to this step's part of the user guide
import { HelpLink } from '../../components/help';

// Removed (SOUPFIN-151): the local INDUSTRY_OPTIONS label list. Industry is now a
// code from src/utils/industry.ts, rendered by the shared IndustrySelect.

// Added: Annual revenue range options
const REVENUE_RANGES = [
  { value: 'UNDER_100K', label: 'Under $100,000' },
  { value: '100K_500K', label: '$100,000 - $500,000' },
  { value: '500K_1M', label: '$500,000 - $1 Million' },
  { value: '1M_5M', label: '$1 Million - $5 Million' },
  { value: '5M_10M', label: '$5 Million - $10 Million' },
  { value: '10M_50M', label: '$10 Million - $50 Million' },
  { value: 'OVER_50M', label: 'Over $50 Million' },
];

// Added: Employee count options
const EMPLOYEE_RANGES = [
  { value: '1_10', label: '1-10 employees' },
  { value: '11_50', label: '11-50 employees' },
  { value: '51_200', label: '51-200 employees' },
  { value: '201_500', label: '201-500 employees' },
  { value: '501_1000', label: '501-1000 employees' },
  { value: 'OVER_1000', label: 'Over 1000 employees' },
];

export function CompanyInfoPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const corporateId = searchParams.get('id');
  const queryClient = useQueryClient();

  // Added: Extended form state for company details
  const [formData, setFormData] = useState({
    // Physical Address
    physicalAddress: '',
    physicalCity: '',
    physicalState: '',
    physicalPostalCode: '',
    physicalCountry: '',
    // Postal Address
    postalAddress: '',
    postalCity: '',
    postalState: '',
    postalPostalCode: '',
    postalCountry: '',
    sameAsPhysical: false,
    // Business Details
    industry: '' as IndustryCode | '',
    annualRevenue: '',
    employeeCount: '',
    website: '',
    description: '',
  });

  // Added: Fetch existing corporate data
  const { data: corporate, isLoading } = useQuery({
    queryKey: ['corporate', corporateId],
    queryFn: () => getCorporate(corporateId!),
    enabled: !!corporateId,
  });

  // Added (SOUPFIN-151): the tenant Account holds industry (chosen at registration)
  // and the business type that decides which COA overlays apply. Not blocking:
  // the form still renders and saves the corporate when this fails.
  const tenantId = useAuthStore((state) => state.user?.tenantId);
  const { data: account } = useQuery({
    queryKey: ['accountSettings', tenantId],
    queryFn: () => accountSettingsApi.get(),
    retry: false,
  });
  const accountBusinessType: BusinessType | undefined =
    account?.businessLicenceCategory === 'TRADING' || account?.businessLicenceCategory === 'SERVICES'
      ? account.businessLicenceCategory
      : undefined;

  // Added (SOUPFIN-151): preselect the industry saved on the Account until the user
  // picks one here. Picking the empty option falls back to the saved value, since
  // Account.industry is only ever set, never cleared, from this page.
  const savedIndustry: IndustryCode | '' = isIndustryCode(account?.industry) ? account.industry : '';
  const industry: IndustryCode | '' = formData.industry || savedIndustry;

  // Added: Populate form with existing data
  /* eslint-disable-next-line -- Syncing fetched data to form state is a valid use case */
  useEffect(() => {
    if (corporate?.address) {
      // Parse existing address if stored as JSON or single string
      setFormData((prev) => ({
        ...prev,
        physicalAddress: corporate.address || '',
      }));
    }
  }, [corporate]);

  // Added: Update mutation
  // Changed (SOUPFIN-151): first writes a changed industry to Account.industry, the
  // first-class field the COA template picker reads, then updates the corporate.
  const updateMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      if (account?.id && industry && industry !== account.industry) {
        await accountSettingsApi.update({ id: account.id, industry });
      }
      return updateCorporate(corporateId!, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accountSettings'] });
      queryClient.invalidateQueries({ queryKey: ['corporate', corporateId] });
      navigate(`/onboarding/directors?id=${corporateId}`);
    },
  });

  // Added: Handle field changes
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;

    setFormData((prev) => {
      const newData = {
        ...prev,
        [name]: type === 'checkbox' ? checked : value,
      };

      // Copy physical address to postal if checkbox is checked
      if (name === 'sameAsPhysical' && checked) {
        newData.postalAddress = prev.physicalAddress;
        newData.postalCity = prev.physicalCity;
        newData.postalState = prev.physicalState;
        newData.postalPostalCode = prev.physicalPostalCode;
        newData.postalCountry = prev.physicalCountry;
      }

      return newData;
    });
  };

  // Added: Form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Combine address fields into a structured format
    const address = JSON.stringify({
      physical: {
        address: formData.physicalAddress,
        city: formData.physicalCity,
        state: formData.physicalState,
        postalCode: formData.physicalPostalCode,
        country: formData.physicalCountry,
      },
      postal: formData.sameAsPhysical
        ? null
        : {
            address: formData.postalAddress,
            city: formData.postalCity,
            state: formData.postalState,
            postalCode: formData.postalPostalCode,
            country: formData.postalCountry,
          },
    });

    updateMutation.mutate({
      address,
      // Extended fields stored as JSON metadata
      // Changed (SOUPFIN-151): industry also goes to Account.industry (see mutationFn);
      // kept here so the metadata blob stays complete for any reader of it.
      metadata: JSON.stringify({
        industry,
        annualRevenue: formData.annualRevenue,
        employeeCount: formData.employeeCount,
        website: formData.website,
        description: formData.description,
      }),
    });
  };

  // Added: Navigation handlers
  // Fix (SOUPFIN-86): the wizard is opened from the dashboard banner, so the
  // user here is signed in. '/register' is not behind PublicRoute and showed
  // them the new-company sign-up form. Return to the dashboard instead; not
  // navigate(-1), which would leave the app when step 1 came from an email link.
  const handleBack = () => {
    navigate('/dashboard');
  };

  const handleSkip = () => {
    navigate(`/onboarding/directors?id=${corporateId}`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <span className="material-symbols-outlined animate-spin text-4xl text-primary">
          progress_activity
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6" data-testid="company-info-page">
      {/* Page Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark">
            Company Information
          </h1>
          <p className="text-subtle-text">
            Provide detailed information about your company
          </p>
          <HelpLink section="kyc-company-details" className="mt-1" />
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleBack}
            className="h-10 px-4 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-medium text-sm hover:bg-primary/5"
          >
            Back
          </button>
          <button
            onClick={handleSkip}
            className="h-10 px-4 rounded-lg bg-primary/20 text-primary font-bold text-sm hover:bg-primary/30"
          >
            Skip for Now
          </button>
          <button
            onClick={handleSubmit}
            disabled={updateMutation.isPending}
            className="h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
          >
            {updateMutation.isPending ? (
              <>
                <span className="material-symbols-outlined animate-spin text-base">
                  progress_activity
                </span>
                Saving...
              </>
            ) : (
              <>
                Save & Continue
                <span className="material-symbols-outlined text-base">arrow_forward</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Progress Indicator */}
      <div className="flex items-center gap-2 text-sm">
        <span className="flex items-center justify-center size-6 rounded-full bg-primary text-white text-xs font-bold">
          1
        </span>
        <span className="text-primary font-medium">Registration</span>
        <span className="material-symbols-outlined text-subtle-text">chevron_right</span>
        <span className="flex items-center justify-center size-6 rounded-full bg-primary text-white text-xs font-bold">
          2
        </span>
        <span className="text-primary font-medium">Company Info</span>
        <span className="material-symbols-outlined text-subtle-text">chevron_right</span>
        <span className="flex items-center justify-center size-6 rounded-full bg-border-light text-subtle-text text-xs font-bold">
          3
        </span>
        <span className="text-subtle-text">Directors</span>
        <span className="material-symbols-outlined text-subtle-text">chevron_right</span>
        <span className="flex items-center justify-center size-6 rounded-full bg-border-light text-subtle-text text-xs font-bold">
          4
        </span>
        <span className="text-subtle-text">Documents</span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Physical Address Section */}
        <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark">
          <div className="px-6 py-4 border-b border-border-light dark:border-border-dark">
            <h2 className="text-lg font-bold text-text-light dark:text-text-dark flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">location_on</span>
              Physical Address
            </h2>
          </div>
          <div className="p-6 space-y-4">
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-text-light dark:text-text-dark">
                Street Address
              </span>
              <input
                type="text"
                name="physicalAddress"
                value={formData.physicalAddress}
                onChange={handleChange}
                placeholder="123 Business Street, Suite 100"
                className="h-12 px-4 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark placeholder:text-subtle-text focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-text-light dark:text-text-dark">City</span>
                <input
                  type="text"
                  name="physicalCity"
                  value={formData.physicalCity}
                  onChange={handleChange}
                  placeholder="New York"
                  className="h-12 px-4 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark placeholder:text-subtle-text focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-text-light dark:text-text-dark">
                  State/Province
                </span>
                <input
                  type="text"
                  name="physicalState"
                  value={formData.physicalState}
                  onChange={handleChange}
                  placeholder="NY"
                  className="h-12 px-4 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark placeholder:text-subtle-text focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-text-light dark:text-text-dark">
                  Postal Code
                </span>
                <input
                  type="text"
                  name="physicalPostalCode"
                  value={formData.physicalPostalCode}
                  onChange={handleChange}
                  placeholder="10001"
                  className="h-12 px-4 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark placeholder:text-subtle-text focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-text-light dark:text-text-dark">Country</span>
                <input
                  type="text"
                  name="physicalCountry"
                  value={formData.physicalCountry}
                  onChange={handleChange}
                  placeholder="United States"
                  className="h-12 px-4 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark placeholder:text-subtle-text focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </label>
            </div>
          </div>
        </div>

        {/* Postal Address Section */}
        <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark">
          <div className="px-6 py-4 border-b border-border-light dark:border-border-dark flex justify-between items-center">
            <h2 className="text-lg font-bold text-text-light dark:text-text-dark flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">mail</span>
              Postal Address
            </h2>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                name="sameAsPhysical"
                checked={formData.sameAsPhysical}
                onChange={handleChange}
                className="size-4 rounded border-border-light text-primary focus:ring-primary"
              />
              <span className="text-sm text-subtle-text">Same as physical address</span>
            </label>
          </div>
          {!formData.sameAsPhysical && (
            <div className="p-6 space-y-4">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-text-light dark:text-text-dark">
                  Street Address
                </span>
                <input
                  type="text"
                  name="postalAddress"
                  value={formData.postalAddress}
                  onChange={handleChange}
                  placeholder="PO Box 123"
                  className="h-12 px-4 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark placeholder:text-subtle-text focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </label>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-medium text-text-light dark:text-text-dark">City</span>
                  <input
                    type="text"
                    name="postalCity"
                    value={formData.postalCity}
                    onChange={handleChange}
                    placeholder="New York"
                    className="h-12 px-4 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark placeholder:text-subtle-text focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </label>

                <label className="flex flex-col gap-2">
                  <span className="text-sm font-medium text-text-light dark:text-text-dark">
                    State/Province
                  </span>
                  <input
                    type="text"
                    name="postalState"
                    value={formData.postalState}
                    onChange={handleChange}
                    placeholder="NY"
                    className="h-12 px-4 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark placeholder:text-subtle-text focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </label>

                <label className="flex flex-col gap-2">
                  <span className="text-sm font-medium text-text-light dark:text-text-dark">
                    Postal Code
                  </span>
                  <input
                    type="text"
                    name="postalPostalCode"
                    value={formData.postalPostalCode}
                    onChange={handleChange}
                    placeholder="10001"
                    className="h-12 px-4 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark placeholder:text-subtle-text focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </label>

                <label className="flex flex-col gap-2">
                  <span className="text-sm font-medium text-text-light dark:text-text-dark">
                    Country
                  </span>
                  <input
                    type="text"
                    name="postalCountry"
                    value={formData.postalCountry}
                    onChange={handleChange}
                    placeholder="United States"
                    className="h-12 px-4 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark placeholder:text-subtle-text focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Business Details Section */}
        <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark">
          <div className="px-6 py-4 border-b border-border-light dark:border-border-dark">
            <h2 className="text-lg font-bold text-text-light dark:text-text-dark flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">business</span>
              Business Details
            </h2>
          </div>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Changed (SOUPFIN-151): shared industry codes, saved to Account.industry */}
              <IndustrySelect
                value={industry}
                onChange={(next) => setFormData((prev) => ({ ...prev, industry: next }))}
                businessType={accountBusinessType}
                testId="company-info-industry"
              />

              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-text-light dark:text-text-dark">
                  Annual Revenue Range
                </span>
                <select
                  name="annualRevenue"
                  value={formData.annualRevenue}
                  onChange={handleChange}
                  className="h-12 px-4 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/20"
                >
                  <option value="">Select range...</option>
                  {REVENUE_RANGES.map((range) => (
                    <option key={range.value} value={range.value}>
                      {range.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-text-light dark:text-text-dark">
                  Number of Employees
                </span>
                <select
                  name="employeeCount"
                  value={formData.employeeCount}
                  onChange={handleChange}
                  className="h-12 px-4 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/20"
                >
                  <option value="">Select range...</option>
                  {EMPLOYEE_RANGES.map((range) => (
                    <option key={range.value} value={range.value}>
                      {range.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-text-light dark:text-text-dark">
                Company Website
              </span>
              <input
                type="url"
                name="website"
                value={formData.website}
                onChange={handleChange}
                placeholder="https://www.yourcompany.com"
                className="h-12 px-4 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark placeholder:text-subtle-text focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-text-light dark:text-text-dark">
                Business Description
              </span>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                placeholder="Brief description of your company's main activities and services..."
                rows={4}
                className="px-4 py-3 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark placeholder:text-subtle-text focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>
          </div>
        </div>
      </form>
    </div>
  );
}
