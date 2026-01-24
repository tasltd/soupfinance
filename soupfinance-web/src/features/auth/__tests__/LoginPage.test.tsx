/**
 * Unit tests for LoginPage component
 * Tests form rendering, validation, and submission behavior
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { LoginPage } from '../LoginPage'
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

// Helper to render with router
function renderLoginPage() {
  return render(
    <BrowserRouter>
      <LoginPage />
    </BrowserRouter>
  )
}

describe('LoginPage', () => {
  beforeEach(() => {
    // Reset auth store to initial state with working mock functions
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      login: vi.fn().mockResolvedValue(undefined),
      logout: vi.fn(),
      clearError: vi.fn(),
      initialize: vi.fn(),
    })
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders the login form', () => {
      // Act
      renderLoginPage()

      // Assert
      expect(screen.getByText('Welcome back')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('you@company.com')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Enter your password')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
    })

    it('renders email input with correct attributes', () => {
      // Act
      renderLoginPage()
      const emailInput = screen.getByPlaceholderText('you@company.com')

      // Assert
      expect(emailInput).toHaveAttribute('type', 'email')
      expect(emailInput).toHaveAttribute('required')
    })

    it('renders password input with correct attributes', () => {
      // Act
      renderLoginPage()
      const passwordInput = screen.getByPlaceholderText('Enter your password')

      // Assert
      expect(passwordInput).toHaveAttribute('type', 'password')
      expect(passwordInput).toHaveAttribute('required')
    })

    it('renders remember me checkbox', () => {
      // Act
      renderLoginPage()

      // Assert
      expect(screen.getByText('Remember me')).toBeInTheDocument()
      expect(screen.getByRole('checkbox')).toBeInTheDocument()
    })

    it('renders forgot password link', () => {
      // Act
      renderLoginPage()

      // Assert
      expect(screen.getByText('Forgot password?')).toBeInTheDocument()
    })

    it('renders register link', () => {
      // Act
      renderLoginPage()

      // Assert
      expect(screen.getByText(/don't have an account/i)).toBeInTheDocument()
      expect(screen.getByText('Register your company')).toBeInTheDocument()
    })
  })

  describe('form interaction', () => {
    it('updates email field on user input', async () => {
      // Arrange
      const user = userEvent.setup()
      renderLoginPage()
      const emailInput = screen.getByPlaceholderText('you@company.com')

      // Act
      await user.type(emailInput, 'test@example.com')

      // Assert
      expect(emailInput).toHaveValue('test@example.com')
    })

    it('updates password field on user input', async () => {
      // Arrange
      const user = userEvent.setup()
      renderLoginPage()
      const passwordInput = screen.getByPlaceholderText('Enter your password')

      // Act
      await user.type(passwordInput, 'mypassword123')

      // Assert
      expect(passwordInput).toHaveValue('mypassword123')
    })

    it('submits form with entered credentials', async () => {
      // Arrange
      const user = userEvent.setup()
      const mockLogin = vi.fn().mockResolvedValue(undefined)
      useAuthStore.setState({ login: mockLogin })

      renderLoginPage()

      // Act
      await user.type(screen.getByPlaceholderText('you@company.com'), 'user@test.com')
      await user.type(screen.getByPlaceholderText('Enter your password'), 'password123')
      await user.click(screen.getByRole('button', { name: /sign in/i }))

      // Assert
      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalledWith('user@test.com', 'password123')
      })
    })

    it('navigates to dashboard on successful login', async () => {
      // Arrange
      const user = userEvent.setup()
      const mockLogin = vi.fn().mockResolvedValue(undefined)
      useAuthStore.setState({ login: mockLogin })

      renderLoginPage()

      // Act
      await user.type(screen.getByPlaceholderText('you@company.com'), 'user@test.com')
      await user.type(screen.getByPlaceholderText('Enter your password'), 'password123')
      await user.click(screen.getByRole('button', { name: /sign in/i }))

      // Assert
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
      })
    })

    it('does not navigate on failed login', async () => {
      // Arrange
      const user = userEvent.setup()
      const mockLogin = vi.fn().mockRejectedValue(new Error('Invalid credentials'))
      useAuthStore.setState({ login: mockLogin })

      renderLoginPage()

      // Act
      await user.type(screen.getByPlaceholderText('you@company.com'), 'user@test.com')
      await user.type(screen.getByPlaceholderText('Enter your password'), 'wrongpassword')
      await user.click(screen.getByRole('button', { name: /sign in/i }))

      // Assert
      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalled()
      })
      expect(mockNavigate).not.toHaveBeenCalled()
    })

    it('clears error before login attempt', async () => {
      // Arrange
      const user = userEvent.setup()
      const mockClearError = vi.fn()
      const mockLogin = vi.fn().mockResolvedValue(undefined)
      useAuthStore.setState({
        login: mockLogin,
        clearError: mockClearError,
        error: 'Previous error',
      })

      renderLoginPage()

      // Act
      await user.type(screen.getByPlaceholderText('you@company.com'), 'user@test.com')
      await user.type(screen.getByPlaceholderText('Enter your password'), 'password123')
      await user.click(screen.getByRole('button', { name: /sign in/i }))

      // Assert
      await waitFor(() => {
        expect(mockClearError).toHaveBeenCalled()
      })
    })
  })

  describe('error display', () => {
    it('displays error message when error exists', () => {
      // Arrange
      useAuthStore.setState({ error: 'Invalid credentials' })

      // Act
      renderLoginPage()

      // Assert
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument()
    })

    it('does not display error element when no error', () => {
      // Arrange
      useAuthStore.setState({ error: null })

      // Act
      renderLoginPage()

      // Assert
      expect(screen.queryByText('Invalid credentials')).not.toBeInTheDocument()
    })

    it('displays different error messages correctly', () => {
      // Arrange
      useAuthStore.setState({ error: 'Network error occurred' })

      // Act
      renderLoginPage()

      // Assert
      expect(screen.getByText('Network error occurred')).toBeInTheDocument()
    })
  })

  describe('loading state', () => {
    it('shows loading spinner when isLoading is true', () => {
      // Arrange
      useAuthStore.setState({ isLoading: true })

      // Act
      renderLoginPage()

      // Assert
      expect(screen.getByText('Signing in...')).toBeInTheDocument()
    })

    it('shows Sign In text when not loading', () => {
      // Arrange
      useAuthStore.setState({ isLoading: false })

      // Act
      renderLoginPage()

      // Assert
      expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument()
    })

    it('disables submit button when loading', () => {
      // Arrange
      useAuthStore.setState({ isLoading: true })

      // Act
      renderLoginPage()

      // Assert
      const button = screen.getByRole('button', { name: /signing in/i })
      expect(button).toBeDisabled()
    })

    it('enables submit button when not loading', () => {
      // Arrange
      useAuthStore.setState({ isLoading: false })

      // Act
      renderLoginPage()

      // Assert
      const button = screen.getByRole('button', { name: /sign in/i })
      expect(button).not.toBeDisabled()
    })
  })

  describe('form validation (browser native)', () => {
    it('email input has required attribute', () => {
      // Act
      renderLoginPage()

      // Assert
      const emailInput = screen.getByPlaceholderText('you@company.com')
      expect(emailInput).toBeRequired()
    })

    it('password input has required attribute', () => {
      // Act
      renderLoginPage()

      // Assert
      const passwordInput = screen.getByPlaceholderText('Enter your password')
      expect(passwordInput).toBeRequired()
    })

    it('email input has type=email for validation', () => {
      // Act
      renderLoginPage()

      // Assert
      const emailInput = screen.getByPlaceholderText('you@company.com')
      expect(emailInput).toHaveAttribute('type', 'email')
    })
  })
})
