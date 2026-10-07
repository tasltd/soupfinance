/**
 * Role Form Page (SOUPFIN-102)
 * PURPOSE: Create or edit a custom role from a permission matrix (area × action).
 *
 * Example: a "Sales" role ticks Invoices → View/Create/Edit and leaves Bills empty,
 * so its users can raise invoices but never see a bill.
 *
 * Each cell is a permission SbRole (`ROLE_PERM_{AREA}_{ACTION}`); saving sends their
 * ids as the role group's authorities. A cell whose SbRole does not exist on the
 * server yet is shown but cannot be ticked — granting a permission the backend
 * cannot store would save silently without it.
 *
 * Built-in roles open read-only.
 */
import { useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { roleGroupApi, rolesApi } from '../../api/endpoints/settings';
import { parseApiError } from '../../api/errors';
import { ApiErrorState } from '../../components/feedback/ApiErrorState';
import { usePermissions } from '../../hooks/usePermission';
import {
  ACTION_LABELS,
  PERMISSION_ACTIONS,
  PERMISSION_CATALOG,
  permissionAuthority,
} from '../../permissions/catalog';
import {
  authoritiesToIds,
  groupPermissionAuthorities,
  indexRolesByAuthority,
  missingPermissionAuthorities,
  togglePermission,
} from '../../permissions/roleMatrix';
import { isBuiltInRoleGroup } from '../../types/settings';
import { logger } from '../../utils/logger';

const roleSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Enter a name for this role')
    .max(100, 'Use 100 characters or fewer'),
  permissions: z.array(z.string()).min(1, 'Tick at least one permission'),
});

type RoleFormValues = z.infer<typeof roleSchema>;

