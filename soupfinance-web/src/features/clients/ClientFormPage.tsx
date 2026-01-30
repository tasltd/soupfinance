/**
 * Client Form Page (Create/Edit)
 * PURPOSE: Create new client or edit existing client details
 *
 * ARCHITECTURE (2026-01-30):
 * - Supports INDIVIDUAL and CORPORATE client types
 * - Dynamic form fields based on selected type
 */
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getClient, createClient, updateClient } from '../../api';
import type { InvoiceClientType } from '../../api/endpoints/clients';
import { Input, Textarea } from '../../components/forms';

// Validation schema with conditional requirements based on clientType
const clientSchema = z.object({
  clientType: z.enum(['INDIVIDUAL', 'CORPORATE']),
  email: z.string().email('Invalid email address'),
  phone: z.string().max(50, 'Phone number is too long').optional().or(z.literal('')),
  address: z.string().max(500, 'Address is too long').optional().or(z.literal('')),

  // Individual fields
  firstName: z.string().max(100, 'First name is too long').optional().or(z.literal('')),
  lastName: z.string().max(100, 'Last name is too long').optional().or(z.literal('')),

  // Corporate fields
  companyName: z.string().max(255, 'Company name is too long').optional().or(z.literal('')),
  contactPerson: z.string().max(200, 'Contact person is too long').optional().or(z.literal('')),
  registrationNumber: z.string().max(50, 'Registration number is too long').optional().or(z.literal('')),
  taxNumber: z.string().max(50, 'Tax number is too long').optional().or(z.literal('')),
}).refine((data) => {
  // Individual requires firstName and lastName
  if (data.clientType === 'INDIVIDUAL') {
    return !!data.firstName?.trim() && !!data.lastName?.trim();
  }
  return true;
}, {
  message: 'First name and last name are required for individuals',
  path: ['firstName'],
}).refine((data) => {
  // Corporate requires companyName
  if (data.clientType === 'CORPORATE') {
    return !!data.companyName?.trim();
  }
  return true;
}, {
  message: 'Company name is required for corporate clients',
  path: ['companyName'],
});

type ClientFormData = z.infer<typeof clientSchema>;

