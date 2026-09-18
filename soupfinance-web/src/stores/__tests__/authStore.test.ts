/**
 * Unit tests for authStore
 * Tests auth state management, login/logout actions, and persistence
 *
 * Changed: Added apiClient mock for token validation tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from '@testing-library/react'
import { useAuthStore } from '../authStore'

// Mock the auth API module
vi.mock('../../api/auth', () => ({
  login: vi.fn(),
  logout: vi.fn(),
  getCurrentUser: vi.fn(),
}))

// Added: Mock the apiClient for token validation
vi.mock('../../api/client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

// Import mocked functions for test control
import * as authApi from '../../api/auth'
import apiClient from '../../api/client'

describe('authStore', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    })
    vi.clearAllMocks()
    localStorage.clear()
    // Added (SOUPFIN-53): the default (rememberMe=false) login path stores the
    // token in sessionStorage, so it must be cleared between tests too.
    sessionStorage.clear()
  })

  describe('initial state', () => {
    it('starts with user as null', () => {
      const state = useAuthStore.getState()
      expect(state.user).toBeNull()
    })

    it('starts with isAuthenticated as false', () => {
      const state = useAuthStore.getState()
      expect(state.isAuthenticated).toBe(false)
    })

    it('starts with isLoading as false', () => {
      const state = useAuthStore.getState()
      expect(state.isLoading).toBe(false)
    })

    it('starts with error as null', () => {
      const state = useAuthStore.getState()
      expect(state.error).toBeNull()
    })
  })

  describe('login action', () => {
    const mockUser = {
      username: 'testuser',
      email: 'test@example.com',
      roles: ['ROLE_USER'],
    }

    it('sets isLoading to true during login attempt', async () => {
      // Arrange: Make login take some time
      vi.mocked(authApi.login).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(mockUser), 100))
      )

      // Act: Start login but don't wait
      const loginPromise = useAuthStore.getState().login('test@example.com', 'password')

      // Assert: isLoading should be true immediately
      expect(useAuthStore.getState().isLoading).toBe(true)

      // Cleanup: Wait for login to complete
      await loginPromise
    })

    it('sets user and isAuthenticated on successful login', async () => {
      // Arrange
      vi.mocked(authApi.login).mockResolvedValue(mockUser)

      // Act
      await act(async () => {
        await useAuthStore.getState().login('test@example.com', 'password')
      })

      // Assert
      const state = useAuthStore.getState()
      expect(state.user).toEqual(mockUser)
      expect(state.isAuthenticated).toBe(true)
      expect(state.isLoading).toBe(false)
      expect(state.error).toBeNull()
    })

    // Changed (2026-01-28): Login now takes 3rd rememberMe parameter (defaults to false)
    it('calls API with correct email, password, and rememberMe', async () => {
      // Arrange
      vi.mocked(authApi.login).mockResolvedValue(mockUser)
      const testEmail = 'specific@test.com'
      const testPassword = 'specificPassword123'

      // Act
      await act(async () => {
        await useAuthStore.getState().login(testEmail, testPassword)
      })

      // Assert - rememberMe defaults to false when not provided
      expect(authApi.login).toHaveBeenCalledWith(testEmail, testPassword, false)
      expect(authApi.login).toHaveBeenCalledTimes(1)
    })

    // Added (2026-01-28): Test rememberMe=true is passed correctly
    it('passes rememberMe=true when specified', async () => {
      // Arrange
      vi.mocked(authApi.login).mockResolvedValue(mockUser)

      // Act
      await act(async () => {
        await useAuthStore.getState().login('user@test.com', 'password', true)
      })

      // Assert
      expect(authApi.login).toHaveBeenCalledWith('user@test.com', 'password', true)
    })

    // Changed (SOUPFIN-29): a raw non-Axios Error must NOT be surfaced verbatim;
    // getLoginErrorMessage returns a safe generic message instead.
    it('sets a friendly error and clears user on login failure', async () => {
      // Arrange
      vi.mocked(authApi.login).mockRejectedValue(new Error('Request failed with status code 401'))

      // Act
      await act(async () => {
        try {
          await useAuthStore.getState().login('test@example.com', 'wrongpassword')
        } catch {
          // Expected to throw
        }
      })

      // Assert
      const state = useAuthStore.getState()
      expect(state.user).toBeNull()
      expect(state.isAuthenticated).toBe(false)
      expect(state.isLoading).toBe(false)
      // Must be a friendly message, never the raw Axios "status code" text
      expect(state.error).toBe('Unable to sign in. Please try again.')
      expect(state.error).not.toContain('status code')
    })

    // Added (SOUPFIN-29): the real production path — an AxiosError with a 401
    // response must render "Invalid username or password.", not the raw message.
    it('maps an Axios 401 to "Invalid username or password."', async () => {
      // Arrange: duck-typed AxiosError as produced by the response interceptor
      const axiosError = Object.assign(new Error('Request failed with status code 401'), {
        isAxiosError: true,
        config: { url: '/api/login' },
        response: { status: 401, data: { error: 'Bad credentials' } },
      })
      vi.mocked(authApi.login).mockRejectedValue(axiosError)

      // Act
      await act(async () => {
        try {
          await useAuthStore.getState().login('test@example.com', 'wrongpassword')
        } catch {
          // Expected to throw
        }
      })

      // Assert
      const state = useAuthStore.getState()
      expect(state.error).toBe('Invalid username or password.')
      expect(state.error).not.toContain('status code')
      expect(state.error).not.toContain('Bad credentials')
    })

    // Added (SOUPFIN-29): descriptive account-state messages pass through so the
    // LoginPage can still show the Resend Confirmation link.
    it('passes through a descriptive "email not confirmed" backend message', async () => {
      const axiosError = Object.assign(new Error('Request failed with status code 403'), {
        isAxiosError: true,
        config: { url: '/api/login' },
        response: { status: 403, data: { message: 'Your email is not confirmed yet.' } },
      })
      vi.mocked(authApi.login).mockRejectedValue(axiosError)

      await act(async () => {
        try {
          await useAuthStore.getState().login('test@example.com', 'password')
        } catch {
          // Expected
        }
      })

      expect(useAuthStore.getState().error).toBe('Your email is not confirmed yet.')
    })

    it('throws error to caller on login failure', async () => {
      // Arrange
      vi.mocked(authApi.login).mockRejectedValue(new Error('Login failed'))

      // Act & Assert
      await expect(
        useAuthStore.getState().login('test@example.com', 'wrongpassword')
      ).rejects.toThrow('Login failed')
    })

    it('handles non-Error rejection gracefully', async () => {
      // Arrange
      vi.mocked(authApi.login).mockRejectedValue('string error')

      // Act
      await act(async () => {
        try {
          await useAuthStore.getState().login('test@example.com', 'pass')
        } catch {
          // Expected
        }
      })

      // Assert: Should use safe fallback message for non-Error types (SOUPFIN-29)
      expect(useAuthStore.getState().error).toBe('Unable to sign in. Please try again.')
    })

    it('clears previous error before new login attempt', async () => {
      // Arrange: Set initial error state
      useAuthStore.setState({ error: 'Previous error' })
      vi.mocked(authApi.login).mockResolvedValue(mockUser)

      // Act
      await act(async () => {
        await useAuthStore.getState().login('test@example.com', 'password')
      })

      // Assert
      expect(useAuthStore.getState().error).toBeNull()
    })

    // Fix (SOUPFIN-53): the login response carries no tenantId, so account
    // settings (and therefore the tenant currency) never loaded until the next
    // page reload. login() must now enrich the stored user via
    // GET /rest/user/current.json, the same call validateToken() makes.
    describe('tenantId enrichment after login (SOUPFIN-53)', () => {
      it('merges tenantId from /user/current.json into the stored user', async () => {
        // Arrange: login response has no tenantId (mirrors POST /rest/api/login)
        vi.mocked(authApi.login).mockResolvedValue(mockUser)
        localStorage.setItem('access_token', 'valid-token')
        vi.mocked(apiClient.get).mockResolvedValue({
          data: {
            username: 'testuser',
            email: 'test@example.com',
            roles: ['ROLE_USER'],
            tenantId: 'tenant-ghs-001',
          },
        })

        // Act
        await act(async () => {
          await useAuthStore.getState().login('test@example.com', 'password')
        })

        // Assert: full round-trip — the enrichment call was made AND the
        // resulting tenantId is readable from the store, which is the value
        // App.tsx gates the account-settings fetch on.
        expect(apiClient.get).toHaveBeenCalledWith('/user/current.json')
        const state = useAuthStore.getState()
        expect(state.user?.tenantId).toBe('tenant-ghs-001')
        expect(state.isAuthenticated).toBe(true)
        expect(state.user?.username).toBe('testuser')
      })

      it('reads the token from sessionStorage when rememberMe is false', async () => {
        // Arrange: default login path stores the token in sessionStorage.
        // validateToken() bails out early if it finds no token, so the
        // enrichment would silently never happen if only localStorage is read.
        vi.mocked(authApi.login).mockResolvedValue(mockUser)
        sessionStorage.setItem('access_token', 'session-token')
        vi.mocked(apiClient.get).mockResolvedValue({
          data: { username: 'testuser', email: 'test@example.com', roles: [], tenantId: 'tenant-session' },
        })

        // Act
        await act(async () => {
          await useAuthStore.getState().login('test@example.com', 'password', false)
        })

        // Assert
        expect(useAuthStore.getState().user?.tenantId).toBe('tenant-session')
      })

      it('keeps the user signed in when the enrichment request fails', async () => {
        // Arrange: the token we just received is valid, so a failed
        // /user/current.json call must not invalidate the session.
        vi.mocked(authApi.login).mockResolvedValue(mockUser)
        localStorage.setItem('access_token', 'valid-token')
        vi.mocked(apiClient.get).mockRejectedValue(new Error('Network error'))

        // Act
        await act(async () => {
          await useAuthStore.getState().login('test@example.com', 'password')
        })

        // Assert
        const state = useAuthStore.getState()
        expect(state.isAuthenticated).toBe(true)
        expect(state.user?.username).toBe('testuser')
        expect(state.user?.tenantId).toBeUndefined()
        expect(state.error).toBeNull()
      })

      it('does not overwrite a tenantId that login already returned', async () => {
        // Arrange: OTP / future login responses may already carry tenantId.
        vi.mocked(authApi.login).mockResolvedValue({ ...mockUser, tenantId: 'tenant-from-login' })
        localStorage.setItem('access_token', 'valid-token')
        vi.mocked(apiClient.get).mockResolvedValue({
          data: { username: 'testuser', email: 'test@example.com', roles: [], tenantId: 'tenant-from-server' },
        })

        // Act
        await act(async () => {
          await useAuthStore.getState().login('test@example.com', 'password')
        })

        // Assert
        expect(useAuthStore.getState().user?.tenantId).toBe('tenant-from-login')
      })

      it('does not attempt enrichment when login itself failed', async () => {
        // Arrange
        vi.mocked(authApi.login).mockRejectedValue(new Error('Invalid username or password.'))
        localStorage.setItem('access_token', 'stale-token')

        // Act
        await act(async () => {
          try {
            await useAuthStore.getState().login('test@example.com', 'wrong')
          } catch {
            // Expected
          }
        })

        // Assert
        expect(apiClient.get).not.toHaveBeenCalled()
        expect(useAuthStore.getState().user).toBeNull()
      })
    })
  })

  describe('logout action', () => {
    it('clears user and sets isAuthenticated to false', () => {
      // Arrange: Set authenticated state
      useAuthStore.setState({
        user: { username: 'test', email: 'test@test.com', roles: [] },
        isAuthenticated: true,
      })

      // Act
      act(() => {
        useAuthStore.getState().logout()
      })

      // Assert
      const state = useAuthStore.getState()
      expect(state.user).toBeNull()
      expect(state.isAuthenticated).toBe(false)
    })

    it('calls apiLogout function', () => {
      // Arrange
      useAuthStore.setState({
        user: { username: 'test', email: 'test@test.com', roles: [] },
        isAuthenticated: true,
      })

      // Act
      act(() => {
        useAuthStore.getState().logout()
      })

      // Assert
      expect(authApi.logout).toHaveBeenCalledTimes(1)
    })

    it('clears any existing error on logout', () => {
      // Arrange
      useAuthStore.setState({ error: 'Some error' })

      // Act
      act(() => {
        useAuthStore.getState().logout()
      })

      // Assert
      expect(useAuthStore.getState().error).toBeNull()
    })
  })

  describe('clearError action', () => {
    it('clears error state', () => {
      // Arrange
      useAuthStore.setState({ error: 'Test error' })

      // Act
      act(() => {
        useAuthStore.getState().clearError()
      })

      // Assert
      expect(useAuthStore.getState().error).toBeNull()
    })

    it('does not affect other state properties', () => {
      // Arrange
      const mockUser = { username: 'test', email: 'test@test.com', roles: ['ROLE_ADMIN'] }
      useAuthStore.setState({
        user: mockUser,
        isAuthenticated: true,
        error: 'Test error',
      })

      // Act
      act(() => {
        useAuthStore.getState().clearError()
      })

      // Assert
      const state = useAuthStore.getState()
      expect(state.user).toEqual(mockUser)
      expect(state.isAuthenticated).toBe(true)
    })
  })

  describe('initialize action', () => {
    // Changed: Test is now async and mocks apiClient for token validation
    it('sets user and isAuthenticated when token and user exist', async () => {
      // Arrange
      const storedUser = { username: 'stored', email: 'stored@test.com', roles: ['ROLE_USER'] }
      localStorage.setItem('access_token', 'valid-token')
      vi.mocked(authApi.getCurrentUser).mockReturnValue(storedUser)
      // Added: Mock successful token validation
      vi.mocked(apiClient.get).mockResolvedValue({ data: { username: 'stored' } })

      // Act - Changed: await the async initialize
      await act(async () => {
        await useAuthStore.getState().initialize()
      })

      // Assert
      const state = useAuthStore.getState()
      expect(state.user).toEqual(storedUser)
      expect(state.isAuthenticated).toBe(true)
    })

    // Changed: Test is now async
    it('sets isAuthenticated to false when no token exists', async () => {
      // Arrange: No token in localStorage
      const storedUser = { username: 'stored', email: 'stored@test.com', roles: [] }
      vi.mocked(authApi.getCurrentUser).mockReturnValue(storedUser)

      // Act
      await act(async () => {
        await useAuthStore.getState().initialize()
      })

      // Assert
      expect(useAuthStore.getState().isAuthenticated).toBe(false)
    })

    // Changed: Test is now async
    it('sets isAuthenticated to false when no user exists', async () => {
      // Arrange: Token exists but no user
      localStorage.setItem('access_token', 'valid-token')
      vi.mocked(authApi.getCurrentUser).mockReturnValue(null)

      // Act
      await act(async () => {
        await useAuthStore.getState().initialize()
      })

      // Assert
      expect(useAuthStore.getState().isAuthenticated).toBe(false)
    })

    // Changed: Test is now async
    it('requires both token and user for authentication', async () => {
      // Arrange: Neither exists
      vi.mocked(authApi.getCurrentUser).mockReturnValue(null)

      // Act
      await act(async () => {
        await useAuthStore.getState().initialize()
      })

      // Assert
      const state = useAuthStore.getState()
      expect(state.user).toBeNull()
      expect(state.isAuthenticated).toBe(false)
    })

    // Added: Test token validation failure clears auth state
    it('clears auth state when token validation fails', async () => {
      // Arrange: Token and user exist but token validation fails
      const storedUser = { username: 'stored', email: 'stored@test.com', roles: ['ROLE_USER'] }
      localStorage.setItem('access_token', 'expired-token')
      vi.mocked(authApi.getCurrentUser).mockReturnValue(storedUser)
      // Added: Mock failed token validation (401 Unauthorized)
      vi.mocked(apiClient.get).mockRejectedValue(new Error('Unauthorized'))

      // Act
      await act(async () => {
        await useAuthStore.getState().initialize()
      })

      // Assert: Auth state should be cleared
      const state = useAuthStore.getState()
      expect(state.user).toBeNull()
      expect(state.isAuthenticated).toBe(false)
      expect(state.error).toBe('Session expired. Please log in again.')
    })
  })
})
