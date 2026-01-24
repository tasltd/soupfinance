/**
 * Vendor Form Page (Create/Edit)
 * PURPOSE: Create new vendor or edit existing vendor details
 * Reference: soupfinance-designs/new-invoice-form/ (form patterns)
 */
import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getVendor, createVendor, updateVendor } from '../../api';
import { Input, Textarea } from '../../components/forms';

// Added: Zod validation schema for vendor form
// Constraints: name required, email format validation, payment terms must be positive
// Changed: paymentTerms uses union with nan transform to handle empty input (valueAsNumber returns NaN for empty)
const vendorSchema = z.object({
  name: z.string().min(1, 'Vendor name is required').max(255, 'Name is too long'),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  phoneNumber: z.string().max(50, 'Phone number is too long').optional().or(z.literal('')),
  address: z.string().max(500, 'Address is too long').optional().or(z.literal('')),
  taxIdentificationNumber: z.string().max(50, 'TIN is too long').optional().or(z.literal('')),
  paymentTerms: z
    .number()
    .int('Payment terms must be a whole number')
    .min(0, 'Payment terms cannot be negative')
    .max(365, 'Payment terms cannot exceed 365 days')
    .optional()
    .or(z.nan().transform(() => undefined)),
  notes: z.string().max(2000, 'Notes are too long').optional().or(z.literal('')),
});

// Added: Type inference from schema for form values
type VendorFormData = z.infer<typeof vendorSchema>;

