/**
 * Authentication store using Zustand
 * Manages auth state and provides login/logout actions
 *
 * Changed: Added token validation on initialize to prevent stale auth state
 * Fix: Clear persisted auth state when token is invalid
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { login as apiLogin, logout as apiLogout, getCurrentUser, type AuthUser } from '../api/auth';
import apiClient, { clearAuthSession, setAuthStateResetter } from '../api/client';
// Fix (SOUPFIN-58): logout must clear the previous tenant's cached account
// settings, otherwise `account-storage` rehydrates and the next tenant briefly
// sees the previous tenant's currency symbol against its own figures.
import { useAccountStore } from './accountStore';
// Fix (SOUPFIN-29): translate raw Axios "Request failed with status code 401"
// into a user-friendly login error message.
import { getLoginErrorMessage } from '../api/errors';

/**
 * Added (SOUPFIN-58): Clear every browser-persisted trace of the signed-in
 * session, so the next sign-in on this browser starts from defaults.
 *
 * `account-storage` holds the tenant's `settings` and `currencyConfig`. It is
 * removed AFTER `useAccountStore.reset()` because zustand's persist middleware
 * writes the store back to localStorage on every `set()` — resetting second
 * would recreate the key.
 */
function clearSessionState(): void {
  // Changed (SOUPFIN-49): shared key list with the 401 handler (client.ts).
  clearAuthSession();

  // Reset in-memory account state, then drop the persisted copy.
  // Resetting also clears `isInitialized`, which is what lets App.tsx refetch
  // settings for the next tenant instead of reusing the previous tenant's.
  useAccountStore.getState().reset();
  localStorage.removeItem('account-storage');
}

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;

  // Actions
  // Changed (2026-01-28): Added rememberMe parameter to login
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  logout: () => void;
  clearError: () => void;
  initialize: () => Promise<void>;
  validateToken: () => Promise<boolean>;
  // Added: Direct setter for OTP verification flow
  setAuthenticated: (isAuthenticated: boolean, user: AuthUser | null) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      isInitialized: false,
      error: null,

      // Changed (2026-01-28): Added rememberMe parameter - pass to apiLogin for dual-storage strategy
      login: async (email: string, password: string, rememberMe: boolean = false) => {
        set({ isLoading: true, error: null });

        try {
          const user = await apiLogin(email, password, rememberMe);
          set({
            user,
            isAuthenticated: true,
            isLoading: false,
            isInitialized: true,
            error: null,
          });

          // Fix (SOUPFIN-53): the POST /rest/api/login response carries no
          // tenantId, so the user stored above has none. App.tsx only fetches
          // account settings when tenantId is present, so the tenant currency
          // (e.g. GHS) never loaded and every amount rendered with the default
          // USD symbol until the next page reload ran initialize() ->
          // validateToken(). Enrich here through that same
          // GET /rest/user/current.json path so the currency is correct on the
          // first render after sign-in.
          //
          // Non-fatal: the token we just received is valid, so a failed
          // enrichment must never invalidate the session. validateToken()
          // already swallows its own request errors and returns false; the
          // try/catch guards anything it does not.
          try {
            await get().validateToken();
          } catch (enrichError) {
            console.warn('[AuthStore] Could not enrich user with tenantId after login:', enrichError);
          }
        } catch (err) {
          // Fix (SOUPFIN-29): never surface the raw Axios status-code message.
          // getLoginErrorMessage maps 401/403 → "Invalid username or password."
          // while passing through descriptive backend messages (e.g. email not
          // confirmed) so LoginPage can still show the Resend Confirmation link.
          const message = getLoginErrorMessage(err);
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
            isInitialized: true,
            error: message,
          });
          throw err;
        }
      },

      logout: () => {
        // Changed (2026-01-28): Clear both storages to handle dual-storage strategy
        // Fix (SOUPFIN-58): also clears the persisted account/tenant settings
        clearSessionState();
        set({
          user: null,
          isAuthenticated: false,
          isInitialized: true,
          error: null,
        });
        apiLogout();
      },

      clearError: () => set({ error: null }),

      // Added: Direct setter for OTP verification flow
      // Used when verifying OTP - token is already stored by verifyOTP()
      setAuthenticated: (isAuthenticated: boolean, user: AuthUser | null) => {
        set({
          user,
          isAuthenticated,
          isLoading: false,
          isInitialized: true,
          error: null,
        });
      },

      // Changed (2026-01-28): Validate token - check both storages for dual-storage strategy
      validateToken: async () => {
        // Check both storages for token
        const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
        if (!token) {
          return false;
        }

        try {
          // Changed: Capture response from /rest/user/current.json to get tenantId
          // SbUserController.current() returns { username, email, roles, tenantId, agentId }
          const response = await apiClient.get<AuthUser>('/user/current.json');
          const serverUser = response.data;

          // Changed: Enrich stored user with tenantId from server response
          if (serverUser?.tenantId) {
            const currentUser = get().user;
            if (currentUser && !currentUser.tenantId) {
              set({ user: { ...currentUser, tenantId: serverUser.tenantId } });
            }
          }
          return true;
        } catch (error) {
          // Added: Token is invalid, clear auth state
          console.warn('[AuthStore] Token validation failed:', error);
          return false;
        }
      },

      // Changed (2026-01-28): Initialize now validates token with server - check both storages
      initialize: async () => {
        const user = getCurrentUser();
        // Check both storages for token (dual-storage strategy)
        const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');

        // Added: No token or user, definitely not authenticated
        if (!token || !user) {
          set({
            user: null,
            isAuthenticated: false,
            isInitialized: true,
          });
          return;
        }

        // Added: Validate token with server
        set({ isLoading: true });
        const isValid = await get().validateToken();

        if (isValid) {
          // Changed: Prefer enriched user from store (validateToken adds tenantId from server)
          // The stale `user` from localStorage lacks tenantId — use store version instead
          set({
            user: get().user || user,
            isAuthenticated: true,
            isLoading: false,
            isInitialized: true,
          });
        } else {
          // Changed (2026-01-28): Token invalid, clear both storages (dual-storage strategy)
          // Fix (SOUPFIN-58): an expired session ends the tenant's session just
          // as logout does, so the cached account settings must go too.
          clearSessionState();
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
            isInitialized: true,
            error: 'Session expired. Please log in again.',
          });
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

