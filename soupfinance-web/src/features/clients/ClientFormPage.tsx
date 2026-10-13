/**
 * Client Form Page (Create/Edit)
 * PURPOSE: Create new client or edit existing client details
 *
 * ARCHITECTURE (2026-01-30):
 * - Supports INDIVIDUAL and CORPORATE client types
 * - Dynamic form fields based on selected type
 */
import { useEffect, useState } from 'react';
// Added (SOUPFIN-167): every visible string comes from the clients namespace
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getClient, createClient, updateClient } from '../../api';
// Changed: Renamed from InvoiceClientType to ClientType (matches backend domain)
import type { ClientType } from '../../api/endpoints/clients';
import { Input, Textarea } from '../../components/forms';
// Added (SOUPFIN-81): "Need Help?" link to this page's section of the user guide
import { HelpLink } from '../../components/help';
import type enClients from '../../i18n/locales/en/clients.json';

// Changed (SOUPFIN-167): the schema is built once, outside React, so its
// messages are translation KEYS. The page translates them when it renders an
// error, which also re-translates a visible error if the user switches language.
type ValidationKey = `validation.${keyof typeof enClients.validation}`;
const msg = (key: ValidationKey) => key;

// Validation schema with conditional requirements based on clientType
const clientSchema = z.object({
  clientType: z.enum(['INDIVIDUAL', 'CORPORATE']),
  email: z.string().email(msg('validation.emailInvalid')),
  phone: z.string().max(50, msg('validation.phoneTooLong')).optional().or(z.literal('')),
  address: z.string().max(500, msg('validation.addressTooLong')).optional().or(z.literal('')),

  // Individual fields
  firstName: z.string().max(100, msg('validation.firstNameTooLong')).optional().or(z.literal('')),
  lastName: z.string().max(100, msg('validation.lastNameTooLong')).optional().or(z.literal('')),

  // Corporate fields
  companyName: z.string().max(255, msg('validation.companyNameTooLong')).optional().or(z.literal('')),
  contactPerson: z.string().max(200, msg('validation.contactPersonTooLong')).optional().or(z.literal('')),
  registrationNumber: z.string().max(50, msg('validation.registrationNumberTooLong')).optional().or(z.literal('')),
  taxNumber: z.string().max(50, msg('validation.taxNumberTooLong')).optional().or(z.literal('')),
}).refine((data) => {
  // Individual requires firstName and lastName
  if (data.clientType === 'INDIVIDUAL') {
    return !!data.firstName?.trim() && !!data.lastName?.trim();
  }
  return true;
}, {
  message: msg('validation.namesRequired'),
  path: ['firstName'],
}).refine((data) => {
  // Corporate requires companyName
  if (data.clientType === 'CORPORATE') {
    return !!data.companyName?.trim();
  }
  return true;
}, {
  message: msg('validation.companyNameRequired'),
  path: ['companyName'],
});

type ClientFormData = z.infer<typeof clientSchema>;

