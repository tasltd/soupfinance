/**
 * User Form Page
 * PURPOSE: Create or edit users (agents) with role assignment
 * Account Person (Director/Signatory) is managed directly from this form.
 * When creating a new admin user, they can optionally be registered as an Account Person.
 * When editing a user with an existing Account Person, those details can be updated here.
 */
import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { agentApi, accountPersonApi, rolesApi } from '../../api/endpoints/settings';
import type { AgentFormData } from '../../types/settings';
import { SOUPFINANCE_ROLES, SOUPFINANCE_ROLE_LABELS } from '../../types/settings';
import { logger } from '../../utils/logger';

// Form validation schema
const userSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  otherNames: z.string().optional(),
  designation: z.string().optional(),
  address: z.string().optional(),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  phone: z.string().optional(),
  username: z.string().min(3, 'Username must be at least 3 characters'),
  password: z.string().optional(),
  roles: z.array(z.string()).min(1, 'At least one role is required'),
  // Added: Account status toggles (gap analysis §4.13)
  archived: z.boolean().optional(),
  disabled: z.boolean().optional(),
  // Account Person fields
  enableAccountPerson: z.boolean().optional(),
  isDirector: z.boolean().optional(),
  isSignatory: z.boolean().optional(),
  isKeyContact: z.boolean().optional(),
  contractNoteSignatory: z.boolean().optional(),
  financeReportsSignatory: z.boolean().optional(),
});

type UserFormValues = z.infer<typeof userSchema>;

// Roles relevant to SoupFinance
const RELEVANT_ROLES = [
  SOUPFINANCE_ROLES.ADMIN,
  SOUPFINANCE_ROLES.USER,
  SOUPFINANCE_ROLES.FINANCE_REPORTS,
  SOUPFINANCE_ROLES.INVOICE,
  SOUPFINANCE_ROLES.BILL,
  SOUPFINANCE_ROLES.LEDGER_TRANSACTION,
  SOUPFINANCE_ROLES.LEDGER_ACCOUNT,
  SOUPFINANCE_ROLES.VENDOR,
];

