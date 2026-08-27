/**
 * Regression tests for SOUPFIN-49
 *
 * The 401 response interceptor cleared `access_token` and `user` from both storages
 * but left Zustand's persisted `auth-storage` key intact. On arriving at /login the
 * store rehydrated `isAuthenticated: true`, so PublicRoute (App.tsx) immediately
 * forwarded the user to /dashboard — a dashboard that still looked signed in but
 * where every subsequent request 401s.
 *
 * These tests exercise the real exported handler (the interceptor callbacks
 * themselves are unreachable because axios is mocked globally in test/setup.ts)
 * and then verify the outcome the user actually sees: a freshly rehydrated store.
 *
 * Note: importing authStore is what registers the state resetter with client.ts,
 * mirroring the app, where App.tsx imports the store before any request is made.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { clearAuthSession, handleUnauthorized } from '../client'
import { useAuthStore } from '../../stores/authStore'

/** Seed the exact artefacts a signed-in session writes. */
function seedSignedInSession(options: { rememberMe: boolean }) {
  const store = options.rememberMe ? localStorage : sessionStorage
  store.setItem('access_token', 'tok-123')
  store.setItem('user', JSON.stringify({ username: 'soup.support' }))
  localStorage.setItem('auth_storage_type', options.rememberMe ? 'local' : 'session')
  localStorage.setItem(
    'auth-storage',
    JSON.stringify({
      state: { user: { username: 'soup.support' }, isAuthenticated: true },
      version: 0,
    })
  )
}

/** Read the persisted `isAuthenticated` flag the way Zustand's persist rehydrator does. */
function persistedIsAuthenticated(): boolean | undefined {
  const raw = localStorage.getItem('auth-storage')
  if (!raw) return undefined
  return JSON.parse(raw).state?.isAuthenticated
}