export function VendorFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEdit = !!id;

  // Added: React Hook Form setup with Zod resolver
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<VendorFormData>({
    resolver: zodResolver(vendorSchema),
    defaultValues: {
      name: '',
      email: '',
      phoneNumber: '',
      address: '',
      taxIdentificationNumber: '',
      paymentTerms: undefined,
      notes: '',
    },
  });

  // Added: Query to fetch vendor data for edit mode
  const { data: vendor, isLoading: isLoadingVendor } = useQuery({
    queryKey: ['vendor', id],
    queryFn: () => getVendor(id!),
    enabled: isEdit, // Only fetch when editing
  });

  // Added: Populate form when vendor data is loaded
  useEffect(() => {
    if (vendor) {
      reset({
        name: vendor.name || '',
        email: vendor.email || '',
        phoneNumber: vendor.phoneNumber || '',
        address: vendor.address || '',
        taxIdentificationNumber: vendor.taxIdentificationNumber || '',
        paymentTerms: vendor.paymentTerms ?? undefined,
        notes: vendor.notes || '',
      });
    }
  }, [vendor, reset]);

  // Added: Create mutation
  const createMutation = useMutation({
    mutationFn: (data: VendorFormData) => {
      // Convert empty strings to undefined for optional fields
      const payload = {
        name: data.name,
        email: data.email || undefined,
        phoneNumber: data.phoneNumber || undefined,
        address: data.address || undefined,
        taxIdentificationNumber: data.taxIdentificationNumber || undefined,
        paymentTerms: data.paymentTerms ? Number(data.paymentTerms) : undefined,
        notes: data.notes || undefined,
      };
      return createVendor(payload);
    },
    onSuccess: (newVendor) => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      navigate(`/vendors/${newVendor.id}`);
    },
  });

  // Added: Update mutation
  const updateMutation = useMutation({
    mutationFn: (data: VendorFormData) => {
      // Convert empty strings to undefined for optional fields
      const payload = {
        name: data.name,
        email: data.email || undefined,
        phoneNumber: data.phoneNumber || undefined,
        address: data.address || undefined,
        taxIdentificationNumber: data.taxIdentificationNumber || undefined,
        paymentTerms: data.paymentTerms ? Number(data.paymentTerms) : undefined,
        notes: data.notes || undefined,
      };
      return updateVendor(id!, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      queryClient.invalidateQueries({ queryKey: ['vendor', id] });
      navigate(`/vendors/${id}`);
    },
  });

  // Added: Form submission handler
  const onSubmit = (data: VendorFormData) => {
    if (isEdit) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  // Added: Loading state for edit mode
  if (isEdit && isLoadingVendor) {
    return (
      <div className="flex flex-col gap-6" data-testid="vendor-form-page">
        <div className="flex items-center justify-center p-12 text-subtle-text">
          Loading vendor...
        </div>
      </div>
    );
  }

  // Added: Determine mutation state for button text
  const isSaving = createMutation.isPending || updateMutation.isPending;
  const mutationError = createMutation.error || updateMutation.error;

  return (
    <div className="flex flex-col gap-6" data-testid="vendor-form-page">
      {/* Page Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1
            className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark"
            data-testid="vendor-form-heading"
          >
            {isEdit ? 'Edit Vendor' : 'New Vendor'}
          </h1>
          <p className="text-subtle-text">
            {isEdit ? 'Update vendor information' : 'Add a new vendor to your system'}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => navigate('/vendors')}
            className="h-10 px-4 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-medium text-sm hover:bg-primary/5"
            data-testid="vendor-form-cancel"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit(onSubmit)}
            disabled={isSaving || isSubmitting}
            className="h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90 disabled:opacity-50"
            data-testid="vendor-form-save"
          >
            {isSaving ? 'Saving...' : isEdit ? 'Update Vendor' : 'Create Vendor'}
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {mutationError && (
        <div
          className="p-4 rounded-lg bg-danger/10 border border-danger/30 text-danger flex items-start gap-3"
          data-testid="vendor-form-error"
        >
          <span className="material-symbols-outlined text-xl">error</span>
          <div>
            <p className="font-medium">Failed to save vendor</p>
            <p className="text-sm opacity-80">
              {mutationError instanceof Error ? mutationError.message : 'An unexpected error occurred'}
            </p>
          </div>
        </div>
      )}

      {/* Form Container */}
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark"
        data-testid="vendor-form-container"
      >
        {/* Basic Information Section */}
        <div className="p-6 border-b border-border-light dark:border-border-dark">
          <h2 className="text-lg font-bold text-text-light dark:text-text-dark mb-6">
            Basic Information
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Input
              label="Vendor Name"
              placeholder="Enter vendor name"
              required
              error={errors.name?.message}
              {...register('name')}
              data-testid="vendor-form-name"
            />
            <Input
              label="Email"
              type="email"
              placeholder="vendor@example.com"
              error={errors.email?.message}
              {...register('email')}
              data-testid="vendor-form-email"
            />
            <Input
              label="Phone Number"
              type="tel"
              placeholder="+1 (555) 123-4567"
              error={errors.phoneNumber?.message}
              {...register('phoneNumber')}
              data-testid="vendor-form-phone"
            />
            <Input
              label="Tax Identification Number"
              placeholder="Enter TIN"
              helperText="Tax ID for reporting purposes"
              error={errors.taxIdentificationNumber?.message}
              {...register('taxIdentificationNumber')}
              data-testid="vendor-form-tin"
            />
          </div>
        </div>

        {/* Payment Terms Section */}
        <div className="p-6 border-b border-border-light dark:border-border-dark">
          <h2 className="text-lg font-bold text-text-light dark:text-text-dark mb-6">Payment Terms</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Input
              label="Payment Terms (Days)"
              type="number"
              placeholder="30"
              min={0}
              max={365}
              helperText="Number of days until payment is due (e.g., Net 30)"
              error={errors.paymentTerms?.message}
              {...register('paymentTerms', { valueAsNumber: true })}
              data-testid="vendor-form-payment-terms"
            />
          </div>
        </div>

        {/* Address Section */}
        <div className="p-6 border-b border-border-light dark:border-border-dark">
          <h2 className="text-lg font-bold text-text-light dark:text-text-dark mb-6">Address</h2>
          <Textarea
            label="Address"
            placeholder="Enter vendor's full address"
            rows={3}
            error={errors.address?.message}
            {...register('address')}
            data-testid="vendor-form-address"
          />
        </div>

        {/* Notes Section */}
        <div className="p-6">
          <h2 className="text-lg font-bold text-text-light dark:text-text-dark mb-6">
            Additional Notes
          </h2>
          <Textarea
            label="Notes"
            placeholder="Add any additional notes about this vendor..."
            rows={4}
            error={errors.notes?.message}
            {...register('notes')}
            data-testid="vendor-form-notes"
          />
        </div>
      </form>

      {/* Bottom Action Buttons (mobile-friendly) */}
      <div className="flex justify-end gap-3 md:hidden">
        <button
          onClick={() => navigate('/vendors')}
          className="flex-1 h-12 px-4 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-medium text-sm hover:bg-primary/5"
          data-testid="vendor-form-cancel-mobile"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit(onSubmit)}
          disabled={isSaving || isSubmitting}
          className="flex-1 h-12 px-4 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90 disabled:opacity-50"
          data-testid="vendor-form-save-mobile"
        >
          {isSaving ? 'Saving...' : isEdit ? 'Update' : 'Create'}
        </button>
      </div>
    </div>
  );
}