export function ClientFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEdit = !!id;

  // Track client type for conditional rendering
  const [clientType, setClientType] = useState<InvoiceClientType>('INDIVIDUAL');

  // React Hook Form setup
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ClientFormData>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      clientType: 'INDIVIDUAL',
      email: '',
      phone: '',
      address: '',
      firstName: '',
      lastName: '',
      companyName: '',
      contactPerson: '',
      registrationNumber: '',
      taxNumber: '',
    },
  });

  // Watch clientType for conditional rendering
  const watchedType = watch('clientType');
  useEffect(() => {
    setClientType(watchedType);
  }, [watchedType]);

  // Query to fetch client data for edit mode
  const { data: client, isLoading: isLoadingClient } = useQuery({
    queryKey: ['client', id],
    queryFn: () => getClient(id!),
    enabled: isEdit,
  });

  // Populate form when client data is loaded
  useEffect(() => {
    if (client) {
      reset({
        clientType: client.clientType,
        email: client.email || '',
        phone: client.phone || '',
        address: client.address || '',
        firstName: client.firstName || '',
        lastName: client.lastName || '',
        companyName: client.companyName || '',
        contactPerson: client.contactPerson || '',
        registrationNumber: client.registrationNumber || '',
        taxNumber: client.taxNumber || '',
      });
      setClientType(client.clientType);
    }
  }, [client, reset]);

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: ClientFormData) => {
      const payload = {
        clientType: data.clientType,
        email: data.email,
        phone: data.phone || undefined,
        address: data.address || undefined,
        firstName: data.firstName || undefined,
        lastName: data.lastName || undefined,
        companyName: data.companyName || undefined,
        contactPerson: data.contactPerson || undefined,
        registrationNumber: data.registrationNumber || undefined,
        taxNumber: data.taxNumber || undefined,
      };
      return createClient(payload);
    },
    onSuccess: (newClient) => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      navigate(`/clients/${newClient.id}`);
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (data: ClientFormData) => {
      const payload = {
        clientType: data.clientType,
        email: data.email,
        phone: data.phone || undefined,
        address: data.address || undefined,
        firstName: data.firstName || undefined,
        lastName: data.lastName || undefined,
        companyName: data.companyName || undefined,
        contactPerson: data.contactPerson || undefined,
        registrationNumber: data.registrationNumber || undefined,
        taxNumber: data.taxNumber || undefined,
      };
      return updateClient(id!, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['client', id] });
      navigate(`/clients/${id}`);
    },
  });

  // Form submission handler
  const onSubmit = (data: ClientFormData) => {
    if (isEdit) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  // Loading state for edit mode
  if (isEdit && isLoadingClient) {
    return (
      <div className="flex flex-col gap-6" data-testid="client-form-page">
        <div className="flex items-center justify-center p-12 text-subtle-text">
          Loading client...
        </div>
      </div>
    );
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const mutationError = createMutation.error || updateMutation.error;

  return (
    <div className="flex flex-col gap-6" data-testid="client-form-page">
      {/* Page Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1
            className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark"
            data-testid="client-form-heading"
          >
            {isEdit ? 'Edit Client' : 'New Client'}
          </h1>
          <p className="text-subtle-text">
            {isEdit ? 'Update client information' : 'Add a new client for invoicing'}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => navigate('/clients')}
            className="h-10 px-4 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-medium text-sm hover:bg-primary/5"
            data-testid="client-form-cancel"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit(onSubmit)}
            disabled={isSaving || isSubmitting}
            className="h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90 disabled:opacity-50"
            data-testid="client-form-save"
          >
            {isSaving ? 'Saving...' : isEdit ? 'Update Client' : 'Create Client'}
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {mutationError && (
        <div
          className="p-4 rounded-lg bg-danger/10 border border-danger/30 text-danger flex items-start gap-3"
          data-testid="client-form-error"
        >
          <span className="material-symbols-outlined text-xl">error</span>
          <div>
            <p className="font-medium">Failed to save client</p>
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
        data-testid="client-form-container"
      >
        {/* Client Type Selection */}
        <div className="p-6 border-b border-border-light dark:border-border-dark">
          <h2 className="text-lg font-bold text-text-light dark:text-text-dark mb-4">
            Client Type <span className="text-danger">*</span>
          </h2>
          <div className="grid grid-cols-2 gap-4 max-w-md">
            <button
              type="button"
              onClick={() => {
                setValue('clientType', 'INDIVIDUAL');
                setClientType('INDIVIDUAL');
              }}
              disabled={isEdit} // Can't change type when editing
              className={`p-4 rounded-lg border-2 transition-all ${
                clientType === 'INDIVIDUAL'
                  ? 'border-primary bg-primary/5'
                  : 'border-border-light dark:border-border-dark hover:border-primary/50'
              } ${isEdit ? 'opacity-60 cursor-not-allowed' : ''}`}
              data-testid="client-type-individual"
            >
              <div className="flex flex-col items-center gap-2">
                <span className={`material-symbols-outlined text-2xl ${
                  clientType === 'INDIVIDUAL' ? 'text-primary' : 'text-subtle-text'
                }`}>
                  person
                </span>
                <span className={`font-medium text-sm ${
                  clientType === 'INDIVIDUAL' ? 'text-primary' : 'text-text-light dark:text-text-dark'
                }`}>
                  Individual
                </span>
              </div>
            </button>
            <button
              type="button"
              onClick={() => {
                setValue('clientType', 'CORPORATE');
                setClientType('CORPORATE');
              }}
              disabled={isEdit}
              className={`p-4 rounded-lg border-2 transition-all ${
                clientType === 'CORPORATE'
                  ? 'border-primary bg-primary/5'
                  : 'border-border-light dark:border-border-dark hover:border-primary/50'
              } ${isEdit ? 'opacity-60 cursor-not-allowed' : ''}`}
              data-testid="client-type-corporate"
            >
              <div className="flex flex-col items-center gap-2">
                <span className={`material-symbols-outlined text-2xl ${
                  clientType === 'CORPORATE' ? 'text-primary' : 'text-subtle-text'
                }`}>
                  business
                </span>
                <span className={`font-medium text-sm ${
                  clientType === 'CORPORATE' ? 'text-primary' : 'text-text-light dark:text-text-dark'
                }`}>
                  Corporate
                </span>
              </div>
            </button>
          </div>
          <input type="hidden" {...register('clientType')} />
        </div>

        {/* Individual Fields */}
        {clientType === 'INDIVIDUAL' && (
          <div className="p-6 border-b border-border-light dark:border-border-dark">
            <h2 className="text-lg font-bold text-text-light dark:text-text-dark mb-6">
              Personal Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Input
                label="First Name"
                placeholder="Enter first name"
                required
                error={errors.firstName?.message}
                {...register('firstName')}
                data-testid="client-form-first-name"
              />
              <Input
                label="Last Name"
                placeholder="Enter last name"
                required
                error={errors.lastName?.message}
                {...register('lastName')}
                data-testid="client-form-last-name"
              />
            </div>
          </div>
        )}

        {/* Corporate Fields */}
        {clientType === 'CORPORATE' && (
          <div className="p-6 border-b border-border-light dark:border-border-dark">
            <h2 className="text-lg font-bold text-text-light dark:text-text-dark mb-6">
              Company Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Input
                label="Company Name"
                placeholder="Enter company name"
                required
                error={errors.companyName?.message}
                {...register('companyName')}
                data-testid="client-form-company-name"
              />
              <Input
                label="Contact Person"
                placeholder="Primary contact name"
                error={errors.contactPerson?.message}
                {...register('contactPerson')}
                data-testid="client-form-contact-person"
              />
              <Input
                label="Registration Number"
                placeholder="Company registration number"
                error={errors.registrationNumber?.message}
                {...register('registrationNumber')}
                data-testid="client-form-registration-number"
              />
              <Input
                label="Tax Number"
                placeholder="Tax identification number"
                error={errors.taxNumber?.message}
                {...register('taxNumber')}
                data-testid="client-form-tax-number"
              />
            </div>
          </div>
        )}

        {/* Contact Information */}
        <div className="p-6 border-b border-border-light dark:border-border-dark">
          <h2 className="text-lg font-bold text-text-light dark:text-text-dark mb-6">
            Contact Information
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Input
              label="Email"
              type="email"
              placeholder="client@example.com"
              required
              error={errors.email?.message}
              {...register('email')}
              data-testid="client-form-email"
            />
            <Input
              label="Phone"
              type="tel"
              placeholder="+1 (555) 123-4567"
              error={errors.phone?.message}
              {...register('phone')}
              data-testid="client-form-phone"
            />
          </div>
        </div>

        {/* Address */}
        <div className="p-6">
          <h2 className="text-lg font-bold text-text-light dark:text-text-dark mb-6">
            Billing Address
          </h2>
          <Textarea
            label="Address"
            placeholder="Enter billing address"
            rows={3}
            error={errors.address?.message}
            {...register('address')}
            data-testid="client-form-address"
          />
        </div>
      </form>

      {/* Bottom Action Buttons (mobile-friendly) */}
      <div className="flex justify-end gap-3 md:hidden">
        <button
          onClick={() => navigate('/clients')}
          className="flex-1 h-12 px-4 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-medium text-sm hover:bg-primary/5"
          data-testid="client-form-cancel-mobile"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit(onSubmit)}
          disabled={isSaving || isSubmitting}
          className="flex-1 h-12 px-4 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90 disabled:opacity-50"
          data-testid="client-form-save-mobile"
        >
          {isSaving ? 'Saving...' : isEdit ? 'Update' : 'Create'}
        </button>
      </div>
    </div>
  );
}
