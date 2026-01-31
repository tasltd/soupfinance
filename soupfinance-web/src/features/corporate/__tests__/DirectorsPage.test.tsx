/**
 * Unit tests for DirectorsPage component
 * Tests director list, CRUD modal interactions, and navigation
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DirectorsPage } from '../DirectorsPage'
import * as corporateApi from '../../../api/endpoints/corporate'
import type { CorporateAccountPerson } from '../../../types'

// Mock corporate API endpoints
vi.mock('../../../api/endpoints/corporate', () => ({
  listDirectors: vi.fn(),
  addDirector: vi.fn(),
  updateDirector: vi.fn(),
  deleteDirector: vi.fn(),
}))

// Mock react-router-dom hooks
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

// Mock director data
const mockDirectors: CorporateAccountPerson[] = [
  {
    id: 'dir-001',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@company.com',
    phoneNumber: '+1 555-0101',
    role: 'DIRECTOR',
    corporate: { id: 'corp-001' },
    archived: false,
    dateCreated: '2024-01-15T10:00:00Z',
    lastUpdated: '2024-01-15T10:00:00Z',
    tenantId: 'tenant-001',
  },
  {
    id: 'dir-002',
    firstName: 'Jane',
    lastName: 'Smith',
    email: 'jane.smith@company.com',
    phoneNumber: '+1 555-0102',
    role: 'SIGNATORY',
    corporate: { id: 'corp-001' },
    archived: false,
    dateCreated: '2024-01-15T10:00:00Z',
    lastUpdated: '2024-01-15T10:00:00Z',
    tenantId: 'tenant-001',
  },
]

// Helper to render DirectorsPage with required providers
function renderDirectorsPage(corporateId = 'corp-001') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/onboarding/directors?id=${corporateId}`]}>
        <DirectorsPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('DirectorsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(corporateApi.listDirectors).mockResolvedValue(mockDirectors)
    vi.mocked(corporateApi.addDirector).mockResolvedValue(mockDirectors[0])
    vi.mocked(corporateApi.updateDirector).mockResolvedValue(mockDirectors[0])
    vi.mocked(corporateApi.deleteDirector).mockResolvedValue(undefined)
  })

  describe('page rendering', () => {
    it('renders page with correct title', async () => {
      renderDirectorsPage()

      await waitFor(() => {
        expect(screen.getByText('Directors & Signatories')).toBeInTheDocument()
      })
    })

    it('renders page description', async () => {
      renderDirectorsPage()

      await waitFor(() => {
        expect(
          screen.getByText('Add directors, authorized signatories, and beneficial owners')
        ).toBeInTheDocument()
      })
    })

    it('renders progress indicator showing step 3', async () => {
      renderDirectorsPage()

      await waitFor(() => {
        expect(screen.getByText('Registration')).toBeInTheDocument()
        expect(screen.getByText('Company Info')).toBeInTheDocument()
        expect(screen.getByText('Directors')).toBeInTheDocument()
        expect(screen.getByText('Documents')).toBeInTheDocument()
      })
    })

    it('renders Back button', async () => {
      renderDirectorsPage()

      await waitFor(() => {
        expect(screen.getByText('Back')).toBeInTheDocument()
      })
    })

    it('renders Continue button', async () => {
      renderDirectorsPage()

      await waitFor(() => {
        expect(screen.getByText('Continue to Documents')).toBeInTheDocument()
      })
    })

    it('renders Add Person button', async () => {
      renderDirectorsPage()

      await waitFor(() => {
        expect(screen.getByText('Add Person')).toBeInTheDocument()
      })
    })
  })

  describe('directors list', () => {
    it('displays director count in action bar', async () => {
      renderDirectorsPage()

      await waitFor(() => {
        expect(screen.getByText('2 people added')).toBeInTheDocument()
      })
    })

    it('displays singular text for single director', async () => {
      vi.mocked(corporateApi.listDirectors).mockResolvedValue([mockDirectors[0]])
      renderDirectorsPage()

      await waitFor(() => {
        expect(screen.getByText('1 person added')).toBeInTheDocument()
      })
    })

    it('renders directors table with correct headers', async () => {
      renderDirectorsPage()

      await waitFor(() => {
        expect(screen.getByText('Name')).toBeInTheDocument()
        expect(screen.getByText('Email')).toBeInTheDocument()
        expect(screen.getByText('Phone')).toBeInTheDocument()
        expect(screen.getByText('Role')).toBeInTheDocument()
        expect(screen.getByText('Actions')).toBeInTheDocument()
      })
    })

    it('displays director names correctly', async () => {
      renderDirectorsPage()

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument()
        expect(screen.getByText('Jane Smith')).toBeInTheDocument()
      })
    })

    it('displays director emails correctly', async () => {
      renderDirectorsPage()

      await waitFor(() => {
        expect(screen.getByText('john.doe@company.com')).toBeInTheDocument()
        expect(screen.getByText('jane.smith@company.com')).toBeInTheDocument()
      })
    })

    it('displays director phone numbers correctly', async () => {
      renderDirectorsPage()

      await waitFor(() => {
        expect(screen.getByText('+1 555-0101')).toBeInTheDocument()
        expect(screen.getByText('+1 555-0102')).toBeInTheDocument()
      })
    })

    it('displays role badges with correct labels', async () => {
      renderDirectorsPage()

      await waitFor(() => {
        expect(screen.getByText('Director')).toBeInTheDocument()
        expect(screen.getByText('Authorized Signatory')).toBeInTheDocument()
      })
    })

    it('renders edit buttons for each director', async () => {
      renderDirectorsPage()

      await waitFor(() => {
        const editButtons = screen.getAllByTitle('Edit')
        expect(editButtons).toHaveLength(2)
      })
    })

    it('renders delete buttons for each director', async () => {
      renderDirectorsPage()

      await waitFor(() => {
        const deleteButtons = screen.getAllByTitle('Delete')
        expect(deleteButtons).toHaveLength(2)
      })
    })
  })

  describe('empty state', () => {
    beforeEach(() => {
      vi.mocked(corporateApi.listDirectors).mockResolvedValue([])
    })

    it('displays empty state when no directors exist', async () => {
      renderDirectorsPage()

      await waitFor(() => {
        expect(screen.getByText('No directors added yet')).toBeInTheDocument()
      })
    })

    it('displays empty state description', async () => {
      renderDirectorsPage()

      await waitFor(() => {
        expect(
          screen.getByText(/Add at least one director or authorized signatory/)
        ).toBeInTheDocument()
      })
    })

    it('displays Add First Person button in empty state', async () => {
      renderDirectorsPage()

      await waitFor(() => {
        expect(screen.getByText('Add First Person')).toBeInTheDocument()
      })
    })

    it('shows 0 people added in action bar', async () => {
      renderDirectorsPage()

      await waitFor(() => {
        expect(screen.getByText('0 people added')).toBeInTheDocument()
      })
    })

    it('disables Continue button when no directors', async () => {
      renderDirectorsPage()

      await waitFor(() => {
        const continueButton = screen.getByText('Continue to Documents').closest('button')
        expect(continueButton).toBeDisabled()
      })
    })
  })

  describe('loading state', () => {
    it('shows loading spinner while fetching directors', async () => {
      // Delay the API response
      vi.mocked(corporateApi.listDirectors).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(mockDirectors), 500))
      )

      renderDirectorsPage()

      // Changed: Use within to find the spinner inside the table area
      await waitFor(() => {
        expect(screen.getByTestId('directors-page')).toBeInTheDocument()
      })

      // The spinner should be visible during loading
      const spinner = document.querySelector('.animate-spin')
      expect(spinner).toBeInTheDocument()
    })
  })

  describe('add person modal', () => {
    it('opens modal when Add Person is clicked', async () => {
      const user = userEvent.setup()
      renderDirectorsPage()

      await waitFor(() => {
        expect(screen.getByText('Add Person')).toBeInTheDocument()
      })

      await user.click(screen.getByText('Add Person'))

      // Changed: Check for Add Person modal title
      await waitFor(() => {
        // Modal should have the title "Add Person" when not editing
        const modalTitle = screen.getByRole('heading', { level: 3 })
        expect(modalTitle).toHaveTextContent('Add Person')
      })
    })

    it('renders first name input in modal', async () => {
      const user = userEvent.setup()
      renderDirectorsPage()

      await waitFor(() => {
        expect(screen.getByText('Add Person')).toBeInTheDocument()
      })

      await user.click(screen.getByText('Add Person'))

      await waitFor(() => {
        expect(screen.getByPlaceholderText('John')).toBeInTheDocument()
      })
    })

    it('renders last name input in modal', async () => {
      const user = userEvent.setup()
      renderDirectorsPage()

      await waitFor(() => {
        expect(screen.getByText('Add Person')).toBeInTheDocument()
      })

      await user.click(screen.getByText('Add Person'))

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Doe')).toBeInTheDocument()
      })
    })

    it('renders email input in modal', async () => {
      const user = userEvent.setup()
      renderDirectorsPage()

      await waitFor(() => {
        expect(screen.getByText('Add Person')).toBeInTheDocument()
      })

      await user.click(screen.getByText('Add Person'))

      await waitFor(() => {
        expect(screen.getByPlaceholderText('john.doe@company.com')).toBeInTheDocument()
      })
    })

    it('renders phone input in modal', async () => {
      const user = userEvent.setup()
      renderDirectorsPage()

      await waitFor(() => {
        expect(screen.getByText('Add Person')).toBeInTheDocument()
      })

      await user.click(screen.getByText('Add Person'))

      await waitFor(() => {
        expect(screen.getByPlaceholderText('+1 (555) 123-4567')).toBeInTheDocument()
      })
    })

    it('renders role dropdown in modal', async () => {
      const user = userEvent.setup()
      renderDirectorsPage()

      await waitFor(() => {
        expect(screen.getByText('Add Person')).toBeInTheDocument()
      })

      await user.click(screen.getByText('Add Person'))

      await waitFor(() => {
        // Check for role dropdown options
        const roleSelect = screen.getByRole('combobox')
        expect(roleSelect).toBeInTheDocument()
      })
    })

    it('closes modal when Cancel is clicked', async () => {
      const user = userEvent.setup()
      renderDirectorsPage()

      await waitFor(() => {
        expect(screen.getByText('Add Person')).toBeInTheDocument()
      })

      await user.click(screen.getByText('Add Person'))

      await waitFor(() => {
        expect(screen.getByPlaceholderText('John')).toBeInTheDocument()
      })

      // Click Cancel button
      await user.click(screen.getByText('Cancel'))

      await waitFor(() => {
        expect(screen.queryByPlaceholderText('John')).not.toBeInTheDocument()
      })
    })

    it('closes modal when X button is clicked', async () => {
      const user = userEvent.setup()
      renderDirectorsPage()

      await waitFor(() => {
        expect(screen.getByText('Add Person')).toBeInTheDocument()
      })

      await user.click(screen.getByText('Add Person'))

      await waitFor(() => {
        expect(screen.getByPlaceholderText('John')).toBeInTheDocument()
      })

      // Fix: Find the close button (X icon) by searching for button with close icon text
      const closeButtons = document.querySelectorAll('button')
      const xButton = Array.from(closeButtons).find(
        (btn) => btn.querySelector('.material-symbols-outlined')?.textContent === 'close'
      )
      expect(xButton).toBeTruthy()
      if (xButton) await user.click(xButton)

      await waitFor(() => {
        expect(screen.queryByPlaceholderText('John')).not.toBeInTheDocument()
      })
    })

    it('submits form and calls addDirector API', async () => {
      const user = userEvent.setup()
      renderDirectorsPage()

      await waitFor(() => {
        expect(screen.getByText('Add Person')).toBeInTheDocument()
      })

      await user.click(screen.getByText('Add Person'))

      await waitFor(() => {
        expect(screen.getByPlaceholderText('John')).toBeInTheDocument()
      })

      // Fill form
      await user.type(screen.getByPlaceholderText('John'), 'New')
      await user.type(screen.getByPlaceholderText('Doe'), 'Director')
      await user.type(screen.getByPlaceholderText('john.doe@company.com'), 'new@company.com')
      await user.type(screen.getByPlaceholderText('+1 (555) 123-4567'), '+1 555-9999')

      // Submit form - find the submit button in modal footer
      const submitButton = screen.getAllByRole('button').find(
        (btn) => btn.textContent?.includes('Add Person') && btn.getAttribute('type') === 'submit'
      )
      if (submitButton) await user.click(submitButton)

      await waitFor(() => {
        expect(corporateApi.addDirector).toHaveBeenCalled()
      })
    })
  })

  describe('edit person modal', () => {
    it('opens edit modal with pre-filled data', async () => {
      const user = userEvent.setup()
      renderDirectorsPage()

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument()
      })

      // Click first edit button
      const editButtons = screen.getAllByTitle('Edit')
      await user.click(editButtons[0])

      await waitFor(() => {
        const modalTitle = screen.getByRole('heading', { level: 3 })
        expect(modalTitle).toHaveTextContent('Edit Person')
      })

      // Check form is pre-filled
      expect(screen.getByDisplayValue('John')).toBeInTheDocument()
      expect(screen.getByDisplayValue('Doe')).toBeInTheDocument()
      expect(screen.getByDisplayValue('john.doe@company.com')).toBeInTheDocument()
    })

    it('calls updateDirector API on edit submit', async () => {
      const user = userEvent.setup()
      renderDirectorsPage()

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument()
      })

      // Click first edit button
      const editButtons = screen.getAllByTitle('Edit')
      await user.click(editButtons[0])

      await waitFor(() => {
        expect(screen.getByDisplayValue('John')).toBeInTheDocument()
      })

      // Update the first name
      const firstNameInput = screen.getByDisplayValue('John')
      await user.clear(firstNameInput)
      await user.type(firstNameInput, 'Jonathan')

      // Click Update button
      await user.click(screen.getByText('Update Person'))

      await waitFor(() => {
        expect(corporateApi.updateDirector).toHaveBeenCalledWith('dir-001', expect.objectContaining({
          firstName: 'Jonathan',
        }))
      })
    })
  })

  describe('delete confirmation modal', () => {
    it('opens delete confirmation when delete is clicked', async () => {
      const user = userEvent.setup()
      renderDirectorsPage()

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument()
      })

      // Click first delete button
      const deleteButtons = screen.getAllByTitle('Delete')
      await user.click(deleteButtons[0])

      await waitFor(() => {
        expect(screen.getByText('Remove Person?')).toBeInTheDocument()
      })
    })

    it('shows warning message in delete confirmation', async () => {
      const user = userEvent.setup()
      renderDirectorsPage()

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument()
      })

      const deleteButtons = screen.getAllByTitle('Delete')
      await user.click(deleteButtons[0])

      await waitFor(() => {
        expect(
          screen.getByText(/This will remove this person from the KYC submission/)
        ).toBeInTheDocument()
      })
    })

    it('closes delete modal when Cancel is clicked', async () => {
      const user = userEvent.setup()
      renderDirectorsPage()

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument()
      })

      const deleteButtons = screen.getAllByTitle('Delete')
      await user.click(deleteButtons[0])

      await waitFor(() => {
        expect(screen.getByText('Remove Person?')).toBeInTheDocument()
      })

      // Find cancel button in delete modal
      const modalCancelButtons = screen.getAllByText('Cancel')
      const deleteModalCancel = modalCancelButtons.find(btn =>
        btn.closest('.fixed')?.querySelector('h3')?.textContent?.includes('Remove')
      )
      if (deleteModalCancel) await user.click(deleteModalCancel)

      await waitFor(() => {
        expect(screen.queryByText('Remove Person?')).not.toBeInTheDocument()
      })
    })

    it('calls deleteDirector API when Remove is confirmed', async () => {
      const user = userEvent.setup()
      renderDirectorsPage()

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument()
      })

      // Click the delete button for the first director (John Doe)
      const deleteButtons = screen.getAllByTitle('Delete')
      expect(deleteButtons.length).toBe(2) // Two directors, two delete buttons
      await user.click(deleteButtons[0])

      // Wait for the confirmation modal to appear
      await waitFor(() => {
        expect(screen.getByText('Remove Person?')).toBeInTheDocument()
      })

      // Added: Use data-testid for reliable button selection
      const removeButton = screen.getByTestId('confirm-delete-button')
      expect(removeButton).toBeInTheDocument()

      // Click the Remove button to confirm deletion
      await user.click(removeButton)

      // Wait for the mutation to be called
      // Note: React Query v5 passes a mutation context as second arg, so we check first arg only
      await waitFor(
        () => {
          expect(corporateApi.deleteDirector).toHaveBeenCalled()
          expect(vi.mocked(corporateApi.deleteDirector).mock.calls[0][0]).toBe('dir-001')
        },
        { timeout: 2000 }
      )
    })
  })

  describe('navigation', () => {
    it('navigates back to company info on Back click', async () => {
      const user = userEvent.setup()
      renderDirectorsPage()

      await waitFor(() => {
        expect(screen.getByText('Back')).toBeInTheDocument()
      })

      await user.click(screen.getByText('Back'))

      expect(mockNavigate).toHaveBeenCalledWith('/onboarding/company?id=corp-001')
    })

    it('navigates to documents on Continue click when directors exist', async () => {
      const user = userEvent.setup()
      renderDirectorsPage()

      await waitFor(() => {
        expect(screen.getByText('Continue to Documents')).toBeInTheDocument()
      })

      await user.click(screen.getByText('Continue to Documents'))

      expect(mockNavigate).toHaveBeenCalledWith('/onboarding/documents?id=corp-001')
    })

    it('does not navigate when Continue is clicked with no directors', async () => {
      vi.mocked(corporateApi.listDirectors).mockResolvedValue([])
      renderDirectorsPage()

      await waitFor(() => {
        expect(screen.getByText('Continue to Documents')).toBeInTheDocument()
      })

      // Button should be disabled
      const continueButton = screen.getByText('Continue to Documents').closest('button')
      expect(continueButton).toBeDisabled()
    })
  })

  describe('API interactions', () => {
    it('calls listDirectors with correct corporate ID', async () => {
      renderDirectorsPage('corp-test-123')

      await waitFor(() => {
        expect(corporateApi.listDirectors).toHaveBeenCalledWith('corp-test-123')
      })
    })

    it('does not call listDirectors when no corporate ID', async () => {
      render(
        <QueryClientProvider
          client={
            new QueryClient({
              defaultOptions: { queries: { retry: false, gcTime: 0 } },
            })
          }
        >
          <MemoryRouter initialEntries={['/onboarding/directors']}>
            <DirectorsPage />
          </MemoryRouter>
        </QueryClientProvider>
      )

      // Wait a bit and verify API was not called
      await new Promise((resolve) => setTimeout(resolve, 100))
      expect(corporateApi.listDirectors).not.toHaveBeenCalled()
    })
  })

  describe('role options', () => {
    it('includes Director option in role dropdown', async () => {
      const user = userEvent.setup()
      renderDirectorsPage()

      await waitFor(() => {
        expect(screen.getByText('Add Person')).toBeInTheDocument()
      })

      await user.click(screen.getByText('Add Person'))

      await waitFor(() => {
        const roleSelect = screen.getByRole('combobox')
        const options = within(roleSelect).getAllByRole('option')
        expect(options.some((opt) => opt.textContent === 'Director')).toBe(true)
      })
    })

    it('includes Authorized Signatory option in role dropdown', async () => {
      const user = userEvent.setup()
      renderDirectorsPage()

      await waitFor(() => {
        expect(screen.getByText('Add Person')).toBeInTheDocument()
      })

      await user.click(screen.getByText('Add Person'))

      await waitFor(() => {
        const roleSelect = screen.getByRole('combobox')
        const options = within(roleSelect).getAllByRole('option')
        expect(options.some((opt) => opt.textContent === 'Authorized Signatory')).toBe(true)
      })
    })

    it('includes Beneficial Owner option in role dropdown', async () => {
      const user = userEvent.setup()
      renderDirectorsPage()

      await waitFor(() => {
        expect(screen.getByText('Add Person')).toBeInTheDocument()
      })

      await user.click(screen.getByText('Add Person'))

      await waitFor(() => {
        const roleSelect = screen.getByRole('combobox')
        const options = within(roleSelect).getAllByRole('option')
        expect(options.some((opt) => opt.textContent === 'Beneficial Owner')).toBe(true)
      })
    })
  })
})
