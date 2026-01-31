/**
 * User List Page
 * PURPOSE: Display and manage users (agents) with CRUD operations
 * Users map to agents with agent contact and user profiles.
 * Account Person status is shown inline (managed via user edit).
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { agentApi } from '../../api/endpoints/settings';
import type { Agent } from '../../types/settings';
import { SOUPFINANCE_ROLE_LABELS } from '../../types/settings';
import { logger } from '../../utils/logger';

interface DeleteState {
  isOpen: boolean;
  userId: string | null;
  userName: string | null;
}

export default function UserListPage() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteState, setDeleteState] = useState<DeleteState>({
    isOpen: false,
    userId: null,
    userName: null,
  });

  const { data: users, isLoading, error } = useQuery({
    queryKey: ['users', searchTerm],
    queryFn: () => {
      logger.info('Fetching user list', { search: searchTerm });
      return agentApi.list({ max: 100, sort: 'firstName', order: 'asc', search: searchTerm || undefined });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => {
      logger.info('Deleting user', { id });
      return agentApi.delete(id);
    },
    onSuccess: () => {
      logger.info('User deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setDeleteState({ isOpen: false, userId: null, userName: null });
    },
    onError: (error) => {
      logger.error('Failed to delete user', error);
    },
  });

  const handleDeleteClick = (userId: string, userName: string) => {
    setDeleteState({ isOpen: true, userId, userName });
  };

  const handleConfirmDelete = () => {
    if (deleteState.userId) {
      deleteMutation.mutate(deleteState.userId);
    }
  };

  const handleCancelDelete = () => {
    setDeleteState({ isOpen: false, userId: null, userName: null });
  };

  const getUserRoles = (agent: Agent): string => {
    if (!agent.authorities || agent.authorities.length === 0) return '-';
    return agent.authorities
      .slice(0, 3)
      .map((role) => SOUPFINANCE_ROLE_LABELS[role.authority] || role.authority.replace('ROLE_', ''))
      .join(', ');
  };

  const getUserEmail = (agent: Agent): string => {
    if (agent.emailContacts && agent.emailContacts.length > 0) {
      return agent.emailContacts[0].email;
    }
    if (agent.userAccess?.username) {
      return agent.userAccess.username;
    }
    return '-';
  };

  const hasAccountPerson = (agent: Agent): boolean => {
    return Boolean(agent.accountPerson?.id);
  };

  return (
    <div className="flex flex-col gap-6" data-testid="user-list-page">
      {/* Page Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-text-light dark:text-text-dark">
            User Management
          </h2>
          <p className="text-subtle-text text-sm">
            Manage users who can access the system and their permissions
          </p>
        </div>
        <Link
          to="/settings/users/new"
          className="flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90"
        >
          <span className="material-symbols-outlined text-lg">person_add</span>
          Add User
        </Link>
      </div>

      {/* Search Input */}
      <div className="relative max-w-md">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-subtle-text text-xl">
          search
        </span>
        <input
          type="search"
          placeholder="Search users..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full h-10 pl-10 pr-4 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark placeholder:text-subtle-text focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
        />
      </div>

      {/* Users Table */}
      <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-subtle-text">Loading users...</div>
        ) : error ? (
          <div className="p-12 text-center">
            <span className="material-symbols-outlined text-6xl text-danger/50 mb-4 block">error</span>
            <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">
              Failed to load users
            </h3>
            <p className="text-subtle-text mb-4">There was an error loading users.</p>
            <button
              onClick={() => queryClient.invalidateQueries({ queryKey: ['users'] })}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm"
            >
              <span className="material-symbols-outlined text-lg">refresh</span>
              Retry
            </button>
          </div>
        ) : users?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-subtle-text uppercase bg-background-light dark:bg-background-dark">
                <tr>
                  <th className="px-6 py-3 text-left">Name</th>
                  <th className="px-6 py-3 text-left">Email / Username</th>
                  <th className="px-6 py-3 text-left">Role</th>
                  <th className="px-6 py-3 text-center">Director/Signatory</th>
                  <th className="px-6 py-3 text-center">Status</th>
                  <th className="px-6 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((agent) => (
                  <tr
                    key={agent.id}
                    className="border-b border-border-light dark:border-border-dark hover:bg-primary/5"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex-shrink-0 size-9 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-primary font-semibold text-sm">
                            {agent.firstName?.[0]}
                            {agent.lastName?.[0]}
                          </span>
                        </div>
                        <div>
                          <Link
                            to={`/settings/users/${agent.id}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {agent.firstName} {agent.lastName}
                          </Link>
                          {agent.designation && (
                            <p className="text-xs text-subtle-text">{agent.designation}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-text-light dark:text-text-dark">
                      {getUserEmail(agent)}
                    </td>
                    <td className="px-6 py-4 text-text-light dark:text-text-dark">
                      <span className="text-xs">{getUserRoles(agent)}</span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {hasAccountPerson(agent) ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
                          <span className="material-symbols-outlined text-sm">badge</span>
                          Account Person
                        </span>
                      ) : (
                        <span className="text-subtle-text text-xs">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {agent.disabled ? (
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
                          Disabled
                        </span>
                      ) : agent.userAccess?.enabled === false ? (
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
                          Inactive
                        </span>
                      ) : (
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                          Active
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <Link
                          to={`/settings/users/${agent.id}`}
                          className="p-1.5 rounded hover:bg-primary/10 text-subtle-text hover:text-primary transition-colors"
                          title="Edit"
                        >
                          <span className="material-symbols-outlined text-lg">edit</span>
                        </Link>
                        <button
                          onClick={() =>
                            handleDeleteClick(agent.id, `${agent.firstName} ${agent.lastName}`)
                          }
                          className="p-1.5 rounded hover:bg-danger/10 text-subtle-text hover:text-danger transition-colors"
                          title="Delete"
                        >
                          <span className="material-symbols-outlined text-lg">delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center">
            <span className="material-symbols-outlined text-6xl text-subtle-text/50 mb-4 block">
              group
            </span>
            <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">
              No users yet
            </h3>
            <p className="text-subtle-text mb-4">Add your first user to get started.</p>
            <Link
              to="/settings/users/new"
              className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm"
            >
              <span className="material-symbols-outlined text-lg">person_add</span>
              Add User
            </Link>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteState.isOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="relative w-full max-w-md rounded-xl bg-surface-light dark:bg-surface-dark shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-border-light dark:border-border-dark p-6">
              <p className="text-xl font-bold text-text-light dark:text-text-dark">Remove User</p>
              <button
                onClick={handleCancelDelete}
                className="flex size-8 items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/10"
              >
                <span className="material-symbols-outlined text-2xl text-subtle-text">close</span>
              </button>
            </div>

            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 size-12 rounded-full bg-danger/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-2xl text-danger">warning</span>
                </div>
                <div>
                  <p className="text-text-light dark:text-text-dark">
                    Are you sure you want to remove{' '}
                    <span className="font-semibold">{deleteState.userName}</span>?
                  </p>
                  <p className="text-subtle-text mt-2 text-sm">
                    This will revoke their system access. This action cannot be undone.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-border-light dark:border-border-dark p-6">
              <button
                onClick={handleCancelDelete}
                className="h-10 px-4 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-medium text-sm hover:bg-primary/5"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleteMutation.isPending}
                className="h-10 px-4 rounded-lg bg-danger text-white font-bold text-sm hover:bg-danger/90 disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Removing...' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
