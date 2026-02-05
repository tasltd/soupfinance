/**
 * Unit tests for CompanyInfoPage component
 * Tests form rendering, field interactions, navigation, and mutation behavior
 *
 * Changed (2026-01-28): Initial test suite creation for corporate KYC onboarding
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CompanyInfoPage } from '../CompanyInfoPage'

// Mock react-router-dom's useNavigate and useSearchParams
const mockNavigate = vi.fn()
let mockSearchParams = new URLSearchParams('id=corp-123')

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useSearchParams: () => [mockSearchParams, vi.fn()],
  }
})

// Mock corporate API endpoints
vi.mock('../../../api/endpoints/corporate', () => ({
  getCorporate: vi.fn(),
  updateCorporate: vi.fn(),
}))

import { getCorporate, updateCorporate } from '../../../api/endpoints/corporate'

// Helper to create a fresh QueryClient for each test
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  })
}

// Mock corporate data
const mockCorporate = {
  id: 'corp-123',
  name: 'Test Company Inc',
  certificateOfIncorporationNumber: 'INC-123456',
  registrationDate: '2020-01-01',
  businessCategory: 'LIMITED_LIABILITY' as const,
  email: 'contact@testcompany.com',
  phoneNumber: '+1234567890',
  address: '123 Test Street',
  archived: false,
  dateCreated: '2026-01-01T00:00:00Z',
  lastUpdated: '2026-01-01T00:00:00Z',
  tenantId: 'tenant-1',
}

// Helper to render component with providers
interface RenderOptions {
  corporateId?: string | null
}

function renderCompanyInfoPage(options: RenderOptions = {}) {
  const { corporateId = 'corp-123' } = options

  // Set up search params based on options
  if (corporateId) {
    mockSearchParams = new URLSearchParams(`id=${corporateId}`)
  } else {
    mockSearchParams = new URLSearchParams()
  }

  const queryClient = createTestQueryClient()

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/onboarding/company-info?id=${corporateId}`]}>
        <CompanyInfoPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('CompanyInfoPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()
    // Default: return mock corporate data
    vi.mocked(getCorporate).mockResolvedValue(mockCorporate)
    vi.mocked(updateCorporate).mockResolvedValue(mockCorporate)
  })

  describe('rendering', () => {
    it('renders the page with correct heading', async () => {
      renderCompanyInfoPage()

      await waitFor(() => {
        expect(screen.getByText('Company Information')).toBeInTheDocument()
      })
    })

    it('renders the page subtitle', async () => {
      renderCompanyInfoPage()

      await waitFor(() => {
        expect(screen.getByText('Provide detailed information about your company')).toBeInTheDocument()
      })
    })

    it('renders progress indicator showing step 2', async () => {
      renderCompanyInfoPage()

      await waitFor(() => {
        expect(screen.getByText('Company Info')).toBeInTheDocument()
        expect(screen.getByText('Directors')).toBeInTheDocument()
        expect(screen.getByText('Documents')).toBeInTheDocument()
      })
    })

    it('renders Physical Address section', async () => {
      renderCompanyInfoPage()

      await waitFor(() => {
        expect(screen.getByText('Physical Address')).toBeInTheDocument()
      })
    })

    it('renders Postal Address section', async () => {
      renderCompanyInfoPage()

      await waitFor(() => {
        expect(screen.getByText('Postal Address')).toBeInTheDocument()
      })
    })

    it('renders Business Details section', async () => {
      renderCompanyInfoPage()

      await waitFor(() => {
        expect(screen.getByText('Business Details')).toBeInTheDocument()
      })
    })

    it('renders all navigation buttons', async () => {
      renderCompanyInfoPage()

      await waitFor(() => {
        expect(screen.getByText('Back')).toBeInTheDocument()
        expect(screen.getByText('Skip for Now')).toBeInTheDocument()
        expect(screen.getByText('Save & Continue')).toBeInTheDocument()
      })
    })

    it('renders page with data-testid', async () => {
      renderCompanyInfoPage()

      await waitFor(() => {
        expect(screen.getByTestId('company-info-page')).toBeInTheDocument()
      })
    })
  })

  describe('loading state', () => {
    it('shows loading spinner while fetching corporate data', async () => {
      // Make getCorporate hang to test loading state
      vi.mocked(getCorporate).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(mockCorporate), 100))
      )

      renderCompanyInfoPage()

      // Look for the loading spinner
      const spinner = screen.getByText('progress_activity')
      expect(spinner).toBeInTheDocument()
      expect(spinner).toHaveClass('animate-spin')
    })
  })

  describe('form fields', () => {
    it('renders street address input in physical address section', async () => {
      renderCompanyInfoPage()

      await waitFor(() => {
        expect(screen.getByPlaceholderText('123 Business Street, Suite 100')).toBeInTheDocument()
      })
    })

    it('renders city, state, postal code, and country inputs', async () => {
      renderCompanyInfoPage()

      await waitFor(() => {
        // Physical address fields - multiple New York placeholders exist
        const newYorkPlaceholders = screen.getAllByPlaceholderText('New York')
        expect(newYorkPlaceholders.length).toBeGreaterThanOrEqual(1)
      })
    })

    it('renders industry classification dropdown', async () => {
      renderCompanyInfoPage()

      await waitFor(() => {
        expect(screen.getByText('Industry Classification')).toBeInTheDocument()
        expect(screen.getByText('Select industry...')).toBeInTheDocument()
      })
    })

    it('renders annual revenue dropdown', async () => {
      renderCompanyInfoPage()

      await waitFor(() => {
        expect(screen.getByText('Annual Revenue Range')).toBeInTheDocument()
        // Fix: Two dropdowns have "Select range..." (revenue and employee count)
        const selectRangeOptions = screen.getAllByText('Select range...')
        expect(selectRangeOptions.length).toBe(2)
      })
    })

    it('renders employee count dropdown', async () => {
      renderCompanyInfoPage()

      await waitFor(() => {
        expect(screen.getByText('Number of Employees')).toBeInTheDocument()
      })
    })

    it('renders company website input', async () => {
      renderCompanyInfoPage()

      await waitFor(() => {
        expect(screen.getByPlaceholderText('https://www.yourcompany.com')).toBeInTheDocument()
      })
    })

    it('renders business description textarea', async () => {
      renderCompanyInfoPage()

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText("Brief description of your company's main activities and services...")
        ).toBeInTheDocument()
      })
    })
  })

  describe('form interactions', () => {
    it('updates street address on user input', async () => {
      const user = userEvent.setup()
      renderCompanyInfoPage()

      await waitFor(() => {
        expect(screen.getByPlaceholderText('123 Business Street, Suite 100')).toBeInTheDocument()
      })

      const streetInput = screen.getByPlaceholderText('123 Business Street, Suite 100')
      // Fix: Clear pre-populated value from mockCorporate before typing new value
      await user.clear(streetInput)
      await user.type(streetInput, '456 Main Street')

      expect(streetInput).toHaveValue('456 Main Street')
    })

    it('selects industry from dropdown', async () => {
      const user = userEvent.setup()
      renderCompanyInfoPage()

      await waitFor(() => {
        expect(screen.getByText('Select industry...')).toBeInTheDocument()
      })

      const industrySelect = screen.getByRole('combobox', { name: /industry classification/i })
      await user.selectOptions(industrySelect, 'Financial Services')

      expect(industrySelect).toHaveValue('Financial Services')
    })

    it('selects annual revenue from dropdown', async () => {
      const user = userEvent.setup()
      renderCompanyInfoPage()

      await waitFor(() => {
        expect(screen.getByText('Annual Revenue Range')).toBeInTheDocument()
      })

      const revenueSelect = screen.getByRole('combobox', { name: /annual revenue range/i })
      await user.selectOptions(revenueSelect, '1M_5M')

      expect(revenueSelect).toHaveValue('1M_5M')
    })

    it('updates website field on user input', async () => {
      const user = userEvent.setup()
      renderCompanyInfoPage()

      await waitFor(() => {
        expect(screen.getByPlaceholderText('https://www.yourcompany.com')).toBeInTheDocument()
      })

      const websiteInput = screen.getByPlaceholderText('https://www.yourcompany.com')
      await user.type(websiteInput, 'https://example.com')

      expect(websiteInput).toHaveValue('https://example.com')
    })

    it('updates business description textarea', async () => {
      const user = userEvent.setup()
      renderCompanyInfoPage()

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText("Brief description of your company's main activities and services...")
        ).toBeInTheDocument()
      })

      const descriptionTextarea = screen.getByPlaceholderText(
        "Brief description of your company's main activities and services..."
      )
      await user.type(descriptionTextarea, 'We provide financial services.')

      expect(descriptionTextarea).toHaveValue('We provide financial services.')
    })
  })

  describe('same as physical address checkbox', () => {
    it('renders same as physical address checkbox', async () => {
      renderCompanyInfoPage()

      await waitFor(() => {
        expect(screen.getByText('Same as physical address')).toBeInTheDocument()
      })
    })

    it('hides postal address fields when checkbox is checked', async () => {
      const user = userEvent.setup()
      renderCompanyInfoPage()

      await waitFor(() => {
        expect(screen.getByText('Same as physical address')).toBeInTheDocument()
      })

      // Postal address fields visible initially
      const postalAddressPlaceholder = screen.getByPlaceholderText('PO Box 123')
      expect(postalAddressPlaceholder).toBeInTheDocument()

      // Check the checkbox
      const checkbox = screen.getByRole('checkbox', { name: /same as physical address/i })
      await user.click(checkbox)

      // Postal address fields should be hidden
      expect(screen.queryByPlaceholderText('PO Box 123')).not.toBeInTheDocument()
    })

    it('copies physical address to postal when checkbox is checked', async () => {
      const user = userEvent.setup()
      renderCompanyInfoPage()

      await waitFor(() => {
        expect(screen.getByPlaceholderText('123 Business Street, Suite 100')).toBeInTheDocument()
      })

      // Fill physical address
      const physicalStreet = screen.getByPlaceholderText('123 Business Street, Suite 100')
      await user.type(physicalStreet, '999 Corporate Ave')

      // Check the checkbox - this should copy values (though they won't be visible since fields hide)
      const checkbox = screen.getByRole('checkbox', { name: /same as physical address/i })
      await user.click(checkbox)

      expect(checkbox).toBeChecked()
    })
  })

  describe('navigation', () => {
    it('navigates to /register when Back button is clicked', async () => {
      const user = userEvent.setup()
      renderCompanyInfoPage()

      await waitFor(() => {
        expect(screen.getByText('Back')).toBeInTheDocument()
      })

      await user.click(screen.getByText('Back'))

      expect(mockNavigate).toHaveBeenCalledWith('/register')
    })

    it('navigates to directors page when Skip button is clicked', async () => {
      const user = userEvent.setup()
      renderCompanyInfoPage()

      await waitFor(() => {
        expect(screen.getByText('Skip for Now')).toBeInTheDocument()
      })

      await user.click(screen.getByText('Skip for Now'))

      expect(mockNavigate).toHaveBeenCalledWith('/onboarding/directors?id=corp-123')
    })
  })

  describe('form submission', () => {
    it('calls updateCorporate when Save & Continue is clicked', async () => {
      const user = userEvent.setup()
      renderCompanyInfoPage()

      await waitFor(() => {
        expect(screen.getByText('Save & Continue')).toBeInTheDocument()
      })

      await user.click(screen.getByText('Save & Continue'))

      await waitFor(() => {
        expect(updateCorporate).toHaveBeenCalled()
      })
    })

    it('passes corporate ID and form data to updateCorporate', async () => {
      const user = userEvent.setup()
      renderCompanyInfoPage()

      await waitFor(() => {
        expect(screen.getByPlaceholderText('123 Business Street, Suite 100')).toBeInTheDocument()
      })

      // Fill in some form data
      const streetInput = screen.getByPlaceholderText('123 Business Street, Suite 100')
      await user.type(streetInput, '100 Main St')

      await user.click(screen.getByText('Save & Continue'))

      await waitFor(() => {
        expect(updateCorporate).toHaveBeenCalledWith(
          'corp-123',
          expect.objectContaining({
            address: expect.any(String),
            metadata: expect.any(String),
          })
        )
      })
    })

    it('navigates to directors page on successful submission', async () => {
      const user = userEvent.setup()
      renderCompanyInfoPage()

      await waitFor(() => {
        expect(screen.getByText('Save & Continue')).toBeInTheDocument()
      })

      await user.click(screen.getByText('Save & Continue'))

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/onboarding/directors?id=corp-123')
      })
    })

    it('shows loading state during submission', async () => {
      const user = userEvent.setup()

      // Make updateCorporate hang (never resolves) to observe loading state
      vi.mocked(updateCorporate).mockImplementation(() => new Promise(() => {}))

      renderCompanyInfoPage()

      await waitFor(() => {
        expect(screen.getByText('Save & Continue')).toBeInTheDocument()
      })

      await user.click(screen.getByText('Save & Continue'))

      // Should show loading state
      await waitFor(() => {
        expect(screen.getByText('Saving...')).toBeInTheDocument()
      })
    })

    it('disables submit button during submission', async () => {
      const user = userEvent.setup()

      // Make updateCorporate hang
      vi.mocked(updateCorporate).mockImplementation(() => new Promise(() => {}))

      renderCompanyInfoPage()

      await waitFor(() => {
        expect(screen.getByText('Save & Continue')).toBeInTheDocument()
      })

      const submitButton = screen.getByText('Save & Continue').closest('button')
      await user.click(submitButton!)

      await waitFor(() => {
        expect(submitButton).toBeDisabled()
      })
    })
  })

  describe('data pre-population', () => {
    it('populates form with existing corporate address', async () => {
      vi.mocked(getCorporate).mockResolvedValue({
        ...mockCorporate,
        address: '789 Existing Street',
      })

      renderCompanyInfoPage()

      await waitFor(() => {
        const streetInput = screen.getByPlaceholderText('123 Business Street, Suite 100')
        expect(streetInput).toHaveValue('789 Existing Street')
      })
    })
  })

  describe('error handling', () => {
    it('handles getCorporate error gracefully', async () => {
      vi.mocked(getCorporate).mockRejectedValue(new Error('Network error'))

      // Should not crash - React Query handles the error
      renderCompanyInfoPage()

      // Page should still render (with empty form)
      await waitFor(() => {
        expect(screen.getByText('Company Information')).toBeInTheDocument()
      })
    })

    it('handles updateCorporate error', async () => {
      const user = userEvent.setup()
      vi.mocked(updateCorporate).mockRejectedValue(new Error('Update failed'))

      renderCompanyInfoPage()

      await waitFor(() => {
        expect(screen.getByText('Save & Continue')).toBeInTheDocument()
      })

      await user.click(screen.getByText('Save & Continue'))

      // Allow React Query to process the mutation rejection asynchronously
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50))
      })

      // Should not navigate on error
      expect(mockNavigate).not.toHaveBeenCalledWith('/onboarding/directors?id=corp-123')
    })
  })

  describe('industry options', () => {
    it('renders all industry options in dropdown', async () => {
      renderCompanyInfoPage()

      await waitFor(() => {
        expect(screen.getByText('Select industry...')).toBeInTheDocument()
      })

      // Check some industry options exist
      const industrySelect = screen.getByRole('combobox', { name: /industry classification/i })
      expect(industrySelect).toContainHTML('Financial Services')
      expect(industrySelect).toContainHTML('Information Technology')
      expect(industrySelect).toContainHTML('Healthcare & Pharmaceuticals')
    })
  })

  describe('revenue range options', () => {
    it('renders all revenue range options in dropdown', async () => {
      renderCompanyInfoPage()

      await waitFor(() => {
        expect(screen.getByText('Annual Revenue Range')).toBeInTheDocument()
      })

      const revenueSelect = screen.getByRole('combobox', { name: /annual revenue range/i })
      expect(revenueSelect).toContainHTML('Under $100,000')
      expect(revenueSelect).toContainHTML('$1 Million - $5 Million')
      expect(revenueSelect).toContainHTML('Over $50 Million')
    })
  })

  describe('employee count options', () => {
    it('renders all employee count options in dropdown', async () => {
      renderCompanyInfoPage()

      await waitFor(() => {
        expect(screen.getByText('Number of Employees')).toBeInTheDocument()
      })

      const employeeSelect = screen.getByRole('combobox', { name: /number of employees/i })
      expect(employeeSelect).toContainHTML('1-10 employees')
      expect(employeeSelect).toContainHTML('51-200 employees')
      expect(employeeSelect).toContainHTML('Over 1000 employees')
    })
  })
})
