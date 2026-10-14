/**
 * SOUPFIN-185: the public auth and registration pages render from the `auth`
 * namespace, and the language picker on AuthLayout switches them live.
 *
 * Each page gets a German render of its heading and submit label. The live
 * switch is driven through the real LanguageSwitcher, and a validation message
 * already on screen must follow the switch rather than stay in English.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import i18n from '../../../i18n'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import enAuth from '../../../i18n/locales/en/auth.json'
import deAuth from '../../../i18n/locales/de/auth.json'
import frAuth from '../../../i18n/locales/fr/auth.json'
import nlAuth from '../../../i18n/locales/nl/auth.json'
import { LoginPage } from '../LoginPage'
import { ForgotPasswordPage } from '../ForgotPasswordPage'
import { ResendConfirmationPage } from '../ResendConfirmationPage'
import { ResetPasswordPage } from '../ResetPasswordPage'
import { ConfirmEmailPage } from '../ConfirmEmailPage'
import { VerifyPage } from '../VerifyPage'
import { RegistrationPage } from '../../corporate/RegistrationPage'
import { AuthLayout } from '../../../components/layout/AuthLayout'
import { useAuthStore } from '../../../stores'
import { getLoginErrorMessage } from '../../../api/errors'

vi.mock('../../../api/auth', () => ({
  requestOTP: vi.fn().mockResolvedValue({ message: 'sent' }),
  verifyOTP: vi.fn(),
}))

vi.mock('../../../api/endpoints/domainData', async () => {
  const actual = await vi.importActual<typeof import('../../../api/endpoints/domainData')>(
    '../../../api/endpoints/domainData',
  )
  return { ...actual, listCountries: vi.fn(async () => actual.DEFAULT_COUNTRIES) }
})

function renderAt(path: string, element: ReactNode, state?: unknown) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[{ pathname: path.split('?')[0], search: path.includes('?') ? `?${path.split('?')[1]}` : '', state }]}>
        <Routes>
          <Route path="*" element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  useAuthStore.setState({
    user: null,
    isAuthenticated: false,
    isLoading: false,
    error: null,
    login: vi.fn().mockResolvedValue(undefined),
    clearError: vi.fn(),
  })
})

afterEach(async () => {
  await i18n.changeLanguage('en')
})

describe('auth pages render German (SOUPFIN-185)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('de')
  })

  const cases: Array<{
    name: string
    path: string
    element: ReactNode
    state?: unknown
    heading: string
    headingText: string
    submit: string
    submitText: string
  }> = [
    { name: 'LoginPage', path: '/login', element: <LoginPage />, heading: 'login-heading', headingText: 'Willkommen zurück', submit: 'login-submit-button', submitText: 'Anmelden' },
    { name: 'ForgotPasswordPage', path: '/forgot-password', element: <ForgotPasswordPage />, heading: 'forgot-password-heading', headingText: 'Passwort vergessen?', submit: 'forgot-password-submit-button', submitText: 'Link zum Zurücksetzen senden' },
    { name: 'ResendConfirmationPage', path: '/resend-confirmation', element: <ResendConfirmationPage />, heading: 'resend-confirmation-heading', headingText: 'Bestätigungs-E-Mail erneut senden', submit: 'resend-confirmation-submit-button', submitText: 'Bestätigungs-E-Mail senden' },
    { name: 'ResetPasswordPage', path: '/reset-password?token=abc', element: <ResetPasswordPage />, heading: 'reset-password-heading', headingText: 'Passwort zurücksetzen', submit: 'reset-password-submit-button', submitText: 'Passwort zurücksetzen' },
    { name: 'ConfirmEmailPage', path: '/confirm-email?token=abc', element: <ConfirmEmailPage />, heading: 'confirm-email-heading', headingText: 'Passwort festlegen', submit: 'confirm-email-submit-button', submitText: 'Konto aktivieren' },
    { name: 'VerifyPage', path: '/verify', element: <VerifyPage />, state: { contact: 'owner@example.com' }, heading: 'verify-heading', headingText: 'Konto bestätigen', submit: 'verify-submit-button', submitText: 'Bestätigen und fortfahren' },
    { name: 'RegistrationPage', path: '/register', element: <RegistrationPage />, heading: 'registration-heading', headingText: 'Konto erstellen', submit: 'registration-submit-button', submitText: 'Konto erstellen' },
  ]

  it.each(cases)('$name shows its heading and submit label in German', async (c) => {
    renderAt(c.path, c.element, c.state)

    expect(await screen.findByTestId(c.heading)).toHaveTextContent(c.headingText)
    expect(screen.getByTestId(c.submit)).toHaveTextContent(c.submitText)
  })

  it('keeps the email bold inside the translated success sentence, even a very long one', async () => {
    // Overflow end: a 200-character address must survive interpolation intact
    const longEmail = `${'a'.repeat(190)}@example.de`
    renderAt('/resend-confirmation', <ResendConfirmationPage />, { email: longEmail })
    const user = userEvent.setup()
    await user.click(screen.getByTestId('resend-confirmation-submit-button'))

    const banner = await screen.findByTestId('resend-confirmation-success')
    expect(banner).toHaveTextContent('Bestätigungs-E-Mail gesendet')
    expect(banner).toHaveTextContent(`Falls ein Konto für ${longEmail} existiert`)
    expect(within(banner).getByText(longEmail)).toHaveClass('font-medium')
  })

  it('interpolates the masked contact into the German "code sent" sentence', async () => {
    renderAt('/verify', <VerifyPage />, { contact: 'owner@example.com', companyName: 'Acme GmbH' })

    expect(await screen.findByText(/Wir haben einen 5-stelligen Code an/)).toHaveTextContent(
      'Wir haben einen 5-stelligen Code an ow***@example.com gesendet',
    )
    expect(screen.getByText('Acme GmbH')).toHaveClass('font-medium')
  })

  it('gives the login error from getLoginErrorMessage in German', () => {
    const rejected = { isAxiosError: true, response: { status: 401, data: { error: 'Bad credentials' } } }
    expect(getLoginErrorMessage(rejected)).toBe('Benutzername oder Passwort ist ungültig.')
    expect(getLoginErrorMessage({ isAxiosError: true })).toBe(
      'Der Server ist nicht erreichbar. Prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.',
    )
    // A message the backend wrote about the account state still comes through as sent
    const unconfirmed = { isAxiosError: true, response: { status: 403, data: { message: 'Email not confirmed' } } }
    expect(getLoginErrorMessage(unconfirmed)).toBe('Email not confirmed')
  })
})

describe('LanguageSwitcher on AuthLayout (SOUPFIN-185)', () => {
  function renderLayout(path: string, page: ReactNode) {
    const queryClient = new QueryClient()
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route element={<AuthLayout />}>
              <Route path={path} element={page} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
  }

  async function pickLanguage(nativeName: string) {
    const user = userEvent.setup()
    const picker = screen.getByTestId('auth-language-switcher')
    await user.click(within(picker).getByRole('button', { name: /language|sprache|langue|taal/i }))
    await user.click(within(picker).getByRole('option', { name: new RegExp(nativeName) }))
  }

  it('switches the sign-in page live, and back again', async () => {
    renderLayout('/login', <LoginPage />)
    expect(screen.getByTestId('login-heading')).toHaveTextContent('Welcome back')

    await pickLanguage('Deutsch')
    expect(screen.getByTestId('login-heading')).toHaveTextContent('Willkommen zurück')
    expect(screen.getByTestId('login-submit-button')).toHaveTextContent('Anmelden')
    expect(screen.getByPlaceholderText('Benutzernamen eingeben')).toBeInTheDocument()
    // The branding panel beside the form follows too
    expect(screen.getByText('Sicherheit auf Bankniveau')).toBeInTheDocument()

    await pickLanguage('Français')
    expect(screen.getByTestId('login-heading')).toHaveTextContent('Bon retour')

    await pickLanguage('Nederlands')
    expect(screen.getByTestId('login-heading')).toHaveTextContent('Welkom terug')

    await pickLanguage('English')
    expect(screen.getByTestId('login-heading')).toHaveTextContent('Welcome back')
  })

  it('re-renders a validation message already on screen in the new language', async () => {
    renderLayout('/register', <RegistrationPage />)
    const user = userEvent.setup()

    // Zero end: submit with every field empty
    await user.click(screen.getByTestId('registration-submit-button'))
    expect(screen.getByTestId('registration-company-name-error')).toHaveTextContent('Company name is required')
    expect(screen.getByTestId('registration-password-error')).toHaveTextContent('Password is required')

    await pickLanguage('Deutsch')
    expect(screen.getByTestId('registration-company-name-error')).toHaveTextContent('Firmenname ist erforderlich')
    expect(screen.getByTestId('registration-password-error')).toHaveTextContent('Passwort ist erforderlich')
  })

  it('translates the password rules on registration (min length, then each character class)', async () => {
    renderLayout('/register', <RegistrationPage />)
    await pickLanguage('Deutsch')
    // No per-keystroke delay: four type-and-submit rounds outlast 5 s on a busy full run
    const user = userEvent.setup({ delay: null })
    const password = screen.getByTestId('registration-password-input')
    const error = () => screen.getByTestId('registration-password-error')

    const rules: Array<[string, string]> = [
      ['short', 'Das Passwort muss mindestens 8 Zeichen lang sein'],
      ['lowercase1', 'Das Passwort muss einen Großbuchstaben enthalten'],
      ['UPPERCASE1', 'Das Passwort muss einen Kleinbuchstaben enthalten'],
      ['NoDigitsHere', 'Das Passwort muss eine Ziffer enthalten'],
    ]
    for (const [value, expected] of rules) {
      await user.clear(password)
      await user.type(password, value)
      await user.click(screen.getByTestId('registration-submit-button'))
      expect(error()).toHaveTextContent(expected)
    }
  }, 15000)
})

describe('auth locale files (SOUPFIN-185)', () => {
  function flatten(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
    return Object.entries(obj).reduce<Record<string, string>>((acc, [key, value]) => {
      if (value && typeof value === 'object') Object.assign(acc, flatten(value as Record<string, unknown>, `${prefix}${key}.`))
      else acc[`${prefix}${key}`] = String(value)
      return acc
    }, {})
  }
  const en = flatten(enAuth)
  const placeholders = (s: string) => (s.match(/\{\{\w+\}\}|<\w+>/g) ?? []).sort()

  it.each([
    ['de', deAuth],
    ['fr', frAuth],
    ['nl', nlAuth],
  ])('%s has every English key, no empty value, and the same placeholders', (_lang, file) => {
    const other = flatten(file as Record<string, unknown>)
    expect(Object.keys(other).sort()).toEqual(Object.keys(en).sort())
    for (const [key, value] of Object.entries(other)) {
      expect(value.trim(), key).not.toBe('')
      expect(placeholders(value), key).toEqual(placeholders(en[key]))
    }
  })
})
