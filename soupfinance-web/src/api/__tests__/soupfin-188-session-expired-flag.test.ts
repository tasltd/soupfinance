/**
 * Regression tests for SOUPFIN-188 — the 401 handler leaves a one-shot
 * `session_expired` flag in sessionStorage so LoginPage can explain the redirect.
 *
 * The flag must be set only when a session actually existed: a wrong password on
 * /login also returns 401, and must never claim the user's session expired.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  handleUnauthorized,
  isSessionExpiredFlagSet,
  clearSessionExpiredFlag,
  SESSION_EXPIRED_FLAG,
  resetLoginRedirectPending,
} from '../client'
import { useAuthStore } from '../../stores/authStore'

describe('SOUPFIN-188 — session-expired flag', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    window.location.pathname = '/dashboard'
    window.location.href = '/dashboard'
    useAuthStore.setState({ user: null, isAuthenticated: false, isInitialized: false, error: null })
    resetLoginRedirectPending()
  })

  it('sets the flag when a default-login (sessionStorage) token gets a 401', () => {
    sessionStorage.setItem('access_token', 'tok-1')

    handleUnauthorized()

    // The flag survives the handler's own storage clear, and the token does not
    expect(sessionStorage.getItem(SESSION_EXPIRED_FLAG)).toBe('1')
    expect(sessionStorage.getItem('access_token')).toBeNull()
    expect(window.location.href).toBe('/login')
  })

  it('sets the flag when a remember-me (localStorage) token gets a 401', () => {
    localStorage.setItem('access_token', 'tok-2')

    handleUnauthorized()

    expect(isSessionExpiredFlagSet()).toBe(true)
    // Never in localStorage: it must not leak into another tab or a later visit
    expect(localStorage.getItem(SESSION_EXPIRED_FLAG)).toBeNull()
  })

  it('does not set the flag for a 401 with no stored token (wrong password on /login)', () => {
    window.location.pathname = '/login'

    handleUnauthorized()

    expect(isSessionExpiredFlagSet()).toBe(false)
  })

  it('keeps the flag when a burst of parallel requests all 401', () => {
    sessionStorage.setItem('access_token', 'tok-3')

    // The first 401 clears the token, so the next 49 see no session at all
    for (let i = 0; i < 50; i++) handleUnauthorized()

    expect(isSessionExpiredFlagSet()).toBe(true)
  })

  it('reads the flag without consuming it, and clears it on request', () => {
    sessionStorage.setItem(SESSION_EXPIRED_FLAG, '1')

    expect(isSessionExpiredFlagSet()).toBe(true)
    expect(isSessionExpiredFlagSet()).toBe(true)
    clearSessionExpiredFlag()
    expect(isSessionExpiredFlagSet()).toBe(false)
  })

  it('keeps the flag while the redirect is pending, so the reloaded /login still sees it', () => {
    sessionStorage.setItem('access_token', 'tok-4')
    handleUnauthorized()

    // The store reset re-renders THIS document onto /login first; its LoginPage
    // must not consume the flag the reloaded page is about to need.
    clearSessionExpiredFlag()
    expect(isSessionExpiredFlagSet()).toBe(true)

    // After the reload (module state starts fresh) the flag clears normally
    resetLoginRedirectPending()
    clearSessionExpiredFlag()
    expect(isSessionExpiredFlagSet()).toBe(false)
  })

  it('does not mark a redirect pending for a 401 already on /login', () => {
    window.location.pathname = '/login'
    sessionStorage.setItem('access_token', 'tok-5')
    handleUnauthorized()

    // No reload is coming, so LoginPage on this document may clear it
    clearSessionExpiredFlag()
    expect(isSessionExpiredFlagSet()).toBe(false)
  })

  it('treats any value other than "1" as unset', () => {
    sessionStorage.setItem(SESSION_EXPIRED_FLAG, 'true')
    expect(isSessionExpiredFlagSet()).toBe(false)
  })
})
