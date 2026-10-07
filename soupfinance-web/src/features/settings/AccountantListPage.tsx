/**
 * Accountant List Page (SOUPFIN-101)
 * PURPOSE: Settings → Users → Accountants. An admin invites an outside accountant by
 * email, re-sends the invite, and revokes access. An accepted accountant gets a login
 * scoped to this tenant with the Accountant role: full books and reports, no user
 * management.
 *
 * Backend contract: plans/soupfin-101-accountant-invite-backend.md. Until that ships,
 * /rest/accountantInvite/index.json answers 404 and this page says the feature is not
 * available yet rather than showing a raw error.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { accountantInviteApi } from '../../api/endpoints/settings';
import { parseApiError } from '../../api/errors';
import { ApiErrorState } from '../../components/feedback/ApiErrorState';
import { useToast } from '../../components/feedback/ToastProvider';
import type {
  AccountantInvite,
  AccountantInviteFormData,
  AccountantInviteStatus,
} from '../../types/settings';
import {
  getAccountantInviteStatus,
  canResendAccountantInvite,
  canRevokeAccountantInvite,
  accountantDisplayName,
} from '../../types/settings';
import { logger } from '../../utils/logger';
import UsersTabs from './UsersTabs';

const QUERY_KEY = ['accountantInvites'];

// Loose check: the backend validates for real; this only catches typos before a round trip.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const STATUS_BADGE: Record<AccountantInviteStatus, { label: string; className: string }> = {
  PENDING: {
    label: 'Pending',
    className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  },
  ACCEPTED: {
    label: 'Active',
    className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  },
  REVOKED: {
    label: 'Revoked',
    className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  },
  EXPIRED: {
    label: 'Expired',
    className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  },
};

/** Backend timestamps are instants; show them on the user's own calendar. */
function formatInviteDate(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

type RevokeTarget = { invite: AccountantInvite; status: AccountantInviteStatus } | null;

const EMPTY_FORM: AccountantInviteFormData = { email: '', firstName: '', lastName: '' };

export default function AccountantListPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [isInviteOpen, setInviteOpen] = useState(false);
  const [form, setForm] = useState<AccountantInviteFormData>(EMPTY_FORM);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<RevokeTarget>(null);

  const { data: invites, isLoading, error } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => accountantInviteApi.list(),
    // A 404 means the backend has no accountant invites yet; retrying will not help.
    retry: false,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });

  const inviteMutation = useMutation({
    mutationFn: (data: AccountantInviteFormData) => accountantInviteApi.invite(data),
    onSuccess: (invite) => {
      logger.info('Accountant invited', { id: invite.id });
      showToast({ variant: 'success', message: `Invitation sent to ${invite.email}.` });
      closeInvite();
      refresh();
    },
    onError: (err) => {
      logger.error('Failed to invite accountant', err);
      setInviteError(parseApiError(err).message);
    },
  });

  const resendMutation = useMutation({
    mutationFn: (id: string) => accountantInviteApi.resend(id),
    onSuccess: (invite) => {
      showToast({ variant: 'success', message: `Invitation sent again to ${invite.email}.` });
      refresh();
    },
    onError: (err) => {
      logger.error('Failed to resend accountant invite', err);
      showToast({ variant: 'error', message: parseApiError(err).message });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => accountantInviteApi.revoke(id),
    onSuccess: (invite) => {
      const wasActive = revokeTarget?.status === 'ACCEPTED';
      showToast({
        variant: 'success',
        message: wasActive
          ? `Access removed for ${invite.email}.`
          : `Invitation to ${invite.email} cancelled.`,
      });
      setRevokeTarget(null);
      refresh();
    },
    onError: (err) => {
      logger.error('Failed to revoke accountant invite', err);
      showToast({ variant: 'error', message: parseApiError(err).message });
    },
  });

  function openInvite() {
    setForm(EMPTY_FORM);
    setEmailError(null);
    setInviteError(null);
    setInviteOpen(true);
  }

  function closeInvite() {
    setInviteOpen(false);
    setForm(EMPTY_FORM);
    setEmailError(null);
    setInviteError(null);
  }

  function handleInviteSubmit(e: React.FormEvent) {
    e.preventDefault();
    const email = form.email.trim();
    if (!email) {
      setEmailError('Enter the accountant’s email address.');
      return;
    }
    if (!EMAIL_PATTERN.test(email)) {
      setEmailError('Enter a valid email address, like name@firm.com.');
      return;
    }
    // Same address already live here: say so instead of sending a duplicate.
    const duplicate = invites?.find(
      (i) =>
        i.email.toLowerCase() === email.toLowerCase() &&
        ['PENDING', 'ACCEPTED'].includes(getAccountantInviteStatus(i))
    );
    if (duplicate) {
      setEmailError(
        getAccountantInviteStatus(duplicate) === 'ACCEPTED'
          ? 'This accountant already has access.'
          : 'This accountant already has a pending invitation. Resend it from the list.'
      );
      return;
    }
    setEmailError(null);
    setInviteError(null);
    inviteMutation.mutate({ ...form, email });
  }

  const parsedError = error ? parseApiError(error) : null;
  // 404 = the backend does not serve /rest/accountantInvite yet (plan not shipped).
  const isUnavailable = parsedError?.kind === 'not_found';

  return (
    <div className="flex flex-col gap-6" data-testid="accountant-list-page">
      <UsersTabs />

      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-text-light dark:text-text-dark">Accountants</h2>
          <p className="text-subtle-text text-sm max-w-2xl">
            Invite an accountant to work on your books and reports. They can’t manage users.
          </p>
        </div>
        {!isUnavailable && (
          <button
            type="button"
            onClick={openInvite}
            className="flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90"
            data-testid="accountant-invite-button"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-lg">person_add</span>
            Invite accountant
          </button>
        )}
      </div>

      <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-subtle-text" data-testid="accountant-list-loading">
            Loading accountants...
          </div>
        ) : isUnavailable ? (
          <div className="p-12 text-center" data-testid="accountant-list-unavailable">
            <span aria-hidden="true" className="material-symbols-outlined text-6xl text-subtle-text/50 mb-4 block">
              hourglass_empty
            </span>
            <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">
              Accountant access isn’t available yet
            </h3>
            <p className="text-subtle-text max-w-md mx-auto">
              This server doesn’t support accountant invites yet. Your team members aren’t
              affected.
            </p>
          </div>
        ) : error ? (
          <ApiErrorState error={error} onRetry={refresh} testId="accountant-list-error" />
        ) : invites?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm" data-testid="accountant-table">
              <thead className="text-xs text-subtle-text uppercase bg-background-light dark:bg-background-dark">
                <tr>
                  <th className="px-4 sm:px-6 py-3 text-left">Accountant</th>
                  <th className="px-4 sm:px-6 py-3 text-center">Status</th>
                  <th className="px-4 sm:px-6 py-3 text-left">Invited</th>
                  <th className="px-4 sm:px-6 py-3 text-left">Last sent</th>
                  <th className="px-4 sm:px-6 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invites.map((invite) => {
                  const status = getAccountantInviteStatus(invite);
                  const badge = STATUS_BADGE[status] ?? STATUS_BADGE.PENDING;
                  const name = accountantDisplayName(invite);
                  const hasName = name !== invite.email;
                  const isResending = resendMutation.isPending && resendMutation.variables === invite.id;
                  return (
                    <tr
                      key={invite.id}
                      className="border-b border-border-light dark:border-border-dark hover:bg-primary/5"
                      data-testid={`accountant-row-${invite.id}`}
                    >
                      <td className="px-4 sm:px-6 py-4">
                        <div className="flex flex-col min-w-0">
                          <span
                            className="font-medium text-text-light dark:text-text-dark truncate max-w-[18rem]"
                            title={name}
                          >
                            {name}
                          </span>
                          {hasName && (
                            <span className="text-xs text-subtle-text truncate max-w-[18rem]" title={invite.email}>
                              {invite.email}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-center">
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded-full ${badge.className}`}
                          data-testid={`accountant-status-${invite.id}`}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-text-light dark:text-text-dark whitespace-nowrap">
                        {formatInviteDate(invite.dateCreated) || '-'}
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-text-light dark:text-text-dark whitespace-nowrap">
                        {status === 'ACCEPTED' || status === 'REVOKED'
                          ? '-'
                          : formatInviteDate(invite.lastSentAt) || '-'}
                      </td>
                      <td className="px-4 sm:px-6 py-4">
                        <div className="flex items-center justify-center gap-2">
                          {canResendAccountantInvite(status) && (
                            <button
                              type="button"
                              onClick={() => resendMutation.mutate(invite.id)}
                              disabled={resendMutation.isPending}
                              aria-label={`Resend invitation to ${invite.email}`}
                              className="h-8 px-3 rounded-lg text-xs font-bold bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50"
                              data-testid={`accountant-resend-${invite.id}`}
                            >
                              {isResending ? 'Sending...' : 'Resend'}
                            </button>
                          )}
                          {canRevokeAccountantInvite(status) && (
                            <button
                              type="button"
                              onClick={() => setRevokeTarget({ invite, status })}
                              aria-label={
                                status === 'ACCEPTED'
                                  ? `Remove access for ${invite.email}`
                                  : `Cancel invitation to ${invite.email}`
                              }
                              className="h-8 px-3 rounded-lg text-xs font-bold text-danger hover:bg-danger/10"
                              data-testid={`accountant-revoke-${invite.id}`}
                            >
                              {status === 'ACCEPTED' ? 'Remove access' : 'Cancel'}
                            </button>
                          )}
                          {!canResendAccountantInvite(status) && !canRevokeAccountantInvite(status) && (
                            <span className="text-subtle-text text-xs">-</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center" data-testid="accountant-list-empty">
            <span aria-hidden="true" className="material-symbols-outlined text-6xl text-subtle-text/50 mb-4 block">
              calculate
            </span>
            <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">No accountants yet</h3>
            <p className="text-subtle-text mb-4">
              Invite your accountant to give them access to your books and reports.
            </p>
            <button
              type="button"
              onClick={openInvite}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-lg">person_add</span>
              Invite accountant
            </button>
          </div>
        )}
      </div>

      {/* Invite dialog */}
      {isInviteOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="accountant-invite-title"
            className="relative w-full max-w-lg rounded-xl bg-surface-light dark:bg-surface-dark shadow-2xl overflow-hidden"
            data-testid="accountant-invite-dialog"
          >
            <form onSubmit={handleInviteSubmit} noValidate>
              <div className="flex items-center justify-between border-b border-border-light dark:border-border-dark p-6">
                <h3 id="accountant-invite-title" className="text-xl font-bold text-text-light dark:text-text-dark">
                  Invite an accountant
                </h3>
                <button
                  type="button"
                  onClick={closeInvite}
                  aria-label="Close"
                  className="flex size-8 items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/10"
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-2xl text-subtle-text">close</span>
                </button>
              </div>

              <div className="p-6 flex flex-col gap-4">
                {inviteError && (
                  <div
                    role="alert"
                    className="p-3 rounded-lg bg-danger/10 border border-danger/30 text-danger text-sm"
                    data-testid="accountant-invite-error"
                  >
                    {inviteError}
                  </div>
                )}
                <label className="flex flex-col gap-2" htmlFor="accountant-email">
                  <span className="text-sm font-medium text-text-light dark:text-text-dark">
                    Email <span className="text-danger">*</span>
                  </span>
                  <input
                    id="accountant-email"
                    name="email"
                    type="email"
                    autoComplete="off"
                    value={form.email}
                    onChange={(e) => {
                      setForm({ ...form, email: e.target.value });
                      // Fix: a stale "enter a valid email" must not sit under an address being corrected
                      setEmailError(null);
                    }}
                    aria-invalid={Boolean(emailError)}
                    aria-describedby={emailError ? 'accountant-email-error' : undefined}
                    placeholder="name@firm.com"
                    className="h-12 px-4 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-background-dark text-text-light dark:text-text-dark placeholder:text-subtle-text focus:border-primary focus:ring-2 focus:ring-primary/50 focus:outline-none"
                    data-testid="accountant-email-input"
                  />
                  {emailError && (
                    <span id="accountant-email-error" className="text-xs text-danger" data-testid="accountant-email-error">
                      {emailError}
                    </span>
                  )}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="flex flex-col gap-2" htmlFor="accountant-first-name">
                    <span className="text-sm font-medium text-text-light dark:text-text-dark">First name (optional)</span>
                    <input
                      id="accountant-first-name"
                      name="firstName"
                      value={form.firstName}
                      maxLength={100}
                      onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                      className="h-12 px-4 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-background-dark text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/50 focus:outline-none"
                      data-testid="accountant-first-name-input"
                    />
                  </label>
                  <label className="flex flex-col gap-2" htmlFor="accountant-last-name">
                    <span className="text-sm font-medium text-text-light dark:text-text-dark">Last name (optional)</span>
                    <input
                      id="accountant-last-name"
                      name="lastName"
                      value={form.lastName}
                      maxLength={100}
                      onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                      className="h-12 px-4 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-background-dark text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/50 focus:outline-none"
                      data-testid="accountant-last-name-input"
                    />
                  </label>
                </div>
                <p className="text-sm text-subtle-text">
                  They’ll get an email with a link that expires in 14 days.
                </p>
              </div>

              <div className="flex justify-end gap-3 border-t border-border-light dark:border-border-dark p-6">
                <button
                  type="button"
                  onClick={closeInvite}
                  className="h-10 px-4 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-medium text-sm hover:bg-primary/5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviteMutation.isPending}
                  className="h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90 disabled:opacity-50"
                  data-testid="accountant-invite-submit"
                >
                  {inviteMutation.isPending ? 'Sending...' : 'Send invitation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Revoke / cancel confirmation */}
      {revokeTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="accountant-revoke-title"
            className="relative w-full max-w-md rounded-xl bg-surface-light dark:bg-surface-dark shadow-2xl overflow-hidden"
            data-testid="accountant-revoke-dialog"
          >
            <div className="p-6 flex items-start gap-4">
              <div className="flex-shrink-0 size-12 rounded-full bg-danger/10 flex items-center justify-center">
                <span aria-hidden="true" className="material-symbols-outlined text-2xl text-danger">warning</span>
              </div>
              <div className="min-w-0">
                <h3 id="accountant-revoke-title" className="text-lg font-bold text-text-light dark:text-text-dark break-words">
                  {revokeTarget.status === 'ACCEPTED'
                    ? `Remove ${accountantDisplayName(revokeTarget.invite)}’s access?`
                    : `Cancel the invitation to ${revokeTarget.invite.email}?`}
                </h3>
                <p className="text-subtle-text mt-2 text-sm">
                  {revokeTarget.status === 'ACCEPTED'
                    ? `${accountantDisplayName(revokeTarget.invite)} will be signed out straight away and can no longer see your books.`
                    : 'The link in their email will stop working.'}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-border-light dark:border-border-dark p-6">
              <button
                type="button"
                onClick={() => setRevokeTarget(null)}
                className="h-10 px-4 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-medium text-sm hover:bg-primary/5"
                data-testid="accountant-revoke-keep"
              >
                {revokeTarget.status === 'ACCEPTED' ? 'Keep access' : 'Keep invitation'}
              </button>
              <button
                type="button"
                onClick={() => revokeMutation.mutate(revokeTarget.invite.id)}
                disabled={revokeMutation.isPending}
                className="h-10 px-4 rounded-lg bg-danger text-white font-bold text-sm hover:bg-danger/90 disabled:opacity-50"
                data-testid="accountant-revoke-confirm"
              >
                {revokeMutation.isPending
                  ? 'Working...'
                  : revokeTarget.status === 'ACCEPTED'
                    ? 'Remove access'
                    : 'Cancel invitation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