describe('SOUPFIN-49 — 401 handling clears the persisted auth store', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    window.location.pathname = '/dashboard'
    window.location.href = '/dashboard'
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      isInitialized: false,
      error: null,
    })
  })

  describe('clearAuthSession', () => {
    it('removes every auth key from localStorage (rememberMe login)', () => {
      // Arrange
      seedSignedInSession({ rememberMe: true })

      // Act
      clearAuthSession()

      // Assert
      expect(localStorage.getItem('access_token')).toBeNull()
      expect(localStorage.getItem('user')).toBeNull()
      expect(localStorage.getItem('auth-storage')).toBeNull()
      expect(localStorage.getItem('auth_storage_type')).toBeNull()
    })

    it('removes the token from sessionStorage (default login, rememberMe=false)', () => {
      // Arrange — the default flow stores the token in sessionStorage only
      seedSignedInSession({ rememberMe: false })
      expect(sessionStorage.getItem('access_token')).toBe('tok-123')

      // Act
      clearAuthSession()

      // Assert — both the sessionStorage token and the localStorage persist key go
      expect(sessionStorage.getItem('access_token')).toBeNull()
      expect(sessionStorage.getItem('user')).toBeNull()
      expect(localStorage.getItem('auth-storage')).toBeNull()
    })

    it('is a no-op when nothing is stored (already signed out)', () => {
      // Act + Assert — must not throw on absent keys
      expect(() => clearAuthSession()).not.toThrow()
      expect(localStorage.getItem('auth-storage')).toBeNull()
    })
  })

  describe('handleUnauthorized', () => {
    it('clears the persisted auth-storage key — the SOUPFIN-49 regression', () => {
      // Arrange
      seedSignedInSession({ rememberMe: false })

      // Act
      handleUnauthorized()

      // Assert — before the fix this key survived and rehydrated as authenticated
      expect(persistedIsAuthenticated()).not.toBe(true)
    })

    it('resets the in-memory store so PublicRoute renders the login form', () => {
      // Arrange — a live, authenticated store as it is at the moment the 401 lands
      seedSignedInSession({ rememberMe: false })
      useAuthStore.setState({
        user: { username: 'soup.support', email: 's@t.io', roles: ['ROLE_USER'] },
        isAuthenticated: true,
        isInitialized: true,
      })

      // Act
      handleUnauthorized()

      // Assert — PublicRoute reads exactly these two fields
      const state = useAuthStore.getState()
      expect(state.isAuthenticated).toBe(false)
      expect(state.user).toBeNull()
      expect(state.isInitialized).toBe(true)
    })

    it('surfaces a session-expired message so the user knows to sign in again', () => {
      // Arrange
      seedSignedInSession({ rememberMe: false })

      // Act
      handleUnauthorized()

      // Assert — LoginPage renders store.error in [data-testid="login-error"]
      expect(useAuthStore.getState().error).toBe('Session expired. Please log in again.')
    })

    it('redirects to /login from a protected route', () => {
      // Arrange
      window.location.pathname = '/dashboard'

      // Act
      handleUnauthorized()

      // Assert
      expect(window.location.href).toBe('/login')
    })

    it('does not redirect when already on /login, but still clears state', () => {
      // Arrange — a background query 401s while the user sits on the login form.
      // There is no reload here, so the in-memory reset is the ONLY thing that
      // stops PublicRoute forwarding to /dashboard.
      seedSignedInSession({ rememberMe: false })
      useAuthStore.setState({ isAuthenticated: true, isInitialized: true })
      window.location.pathname = '/login'
      window.location.href = '/login'

      // Act
      handleUnauthorized()

      // Assert
      expect(window.location.href).toBe('/login') // untouched, no redirect loop
      expect(useAuthStore.getState().isAuthenticated).toBe(false)
      expect(persistedIsAuthenticated()).not.toBe(true)
    })

    it('stays cleared across a burst of concurrent 401s (idempotent)', () => {
      // Arrange — a dashboard fires many parallel queries; every one 401s
      seedSignedInSession({ rememberMe: false })
      useAuthStore.setState({ isAuthenticated: true, isInitialized: true })

      // Act
      for (let i = 0; i < 12; i += 1) {
        handleUnauthorized()
      }

      // Assert
      expect(useAuthStore.getState().isAuthenticated).toBe(false)
      expect(persistedIsAuthenticated()).not.toBe(true)
      expect(localStorage.getItem('access_token')).toBeNull()
      expect(sessionStorage.getItem('access_token')).toBeNull()
    })

    it('cannot be resurrected by a later persist write', () => {
      // Arrange — window.location.href does not navigate synchronously, so any
      // store set() between the 401 and the actual page load re-persists the key.
      seedSignedInSession({ rememberMe: false })
      useAuthStore.setState({ isAuthenticated: true, isInitialized: true })

      // Act
      handleUnauthorized()
      useAuthStore.setState({ error: 'some later unrelated update' })

      // Assert — the re-persisted value must still be false, never a stale true
      expect(persistedIsAuthenticated()).toBe(false)
    })
  })

  describe('full round trip: reload after a 401', () => {
    it('a freshly rehydrated store reports NOT authenticated', async () => {
      // Arrange
      seedSignedInSession({ rememberMe: false })

      // Act — handle the 401, then simulate the full page load that
      // window.location.href triggers by re-creating the store from storage.
      handleUnauthorized()
      vi.resetModules()
      const { useAuthStore: reloadedStore } = await import('../../stores/authStore')

      // Assert — this is the user-visible outcome: PublicRoute sees false and
      // renders the login form instead of forwarding to /dashboard.
      expect(reloadedStore.getState().isAuthenticated).toBe(false)
      expect(reloadedStore.getState().user).toBeNull()
    })

    it('rehydrates authenticated when NO 401 occurred (guards over-clearing)', async () => {
      // Arrange — a healthy session must survive a reload untouched, otherwise
      // the fix would simply be logging everyone out.
      seedSignedInSession({ rememberMe: false })

      // Act — reload without any 401
      vi.resetModules()
      const { useAuthStore: reloadedStore } = await import('../../stores/authStore')

      // Assert
      expect(reloadedStore.getState().isAuthenticated).toBe(true)
      expect(sessionStorage.getItem('access_token')).toBe('tok-123')
    })
  })
})
