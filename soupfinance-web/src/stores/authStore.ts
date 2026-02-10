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
import apiClient from '../api/client';

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
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Login failed';
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
        localStorage.removeItem('access_token');
        localStorage.removeItem('user');
        localStorage.removeItem('auth-storage');
        localStorage.removeItem('auth_storage_type');
        sessionStorage.removeItem('access_token');
        sessionStorage.removeItem('user');
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
          localStorage.removeItem('access_token');
          localStorage.removeItem('user');
          localStorage.removeItem('auth-storage');
          localStorage.removeItem('auth_storage_type');
          sessionStorage.removeItem('access_token');
          sessionStorage.removeItem('user');
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
