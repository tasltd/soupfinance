/**
 * Role List Page (SOUPFIN-102)
 * PURPOSE: List built-in and custom roles; create, edit and delete custom roles.
 *
 * A role is an SbRoleGroup. Built-in roles (system-wide, or flagged builtIn) can be
 * opened read-only but never edited or deleted.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { roleGroupApi } from '../../api/endpoints/settings';
import { parseApiError } from '../../api/errors';
import { ApiErrorState } from '../../components/feedback/ApiErrorState';
import { usePermissions } from '../../hooks/usePermission';
import { groupPermissionAuthorities } from '../../permissions/roleMatrix';
import { isBuiltInRoleGroup, type SbRoleGroup } from '../../types/settings';
import { logger } from '../../utils/logger';

export default function RoleListPage() {
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const [roleToDelete, setRoleToDelete] = useState<SbRoleGroup | null>(null);

  const { data: roles, isLoading, error, refetch } = useQuery({
    queryKey: ['roleGroups'],
    queryFn: roleGroupApi.list,
  });

  const deleteMutation = useMutation({
    mutationFn: (group: SbRoleGroup) => roleGroupApi.delete(group),
    onSuccess: () => {
      logger.info('Role deleted');
      queryClient.invalidateQueries({ queryKey: ['roleGroups'] });
      setRoleToDelete(null);
    },
    onError: (err) => logger.error('Failed to delete role', err),
  });

  const closeDelete = () => {
    setRoleToDelete(null);
    deleteMutation.reset();
  };

  const canCreate = can('settings', 'create');
  const canDelete = can('settings', 'delete');

  return (
    <div className="flex flex-col gap-6" data-testid="role-list-page">
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-text-light dark:text-text-dark">Roles</h2>
          <p className="text-subtle-text text-sm">
            Decide what each team member can see and do. Built-in roles cannot be changed.
          </p>
        </div>
        {canCreate && (
          <Link
            to="/settings/roles/new"
            className="flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90"
            data-testid="role-list-new-button"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-lg">add</span>
            New role
          </Link>
        )}
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-subtle-text" data-testid="role-list-loading">
          Loading roles…
        </div>
      ) : error ? (
        <ApiErrorState error={error} onRetry={() => refetch()} testId="role-list-error" />
      ) : roles && roles.length > 0 ? (
        <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm" data-testid="role-table">
              <thead className="text-xs text-subtle-text uppercase bg-background-light dark:bg-background-dark">
                <tr>
                  <th className="px-4 sm:px-6 py-3 text-left">Role</th>
                  <th className="px-4 sm:px-6 py-3 text-left">Type</th>
                  <th className="px-4 sm:px-6 py-3 text-left">Permissions</th>
                  <th className="px-4 sm:px-6 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {roles.map((role) => {
                  const builtIn = isBuiltInRoleGroup(role);
                  const permissionCount = groupPermissionAuthorities(role).length;
                  return (
                    <tr
                      key={role.id}
                      className="border-b border-border-light dark:border-border-dark hover:bg-primary/5"
                      data-testid={`role-row-${role.id}`}
                    >
                      <td className="px-4 sm:px-6 py-4">
                        <Link
                          to={`/settings/roles/${role.id}`}
                          className="font-medium text-primary hover:underline"
                          data-testid={`role-name-${role.id}`}
                        >
                          {role.name}
                        </Link>
                      </td>
                      <td className="px-4 sm:px-6 py-4">
                        {builtIn ? (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                            data-testid={`role-builtin-badge-${role.id}`}
                          >
                            <span aria-hidden="true" className="material-symbols-outlined text-sm">lock</span>
                            Built-in
                          </span>
                        ) : (
                          <span className="px-2 py-1 text-xs font-medium rounded-full bg-primary/10 text-primary">
                            Custom
                          </span>
                        )}
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-text-light dark:text-text-dark">
                        {builtIn && permissionCount === 0 ? (
                          <span className="text-subtle-text text-xs">Set by the system</span>
                        ) : (
                          <span data-testid={`role-permission-count-${role.id}`}>
                            {permissionCount} {permissionCount === 1 ? 'permission' : 'permissions'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Link
                            to={`/settings/roles/${role.id}`}
                            className="p-1.5 rounded hover:bg-primary/10 text-subtle-text hover:text-primary transition-colors"
                            aria-label={builtIn ? `View ${role.name}` : `Edit ${role.name}`}
                            title={builtIn ? 'View' : 'Edit'}
                          >
                            <span aria-hidden="true" className="material-symbols-outlined text-lg">
                              {builtIn ? 'visibility' : 'edit'}
                            </span>
                          </Link>
                          {!builtIn && canDelete && (
                            <button
                              type="button"
                              onClick={() => setRoleToDelete(role)}
                              className="p-1.5 rounded hover:bg-danger/10 text-subtle-text hover:text-danger transition-colors"
                              aria-label={`Delete ${role.name}`}
                              title="Delete"
                              data-testid={`role-delete-${role.id}`}
                            >
                              <span aria-hidden="true" className="material-symbols-outlined text-lg">delete</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div
          className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-12 text-center"
          data-testid="role-list-empty"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-6xl text-subtle-text/50 mb-4 block">
            admin_panel_settings
          </span>
          <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">No roles yet</h3>
          <p className="text-subtle-text mb-4">
            Create a role to give someone access to only part of your books.
          </p>
        </div>
      )}

      {roleToDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="role-delete-title"
            className="relative w-full max-w-md rounded-xl bg-surface-light dark:bg-surface-dark shadow-2xl overflow-hidden"
            data-testid="role-delete-dialog"
          >
            <div className="border-b border-border-light dark:border-border-dark p-6">
              <p id="role-delete-title" className="text-xl font-bold text-text-light dark:text-text-dark">
                Delete the {roleToDelete.name} role?
              </p>
            </div>
            <div className="p-6 flex flex-col gap-3">
              <p className="text-subtle-text">
                Anyone with only this role will lose access to the areas it granted. You cannot undo this.
              </p>
              {deleteMutation.isError && (
                <p className="text-sm text-danger" role="alert" data-testid="role-delete-error">
                  {parseApiError(deleteMutation.error).message}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-3 border-t border-border-light dark:border-border-dark p-6">
              <button
                type="button"
                onClick={closeDelete}
                className="h-10 px-4 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-medium text-sm hover:bg-primary/5"
              >
                Keep role
              </button>
              <button
                type="button"
                onClick={() => deleteMutation.mutate(roleToDelete)}
                disabled={deleteMutation.isPending}
                className="h-10 px-4 rounded-lg bg-danger text-white font-bold text-sm hover:bg-danger/90 disabled:opacity-50"
                data-testid="role-delete-confirm"
              >
                {deleteMutation.isPending ? 'Deleting…' : 'Delete role'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
