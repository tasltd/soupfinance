/**
 * Company Information Page
 * Detailed company information for KYC onboarding
 * Reference: soupfinance-designs/new-invoice-form/ (multi-section form pattern)
 */
import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getCorporate, updateCorporate } from '../../api/endpoints/corporate';

// Added: Industry classification options
const INDUSTRY_OPTIONS = [
  'Agriculture & Farming',
  'Construction & Real Estate',
  'Education & Training',
  'Energy & Utilities',
  'Financial Services',
  'Healthcare & Pharmaceuticals',
  'Hospitality & Tourism',
  'Information Technology',
  'Manufacturing',
  'Mining & Natural Resources',
  'Professional Services',
  'Retail & Wholesale',
  'Transportation & Logistics',
  'Telecommunications',
  'Other',
];

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
    industry: '',
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
  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => updateCorporate(corporateId!, data),
    onSuccess: () => {
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
      metadata: JSON.stringify({
        industry: formData.industry,
        annualRevenue: formData.annualRevenue,
        employeeCount: formData.employeeCount,
        website: formData.website,
        description: formData.description,
      }),
    });
  };

  // Added: Navigation handlers
  const handleBack = () => {
    navigate('/register');
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
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-text-light dark:text-text-dark">
                  Industry Classification
                </span>
                <select
                  name="industry"
                  value={formData.industry}
                  onChange={handleChange}
                  className="h-12 px-4 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/20"
                >
                  <option value="">Select industry...</option>
                  {INDUSTRY_OPTIONS.map((industry) => (
                    <option key={industry} value={industry}>
                      {industry}
                    </option>
                  ))}
                </select>
              </label>

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