export default function RoleFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const isEdit = Boolean(id);

  const rolesQuery = useQuery({ queryKey: ['roles'], queryFn: rolesApi.list });
  const groupQuery = useQuery({
    queryKey: ['roleGroup', id],
    queryFn: () => roleGroupApi.get(id!),
    enabled: isEdit,
  });

  const authorityIndex = useMemo(() => indexRolesByAuthority(rolesQuery.data), [rolesQuery.data]);
  const missing = useMemo(
    () => (rolesQuery.data ? missingPermissionAuthorities(authorityIndex) : []),
    [rolesQuery.data, authorityIndex]
  );

  const builtIn = isEdit && groupQuery.data ? isBuiltInRoleGroup(groupQuery.data) : false;
  const mayWrite = isEdit ? can('settings', 'edit') : can('settings', 'create');
  const readOnly = builtIn || !mayWrite;

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitted },
  } = useForm<RoleFormValues>({
    resolver: zodResolver(roleSchema),
    defaultValues: { name: '', permissions: [] },
  });

  useEffect(() => {
    if (groupQuery.data) {
      reset({
        name: groupQuery.data.name ?? '',
        permissions: groupPermissionAuthorities(groupQuery.data),
      });
    }
  }, [groupQuery.data, reset]);

  const permissions = watch('permissions');

  const saveMutation = useMutation({
    mutationFn: (values: RoleFormValues) => {
      const payload = {
        name: values.name,
        authorityIds: authoritiesToIds(values.permissions, authorityIndex),
      };
      return isEdit ? roleGroupApi.update(id!, payload) : roleGroupApi.create(payload);
    },
    onSuccess: () => {
      logger.info(isEdit ? 'Role updated' : 'Role created');
      queryClient.invalidateQueries({ queryKey: ['roleGroups'] });
      queryClient.invalidateQueries({ queryKey: ['roleGroup', id] });
      navigate('/settings/roles');
    },
    onError: (err) => logger.error('Failed to save role', err),
  });

  const toggle = (area: (typeof PERMISSION_CATALOG)[number]['area'], action: (typeof PERMISSION_ACTIONS)[number]) => {
    setValue('permissions', togglePermission(permissions, area, action), {
      shouldValidate: isSubmitted,
      shouldDirty: true,
    });
  };

  const loadError = rolesQuery.error ?? groupQuery.error;
  if (loadError) {
    return (
      <div className="flex flex-col gap-6" data-testid="role-form-page">
        <ApiErrorState
          error={loadError}
          onRetry={() => {
            rolesQuery.refetch();
            if (isEdit) groupQuery.refetch();
          }}
          testId="role-form-load-error"
        />
      </div>
    );
  }

  if (rolesQuery.isLoading || (isEdit && groupQuery.isLoading)) {
    return (
      <div className="p-8 text-center text-subtle-text" data-testid="role-form-loading">
        Loading role…
      </div>
    );
  }

  const title = builtIn ? groupQuery.data?.name ?? 'Role' : isEdit ? 'Edit role' : 'New role';

  return (
    <form
      onSubmit={handleSubmit((values) => saveMutation.mutate(values))}
      className="flex flex-col gap-6"
      data-testid="role-form-page"
      noValidate
    >
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-text-light dark:text-text-dark">{title}</h2>
          <p className="text-subtle-text text-sm">
            Tick what people with this role may do. Anything left blank stays hidden from them.
          </p>
        </div>
        <Link
          to="/settings/roles"
          className="flex items-center gap-2 h-10 px-4 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-medium text-sm hover:bg-primary/5"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-lg">arrow_back</span>
          Back to roles
        </Link>
      </div>

      {builtIn && (
        <div
          className="flex items-start gap-3 p-4 rounded-lg border border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900/50 dark:bg-blue-900/20 dark:text-blue-200"
          data-testid="role-form-builtin-notice"
        >
          <span aria-hidden="true" className="material-symbols-outlined">lock</span>
          <p className="text-sm">
            This is a built-in role, so it cannot be changed or deleted. To give someone different access,
            create a new role.
          </p>
        </div>
      )}

      {!readOnly && missing.length > 0 && (
        <div
          className="flex items-start gap-3 p-4 rounded-lg border border-yellow-200 bg-yellow-50 text-yellow-900 dark:border-yellow-900/50 dark:bg-yellow-900/20 dark:text-yellow-200"
          data-testid="role-form-missing-permissions"
        >
          <span aria-hidden="true" className="material-symbols-outlined">info</span>
          <p className="text-sm">
            {missing.length} {missing.length === 1 ? 'permission is' : 'permissions are'} not set up on the
            server yet, so {missing.length === 1 ? 'it' : 'they'} cannot be ticked. Ask your administrator to
            finish setting up role permissions.
          </p>
        </div>
      )}

      <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-6 flex flex-col gap-2">
        <label htmlFor="role-name" className="text-sm font-medium text-text-light dark:text-text-dark">
          Role name
        </label>
        <input
          id="role-name"
          type="text"
          placeholder="For example, Sales"
          readOnly={readOnly}
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? 'role-name-error' : undefined}
          {...register('name')}
          className="w-full max-w-md h-12 px-4 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-background-dark text-text-light dark:text-text-dark placeholder:text-subtle-text focus:border-primary focus:ring-2 focus:ring-primary/50 focus:outline-none read-only:bg-background-light read-only:text-subtle-text"
          data-testid="role-form-name"
        />
        {errors.name && (
          <p id="role-name-error" className="text-sm text-danger" data-testid="role-form-name-error">
            {errors.name.message}
          </p>
        )}
      </div>

      <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden">
        <div className="px-6 py-4 border-b border-border-light dark:border-border-dark">
          <h3 className="text-lg font-bold text-text-light dark:text-text-dark">Permissions</h3>
          <p className="text-subtle-text text-sm">
            Ticking Create, Edit, Delete or Approve also ticks View. Clearing View clears the whole row.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm" data-testid="permission-matrix">
            <thead className="text-xs text-subtle-text uppercase bg-background-light dark:bg-background-dark">
              <tr>
                <th scope="col" className="px-4 sm:px-6 py-3 text-left">Area</th>
                {PERMISSION_ACTIONS.map((action) => (
                  <th key={action} scope="col" className="px-3 py-3 text-center">
                    {ACTION_LABELS[action]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSION_CATALOG.map((definition) => (
                <tr
                  key={definition.area}
                  className="border-b border-border-light dark:border-border-dark"
                  data-testid={`permission-row-${definition.area}`}
                >
                  <th scope="row" className="px-4 sm:px-6 py-3 text-left font-normal">
                    <span className="block font-medium text-text-light dark:text-text-dark">{definition.label}</span>
                    <span className="block text-xs text-subtle-text">{definition.description}</span>
                  </th>
                  {PERMISSION_ACTIONS.map((action) => {
                    if (!definition.actions.includes(action)) {
                      return (
                        <td key={action} className="px-3 py-3 text-center text-subtle-text" aria-hidden="true">
                          —
                        </td>
                      );
                    }
                    const authority = permissionAuthority(definition.area, action);
                    const unavailable = !authorityIndex.has(authority);
                    return (
                      <td key={action} className="px-3 py-3 text-center">
                        <input
                          type="checkbox"
                          className="size-5 rounded border-border-light dark:border-border-dark text-primary focus:ring-primary/50 disabled:opacity-40"
                          checked={permissions.includes(authority)}
                          disabled={readOnly || unavailable}
                          onChange={() => toggle(definition.area, action)}
                          aria-label={`${definition.label}: ${ACTION_LABELS[action]}`}
                          title={unavailable ? 'Not set up on the server yet' : undefined}
                          data-testid={`permission-${definition.area}-${action}`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {errors.permissions && (
          <p className="px-6 py-3 text-sm text-danger" data-testid="role-form-permissions-error">
            {errors.permissions.message}
          </p>
        )}
      </div>

      {saveMutation.isError && (
        <div
          className="p-4 rounded-lg border border-danger/30 bg-danger/10 text-danger text-sm"
          role="alert"
          data-testid="role-form-save-error"
          data-error-kind={parseApiError(saveMutation.error).kind}
        >
          <p className="font-bold">{parseApiError(saveMutation.error).title}</p>
          <p>{parseApiError(saveMutation.error).message}</p>
        </div>
      )}

      {!readOnly && (
        <div className="flex justify-end gap-3">
          <Link
            to="/settings/roles"
            className="flex items-center h-10 px-4 rounded-lg bg-background-light dark:bg-background-dark text-text-light dark:text-text-dark text-sm font-bold hover:bg-primary/10"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saveMutation.isPending}
            className="flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-50"
            data-testid="role-form-submit"
          >
            {saveMutation.isPending ? 'Saving…' : isEdit ? 'Save role' : 'Create role'}
          </button>
        </div>
      )}
    </form>
  );
}
