/**
 * Added (SOUPFIN-186): forgot-password and reset-password pages.
 *
 * Covers the two behaviours this issue changed:
 * - ForgotPasswordPage shows a real error when the request fails (it used to
 *   show "Reset link sent" on every error, including the 302 the missing
 *   backend action returns today).
 * - ResetPasswordPage swaps the form for a "request a new link" screen when the
 *   backend says the token is expired or already used, and keeps the form for
 *   password problems.
 *
 * The API calls are mocked; getResetPasswordError is the real implementation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ForgotPasswordPage } from '../ForgotPasswordPage'
import { ResetPasswordPage } from '../ResetPasswordPage'

vi.mock('../../../api/endpoints/registration', async () => {
  const actual = await vi.importActual<typeof import('../../../api/endpoints/registration')>(
    '../../../api/endpoints/registration',
  )
  return { ...actual, forgotPassword: vi.fn(), resetPassword: vi.fn() }
})

import { forgotPassword, resetPassword } from '../../../api/endpoints/registration'

const mockForgot = forgotPassword as ReturnType<typeof vi.fn>
const mockReset = resetPassword as ReturnType<typeof vi.fn>

function axiosError(status: number | undefined, data?: unknown) {
  return {
    isAxiosError: true,
    message: status ? `Request failed with status code ${status}` : 'Network Error',
    response: status === undefined ? undefined : { status, data },
    config: { url: '/account/forgotPassword.json' },
  }
}

function renderAt(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/login" element={<div data-testid="login-page" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ForgotPasswordPage (SOUPFIN-186)', () => {
  beforeEach(() => vi.clearAllMocks())

  async function submit(email: string) {
    const user = userEvent.setup()
    await user.type(screen.getByTestId('forgot-password-email-input'), email)
    await user.click(screen.getByTestId('forgot-password-submit-button'))
  }

  it('shows the generic "link sent" message when the backend answers 200', async () => {
    mockForgot.mockResolvedValue({ success: true, message: 'If an account exists…' })
    renderAt('/forgot-password')

    await submit('jane@acme.com')

    expect(await screen.findByTestId('forgot-password-success')).toHaveTextContent('jane@acme.com')
    expect(mockForgot).toHaveBeenCalledWith('jane@acme.com')
    expect(screen.queryByTestId('forgot-password-error')).not.toBeInTheDocument()
  })

  it('shows an error, not "link sent", when the request fails at the network level', async () => {
    mockForgot.mockRejectedValue(axiosError(undefined))
    renderAt('/forgot-password')

    await submit('jane@acme.com')

    const banner = await screen.findByTestId('forgot-password-error')
    expect(banner).toHaveTextContent('We could not send the reset link')
    expect(screen.getByTestId('forgot-password-error-message')).toHaveTextContent(/could not reach the server/i)
    expect(screen.queryByTestId('forgot-password-success')).not.toBeInTheDocument()
    // No cooldown on failure: the user can retry straight away
    expect(screen.getByTestId('forgot-password-submit-button')).toHaveTextContent('Send Reset Link')
    expect(screen.getByTestId('forgot-password-submit-button')).toBeEnabled()
  })

  it('shows the backend sentence for a 400 EMAIL_INVALID', async () => {
    mockForgot.mockRejectedValue(
      axiosError(400, { success: false, code: 'EMAIL_INVALID', message: 'Enter a valid email address' }),
    )
    renderAt('/forgot-password')

    await submit('jane@acme.com')

    expect(await screen.findByTestId('forgot-password-error-message')).toHaveTextContent(
      'Enter a valid email address',
    )
  })

  it('never shows HTTP jargon for a 500', async () => {
    // A real Tomcat/Apache error page; short HTML bodies are tracked separately
    const errorPage = `<!doctype html><html><head><title>HTTP Status 500</title></head><body>${'x'.repeat(400)}</body></html>`
    mockForgot.mockRejectedValue(axiosError(500, errorPage))
    renderAt('/forgot-password')

    await submit('jane@acme.com')

    const message = await screen.findByTestId('forgot-password-error-message')
    expect(message.textContent).not.toMatch(/status code|<html>/i)
  })

  it('shows the "unavailable" error when the endpoint answers 200 without the JSON contract', async () => {
    const { PASSWORD_RESET_UNAVAILABLE_MESSAGE } = await import('../../../api/endpoints/registration')
    mockForgot.mockRejectedValue(new Error(PASSWORD_RESET_UNAVAILABLE_MESSAGE))
    renderAt('/forgot-password')

    await submit('jane@acme.com')

    expect(await screen.findByTestId('forgot-password-error-message')).toHaveTextContent(
      PASSWORD_RESET_UNAVAILABLE_MESSAGE,
    )
    expect(screen.queryByTestId('forgot-password-success')).not.toBeInTheDocument()
  })

  it('clears the error once a retry succeeds', async () => {
    mockForgot.mockRejectedValueOnce(axiosError(undefined))
    mockForgot.mockResolvedValueOnce({ success: true, message: 'ok' })
    renderAt('/forgot-password')

    await submit('jane@acme.com')
    await screen.findByTestId('forgot-password-error')
    await userEvent.setup().click(screen.getByTestId('forgot-password-submit-button'))

    expect(await screen.findByTestId('forgot-password-success')).toBeInTheDocument()
    expect(screen.queryByTestId('forgot-password-error')).not.toBeInTheDocument()
    expect(mockForgot).toHaveBeenCalledTimes(2)
  })
})

describe('ResetPasswordPage (SOUPFIN-186)', () => {
  beforeEach(() => vi.clearAllMocks())

  async function fillAndSubmit(password = 'NewPass123!', confirm = password) {
    const user = userEvent.setup()
    await user.type(screen.getByTestId('reset-password-input'), password)
    await user.type(screen.getByTestId('reset-password-confirm-input'), confirm)
    await user.click(screen.getByTestId('reset-password-submit-button'))
  }

  it('shows the invalid-link screen when the URL has no token (empty input)', () => {
    renderAt('/reset-password')

    expect(screen.getByTestId('reset-password-link-error-heading')).toHaveTextContent('Invalid Reset Link')
    expect(screen.getByTestId('reset-password-request-new-link')).toHaveAttribute('href', '/forgot-password')
    expect(screen.queryByTestId('reset-password-form')).not.toBeInTheDocument()
  })

  it('sends the token and passwords, then shows success', async () => {
    mockReset.mockResolvedValue({ success: true, message: 'Your password has been reset.' })
    renderAt('/reset-password?token=tok_abc')

    await fillAndSubmit()

    expect(await screen.findByTestId('reset-password-success-heading')).toBeInTheDocument()
    expect(mockReset).toHaveBeenCalledWith({
      token: 'tok_abc',
      password: 'NewPass123!',
      confirmPassword: 'NewPass123!',
    })
  })

  // Added (SOUPFIN-189): the success screen's Sign In leads to the login page
  it('goes to /login from the success screen', async () => {
    mockReset.mockResolvedValue({ success: true, message: 'Your password has been reset.' })
    renderAt('/reset-password?token=tok_abc')

    await fillAndSubmit()
    await userEvent.setup().click(await screen.findByTestId('reset-password-login-link'))

    expect(await screen.findByTestId('login-page')).toBeInTheDocument()
  })

  it('swaps the form for the expired-link screen on TOKEN_EXPIRED', async () => {
    mockReset.mockRejectedValue(
      axiosError(400, { success: false, code: 'TOKEN_EXPIRED', message: 'This password reset link has expired.' }),
    )
    renderAt('/reset-password?token=tok_old')

    await fillAndSubmit()

    expect(await screen.findByTestId('reset-password-link-error-heading')).toHaveTextContent('Reset Link Expired')
    expect(screen.getByTestId('reset-password-link-error-message')).toHaveTextContent(
      'This password reset link has expired.',
    )
    expect(screen.getByTestId('reset-password-request-new-link')).toHaveAttribute('href', '/forgot-password')
    expect(screen.queryByTestId('reset-password-form')).not.toBeInTheDocument()
  })

  it('shows the invalid-link screen for a used link (TOKEN_INVALID)', async () => {
    mockReset.mockRejectedValue(axiosError(400, { success: false, code: 'TOKEN_INVALID' }))
    renderAt('/reset-password?token=tok_used')

    await fillAndSubmit()

    expect(await screen.findByTestId('reset-password-link-error-heading')).toHaveTextContent('Invalid Reset Link')
    expect(screen.getByTestId('reset-password-link-error-message')).toHaveTextContent(
      'This password reset link is invalid or has already been used.',
    )
  })

  it('keeps the form and shows the message for a password problem', async () => {
    mockReset.mockRejectedValue(
      axiosError(400, {
        success: false,
        code: 'PASSWORD_TOO_SHORT',
        message: 'Password must be at least 8 characters',
      }),
    )
    renderAt('/reset-password?token=tok_abc')

    await fillAndSubmit()

    expect(await screen.findByTestId('reset-password-error-message')).toHaveTextContent(
      'Password must be at least 8 characters',
    )
    expect(screen.getByTestId('reset-password-form')).toBeInTheDocument()
  })

  it('shows a plain-language message, never "Request failed with status code", for a network error', async () => {
    mockReset.mockRejectedValue(axiosError(undefined))
    renderAt('/reset-password?token=tok_abc')

    await fillAndSubmit()

    const message = await screen.findByTestId('reset-password-error-message')
    expect(message.textContent).not.toMatch(/status code/i)
    expect(message).toHaveTextContent(/could not reach the server/i)
    expect(screen.getByTestId('reset-password-form')).toBeInTheDocument()
  })

  it('does not submit when the passwords differ', async () => {
    renderAt('/reset-password?token=tok_abc')

    await fillAndSubmit('NewPass123!', 'Different1!')

    expect(screen.getByTestId('reset-password-submit-button')).toBeDisabled()
    expect(mockReset).not.toHaveBeenCalled()
  })
})
