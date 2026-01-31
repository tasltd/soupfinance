/**
 * Unit tests for VerifyPage component
 * Tests OTP verification flow including:
 * - Automatic OTP request on mount
 * - OTP input handling (typing, paste, backspace)
 * - Form submission and verification
 * - Resend functionality with cooldown
 * - Error states and redirects
 *
 * Changed (2026-01-28): Created to verify OTP auto-request fix
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { VerifyPage } from '../VerifyPage'
import { useAuthStore } from '../../../stores'

// Mock react-router-dom's useNavigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

// Mock auth API
vi.mock('../../../api/auth', () => ({
  requestOTP: vi.fn(),
  verifyOTP: vi.fn(),
}))

import * as authApi from '../../../api/auth'

// Helper to create a fresh QueryClient for each test
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

// Helper to render with router and location state
interface RenderOptions {
  contact?: string
  corporateId?: string
  companyName?: string
}

function renderVerifyPage(options: RenderOptions = {}) {
  const queryClient = createTestQueryClient()
  const initialEntries = options.contact
    ? [{ pathname: '/verify', state: options }]
    : ['/verify']

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <VerifyPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('VerifyPage', () => {
  beforeEach(() => {
    // Reset auth store to initial state
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      setAuthenticated: vi.fn(),
    })
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('rendering', () => {
    it('renders the verify page with contact info', async () => {
      vi.mocked(authApi.requestOTP).mockResolvedValue({ message: 'OTP sent' })

      renderVerifyPage({ contact: 'test@example.com' })

      expect(screen.getByTestId('verify-page')).toBeInTheDocument()
      expect(screen.getByTestId('verify-heading')).toHaveTextContent('Verify Your Account')
      expect(screen.getByText(/te\*\*\*@example\.com/)).toBeInTheDocument()
    })

    it('displays company name when provided', async () => {
      vi.mocked(authApi.requestOTP).mockResolvedValue({ message: 'OTP sent' })

      renderVerifyPage({
        contact: 'test@example.com',
        companyName: 'Acme Corp',
      })

      expect(screen.getByText(/Setting up/)).toBeInTheDocument()
      expect(screen.getByText('Acme Corp')).toBeInTheDocument()
    })

    it('renders 5 OTP input fields', async () => {
      vi.mocked(authApi.requestOTP).mockResolvedValue({ message: 'OTP sent' })

      renderVerifyPage({ contact: 'test@example.com' })

      expect(screen.getByTestId('verify-otp-inputs')).toBeInTheDocument()
      for (let i = 0; i < 5; i++) {
        expect(screen.getByTestId(`verify-otp-input-${i}`)).toBeInTheDocument()
      }
    })

    it('renders submit and resend buttons', async () => {
      vi.mocked(authApi.requestOTP).mockResolvedValue({ message: 'OTP sent' })

      renderVerifyPage({ contact: 'test@example.com' })

      expect(screen.getByTestId('verify-submit-button')).toBeInTheDocument()
      // Resend button appears after cooldown or initially
      await waitFor(() => {
        expect(screen.getByText(/Resend/i)).toBeInTheDocument()
      })
    })
  })

  describe('automatic OTP request on mount', () => {
    it('automatically requests OTP when page loads with contact info', async () => {
      vi.mocked(authApi.requestOTP).mockResolvedValue({ message: 'OTP sent' })

      renderVerifyPage({ contact: 'user@company.com' })

      await waitFor(() => {
        expect(authApi.requestOTP).toHaveBeenCalledWith('user@company.com')
        expect(authApi.requestOTP).toHaveBeenCalledTimes(1)
      })
    })

    it('does not request OTP when no contact info is provided', async () => {
      renderVerifyPage({})

      // Should redirect instead
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/register', { replace: true })
      })
      expect(authApi.requestOTP).not.toHaveBeenCalled()
    })

    it('shows error when initial OTP request fails', async () => {
      vi.mocked(authApi.requestOTP).mockRejectedValue(new Error('Network error'))

      renderVerifyPage({ contact: 'test@example.com' })

      await waitFor(() => {
        expect(screen.getByTestId('verify-error')).toBeInTheDocument()
        expect(screen.getByTestId('verify-error')).toHaveTextContent('Network error')
      })
    })

    it('sets resend cooldown after automatic OTP request', async () => {
      vi.mocked(authApi.requestOTP).mockResolvedValue({ message: 'OTP sent' })

      renderVerifyPage({ contact: 'test@example.com' })

      await waitFor(() => {
        expect(screen.getByText(/Resend in \d+s/)).toBeInTheDocument()
      })
    })
  })

  describe('redirect behavior', () => {
    it('redirects to register page when no contact info is in state', async () => {
      renderVerifyPage({})

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/register', { replace: true })
      })
    })

    it('does not render content when redirecting', async () => {
      renderVerifyPage({})

      // Should render null when no state
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalled()
      })
      // The verify-form should not be present
      expect(screen.queryByTestId('verify-form')).not.toBeInTheDocument()
    })
  })

  describe('OTP input handling', () => {
    it('accepts single digit input and auto-focuses next field', async () => {
      vi.mocked(authApi.requestOTP).mockResolvedValue({ message: 'OTP sent' })
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

      renderVerifyPage({ contact: 'test@example.com' })

      const input0 = screen.getByTestId('verify-otp-input-0')
      const input1 = screen.getByTestId('verify-otp-input-1')

      await user.type(input0, '1')

      expect(input0).toHaveValue('1')
      expect(input1).toHaveFocus()
    })

    it('handles paste of full OTP code', async () => {
      vi.mocked(authApi.requestOTP).mockResolvedValue({ message: 'OTP sent' })

      renderVerifyPage({ contact: 'test@example.com' })

      const input0 = screen.getByTestId('verify-otp-input-0')

      // Simulate paste via fireEvent.change with full code
      // The component handles multi-digit input by spreading across inputs
      await act(async () => {
        fireEvent.change(input0, { target: { value: '12345' } })
      })

      // All inputs should be filled
      expect(screen.getByTestId('verify-otp-input-0')).toHaveValue('1')
      expect(screen.getByTestId('verify-otp-input-1')).toHaveValue('2')
      expect(screen.getByTestId('verify-otp-input-2')).toHaveValue('3')
      expect(screen.getByTestId('verify-otp-input-3')).toHaveValue('4')
      expect(screen.getByTestId('verify-otp-input-4')).toHaveValue('5')
    })

    it('rejects non-digit input', async () => {
      vi.mocked(authApi.requestOTP).mockResolvedValue({ message: 'OTP sent' })
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

      renderVerifyPage({ contact: 'test@example.com' })

      const input0 = screen.getByTestId('verify-otp-input-0')

      await user.type(input0, 'a')

      expect(input0).toHaveValue('')
    })

    it('handles backspace to move to previous input', async () => {
      vi.mocked(authApi.requestOTP).mockResolvedValue({ message: 'OTP sent' })
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

      renderVerifyPage({ contact: 'test@example.com' })

      const input0 = screen.getByTestId('verify-otp-input-0')
      const input1 = screen.getByTestId('verify-otp-input-1')

      // Type in first input
      await user.type(input0, '1')
      expect(input1).toHaveFocus()

      // Backspace on empty second input should focus first
      await user.keyboard('{Backspace}')
      expect(input0).toHaveFocus()
    })
  })

  describe('form submission', () => {
    it('submits OTP and navigates to dashboard on success', async () => {
      vi.mocked(authApi.requestOTP).mockResolvedValue({ message: 'OTP sent' })
      vi.mocked(authApi.verifyOTP).mockResolvedValue({
        username: 'testuser',
        email: 'test@example.com',
        roles: ['ROLE_USER'],
      })

      const mockSetAuthenticated = vi.fn()
      useAuthStore.setState({ setAuthenticated: mockSetAuthenticated })

      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

      renderVerifyPage({ contact: 'test@example.com' })

      // Fill OTP using fireEvent.change (simulates paste by setting multi-digit value)
      const input0 = screen.getByTestId('verify-otp-input-0')
      await act(async () => {
        fireEvent.change(input0, { target: { value: '12345' } })
      })

      // Submit
      await user.click(screen.getByTestId('verify-submit-button'))

      await waitFor(() => {
        expect(authApi.verifyOTP).toHaveBeenCalledWith('12345')
        expect(mockSetAuthenticated).toHaveBeenCalledWith(true, expect.objectContaining({
          username: 'testuser',
        }))
        expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true })
      })
    })

    it('shows error and clears inputs on verification failure', async () => {
      vi.mocked(authApi.requestOTP).mockResolvedValue({ message: 'OTP sent' })
      vi.mocked(authApi.verifyOTP).mockRejectedValue(new Error('Invalid code'))

      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

      renderVerifyPage({ contact: 'test@example.com' })

      // Fill OTP using fireEvent.change (simulates paste)
      const input0 = screen.getByTestId('verify-otp-input-0')
      await act(async () => {
        fireEvent.change(input0, { target: { value: '12345' } })
      })

      // Submit
      await user.click(screen.getByTestId('verify-submit-button'))

      await waitFor(() => {
        expect(screen.getByTestId('verify-error')).toHaveTextContent('Invalid code')
      })

      // Inputs should be cleared
      expect(screen.getByTestId('verify-otp-input-0')).toHaveValue('')
      expect(screen.getByTestId('verify-otp-input-0')).toHaveFocus()
    })

    it('disables submit button when OTP is incomplete', async () => {
      vi.mocked(authApi.requestOTP).mockResolvedValue({ message: 'OTP sent' })

      renderVerifyPage({ contact: 'test@example.com' })

      // Only type 3 digits using fireEvent.change
      const input0 = screen.getByTestId('verify-otp-input-0')
      await act(async () => {
        fireEvent.change(input0, { target: { value: '123' } })
      })

      expect(screen.getByTestId('verify-submit-button')).toBeDisabled()
    })

    // Changed (2026-01-28): Fixed form submission test to use fireEvent.submit
    // which properly triggers React's synthetic event system
    // Fix: Wait for initial OTP request to complete before submitting, because
    // requestOTP.onSuccess clears the error state with setError(null)
    it('shows validation error when submitting incomplete OTP', async () => {
      vi.mocked(authApi.requestOTP).mockResolvedValue({ message: 'OTP sent' })

      renderVerifyPage({ contact: 'test@example.com' })

      // Wait for initial OTP request to complete (indicated by cooldown starting)
      await waitFor(() => {
        expect(screen.getByText(/Resend in/)).toBeInTheDocument()
      })

      // Try to submit via form (bypassing button disabled state)
      const form = screen.getByTestId('verify-form')
      await act(async () => {
        fireEvent.submit(form)
      })

      await waitFor(() => {
        expect(screen.getByTestId('verify-error')).toHaveTextContent('complete 5-digit code')
      })
    })

    it('shows loading state during verification', async () => {
      vi.mocked(authApi.requestOTP).mockResolvedValue({ message: 'OTP sent' })
      // Make verification take time
      vi.mocked(authApi.verifyOTP).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({
          username: 'test',
          email: 'test@example.com',
          roles: [],
        }), 1000))
      )

      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

      renderVerifyPage({ contact: 'test@example.com' })

      // Fill OTP using fireEvent.change
      const input0 = screen.getByTestId('verify-otp-input-0')
      await act(async () => {
        fireEvent.change(input0, { target: { value: '12345' } })
      })

      await user.click(screen.getByTestId('verify-submit-button'))

      expect(screen.getByText('Verifying...')).toBeInTheDocument()
      expect(screen.getByTestId('verify-submit-button')).toBeDisabled()

      // Cleanup
      await act(async () => {
        vi.advanceTimersByTime(1500)
      })
    })
  })

  describe('resend functionality', () => {
    // Changed (2026-01-28): Fixed timer tests by advancing timers in increments
    // to allow React to properly process each state update from the useEffect cooldown timer
    it('enables resend button after cooldown expires', async () => {
      vi.mocked(authApi.requestOTP).mockResolvedValue({ message: 'OTP sent' })

      renderVerifyPage({ contact: 'test@example.com' })

      // Initially shows cooldown
      await waitFor(() => {
        expect(screen.getByText(/Resend in \d+s/)).toBeInTheDocument()
      })

      // Advance past cooldown (60 seconds) - advance in chunks to let React process state updates
      // Each setTimeout is 1 second, so we need to flush after each advancement
      for (let i = 0; i < 61; i++) {
        await act(async () => {
          vi.advanceTimersByTime(1000)
        })
      }

      // Now resend button should be available
      await waitFor(() => {
        expect(screen.getByTestId('verify-resend-button')).toBeInTheDocument()
      })
      expect(screen.getByTestId('verify-resend-button')).not.toBeDisabled()
    })

    it('calls requestOTP when resend is clicked', async () => {
      vi.mocked(authApi.requestOTP).mockResolvedValue({ message: 'OTP sent' })

      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

      renderVerifyPage({ contact: 'test@example.com' })

      // Wait for initial request
      await waitFor(() => {
        expect(authApi.requestOTP).toHaveBeenCalledTimes(1)
      })

      // Advance past cooldown in increments to let React process state updates
      for (let i = 0; i < 61; i++) {
        await act(async () => {
          vi.advanceTimersByTime(1000)
        })
      }

      // Wait for resend button to appear
      await waitFor(() => {
        expect(screen.getByTestId('verify-resend-button')).toBeInTheDocument()
      })

      // Click resend
      const resendButton = screen.getByTestId('verify-resend-button')
      await user.click(resendButton)

      await waitFor(() => {
        expect(authApi.requestOTP).toHaveBeenCalledTimes(2)
      })
    })

    it('resets cooldown after resend', async () => {
      vi.mocked(authApi.requestOTP).mockResolvedValue({ message: 'OTP sent' })

      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

      renderVerifyPage({ contact: 'test@example.com' })

      // Advance past cooldown in increments
      for (let i = 0; i < 61; i++) {
        await act(async () => {
          vi.advanceTimersByTime(1000)
        })
      }

      // Wait for resend button to appear
      await waitFor(() => {
        expect(screen.getByTestId('verify-resend-button')).toBeInTheDocument()
      })

      // Click resend
      await user.click(screen.getByTestId('verify-resend-button'))

      // Cooldown should restart
      await waitFor(() => {
        expect(screen.getByText(/Resend in \d+s/)).toBeInTheDocument()
      })
    })
  })

  describe('contact masking', () => {
    it('masks email addresses correctly', async () => {
      vi.mocked(authApi.requestOTP).mockResolvedValue({ message: 'OTP sent' })

      renderVerifyPage({ contact: 'john.doe@company.com' })

      // Should show "jo***@company.com" pattern
      expect(screen.getByText(/jo\*\*\*@company\.com/)).toBeInTheDocument()
    })

    it('masks phone numbers correctly', async () => {
      vi.mocked(authApi.requestOTP).mockResolvedValue({ message: 'OTP sent' })

      renderVerifyPage({ contact: '+1234567890' })

      // Should show partial phone with asterisks
      expect(screen.getByText(/\+123\*\*\*890/)).toBeInTheDocument()
    })
  })

  describe('back to registration link', () => {
    it('renders link back to registration', async () => {
      vi.mocked(authApi.requestOTP).mockResolvedValue({ message: 'OTP sent' })

      renderVerifyPage({ contact: 'test@example.com' })

      const backLink = screen.getByTestId('verify-back-link')
      expect(backLink).toBeInTheDocument()
      expect(backLink).toHaveAttribute('href', '/register')
    })
  })
})
