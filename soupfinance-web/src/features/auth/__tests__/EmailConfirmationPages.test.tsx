/**
 * Added (SOUPFIN-189): ConfirmEmailPage and ResendConfirmationPage unit tests.
 *
 * ConfirmEmailPage:
 * - no token in the URL sends the user back to /register
 * - password rules and confirm mismatch keep the submit disabled
 * - success shows "Account Activated!" and Sign In goes to /login
 * - an invalid or expired token shows the backend sentence and keeps the form
 *
 * ResendConfirmationPage:
 * - success shows the generic "check your inbox" message and starts a cooldown
 * - a failure shows the SAME generic message, by design: it must not reveal
 *   whether an account exists for the email
 *
 * The API calls are mocked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConfirmEmailPage } from '../ConfirmEmailPage'
import { ResendConfirmationPage } from '../ResendConfirmationPage'

vi.mock('../../../api/endpoints/registration', async () => {
  const actual = await vi.importActual<typeof import('../../../api/endpoints/registration')>(
    '../../../api/endpoints/registration',
  )
  return { ...actual, confirmEmail: vi.fn(), resendConfirmation: vi.fn() }
})

import { confirmEmail, resendConfirmation } from '../../../api/endpoints/registration'

const mockConfirm = confirmEmail as ReturnType<typeof vi.fn>
const mockResend = resendConfirmation as ReturnType<typeof vi.fn>

function axiosError(status: number | undefined, data?: unknown) {
  return Object.assign(new Error(status ? `Request failed with status code ${status}` : 'Network Error'), {
    isAxiosError: true,
    response: status === undefined ? undefined : { status, data },
    config: { url: '/account/confirmEmail.json' },
  })
}

function renderAt(entry: string | { pathname: string; state?: unknown }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/confirm-email" element={<ConfirmEmailPage />} />
          <Route path="/resend-confirmation" element={<ResendConfirmationPage />} />
          <Route path="/register" element={<div data-testid="register-page" />} />
          <Route path="/login" element={<div data-testid="login-page" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ConfirmEmailPage (SOUPFIN-189)', () => {
  beforeEach(() => vi.clearAllMocks())

  async function fillAndSubmit(password = 'Secret123', confirm = password) {
    const user = userEvent.setup()
    await user.type(screen.getByTestId('confirm-email-password-input'), password)
    await user.type(screen.getByTestId('confirm-email-confirm-password-input'), confirm)
    await user.click(screen.getByTestId('confirm-email-submit-button'))
    return user
  }

  it('sends the user to /register when the URL has no token', async () => {
    renderAt('/confirm-email')

    expect(await screen.findByTestId('register-page')).toBeInTheDocument()
    expect(screen.queryByTestId('confirm-email-form')).not.toBeInTheDocument()
  })

  it('sends the user to /register when the token is empty', async () => {
    renderAt('/confirm-email?token=')

    expect(await screen.findByTestId('register-page')).toBeInTheDocument()
  })

  it.each([
    ['Short1', 'too short'],
    ['lowercase123', 'no uppercase'],
    ['UPPERCASE123', 'no lowercase'],
    ['NoDigitsHere', 'no number'],
  ])('keeps the submit disabled for %s (%s)', async (password) => {
    renderAt('/confirm-email?token=tok_abc')

    await fillAndSubmit(password)

    expect(screen.getByTestId('confirm-email-submit-button')).toBeDisabled()
    expect(mockConfirm).not.toHaveBeenCalled()
  })

  it('shows "Passwords do not match" and does not submit when the confirm differs', async () => {
    renderAt('/confirm-email?token=tok_abc')

    await fillAndSubmit('Secret123', 'Secret124')

    expect(screen.getByText('Passwords do not match')).toBeInTheDocument()
    expect(screen.getByTestId('confirm-email-submit-button')).toBeDisabled()
    expect(mockConfirm).not.toHaveBeenCalled()
  })

  it('sends the token and passwords, then Sign In goes to /login', async () => {
    mockConfirm.mockResolvedValue({ success: true, message: 'Email confirmed' })
    renderAt('/confirm-email?token=tok_abc')

    const user = await fillAndSubmit()

    expect(await screen.findByTestId('confirm-email-success-heading')).toHaveTextContent('Account Activated!')
    expect(mockConfirm).toHaveBeenCalledWith({
      token: 'tok_abc',
      password: 'Secret123',
      confirmPassword: 'Secret123',
    })

    await user.click(screen.getByTestId('confirm-email-login-button'))

    expect(await screen.findByTestId('login-page')).toBeInTheDocument()
  })

  it('accepts a very long password and sends it unchanged', async () => {
    const longPassword = `Aa1${'x'.repeat(200)}`
    mockConfirm.mockResolvedValue({ success: true, message: 'ok' })
    renderAt('/confirm-email?token=tok_abc')

    // fireEvent: typing 200 characters key by key twice is slow and adds nothing
    fireEvent.change(screen.getByTestId('confirm-email-password-input'), { target: { value: longPassword } })
    fireEvent.change(screen.getByTestId('confirm-email-confirm-password-input'), { target: { value: longPassword } })
    fireEvent.click(screen.getByTestId('confirm-email-submit-button'))

    await screen.findByTestId('confirm-email-success-heading')
    expect(mockConfirm.mock.calls[0][0].password).toBe(longPassword)
  })

  it('shows the backend sentence and keeps the form for an invalid token (400)', async () => {
    mockConfirm.mockRejectedValue(
      axiosError(400, { success: false, message: 'Invalid or expired confirmation token' }),
    )
    renderAt('/confirm-email?token=tok_bad')

    await fillAndSubmit()

    expect(await screen.findByTestId('confirm-email-form-error')).toHaveTextContent(
      'Invalid or expired confirmation token',
    )
    expect(screen.getByTestId('confirm-email-form')).toBeInTheDocument()
    expect(screen.queryByTestId('confirm-email-success')).not.toBeInTheDocument()
  })

  it('shows the backend error for an expired token answered with success:false', async () => {
    mockConfirm.mockResolvedValue({ success: false, message: 'Request failed', error: 'Confirmation token has expired' })
    renderAt('/confirm-email?token=tok_old')

    await fillAndSubmit()

    expect(await screen.findByTestId('confirm-email-form-error')).toHaveTextContent('Confirmation token has expired')
    expect(screen.queryByTestId('confirm-email-success')).not.toBeInTheDocument()
  })

  it('shows field errors returned by the backend under the field', async () => {
    mockConfirm.mockRejectedValue(
      axiosError(422, { success: false, errors: { password: 'Password was used recently' } }),
    )
    renderAt('/confirm-email?token=tok_abc')

    await fillAndSubmit()

    expect(await screen.findByText('Password was used recently')).toBeInTheDocument()
    expect(screen.queryByTestId('confirm-email-form-error')).not.toBeInTheDocument()
  })
})

describe('ResendConfirmationPage (SOUPFIN-189)', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.useRealTimers())

  it('pre-fills the email passed from the registration page', () => {
    renderAt({ pathname: '/resend-confirmation', state: { email: 'jane@acme.com' } })

    expect(screen.getByTestId('resend-confirmation-email-input')).toHaveValue('jane@acme.com')
    expect(screen.getByTestId('resend-confirmation-submit-button')).toBeEnabled()
  })

  it('keeps the submit disabled while the email is empty', () => {
    renderAt('/resend-confirmation')

    expect(screen.getByTestId('resend-confirmation-email-input')).toHaveValue('')
    expect(screen.getByTestId('resend-confirmation-submit-button')).toBeDisabled()
  })

  it('shows the "email sent" message and starts a cooldown on success', async () => {
    mockResend.mockResolvedValue({ success: true, message: 'Confirmation email sent' })
    renderAt('/resend-confirmation')
    const user = userEvent.setup()

    await user.type(screen.getByTestId('resend-confirmation-email-input'), 'jane@acme.com')
    await user.click(screen.getByTestId('resend-confirmation-submit-button'))

    const banner = await screen.findByTestId('resend-confirmation-success')
    expect(banner).toHaveTextContent('Confirmation email sent')
    expect(banner).toHaveTextContent('jane@acme.com')
    expect(mockResend).toHaveBeenCalledWith('jane@acme.com')
    expect(screen.getByTestId('resend-confirmation-submit-button')).toHaveTextContent(/Resend available in \d+s/)
    expect(screen.getByTestId('resend-confirmation-submit-button')).toBeDisabled()
  })

  it.each([
    ['a 404 (no such account)', axiosError(404, { success: false, message: 'No account found for this email' })],
    ['a 500', axiosError(500, '<html>Internal Server Error</html>')],
    ['a network error', axiosError(undefined)],
  ])('shows the same generic message for %s, never the error or whether the account exists', async (_label, error) => {
    mockResend.mockRejectedValue(error)
    renderAt('/resend-confirmation')
    const user = userEvent.setup()

    await user.type(screen.getByTestId('resend-confirmation-email-input'), 'ghost@acme.com')
    await user.click(screen.getByTestId('resend-confirmation-submit-button'))

    const banner = await screen.findByTestId('resend-confirmation-success')
    expect(banner).toHaveTextContent('If an account exists for ghost@acme.com')
    expect(screen.getByTestId('resend-confirmation-page').textContent).not.toMatch(
      /no account found|status code|network error|internal server error/i,
    )
  })

  it('lets the user resend again once the 60 second cooldown ends', async () => {
    vi.useFakeTimers()
    mockResend.mockResolvedValue({ success: true, message: 'ok' })
    renderAt({ pathname: '/resend-confirmation', state: { email: 'jane@acme.com' } })
    const button = screen.getByTestId('resend-confirmation-submit-button')

    fireEvent.click(button)
    // Let the mutation settle; react-query notifies through a zero-delay timer
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(screen.getByTestId('resend-confirmation-success')).toBeInTheDocument()
    expect(button).toHaveTextContent('Resend available in 60s')

    // One second short of the cooldown the button is still locked
    for (let i = 0; i < 59; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000)
      })
    }
    expect(button).toHaveTextContent('Resend available in 1s')
    expect(button).toBeDisabled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(button).toHaveTextContent('Resend Again')
    expect(button).toBeEnabled()

    fireEvent.click(button)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(mockResend).toHaveBeenCalledTimes(2)
  })
})