// Fix (SOUPFIN-49): let the 401 interceptor reset this store without importing it.
// client.ts cannot import authStore (authStore already imports client.ts, which would
// close an import cycle), so authStore pushes the resetter down instead.
//
// This runs on the SAME set() path as initialize()'s invalid-token branch, so it
// re-persists auth-storage as { isAuthenticated: false } rather than leaving the key
// absent — a later set() therefore cannot resurrect a stale `true`.
//
// The error message matches initialize()'s wording, but note it is only USER-VISIBLE
// when no reload follows (a 401 arriving while already on /login). On the redirect
// path, handleUnauthorized navigates with window.location.href — a full document load
// — and persist's partialize keeps only { user, isAuthenticated }, so `error` is
// dropped. Changed (SOUPFIN-188): that separate flag now exists — handleUnauthorized
// writes sessionStorage `session_expired`, and LoginPage shows the notice from it.
setAuthStateResetter(() => {
  // Changed (SOUPFIN-188): an expired session also drops the tenant's cached
  // account settings, matching initialize()'s invalid-token branch (SOUPFIN-58).
  clearSessionState();
  useAuthStore.setState({
    user: null,
    isAuthenticated: false,
    isLoading: false,
    isInitialized: true,
    error: 'Session expired. Please log in again.',
  });
});

// Helper hook for checking roles
export function useHasRole(role: string): boolean {
  const user = useAuthStore((state) => state.user);
  return user?.roles?.includes(role) ?? false;
}

// Helper hook for checking any of multiple roles
export function useHasAnyRole(roles: string[]): boolean {
  const user = useAuthStore((state) => state.user);
  if (!user?.roles) return false;
  return roles.some((role) => user.roles.includes(role));
}
