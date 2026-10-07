/**
 * Accept Accountant Invite Page (SOUPFIN-101)
 * The link in an accountant invitation email lands here: /accept-invite?token=xxx
 *
 * FLOW:
 * 1. GET /account/accountantInvite.json?token= → who invited them and whether the email
 *    already has a SoupFinance login.
 * 2a. Existing login → one click to accept; their password is unchanged.
 * 2b. New login → set a password, then accept.
 * 3. POST /account/acceptAccountantInvite.json → success screen → Sign in.
 *
 * The backend scopes the new login to the inviting tenant (Agent.tenant_id = account.id).
 * Contract: plans/soupfin-101-accountant-invite-backend.md.
 */
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  getAccountantInvite,
  acceptAccountantInvite,
  type AccountantInviteDetails,
} from '../../api/endpoints/registration';
import { parseApiError } from '../../api/errors';
import { Logo } from '../../components/Logo';

// Same rules as ConfirmEmailPage, so an accountant's password meets the owner's bar.
const PASSWORD_REQUIREMENTS = [
  { key: 'length', label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { key: 'uppercase', label: 'One uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { key: 'lowercase', label: 'One lowercase letter', test: (p: string) => /[a-z]/.test(p) },
  { key: 'number', label: 'One number', test: (p: string) => /\d/.test(p) },
];

/** Why an invite can no longer be used, worded for the accountant. */
function unusableReason(status: AccountantInviteDetails['status'] | undefined, company: string): string {
  switch (status) {
    case 'ACCEPTED':
      return 'You’ve already accepted this invitation. Sign in to continue.';
    case 'REVOKED':
      return `${company} cancelled this invitation. Ask them to send a new one.`;
    case 'EXPIRED':
      return `This invitation has expired. Ask ${company} to send it again.`;
    default:
      return 'This invitation link isn’t valid. Check you used the whole link from the email.';
  }
}

/** The backend answers 410 with `{ status }` for revoked / expired / used invites. */
function statusFromError(error: unknown): AccountantInviteDetails['status'] | undefined {
  const data = (error as { response?: { data?: { status?: string } } })?.response?.data;
  const status = data?.status;
  return status === 'ACCEPTED' || status === 'REVOKED' || status === 'EXPIRED' ? status : undefined;
}

export function AcceptInvitePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [acceptedAs, setAcceptedAs] = useState<string | null>(null);

  const { data: invite, isLoading, error } = useQuery({
    queryKey: ['accountantInvite', token],
    queryFn: () => getAccountantInvite(token),
    enabled: Boolean(token),
    retry: false,
  });

  const acceptMutation = useMutation({
    mutationFn: () =>
      acceptAccountantInvite(
        invite?.existingUser ? { token } : { token, password, confirmPassword }
      ),
    onSuccess: (response) => {
      if (response.success) {
        setAcceptedAs(response.username || invite?.email || '');
      } else {
        setFormError(response.message || 'The invitation could not be accepted. Please try again.');
      }
    },
    onError: (err) => setFormError(parseApiError(err).message),
  });

  const company = invite?.companyName || 'The company';
  const passwordChecks = PASSWORD_REQUIREMENTS.map((r) => ({ ...r, passed: r.test(password) }));
  const passwordReady = passwordChecks.every((c) => c.passed) && password === confirmPassword;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!invite?.existingUser && !passwordReady) {
      setFormError('Choose a password that meets every rule, and type it the same way twice.');
      return;
    }
    acceptMutation.mutate();
  }

  const mobileLogo = (
    <div className="lg:hidden flex items-center gap-3 justify-center mb-4">
      <Logo variant="full" size={48} />
    </div>
  );

  // No token, an unknown token, or one the backend says is spent.
  const isUnusable =
    !token || (!isLoading && (Boolean(error) || (invite && invite.status !== 'PENDING')));

  if (token && isLoading) {
    return (
      <div className="flex flex-col items-center gap-4 py-12" data-testid="accept-invite-loading">
        <span aria-hidden="true" className="material-symbols-outlined text-4xl text-primary animate-spin">
          progress_activity
        </span>
        <p className="text-subtle-text">Checking your invitation...</p>
      </div>
    );
  }

  if (acceptedAs !== null) {
    return (
      <div className="flex flex-col gap-8" data-testid="accept-invite-success">
        {mobileLogo}
        <div className="flex justify-center">
          <div className="size-20 rounded-full bg-success/10 flex items-center justify-center">
            <span aria-hidden="true" className="material-symbols-outlined text-4xl text-success">check_circle</span>
          </div>
        </div>
        <div className="text-center">
          <h2 className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark">
            Invitation accepted
          </h2>
          <p className="mt-4 text-subtle-text break-words">
            Sign in with {acceptedAs} to start working on {company}’s books.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/login')}
          className="h-14 rounded-lg bg-primary text-white font-bold text-base hover:bg-primary/90 transition-colors"
          data-testid="accept-invite-login-button"
        >
          Sign in
        </button>
      </div>
    );
  }

  if (isUnusable) {
    const status = invite?.status ?? statusFromError(error);
    return (
      <div className="flex flex-col gap-8" data-testid="accept-invite-invalid">
        {mobileLogo}
        <div>
          <h2 className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark">
            This invitation is no longer valid
          </h2>
          <p className="mt-2 text-subtle-text" data-testid="accept-invite-invalid-reason">
            {unusableReason(status, company)}
          </p>
        </div>
        <a
          href="/login"
          className="h-14 rounded-lg bg-primary text-white font-bold text-base hover:bg-primary/90 transition-colors flex items-center justify-center"
          data-testid="accept-invite-invalid-login-link"
        >
          Go to sign in
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8" data-testid="accept-invite-page">
      {mobileLogo}
      <div>
        <h2
          className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark break-words"
          data-testid="accept-invite-heading"
        >
          Join {company} on SoupFinance
        </h2>
        <p className="mt-2 text-subtle-text">
          {company} invited you to work on their books as their accountant.
        </p>
        <p className="mt-2 text-subtle-text break-words" data-testid="accept-invite-intro">
          {invite?.existingUser
            ? `You already have a SoupFinance login (${invite.email}). Accept to add ${company} to it.`
            : 'Set a password to create your login.'}
        </p>
      </div>

      {formError && (
        <div
          role="alert"
          className="p-4 rounded-lg bg-danger/10 border border-danger/30 text-danger text-sm"
          data-testid="accept-invite-error"
        >
          {formError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-6" data-testid="accept-invite-form" noValidate>
        {!invite?.existingUser && (
          <>
            <label className="flex flex-col gap-2" htmlFor="accept-invite-email">
              <span className="text-sm font-medium text-text-light dark:text-text-dark">Email</span>
              <input
                id="accept-invite-email"
                value={invite?.email ?? ''}
                readOnly
                className="h-12 px-4 rounded-lg border border-border-light dark:border-border-dark bg-background-light/50 dark:bg-background-dark text-subtle-text cursor-not-allowed"
              />
            </label>
            <label className="flex flex-col gap-2" htmlFor="accept-invite-password">
              <span className="text-sm font-medium text-text-light dark:text-text-dark">
                Password <span className="text-danger">*</span>
              </span>
              <div className="relative">
                <input
                  id="accept-invite-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-12 w-full px-4 pr-12 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
                  data-testid="accept-invite-password-input"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-subtle-text"
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-xl">
                    {showPassword ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
              <div className="mt-1 space-y-1">
                {passwordChecks.map((check) => (
                  <div
                    key={check.key}
                    className={`flex items-center gap-2 text-xs ${check.passed ? 'text-success' : 'text-subtle-text'}`}
                  >
                    <span aria-hidden="true" className="material-symbols-outlined text-sm">
                      {check.passed ? 'check_circle' : 'radio_button_unchecked'}
                    </span>
                    <span>{check.label}</span>
                  </div>
                ))}
              </div>
            </label>
            <label className="flex flex-col gap-2" htmlFor="accept-invite-confirm-password">
              <span className="text-sm font-medium text-text-light dark:text-text-dark">
                Confirm password <span className="text-danger">*</span>
              </span>
              <input
                id="accept-invite-confirm-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="h-12 px-4 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
                data-testid="accept-invite-confirm-password-input"
              />
              {confirmPassword && password !== confirmPassword && (
                <span className="text-xs text-danger">Passwords do not match</span>
              )}
            </label>
          </>
        )}

        <button
          type="submit"
          disabled={acceptMutation.isPending || (!invite?.existingUser && !passwordReady)}
          className="h-14 rounded-lg bg-primary text-white font-bold text-base hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          data-testid="accept-invite-submit"
        >
          {acceptMutation.isPending
            ? 'Accepting...'
            : invite?.existingUser
              ? 'Accept invitation'
              : 'Accept and create login'}
        </button>
      </form>
    </div>
  );
}
