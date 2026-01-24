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

    it('calls API with correct email and password', async () => {
      // Arrange
      vi.mocked(authApi.login).mockResolvedValue(mockUser)
      const testEmail = 'specific@test.com'
      const testPassword = 'specificPassword123'

      // Act
      await act(async () => {
        await useAuthStore.getState().login(testEmail, testPassword)
      })

      // Assert
      expect(authApi.login).toHaveBeenCalledWith(testEmail, testPassword)
      expect(authApi.login).toHaveBeenCalledTimes(1)
    })

    it('sets error and clears user on login failure', async () => {
      // Arrange
      const errorMessage = 'Invalid credentials'
      vi.mocked(authApi.login).mockRejectedValue(new Error(errorMessage))

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
      expect(state.error).toBe(errorMessage)
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

      // Assert: Should use fallback message for non-Error types
      expect(useAuthStore.getState().error).toBe('Login failed')
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
