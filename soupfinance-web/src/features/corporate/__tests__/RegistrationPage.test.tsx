/**
 * Added (SOUPFIN-189): RegistrationPage unit tests.
 *
 * Covers:
 * - Client-side validation: empty form, password rules, confirm mismatch
 * - Payload sent to registerTenant (country maps to currency)
 * - Success branches: single-step (→ /login) and email confirmation
 *   ("Check Your Email" + Resend link carrying the email)
 * - Backend failures: field errors, 4xx message surfaced, never the raw
 *   "Request failed with status code" text
 *
 * registerTenant is mocked; getApiErrorMessage is the real implementation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RegistrationPage } from '../RegistrationPage'

vi.mock('../../../api/endpoints/registration', async () => {
  const actual = await vi.importActual<typeof import('../../../api/endpoints/registration')>(
    '../../../api/endpoints/registration',
  )
  return { ...actual, registerTenant: vi.fn() }
})

import { registerTenant } from '../../../api/endpoints/registration'

const mockRegister = registerTenant as ReturnType<typeof vi.fn>

const VALID = {
  companyName: 'Acme Services Ltd',
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane@acme.com',
  password: 'Secret123',
}

function axiosError(status: number | undefined, data?: unknown) {
  return {
    isAxiosError: true,
    message: status ? `Request failed with status code ${status}` : 'Network Error',
    response: status === undefined ? undefined : { status, data },
    config: { url: '/account/register.json' },
  }
}

// Renders the route state so tests can assert what was handed to the next page
function StateProbe({ testId }: { testId: string }) {
  const location = useLocation()
  return <pre data-testid={testId}>{JSON.stringify(location.state)}</pre>
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/register']}>
        <Routes>
          <Route path="/register" element={<RegistrationPage />} />
          <Route path="/login" element={<StateProbe testId="login-page" />} />
          <Route path="/resend-confirmation" element={<StateProbe testId="resend-page" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// fireEvent.change rather than user.type: the page only reads name/value, and
// typing seven fields key by key times out when the whole suite runs in parallel
async function fillForm(overrides: Partial<typeof VALID & { confirm: string; country: string }> = {}) {
  const v = { ...VALID, confirm: overrides.password ?? VALID.password, country: 'GH', ...overrides }
  const set = (testId: string, value: string) => {
    if (value) fireEvent.change(screen.getByTestId(testId), { target: { value } })
  }
  set('registration-company-name-input', v.companyName)
  set('registration-country-select', v.country)
  set('registration-admin-first-name', v.firstName)
  set('registration-admin-last-name', v.lastName)
  set('registration-email-input', v.email)
  set('registration-password-input', v.password)
  set('registration-confirm-password-input', v.confirm)
  return userEvent.setup()
}

async function submit(user = userEvent.setup()) {
  await user.click(screen.getByTestId('registration-submit-button'))
}

describe('RegistrationPage (SOUPFIN-189)', () => {
  beforeEach(() => vi.clearAllMocks())

  describe('validation', () => {
    it('flags every required field on an empty submit and sends nothing', async () => {
      renderPage()

      await submit()

      expect(screen.getByTestId('registration-company-name-error')).toHaveTextContent('Company name is required')
      expect(screen.getByTestId('registration-country-error')).toHaveTextContent('Please select your country')
      expect(screen.getByText('First name is required')).toBeInTheDocument()
      expect(screen.getByText('Last name is required')).toBeInTheDocument()
      expect(screen.getByTestId('registration-email-error')).toHaveTextContent('Email is required')
      expect(screen.getByTestId('registration-password-error')).toHaveTextContent('Password is required')
      expect(mockRegister).not.toHaveBeenCalled()
    })

    it('rejects a malformed email', async () => {
      renderPage()
      const user = await fillForm({ email: 'jane@acme' })

      await submit(user)

      expect(screen.getByTestId('registration-email-error')).toHaveTextContent('Please enter a valid email address')
      expect(mockRegister).not.toHaveBeenCalled()
    })

    it.each([
      ['Short1', 'Password must be at least 8 characters'],
      ['lowercase123', 'Password must include an uppercase letter'],
      ['UPPERCASE123', 'Password must include a lowercase letter'],
      ['NoDigitsHere', 'Password must include a number'],
    ])('rejects password %s: %s', async (password, message) => {
      renderPage()
      const user = await fillForm({ password })

      await submit(user)

      expect(screen.getByTestId('registration-password-error')).toHaveTextContent(message)
      expect(mockRegister).not.toHaveBeenCalled()
    })

    it('rejects a confirm password that does not match', async () => {
      renderPage()
      const user = await fillForm({ password: 'Secret123', confirm: 'Secret124' })

      await submit(user)

      expect(screen.getByTestId('registration-confirm-password-error')).toHaveTextContent('Passwords do not match')
      expect(screen.queryByTestId('registration-password-error')).not.toBeInTheDocument()
      expect(mockRegister).not.toHaveBeenCalled()
    })

    it('clears a field error once the user edits that field', async () => {
      renderPage()
      const user = userEvent.setup()
      await submit(user)
      expect(screen.getByTestId('registration-company-name-error')).toBeInTheDocument()

      await user.type(screen.getByTestId('registration-company-name-input'), 'A')

      expect(screen.queryByTestId('registration-company-name-error')).not.toBeInTheDocument()
    })

    it('accepts a very long password and sends it unchanged', async () => {
      const longPassword = `Aa1${'x'.repeat(200)}`
      mockRegister.mockResolvedValue({ success: true, message: 'ok', requiresConfirmation: false })
      renderPage()
      const user = await fillForm({ password: longPassword })

      await submit(user)

      await screen.findByTestId('login-page')
      expect(mockRegister.mock.calls[0][0].password).toBe(longPassword)
    })
  })

  describe('success', () => {
    it('sends the form with the currency mapped from the country, then goes to /login (single-step)', async () => {
      mockRegister.mockResolvedValue({ success: true, message: 'ok', requiresConfirmation: false })
      renderPage()
      const user = await fillForm()
      await user.click(screen.getByTestId('registration-business-type-trading'))

      await submit(user)

      const login = await screen.findByTestId('login-page')
      expect(JSON.parse(login.textContent || 'null')).toEqual({
        fromRegistration: true,
        registeredEmail: 'jane@acme.com',
      })
      expect(mockRegister).toHaveBeenCalledTimes(1)
      expect(mockRegister.mock.calls[0][0]).toEqual({
        companyName: 'Acme Services Ltd',
        businessType: 'TRADING',
        adminFirstName: 'Jane',
        adminLastName: 'Doe',
        email: 'jane@acme.com',
        country: 'GH',
        currency: 'GHS',
        password: 'Secret123',
      })
      // confirmPassword is form-only state
      expect(mockRegister.mock.calls[0][0]).not.toHaveProperty('confirmPassword')
    })

    it('shows "Check Your Email" with a Resend link that carries the email (confirmation required)', async () => {
      mockRegister.mockResolvedValue({ success: true, message: 'ok', requiresConfirmation: true })
      renderPage()
      const user = await fillForm()

      await submit(user)

      expect(await screen.findByTestId('registration-success-heading')).toHaveTextContent('Check Your Email')
      expect(screen.getByTestId('registration-success')).toHaveTextContent('jane@acme.com')

      await user.click(screen.getByRole('button', { name: 'Resend confirmation' }))

      const resend = await screen.findByTestId('resend-page')
      expect(JSON.parse(resend.textContent || 'null')).toEqual({ email: 'jane@acme.com' })
    })

    it('treats a missing requiresConfirmation flag as the email-confirmation flow', async () => {
      mockRegister.mockResolvedValue({ success: true, message: 'ok' })
      renderPage()
      const user = await fillForm()

      await submit(user)

      expect(await screen.findByTestId('registration-success-heading')).toBeInTheDocument()
      expect(screen.queryByTestId('login-page')).not.toBeInTheDocument()
    })
  })

  describe('backend failures', () => {
    it('shows field errors returned with success:false', async () => {
      mockRegister.mockResolvedValue({
        success: false,
        message: 'Validation failed',
        errors: { email: 'An account with this email already exists' },
      })
      renderPage()
      const user = await fillForm()

      await submit(user)

      expect(await screen.findByTestId('registration-email-error')).toHaveTextContent(
        'An account with this email already exists',
      )
      expect(screen.queryByTestId('registration-success')).not.toBeInTheDocument()
    })

    it('shows the backend sentence for a 400 with a message', async () => {
      mockRegister.mockRejectedValue(axiosError(400, { success: false, message: 'Company name already taken' }))
      renderPage()
      const user = await fillForm()

      await submit(user)

      expect(await screen.findByTestId('registration-form-error')).toHaveTextContent('Company name already taken')
    })

    it('shows field errors from a 422 body', async () => {
      mockRegister.mockRejectedValue(
        axiosError(422, { success: false, errors: { companyName: 'Company name is too long' } }),
      )
      renderPage()
      const user = await fillForm()

      await submit(user)

      expect(await screen.findByTestId('registration-company-name-error')).toHaveTextContent(
        'Company name is too long',
      )
    })

    it.each([
      ['a 400 with an empty body', axiosError(400, '')],
      ['a 403 with an empty body', axiosError(403, '')],
      ['a network error', axiosError(undefined)],
      ['a 500 HTML error page', axiosError(500, `<html><body>${'x'.repeat(5000)}</body></html>`)],
    ])('never shows the raw status text for %s', async (_label, error) => {
      mockRegister.mockRejectedValue(error)
      renderPage()
      const user = await fillForm()

      await submit(user)

      const banner = await screen.findByTestId('registration-form-error')
      expect(banner.textContent).not.toMatch(/status code|network error|<html/i)
      expect(banner.textContent?.trim()).not.toBe('')
      // The form stays so the user can correct and retry
      expect(screen.getByTestId('registration-form')).toBeInTheDocument()
    })
  })
})