export default function UserFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEdit = Boolean(id);

  const [showPassword, setShowPassword] = useState(false);

  // Fetch existing user data if editing
  const { data: existingUser, isLoading: isLoadingUser } = useQuery({
    queryKey: ['user', id],
    queryFn: () => agentApi.get(id!),
    enabled: isEdit,
  });

  // Fetch the linked AccountPerson if exists
  const { data: linkedAccountPerson } = useQuery({
    queryKey: ['accountPerson', existingUser?.accountPerson?.id],
    queryFn: () => accountPersonApi.get(existingUser!.accountPerson!.id),
    enabled: Boolean(existingUser?.accountPerson?.id),
  });

  // Fetch available roles
  const { data: allRoles } = useQuery({
    queryKey: ['roles'],
    queryFn: rolesApi.list,
  });

  // Filter to relevant roles
  const availableRoles = allRoles?.filter((role) =>
    (RELEVANT_ROLES as readonly string[]).includes(role.authority)
  ) || [];

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<UserFormValues>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      otherNames: '',
      designation: '',
      address: '',
      email: '',
      phone: '',
      username: '',
      password: '',
      roles: [SOUPFINANCE_ROLES.USER],
      archived: false,
      disabled: false,
      enableAccountPerson: false,
      isDirector: true,
      isSignatory: false,
      isKeyContact: false,
      contractNoteSignatory: false,
      financeReportsSignatory: false,
    },
  });

  // Watch for admin role to show AccountPerson options
  const selectedRoles = watch('roles');
  const enableAccountPerson = watch('enableAccountPerson');
  const hasAdminRole = selectedRoles?.includes(SOUPFINANCE_ROLES.ADMIN);
  const hasExistingAccountPerson = Boolean(existingUser?.accountPerson?.id);

  // Reset form when existing user data loads
  useEffect(() => {
    if (existingUser) {
      const roles = existingUser.authorities?.map((r) => r.authority) || [];
      const email = existingUser.emailContacts?.[0]?.email || '';
      const phone = existingUser.phoneContacts?.[0]?.phone || '';

      reset({
        firstName: existingUser.firstName || '',
        lastName: existingUser.lastName || '',
        otherNames: existingUser.otherNames || '',
        designation: existingUser.designation || '',
        address: existingUser.address || '',
        email,
        phone,
        username: existingUser.userAccess?.username || '',
        password: '', // Don't pre-fill password
        roles,
        archived: existingUser.archived ?? false,
        disabled: existingUser.disabled ?? false,
        enableAccountPerson: Boolean(existingUser.accountPerson?.id),
        isDirector: linkedAccountPerson?.director ?? true,
        isSignatory: linkedAccountPerson?.signatory ?? false,
        isKeyContact: linkedAccountPerson?.keyContact ?? false,
        contractNoteSignatory: linkedAccountPerson?.contractNoteSignatory ?? false,
        financeReportsSignatory: linkedAccountPerson?.financeReportsSignatory ?? false,
      });
    }
  }, [existingUser, linkedAccountPerson, reset]);

  // Create/Update mutation
  const saveMutation = useMutation({
    mutationFn: async (data: UserFormValues) => {
      // Changed: Include archived/disabled status in form data
      const agentData: AgentFormData = {
        firstName: data.firstName,
        lastName: data.lastName,
        otherNames: data.otherNames,
        designation: data.designation,
        address: data.address,
        email: data.email,
        phone: data.phone,
        username: data.username,
        password: data.password,
        roles: data.roles,
        archived: data.archived,
        disabled: data.disabled,
      };

      let agent;
      if (isEdit && id) {
        logger.info('Updating user', { id });
        agent = await agentApi.update(id, agentData);

        // Update AccountPerson if it exists and details changed
        if (hasExistingAccountPerson && existingUser?.accountPerson?.id) {
          logger.info('Updating AccountPerson for user', { accountPersonId: existingUser.accountPerson.id });
          await accountPersonApi.update(existingUser.accountPerson.id, {
            firstName: data.firstName,
            surname: data.lastName,
            otherNames: data.otherNames,
            jobTitle: data.designation,
            director: data.isDirector ?? false,
            signatory: data.isSignatory ?? false,
            keyContact: data.isKeyContact ?? false,
            contractNoteSignatory: data.contractNoteSignatory ?? false,
            financeReportsSignatory: data.financeReportsSignatory ?? false,
            email: data.email,
            phone: data.phone,
          });
        }
      } else {
        logger.info('Creating new user');
        agent = await agentApi.create(agentData);

        // Create AccountPerson if requested and has admin role
        if (data.enableAccountPerson && data.roles.includes(SOUPFINANCE_ROLES.ADMIN)) {
          logger.info('Creating AccountPerson for admin user');
          await accountPersonApi.create({
            firstName: data.firstName,
            surname: data.lastName,
            otherNames: data.otherNames,
            jobTitle: data.designation,
            keyContact: data.isKeyContact ?? false,
            director: data.isDirector ?? true,
            signatory: data.isSignatory ?? false,
            contractNoteSignatory: data.contractNoteSignatory ?? false,
            financeReportsSignatory: data.financeReportsSignatory ?? false,
            email: data.email,
            phone: data.phone,
          });
        }
      }

      return agent;
    },
    onSuccess: () => {
      logger.info('User saved successfully');
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['accountPersons'] });
      navigate('/settings/users');
    },
    onError: (error) => {
      logger.error('Failed to save user', error);
    },
  });

  const onSubmit = (data: UserFormValues) => {
    saveMutation.mutate(data);
  };

  // Handle role checkbox changes
  const handleRoleChange = (roleAuthority: string, checked: boolean) => {
    const currentRoles = selectedRoles || [];
    if (checked) {
      setValue('roles', [...currentRoles, roleAuthority]);
    } else {
      setValue(
        'roles',
        currentRoles.filter((r) => r !== roleAuthority)
      );
    }
  };

  if (isEdit && isLoadingUser) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-subtle-text">Loading user details...</div>
      </div>
    );
  }

  // Show Account Person section if:
  // 1. Editing a user that already has an AccountPerson
  // 2. Creating a new user with admin role and checkbox is enabled
  const showAccountPersonSection = hasExistingAccountPerson || (!isEdit && hasAdminRole);

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      {/* Page Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-text-light dark:text-text-dark">
            {isEdit ? 'Edit User' : 'Add New User'}
          </h2>
          <p className="text-subtle-text text-sm">
            {isEdit ? 'Update user details and permissions' : 'Add a new user with system access'}
          </p>
        </div>
        <Link
          to="/settings/users"
          className="flex items-center gap-2 h-10 px-4 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-medium text-sm hover:bg-primary/5"
        >
          <span className="material-symbols-outlined text-lg">arrow_back</span>
          Back to List
        </Link>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
        {/* Personal Information */}
        <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-6">
          <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-4">
            Personal Information
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
                First Name <span className="text-danger">*</span>
              </label>
              <input
                {...register('firstName')}
                className="w-full h-10 px-3 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-background-dark text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
                placeholder="Enter first name"
              />
              {errors.firstName && (
                <p className="text-danger text-xs mt-1">{errors.firstName.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
                Last Name <span className="text-danger">*</span>
              </label>
              <input
                {...register('lastName')}
                className="w-full h-10 px-3 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-background-dark text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
                placeholder="Enter last name"
              />
              {errors.lastName && (
                <p className="text-danger text-xs mt-1">{errors.lastName.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
                Other Names
              </label>
              <input
                {...register('otherNames')}
                className="w-full h-10 px-3 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-background-dark text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
                placeholder="Middle names"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
                Job Title / Designation
              </label>
              <input
                {...register('designation')}
                className="w-full h-10 px-3 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-background-dark text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
                placeholder="e.g., Finance Manager"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
                Address
              </label>
              <input
                {...register('address')}
                className="w-full h-10 px-3 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-background-dark text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
                placeholder="Office or home address"
              />
            </div>
          </div>
        </div>

        {/* Contact & Login Information */}
        <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-6">
          <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-4">
            Contact & Login Details
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
                Email Address
              </label>
              <input
                {...register('email')}
                type="email"
                className="w-full h-10 px-3 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-background-dark text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
                placeholder="user@company.com"
              />
              {errors.email && <p className="text-danger text-xs mt-1">{errors.email.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
                Phone Number
              </label>
              <input
                {...register('phone')}
                type="tel"
                className="w-full h-10 px-3 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-background-dark text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
                placeholder="+233 XXX XXX XXX"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
                Username <span className="text-danger">*</span>
              </label>
              <input
                {...register('username')}
                className="w-full h-10 px-3 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-background-dark text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
                placeholder="Login username"
                autoComplete="off"
              />
              {errors.username && (
                <p className="text-danger text-xs mt-1">{errors.username.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
                Password {!isEdit && <span className="text-danger">*</span>}
              </label>
              <div className="relative">
                <input
                  {...register('password')}
                  type={showPassword ? 'text' : 'password'}
                  className="w-full h-10 px-3 pr-10 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-background-dark text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
                  placeholder={isEdit ? 'Leave blank to keep current' : 'Enter password'}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-subtle-text hover:text-text-light dark:hover:text-text-dark"
                >
                  <span className="material-symbols-outlined text-lg">
                    {showPassword ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
              {errors.password && (
                <p className="text-danger text-xs mt-1">{errors.password.message}</p>
              )}
            </div>
          </div>
        </div>

        {/* Roles & Permissions */}
        <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-6">
          <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-4">
            Roles & Permissions
          </h3>
          <p className="text-subtle-text text-sm mb-4">
            Select the roles that determine what this user can access.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {availableRoles.map((role) => (
              <label
                key={role.id}
                className="flex items-center gap-3 p-3 rounded-lg border border-border-light dark:border-border-dark hover:bg-primary/5 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedRoles?.includes(role.authority) || false}
                  onChange={(e) => handleRoleChange(role.authority, e.target.checked)}
                  className="w-4 h-4 text-primary border-border-light dark:border-border-dark rounded focus:ring-primary"
                />
                <div>
                  <span className="font-medium text-text-light dark:text-text-dark text-sm">
                    {SOUPFINANCE_ROLE_LABELS[role.authority] || role.authority.replace('ROLE_', '')}
                  </span>
                  {role.authority === SOUPFINANCE_ROLES.ADMIN && (
                    <span className="ml-2 text-xs text-primary">(Full access)</span>
                  )}
                </div>
              </label>
            ))}
          </div>
          {errors.roles && <p className="text-danger text-xs mt-2">{errors.roles.message}</p>}
        </div>

        {/* Account Person Section */}
        {showAccountPersonSection && (
          <div className={`rounded-xl border p-6 ${
            hasExistingAccountPerson
              ? 'bg-purple-50 dark:bg-purple-900/10 border-purple-200 dark:border-purple-800/30'
              : 'bg-primary/5 border-primary/20'
          }`}>
            <div className="flex items-center gap-3 mb-2">
              <span className="material-symbols-outlined text-xl text-purple-600 dark:text-purple-400">badge</span>
              <h3 className="text-lg font-bold text-text-light dark:text-text-dark">
                {hasExistingAccountPerson ? 'Account Person (Director/Signatory)' : 'Register as Director/Signatory'}
              </h3>
            </div>

            {hasExistingAccountPerson ? (
              <p className="text-subtle-text text-sm mb-4">
                This user is registered as an Account Person. Update their director and signatory settings below.
              </p>
            ) : (
              <>
                <p className="text-subtle-text text-sm mb-4">
                  Since this user has Administrator role, you can optionally register them as a company director or signatory.
                </p>
                <label className="flex items-center gap-3 mb-4 cursor-pointer">
                  <input
                    {...register('enableAccountPerson')}
                    type="checkbox"
                    className="w-4 h-4 text-primary border-border-light dark:border-border-dark rounded focus:ring-primary"
                  />
                  <span className="font-medium text-text-light dark:text-text-dark">
                    Enable Account Person registration
                  </span>
                </label>
              </>
            )}

            {(hasExistingAccountPerson || enableAccountPerson) && (
              <div className="space-y-4">
                {/* Primary Roles */}
                <div>
                  <p className="text-sm font-medium text-text-light dark:text-text-dark mb-2">Corporate Role</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <label className="flex items-center gap-2 p-2 rounded border border-border-light dark:border-border-dark hover:bg-white/50 dark:hover:bg-black/20 cursor-pointer">
                      <input
                        {...register('isDirector')}
                        type="checkbox"
                        className="w-4 h-4 text-primary border-border-light dark:border-border-dark rounded focus:ring-primary"
                      />
                      <span className="text-sm text-text-light dark:text-text-dark">Director</span>
                    </label>
                    <label className="flex items-center gap-2 p-2 rounded border border-border-light dark:border-border-dark hover:bg-white/50 dark:hover:bg-black/20 cursor-pointer">
                      <input
                        {...register('isSignatory')}
                        type="checkbox"
                        className="w-4 h-4 text-primary border-border-light dark:border-border-dark rounded focus:ring-primary"
                      />
                      <span className="text-sm text-text-light dark:text-text-dark">Signatory</span>
                    </label>
                    <label className="flex items-center gap-2 p-2 rounded border border-border-light dark:border-border-dark hover:bg-white/50 dark:hover:bg-black/20 cursor-pointer">
                      <input
                        {...register('isKeyContact')}
                        type="checkbox"
                        className="w-4 h-4 text-primary border-border-light dark:border-border-dark rounded focus:ring-primary"
                      />
                      <span className="text-sm text-text-light dark:text-text-dark">Key Contact</span>
                    </label>
                  </div>
                </div>

                {/* Signatory Types */}
                <div>
                  <p className="text-sm font-medium text-text-light dark:text-text-dark mb-2">Can Sign</p>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex items-center gap-2 p-2 rounded border border-border-light dark:border-border-dark hover:bg-white/50 dark:hover:bg-black/20 cursor-pointer">
                      <input
                        {...register('contractNoteSignatory')}
                        type="checkbox"
                        className="w-4 h-4 text-primary border-border-light dark:border-border-dark rounded focus:ring-primary"
                      />
                      <span className="text-sm text-text-light dark:text-text-dark">Contracts</span>
                    </label>
                    <label className="flex items-center gap-2 p-2 rounded border border-border-light dark:border-border-dark hover:bg-white/50 dark:hover:bg-black/20 cursor-pointer">
                      <input
                        {...register('financeReportsSignatory')}
                        type="checkbox"
                        className="w-4 h-4 text-primary border-border-light dark:border-border-dark rounded focus:ring-primary"
                      />
                      <span className="text-sm text-text-light dark:text-text-dark">Finance Reports</span>
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Added: Account Status section (only shown when editing) */}
        {isEdit && (
          <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-6">
            <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-4">
              Account Status
            </h3>
            <div className="space-y-4">
              <label className="flex items-center justify-between p-3 rounded-lg border border-border-light dark:border-border-dark hover:bg-primary/5 cursor-pointer">
                <div>
                  <span className="font-medium text-text-light dark:text-text-dark text-sm">Disable Account</span>
                  <p className="text-subtle-text text-xs mt-0.5">
                    Prevents this user from logging in. Does not delete their data.
                  </p>
                </div>
                <input
                  {...register('disabled')}
                  type="checkbox"
                  className="w-4 h-4 text-danger border-border-light dark:border-border-dark rounded focus:ring-danger"
                />
              </label>
              <label className="flex items-center justify-between p-3 rounded-lg border border-border-light dark:border-border-dark hover:bg-primary/5 cursor-pointer">
                <div>
                  <span className="font-medium text-text-light dark:text-text-dark text-sm">Archive Account</span>
                  <p className="text-subtle-text text-xs mt-0.5">
                    Hides this user from active lists. Can be restored later.
                  </p>
                </div>
                <input
                  {...register('archived')}
                  type="checkbox"
                  className="w-4 h-4 text-warning border-border-light dark:border-border-dark rounded focus:ring-warning"
                />
              </label>
            </div>
          </div>
        )}

        {/* Form Actions */}
        <div className="flex justify-end gap-3">
          <Link
            to="/settings/users"
            className="h-10 px-4 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-medium text-sm hover:bg-primary/5 flex items-center"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isSubmitting || saveMutation.isPending}
            className="h-10 px-6 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
          >
            {(isSubmitting || saveMutation.isPending) && (
              <span className="material-symbols-outlined text-lg animate-spin">progress_activity</span>
            )}
            {isEdit ? 'Update User' : 'Add User'}
          </button>
        </div>

        {/* Error Display */}
        {saveMutation.isError && (
          <div className="bg-danger/10 border border-danger/20 rounded-lg p-4">
            <p className="text-danger text-sm">
              Failed to save user. Please check the form and try again.
            </p>
          </div>
        )}
      </form>
    </div>
  );
}