export function ClientFormPage() {
  const { t } = useTranslation('clients');
  // Resolve a schema message key; anything else (a future raw message) shows as-is
  const errorText = (message?: string) =>
    message?.startsWith('validation.') ? t(message as ValidationKey) : message;
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEdit = !!id;

  // Track client type for conditional rendering
  // Changed: InvoiceClientType → ClientType (matches backend domain soupbroker.kyc.Client)
  const [clientType, setClientType] = useState<ClientType>('INDIVIDUAL');

  // Fix (SOUPFIN-30 #14): when EDITING a client that resolved to INDIVIDUAL,
  // the Corporate type tab must not be offered — an existing individual record
  // has no company fields to fill, and switching it would submit an invalid
  // payload. Set once from the loaded record; creation still shows both tabs.
  const [isEditingIndividual, setIsEditingIndividual] = useState(false);

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
      // Fix (SOUPFIN-14): The backend sometimes returns clientType=CORPORATE
      // even for individual clients. Infer the actual type from populated
      // fields so the Personal Information section isn't hidden when the
      // record clearly has firstName/lastName but a wrong type discriminator.
      // Priority order:
      //   1. companyName present and no individual fields → CORPORATE
      //   2. firstName/lastName present and no companyName → INDIVIDUAL
      //   3. fall back to whatever the backend reported (default CORPORATE)
      const hasIndividualFields = Boolean(client.firstName?.trim() || client.lastName?.trim());
      const hasCorporateFields = Boolean(client.companyName?.trim());
      // Fix (SOUP-1836): The form only supports INDIVIDUAL and CORPORATE, but the
      // backend can return ITF or "UNKNOWN" client types (and Corporate records
      // sometimes carry the company name only in the generic `name` field, not
      // `companyName`). Resolve every non-individual record to the CORPORATE
      // branch so a name field is ALWAYS shown and editable — previously an
      // ITF/UNKNOWN client rendered neither the Personal nor Company section,
      // leaving its name field missing entirely.
      const resolvedType: ClientType =
        hasIndividualFields && !hasCorporateFields
          ? 'INDIVIDUAL'
          : client.clientType === 'INDIVIDUAL' && !hasCorporateFields
            ? 'INDIVIDUAL'
            : 'CORPORATE';

      // Back-fill the Company Name from the generic `name` field for any
      // corporate-resolved record whose `companyName` came back empty (Corporate,
      // ITF and UNKNOWN all surface their display name as `name`).
      const resolvedCompanyName =
        client.companyName?.trim() ||
        (resolvedType === 'CORPORATE' ? client.name?.trim() || '' : '');

      reset({
        clientType: resolvedType,
        email: client.email || '',
        phone: client.phone || '',
        address: client.address || '',
        firstName: client.firstName || '',
        lastName: client.lastName || '',
        companyName: resolvedCompanyName,
        contactPerson: client.contactPerson || '',
        registrationNumber: client.registrationNumber || '',
        taxNumber: client.taxNumber || '',
      });
      setClientType(resolvedType);
      // Fix (SOUPFIN-30 #14): remember that this record is an individual so the
      // Corporate tab stays hidden for the lifetime of the edit session.
      setIsEditingIndividual(resolvedType === 'INDIVIDUAL');
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
          {t('form.loading')}
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
            {isEdit ? t('form.headingEdit') : t('form.headingNew')}
          </h1>
          <p className="text-subtle-text">
            {isEdit ? t('form.subtitleEdit') : t('form.subtitleNew')}
          </p>
          <HelpLink section="add-client" className="mt-1 self-start" />
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => navigate('/clients')}
            className="h-10 px-4 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-medium text-sm hover:bg-primary/5"
            data-testid="client-form-cancel"
          >
            {t('actions.cancel')}
          </button>
          <button
            onClick={handleSubmit(onSubmit)}
            disabled={isSaving || isSubmitting}
            className="h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90 disabled:opacity-50"
            data-testid="client-form-save"
          >
            {isSaving ? t('form.saving') : isEdit ? t('form.update') : t('form.create')}
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
            <p className="font-medium">{t('form.saveFailed')}</p>
            <p className="text-sm opacity-80">
              {mutationError instanceof Error ? mutationError.message : t('form.unexpectedError')}
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
            {t('form.clientType')} <span className="text-danger">*</span>
          </h2>
          {/* Fix (SOUPFIN-30 #14): collapse to a single column when the Corporate
              tab is hidden so the lone Individual tab doesn't stretch oddly. */}
          <div
            className={`grid gap-4 max-w-md ${isEditingIndividual ? 'grid-cols-1' : 'grid-cols-2'}`}
          >
            <button
              type="button"
              onClick={() => {
                setValue('clientType', 'INDIVIDUAL');
                setClientType('INDIVIDUAL');
              }}
              // Fix (SOUPFIN-14): Allow type changes when editing — the backend
              // sometimes mislabels individual records as Corporate, and the
              // user needs a way to correct the discriminator.
              className={`p-4 rounded-lg border-2 transition-all ${
                clientType === 'INDIVIDUAL'
                  ? 'border-primary bg-primary/5'
                  : 'border-border-light dark:border-border-dark hover:border-primary/50'
              }`}
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
                  {t('types.individual')}
                </span>
              </div>
            </button>
            {/* Fix (SOUPFIN-30 #14): hidden when editing an individual client. */}
            {!isEditingIndividual && (
            <button
              type="button"
              onClick={() => {
                setValue('clientType', 'CORPORATE');
                setClientType('CORPORATE');
              }}
              // Fix (SOUPFIN-14): Allow type changes when editing — see Individual
              // button above. Mirrors the same rule.
              className={`p-4 rounded-lg border-2 transition-all ${
                clientType === 'CORPORATE'
                  ? 'border-primary bg-primary/5'
                  : 'border-border-light dark:border-border-dark hover:border-primary/50'
              }`}
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
                  {t('types.corporate')}
                </span>
              </div>
            </button>
            )}
          </div>
          <input type="hidden" {...register('clientType')} />
        </div>

        {/* Individual Fields */}
        {/* Fix (SOUPFIN-16): Also render Personal Information in edit mode when the
            client has firstName/lastName even if the backend reported CORPORATE —
            the previous fix only inferred type at form-init time, but a user who
            manually toggles to CORPORATE would then lose access to update name
            fields. Showing them for INDIVIDUAL OR when existing values are present
            in edit mode keeps name details editable in all real-world scenarios. */}
        {(clientType === 'INDIVIDUAL' ||
          (isEdit && (!!client?.firstName?.trim() || !!client?.lastName?.trim()))) && (
          <div
            className="p-6 border-b border-border-light dark:border-border-dark"
            data-testid="client-form-personal-section"
          >
            <h2 className="text-lg font-bold text-text-light dark:text-text-dark mb-6">
              {t('detail.personalInfo')}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Input
                label={t('fields.firstName')}
                placeholder={t('form.placeholders.firstName')}
                required={clientType === 'INDIVIDUAL'}
                error={errorText(errors.firstName?.message)}
                {...register('firstName')}
                data-testid="client-form-first-name"
              />
              <Input
                label={t('fields.lastName')}
                placeholder={t('form.placeholders.lastName')}
                required={clientType === 'INDIVIDUAL'}
                error={errorText(errors.lastName?.message)}
                {...register('lastName')}
                data-testid="client-form-last-name"
              />
            </div>
          </div>
        )}

        {/* Corporate Fields */}
        {clientType === 'CORPORATE' && (
          <div
            className="p-6 border-b border-border-light dark:border-border-dark"
            data-testid="client-form-company-section"
          >
            <h2 className="text-lg font-bold text-text-light dark:text-text-dark mb-6">
              {t('detail.companyInfo')}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Input
                label={t('fields.companyName')}
                placeholder={t('form.placeholders.companyName')}
                required
                error={errorText(errors.companyName?.message)}
                {...register('companyName')}
                data-testid="client-form-company-name"
              />
              <Input
                label={t('fields.contactPerson')}
                placeholder={t('form.placeholders.contactPerson')}
                error={errorText(errors.contactPerson?.message)}
                {...register('contactPerson')}
                data-testid="client-form-contact-person"
              />
              <Input
                label={t('fields.registrationNumber')}
                placeholder={t('form.placeholders.registrationNumber')}
                error={errorText(errors.registrationNumber?.message)}
                {...register('registrationNumber')}
                data-testid="client-form-registration-number"
              />
              <Input
                label={t('fields.taxNumber')}
                placeholder={t('form.placeholders.taxNumber')}
                error={errorText(errors.taxNumber?.message)}
                {...register('taxNumber')}
                data-testid="client-form-tax-number"
              />
            </div>
          </div>
        )}

        {/* Contact Information */}
        <div className="p-6 border-b border-border-light dark:border-border-dark">
          <h2 className="text-lg font-bold text-text-light dark:text-text-dark mb-6">
            {t('detail.contactInfo')}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Input
              label={t('fields.email')}
              type="email"
              placeholder={t('form.placeholders.email')}
              required
              error={errorText(errors.email?.message)}
              {...register('email')}
              data-testid="client-form-email"
            />
            <Input
              label={t('fields.phone')}
              type="tel"
              placeholder={t('form.placeholders.phone')}
              error={errorText(errors.phone?.message)}
              {...register('phone')}
              data-testid="client-form-phone"
            />
          </div>
        </div>

        {/* Address */}
        <div className="p-6">
          <h2 className="text-lg font-bold text-text-light dark:text-text-dark mb-6">
            {t('detail.billingAddress')}
          </h2>
          <Textarea
            label={t('fields.address')}
            placeholder={t('form.placeholders.address')}
            rows={3}
            error={errorText(errors.address?.message)}
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
          {t('actions.cancel')}
        </button>
        <button
          onClick={handleSubmit(onSubmit)}
          disabled={isSaving || isSubmitting}
          className="flex-1 h-12 px-4 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90 disabled:opacity-50"
          data-testid="client-form-save-mobile"
        >
          {isSaving ? t('form.saving') : isEdit ? t('form.updateShort') : t('form.createShort')}
        </button>
      </div>
    </div>
  );
}
