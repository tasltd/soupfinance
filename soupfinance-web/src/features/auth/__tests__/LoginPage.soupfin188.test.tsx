/**
 * SOUPFIN-188 — LoginPage shows a one-shot "session expired" notice after a 401.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../../i18n'
import { LoginPage } from '../LoginPage'
import { useAuthStore } from '../../../stores'
import { SESSION_EXPIRED_FLAG } from '../../../api/client'

function renderLoginPage() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <LoginPage />
    </MemoryRouter>
  )
}

const clearError = vi.fn(() => useAuthStore.setState({ error: null }))

describe('LoginPage — session expired notice (SOUPFIN-188)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    sessionStorage.clear()
    localStorage.clear()
    clearError.mockClear()
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      login: vi.fn().mockResolvedValue(undefined),
      clearError,
    })
  })

  afterEach(async () => {
    await i18n.changeLanguage('en')
  })

  it('shows an info banner and clears the flag when the 401 handler left it', () => {
    sessionStorage.setItem(SESSION_EXPIRED_FLAG, '1')

    renderLoginPage()

    const banner = screen.getByTestId('login-session-expired')
    expect(banner).toHaveTextContent('Your session has expired. Please sign in again.')
    expect(screen.getByRole('alert')).toHaveClass('bg-blue-100')
    expect(sessionStorage.getItem(SESSION_EXPIRED_FLAG)).toBeNull()
  })

  it('shows the notice only once — a second visit to /login has no banner', () => {
    sessionStorage.setItem(SESSION_EXPIRED_FLAG, '1')
    const first = renderLoginPage()
    expect(screen.getByTestId('login-session-expired')).toBeInTheDocument()
    first.unmount()

    renderLoginPage()

    expect(screen.queryByTestId('login-session-expired')).not.toBeInTheDocument()
  })

  it('shows no banner on an ordinary visit', () => {
    renderLoginPage()

    expect(screen.queryByTestId('login-session-expired')).not.toBeInTheDocument()
    expect(clearError).not.toHaveBeenCalled()
  })

  it('replaces the store\'s red "Session expired" error with the one info banner', () => {
    sessionStorage.setItem(SESSION_EXPIRED_FLAG, '1')
    useAuthStore.setState({ error: 'Session expired. Please log in again.' })

    renderLoginPage()

    expect(clearError).toHaveBeenCalled()
    expect(screen.queryByTestId('login-error')).not.toBeInTheDocument()
    expect(screen.getByTestId('login-session-expired')).toBeInTheDocument()
  })

  it('hides the banner once a new sign-in attempt fails', () => {
    sessionStorage.setItem(SESSION_EXPIRED_FLAG, '1')
    renderLoginPage()

    // A failed attempt sets the store error after mount
    act(() => useAuthStore.setState({ error: 'Invalid username or password.' }))

    expect(screen.queryByTestId('login-session-expired')).not.toBeInTheDocument()
    expect(screen.getByTestId('login-error')).toHaveTextContent('Invalid username or password.')
  })

  it('can be dismissed', async () => {
    sessionStorage.setItem(SESSION_EXPIRED_FLAG, '1')
    renderLoginPage()

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss alert' }))

    expect(screen.queryByTestId('login-session-expired')).not.toBeInTheDocument()
  })

  it.each([
    ['de', 'Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.'],
    ['fr', 'Votre session a expiré. Veuillez vous reconnecter.'],
    ['nl', 'Uw sessie is verlopen. Log opnieuw in.'],
  ])('is translated in %s', async (lang, text) => {
    await i18n.changeLanguage(lang)
    sessionStorage.setItem(SESSION_EXPIRED_FLAG, '1')

    renderLoginPage()

    expect(screen.getByTestId('login-session-expired')).toHaveTextContent(text)
  })
})
