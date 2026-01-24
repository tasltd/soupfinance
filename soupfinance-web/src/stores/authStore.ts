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
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  clearError: () => void;
  initialize: () => Promise<void>;
  validateToken: () => Promise<boolean>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      isInitialized: false,
      error: null,

      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null });

        try {
          const user = await apiLogin(email, password);
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
        // Added: Clear localStorage first to prevent stale state
        localStorage.removeItem('access_token');
        localStorage.removeItem('user');
        localStorage.removeItem('auth-storage');
        set({
          user: null,
          isAuthenticated: false,
          isInitialized: true,
          error: null,
        });
        apiLogout();
      },

      clearError: () => set({ error: null }),

      // Added: Validate token with the server by making a test API call
      validateToken: async () => {
        const token = localStorage.getItem('access_token');
        if (!token) {
          return false;
        }

        try {
          // Added: Make a lightweight API call to verify token is valid
          // Use /rest/user/current.json or similar endpoint that requires auth
          await apiClient.get('/user/current.json');
          return true;
        } catch (error) {
          // Added: Token is invalid, clear auth state
          console.warn('[AuthStore] Token validation failed:', error);
          return false;
        }
      },

      // Changed: Initialize now validates token with server
      initialize: async () => {
        const user = getCurrentUser();
        const token = localStorage.getItem('access_token');

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
          set({
            user,
            isAuthenticated: true,
            isLoading: false,
            isInitialized: true,
          });
        } else {
          // Added: Token invalid, clear everything
          localStorage.removeItem('access_token');
          localStorage.removeItem('user');
          localStorage.removeItem('auth-storage');
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
