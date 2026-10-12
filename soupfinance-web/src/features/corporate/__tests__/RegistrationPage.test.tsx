/**
 * Unit tests for RegistrationPage's industry field (SOUPFIN-151).
 *
 * Industry is optional. When chosen it goes into the /account/register.json
 * payload as a code, and the hint says whether it adds a COA industry overlay
 * for the selected business type.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../../../i18n'
import { RegistrationPage } from '../RegistrationPage'
import { INDUSTRY_CODES } from '../../../utils/industry'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('../../../api/endpoints/registration', () => ({
  registerTenant: vi.fn(),
}))

// Keep the shared country data; only stop the backend country fetch
vi.mock('../../../api/endpoints/domainData', async () => {
  const actual = await vi.importActual<typeof import('../../../api/endpoints/domainData')>(
    '../../../api/endpoints/domainData'
  )
  return { ...actual, listCountries: vi.fn().mockResolvedValue(actual.DEFAULT_COUNTRIES) }
})

import { registerTenant } from '../../../api/endpoints/registration'

const OVERLAY_HINT = 'Your chart of accounts will include extra accounts for this industry.'
const NO_OVERLAY_HINT = 'Your chart of accounts uses the standard template for your business type.'

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/register']}>
        <RegistrationPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByTestId('registration-company-name-input'), 'Accra Retail Ltd')
  await user.selectOptions(screen.getByTestId('registration-country-select'), 'GH')
  await user.type(screen.getByTestId('registration-admin-first-name'), 'Ama')
  await user.type(screen.getByTestId('registration-admin-last-name'), 'Mensah')
  await user.type(screen.getByTestId('registration-email-input'), 'ama@accraretail.com')
  await user.type(screen.getByTestId('registration-password-input'), 'Secret123')
  await user.type(screen.getByTestId('registration-confirm-password-input'), 'Secret123')
}

describe('RegistrationPage industry field (SOUPFIN-151)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(registerTenant).mockResolvedValue({
      success: true,
      message: 'Registration successful',
      requiresConfirmation: false,
    })
  })

  it('renders an optional industry select with every industry code', () => {
    renderPage()
    const select = screen.getByTestId('registration-industry-select')
    expect(select).toHaveValue('')
    const values = Array.from(select.querySelectorAll('option')).map((o) => o.getAttribute('value'))
    expect(values).toEqual(['', ...INDUSTRY_CODES])
    expect(screen.getByRole('combobox', { name: /^industry \(optional\)/i })).toBe(select)
    // No hint until an industry is chosen
    expect(screen.queryByTestId('registration-industry-hint')).not.toBeInTheDocument()
  })

  it('sends the chosen industry in the registration payload', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByTestId('registration-business-type-trading'))
    await user.selectOptions(screen.getByTestId('registration-industry-select'), 'retail')
    await fillRequiredFields(user)
    await user.click(screen.getByTestId('registration-submit-button'))

    await waitFor(() => expect(registerTenant).toHaveBeenCalledTimes(1))
    expect(vi.mocked(registerTenant).mock.calls[0][0]).toEqual({
      companyName: 'Accra Retail Ltd',
      businessType: 'TRADING',
      industry: 'retail',
      adminFirstName: 'Ama',
      adminLastName: 'Mensah',
      email: 'ama@accraretail.com',
      country: 'GH',
      currency: 'GHS',
      password: 'Secret123',
    })
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/login', expect.anything()))
  })

  it('registers without an industry when none is chosen', async () => {
    const user = userEvent.setup()
    renderPage()

    await fillRequiredFields(user)
    await user.click(screen.getByTestId('registration-submit-button'))

    await waitFor(() => expect(registerTenant).toHaveBeenCalledTimes(1))
    // The endpoint drops the empty value from the request body (registration.test.ts)
    expect(vi.mocked(registerTenant).mock.calls[0][0].industry).toBe('')
  })

  it('updates the overlay hint when the business type changes', async () => {
    const user = userEvent.setup()
    renderPage()

    // Default business type is SERVICES; retail only overlays a TRADING chart
    await user.selectOptions(screen.getByTestId('registration-industry-select'), 'retail')
    expect(screen.getByTestId('registration-industry-hint')).toHaveTextContent(NO_OVERLAY_HINT)

    await user.click(screen.getByTestId('registration-business-type-trading'))
    expect(screen.getByTestId('registration-industry-hint')).toHaveTextContent(OVERLAY_HINT)

    // An industry with no overlay never promises extra accounts
    await user.selectOptions(screen.getByTestId('registration-industry-select'), 'agriculture')
    expect(screen.getByTestId('registration-industry-hint')).toHaveTextContent(NO_OVERLAY_HINT)
  })
})
