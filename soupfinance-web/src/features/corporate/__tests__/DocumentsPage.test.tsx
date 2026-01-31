/**
 * Unit tests for DocumentsPage component
 * Tests document upload, validation, deletion, and KYC submission
 *
 * Changed (2026-01-28): Created comprehensive tests for corporate document upload
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DocumentsPage } from '../DocumentsPage'
import * as corporateApi from '../../../api/endpoints/corporate'
import type { CorporateDocuments } from '../../../types'

// Mock the corporate API module
vi.mock('../../../api/endpoints/corporate', () => ({
  listDocuments: vi.fn(),
  uploadDocument: vi.fn(),
  deleteDocument: vi.fn(),
  submitKyc: vi.fn(),
}))

// Mock useNavigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

// Test data
const mockDocuments: CorporateDocuments[] = [
  {
    id: 'doc-001',
    documentType: 'CERTIFICATE_OF_INCORPORATION',
    fileName: 'certificate.pdf',
    fileUrl: 'https://example.com/files/certificate.pdf',
    corporate: { id: 'corp-001' },
    dateCreated: '2024-01-15T10:30:00Z',
    lastUpdated: '2024-01-15T10:30:00Z',
    archived: false,
  },
  {
    id: 'doc-002',
    documentType: 'BOARD_RESOLUTION',
    fileName: 'board_resolution.pdf',
    fileUrl: 'https://example.com/files/board_resolution.pdf',
    corporate: { id: 'corp-001' },
    dateCreated: '2024-01-16T14:00:00Z',
    lastUpdated: '2024-01-16T14:00:00Z',
    archived: false,
  },
]

const mockAllRequiredDocuments: CorporateDocuments[] = [
  ...mockDocuments,
  {
    id: 'doc-003',
    documentType: 'PROOF_OF_ADDRESS',
    fileName: 'utility_bill.pdf',
    fileUrl: 'https://example.com/files/utility_bill.pdf',
    corporate: { id: 'corp-001' },
    dateCreated: '2024-01-17T09:00:00Z',
    lastUpdated: '2024-01-17T09:00:00Z',
    archived: false,
  },
]

// Helper to create a mock document
function createMockDocument(overrides: Partial<CorporateDocuments> = {}): CorporateDocuments {
  return {
    id: 'doc-mock',
    documentType: 'CERTIFICATE_OF_INCORPORATION',
    fileName: 'certificate.pdf',
    fileUrl: 'https://example.com/certificate.pdf',
    corporate: { id: 'corp-001' },
    dateCreated: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    archived: false,
    ...overrides,
  }
}

// Helper to create a test file
function createMockFile(name: string, type: string, sizeInMB: number = 1): File {
  const bytes = sizeInMB * 1024 * 1024
  const content = new Uint8Array(bytes)
  return new File([content], name, { type })
}

// Create a fresh QueryClient for each test
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

// Helper to render with providers
function renderDocumentsPage(corporateId: string = 'corp-001', initialDocuments: CorporateDocuments[] = []) {
  const queryClient = createTestQueryClient()

  vi.mocked(corporateApi.listDocuments).mockResolvedValue(initialDocuments)

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/onboarding/documents?id=${corporateId}`]}>
        <DocumentsPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('DocumentsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()
  })

  describe('rendering', () => {
    it('renders page title and description', async () => {
      renderDocumentsPage()

      await waitFor(() => {
        expect(screen.getByText('KYC Documents')).toBeInTheDocument()
      })
      expect(screen.getByText('Upload required documents for verification')).toBeInTheDocument()
    })

    it('renders page with testid', async () => {
      renderDocumentsPage()

      await waitFor(() => {
        expect(screen.getByTestId('documents-page')).toBeInTheDocument()
      })
    })

    it('renders progress indicator showing step 4', async () => {
      renderDocumentsPage()

      await waitFor(() => {
        expect(screen.getByText('Registration')).toBeInTheDocument()
      })
      expect(screen.getByText('Company Info')).toBeInTheDocument()
      expect(screen.getByText('Directors')).toBeInTheDocument()
      expect(screen.getByText('Documents')).toBeInTheDocument()
      // Step 4 is active
      expect(screen.getByText('4')).toBeInTheDocument()
    })

    it('renders all four document type cards', async () => {
      renderDocumentsPage()

      await waitFor(() => {
        expect(screen.getByText('Certificate of Incorporation')).toBeInTheDocument()
      })
      expect(screen.getByText('Board Resolution')).toBeInTheDocument()
      expect(screen.getByText('Memorandum & Articles')).toBeInTheDocument()
      expect(screen.getByText('Proof of Address')).toBeInTheDocument()
    })

    it('renders document type descriptions', async () => {
      renderDocumentsPage()

      await waitFor(() => {
        expect(screen.getByText('Official document proving company registration')).toBeInTheDocument()
      })
      expect(screen.getByText('Authorization to open and operate the account')).toBeInTheDocument()
      expect(screen.getByText('Company constitution and bylaws')).toBeInTheDocument()
      expect(screen.getByText('Utility bill or bank statement (less than 3 months old)')).toBeInTheDocument()
    })

    it('marks required documents with asterisk', async () => {
      renderDocumentsPage()

      await waitFor(() => {
        expect(screen.getByText('Certificate of Incorporation')).toBeInTheDocument()
      })

      // Certificate of Incorporation, Board Resolution, and Proof of Address are required
      // They should have asterisks in their header labels (with class text-danger)
      // Note: The warning notice also has an asterisk, so we use a more specific selector
      const requiredMarkers = document.querySelectorAll('h3 .text-danger')
      expect(requiredMarkers.length).toBe(3)
    })

    it('renders Back and Submit buttons', async () => {
      renderDocumentsPage()

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument()
      })
      expect(screen.getByRole('button', { name: /submit for review/i })).toBeInTheDocument()
    })

    it('renders Additional Information section', async () => {
      renderDocumentsPage()

      await waitFor(() => {
        expect(screen.getByText('Additional Information')).toBeInTheDocument()
      })
      expect(screen.getByText(/Director ID copies should be uploaded/)).toBeInTheDocument()
      expect(screen.getByText('Go to Directors')).toBeInTheDocument()
    })
  })

  describe('loading state', () => {
    it('shows loading spinner while fetching documents', async () => {
      // Delay the response to show loading state
      vi.mocked(corporateApi.listDocuments).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve([]), 100))
      )

      renderDocumentsPage()

      // Check for the spinner
      const spinners = document.querySelectorAll('.animate-spin')
      expect(spinners.length).toBeGreaterThan(0)
    })

    it('removes loading spinner after documents load', async () => {
      renderDocumentsPage()

      await waitFor(() => {
        expect(screen.getByText('Certificate of Incorporation')).toBeInTheDocument()
      })

      // After loading, check for upload areas
      const uploadText = screen.getAllByText(/Click to upload/)
      expect(uploadText.length).toBe(4)
    })
  })

  describe('required documents notice', () => {
    it('shows warning notice when required documents are missing', async () => {
      renderDocumentsPage('corp-001', [])

      await waitFor(() => {
        expect(
          screen.getByText(/Please upload all required documents marked with/)
        ).toBeInTheDocument()
      })
    })

    it('hides warning notice when all required documents are uploaded', async () => {
      renderDocumentsPage('corp-001', mockAllRequiredDocuments)

      await waitFor(() => {
        expect(screen.getByText('certificate.pdf')).toBeInTheDocument()
      })

      // Warning should not be present
      expect(
        screen.queryByText(/Please upload all required documents marked with/)
      ).not.toBeInTheDocument()
    })

    it('shows warning when only some required documents are uploaded', async () => {
      // Only certificate is uploaded, missing board resolution and proof of address
      renderDocumentsPage('corp-001', [mockDocuments[0]])

      await waitFor(() => {
        expect(
          screen.getByText(/Please upload all required documents marked with/)
        ).toBeInTheDocument()
      })
    })
  })

  describe('uploaded documents display', () => {
    it('displays uploaded document file name', async () => {
      renderDocumentsPage('corp-001', mockDocuments)

      await waitFor(() => {
        expect(screen.getByText('certificate.pdf')).toBeInTheDocument()
      })
      expect(screen.getByText('board_resolution.pdf')).toBeInTheDocument()
    })

    it('displays uploaded date for documents', async () => {
      renderDocumentsPage('corp-001', mockDocuments)

      await waitFor(() => {
        // Check for "Uploaded" text with date
        const uploadedTexts = screen.getAllByText(/Uploaded/)
        expect(uploadedTexts.length).toBe(2)
      })
    })

    it('shows green checkmark for uploaded document types', async () => {
      renderDocumentsPage('corp-001', mockDocuments)

      await waitFor(() => {
        expect(screen.getByText('certificate.pdf')).toBeInTheDocument()
      })

      // Check for checkmarks (green circles with check icon)
      const checkIcons = document.querySelectorAll('.bg-green-500')
      expect(checkIcons.length).toBeGreaterThan(0)
    })

    it('renders View button that opens file in new tab', async () => {
      renderDocumentsPage('corp-001', mockDocuments)

      await waitFor(() => {
        expect(screen.getByText('certificate.pdf')).toBeInTheDocument()
      })

      const viewLinks = screen.getAllByTitle('View')
      expect(viewLinks.length).toBe(2)
      expect(viewLinks[0]).toHaveAttribute('href', mockDocuments[0].fileUrl)
      expect(viewLinks[0]).toHaveAttribute('target', '_blank')
      expect(viewLinks[0]).toHaveAttribute('rel', 'noopener noreferrer')
    })

    it('renders Delete button for uploaded documents', async () => {
      renderDocumentsPage('corp-001', mockDocuments)

      await waitFor(() => {
        expect(screen.getByText('certificate.pdf')).toBeInTheDocument()
      })

      const deleteButtons = screen.getAllByTitle('Delete')
      expect(deleteButtons.length).toBe(2)
    })
  })

  describe('document upload', () => {
    it('displays upload dropzones for documents without uploads', async () => {
      renderDocumentsPage('corp-001', [])

      await waitFor(() => {
        const uploadAreas = screen.getAllByText(/Click to upload/)
        expect(uploadAreas.length).toBe(4)
      })
    })

    it('displays file size and type restrictions', async () => {
      renderDocumentsPage('corp-001', [])

      await waitFor(() => {
        const restrictions = screen.getAllByText('PDF, PNG, JPG or GIF (MAX. 5MB)')
        expect(restrictions.length).toBe(4)
      })
    })

    it('calls uploadDocument API when file is selected', async () => {
      const user = userEvent.setup()
      vi.mocked(corporateApi.uploadDocument).mockResolvedValue(
        createMockDocument({ id: 'new-doc', fileName: 'new_certificate.pdf', fileUrl: 'https://example.com/new_certificate.pdf' })
      )

      renderDocumentsPage('corp-001', [])

      await waitFor(() => {
        expect(screen.getByText('Certificate of Incorporation')).toBeInTheDocument()
      })

      // Find the file input for Certificate of Incorporation (first one)
      const fileInputs = document.querySelectorAll('input[type="file"]')
      const file = createMockFile('certificate.pdf', 'application/pdf', 1)

      // Upload the file
      await user.upload(fileInputs[0] as HTMLInputElement, file)

      await waitFor(() => {
        expect(corporateApi.uploadDocument).toHaveBeenCalledWith(
          'corp-001',
          file,
          'CERTIFICATE_OF_INCORPORATION'
        )
      })
    })

    it('shows uploading state during file upload', async () => {
      const user = userEvent.setup()

      // Delay the upload response
      vi.mocked(corporateApi.uploadDocument).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(createMockDocument({ id: 'new-doc' })), 500))
      )

      renderDocumentsPage('corp-001', [])

      await waitFor(() => {
        expect(screen.getByText('Certificate of Incorporation')).toBeInTheDocument()
      })

      const fileInputs = document.querySelectorAll('input[type="file"]')
      const file = createMockFile('certificate.pdf', 'application/pdf', 1)

      // Upload the file
      await user.upload(fileInputs[0] as HTMLInputElement, file)

      // Check for uploading text
      await waitFor(() => {
        expect(screen.getByText('Uploading...')).toBeInTheDocument()
      })
    })
  })

  describe('file validation', () => {
    it('alerts when file is too large (over 5MB)', async () => {
      const user = userEvent.setup()
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})

      renderDocumentsPage('corp-001', [])

      await waitFor(() => {
        expect(screen.getByText('Certificate of Incorporation')).toBeInTheDocument()
      })

      const fileInputs = document.querySelectorAll('input[type="file"]')
      const largeFile = createMockFile('large_file.pdf', 'application/pdf', 10) // 10MB

      await user.upload(fileInputs[0] as HTMLInputElement, largeFile)

      expect(alertSpy).toHaveBeenCalledWith('File size must be less than 5MB')
      expect(corporateApi.uploadDocument).not.toHaveBeenCalled()

      alertSpy.mockRestore()
    })

    // Changed: Use fireEvent.change instead of userEvent.upload to bypass browser accept attribute filtering
    // userEvent.upload respects the accept attribute and won't trigger for disallowed file types
    it('alerts when file type is not allowed', async () => {
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})

      renderDocumentsPage('corp-001', [])

      await waitFor(() => {
        expect(screen.getByText('Certificate of Incorporation')).toBeInTheDocument()
      })

      const fileInputs = document.querySelectorAll('input[type="file"]')
      const wrongTypeFile = createMockFile('document.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 1)

      // Use fireEvent to bypass browser accept attribute filtering
      Object.defineProperty(fileInputs[0], 'files', {
        value: [wrongTypeFile],
        configurable: true,
      })
      fireEvent.change(fileInputs[0])

      expect(alertSpy).toHaveBeenCalledWith('Only PDF, PNG, JPG, or GIF files are allowed')
      expect(corporateApi.uploadDocument).not.toHaveBeenCalled()

      alertSpy.mockRestore()
    })

    it('accepts PDF files', async () => {
      const user = userEvent.setup()
      vi.mocked(corporateApi.uploadDocument).mockResolvedValue(
        createMockDocument({ id: 'new-doc', fileName: 'document.pdf', fileUrl: 'https://example.com/document.pdf' })
      )

      renderDocumentsPage('corp-001', [])

      await waitFor(() => {
        expect(screen.getByText('Certificate of Incorporation')).toBeInTheDocument()
      })

      const fileInputs = document.querySelectorAll('input[type="file"]')
      const pdfFile = createMockFile('document.pdf', 'application/pdf', 2)

      await user.upload(fileInputs[0] as HTMLInputElement, pdfFile)

      await waitFor(() => {
        expect(corporateApi.uploadDocument).toHaveBeenCalled()
      })
    })

    it('accepts PNG image files', async () => {
      const user = userEvent.setup()
      vi.mocked(corporateApi.uploadDocument).mockResolvedValue(
        createMockDocument({ id: 'new-doc', fileName: 'document.png', fileUrl: 'https://example.com/document.png' })
      )

      renderDocumentsPage('corp-001', [])

      await waitFor(() => {
        expect(screen.getByText('Certificate of Incorporation')).toBeInTheDocument()
      })

      const fileInputs = document.querySelectorAll('input[type="file"]')
      const pngFile = createMockFile('document.png', 'image/png', 1)

      await user.upload(fileInputs[0] as HTMLInputElement, pngFile)

      await waitFor(() => {
        expect(corporateApi.uploadDocument).toHaveBeenCalled()
      })
    })

    it('accepts JPEG image files', async () => {
      const user = userEvent.setup()
      vi.mocked(corporateApi.uploadDocument).mockResolvedValue(
        createMockDocument({ id: 'new-doc', fileName: 'document.jpg', fileUrl: 'https://example.com/document.jpg' })
      )

      renderDocumentsPage('corp-001', [])

      await waitFor(() => {
        expect(screen.getByText('Certificate of Incorporation')).toBeInTheDocument()
      })

      const fileInputs = document.querySelectorAll('input[type="file"]')
      const jpegFile = createMockFile('document.jpg', 'image/jpeg', 1)

      await user.upload(fileInputs[0] as HTMLInputElement, jpegFile)

      await waitFor(() => {
        expect(corporateApi.uploadDocument).toHaveBeenCalled()
      })
    })

    it('accepts GIF image files', async () => {
      const user = userEvent.setup()
      vi.mocked(corporateApi.uploadDocument).mockResolvedValue(
        createMockDocument({ id: 'new-doc', fileName: 'document.gif', fileUrl: 'https://example.com/document.gif' })
      )

      renderDocumentsPage('corp-001', [])

      await waitFor(() => {
        expect(screen.getByText('Certificate of Incorporation')).toBeInTheDocument()
      })

      const fileInputs = document.querySelectorAll('input[type="file"]')
      const gifFile = createMockFile('document.gif', 'image/gif', 1)

      await user.upload(fileInputs[0] as HTMLInputElement, gifFile)

      await waitFor(() => {
        expect(corporateApi.uploadDocument).toHaveBeenCalled()
      })
    })
  })

  describe('drag and drop', () => {
    it('highlights dropzone on drag over', async () => {
      renderDocumentsPage('corp-001', [])

      await waitFor(() => {
        expect(screen.getByText('Certificate of Incorporation')).toBeInTheDocument()
      })

      // Find the first dropzone (label with the upload UI)
      const dropzones = document.querySelectorAll('label.cursor-pointer')
      const firstDropzone = dropzones[0]

      // Simulate drag over
      fireEvent.dragOver(firstDropzone, {
        dataTransfer: { files: [] },
      })

      // The dropzone should have highlight class
      await waitFor(() => {
        expect(firstDropzone).toHaveClass('border-primary')
      })
    })

    it('removes highlight on drag leave', async () => {
      renderDocumentsPage('corp-001', [])

      await waitFor(() => {
        expect(screen.getByText('Certificate of Incorporation')).toBeInTheDocument()
      })

      const dropzones = document.querySelectorAll('label.cursor-pointer')
      const firstDropzone = dropzones[0]

      // Simulate drag over then leave
      fireEvent.dragOver(firstDropzone, {
        dataTransfer: { files: [] },
      })

      fireEvent.dragLeave(firstDropzone)

      await waitFor(() => {
        expect(firstDropzone).not.toHaveClass('border-primary')
      })
    })

    it('uploads file on drop', async () => {
      vi.mocked(corporateApi.uploadDocument).mockResolvedValue(
        createMockDocument({ id: 'new-doc', fileName: 'dropped_file.pdf', fileUrl: 'https://example.com/dropped_file.pdf' })
      )

      renderDocumentsPage('corp-001', [])

      await waitFor(() => {
        expect(screen.getByText('Certificate of Incorporation')).toBeInTheDocument()
      })

      const dropzones = document.querySelectorAll('label.cursor-pointer')
      const firstDropzone = dropzones[0]
      const file = createMockFile('dropped_file.pdf', 'application/pdf', 1)

      // Simulate drop
      fireEvent.drop(firstDropzone, {
        dataTransfer: {
          files: [file],
        },
      })

      await waitFor(() => {
        expect(corporateApi.uploadDocument).toHaveBeenCalledWith(
          'corp-001',
          file,
          'CERTIFICATE_OF_INCORPORATION'
        )
      })
    })
  })

  describe('document deletion', () => {
    it('calls deleteDocument API when delete button is clicked', async () => {
      const user = userEvent.setup()
      vi.mocked(corporateApi.deleteDocument).mockResolvedValue(undefined)

      renderDocumentsPage('corp-001', mockDocuments)

      await waitFor(() => {
        expect(screen.getByText('certificate.pdf')).toBeInTheDocument()
      })

      const deleteButtons = screen.getAllByTitle('Delete')
      await user.click(deleteButtons[0])

      await waitFor(() => {
        expect(corporateApi.deleteDocument).toHaveBeenCalled()
        expect(vi.mocked(corporateApi.deleteDocument).mock.calls[0][0]).toBe('doc-001')
      })
    })

    it('invalidates documents query after successful deletion', async () => {
      const user = userEvent.setup()
      vi.mocked(corporateApi.deleteDocument).mockResolvedValue(undefined)

      renderDocumentsPage('corp-001', mockDocuments)

      await waitFor(() => {
        expect(screen.getByText('certificate.pdf')).toBeInTheDocument()
      })

      const deleteButtons = screen.getAllByTitle('Delete')
      await user.click(deleteButtons[0])

      await waitFor(() => {
        expect(corporateApi.deleteDocument).toHaveBeenCalled()
      })

      // The listDocuments should be called again (query invalidation)
      await waitFor(() => {
        expect(corporateApi.listDocuments).toHaveBeenCalledTimes(2)
      })
    })
  })

  describe('submit for review', () => {
    it('disables submit button when required documents are missing', async () => {
      renderDocumentsPage('corp-001', []) // No documents

      await waitFor(() => {
        expect(screen.getByText('Certificate of Incorporation')).toBeInTheDocument()
      })

      const submitButton = screen.getByRole('button', { name: /submit for review/i })
      expect(submitButton).toBeDisabled()
    })

    it('disables submit button when only some required documents are uploaded', async () => {
      // Only certificate, missing board resolution and proof of address
      renderDocumentsPage('corp-001', [mockDocuments[0]])

      await waitFor(() => {
        expect(screen.getByText('certificate.pdf')).toBeInTheDocument()
      })

      const submitButton = screen.getByRole('button', { name: /submit for review/i })
      expect(submitButton).toBeDisabled()
    })

    it('enables submit button when all required documents are uploaded', async () => {
      renderDocumentsPage('corp-001', mockAllRequiredDocuments)

      await waitFor(() => {
        expect(screen.getByText('certificate.pdf')).toBeInTheDocument()
      })

      const submitButton = screen.getByRole('button', { name: /submit for review/i })
      expect(submitButton).not.toBeDisabled()
    })

    it('calls submitKyc API when submit button is clicked', async () => {
      const user = userEvent.setup()
      vi.mocked(corporateApi.submitKyc).mockResolvedValue({
        id: 'corp-001',
        name: 'Test Company',
        kycStatus: 'PENDING_REVIEW',
      } as any)

      renderDocumentsPage('corp-001', mockAllRequiredDocuments)

      await waitFor(() => {
        expect(screen.getByText('certificate.pdf')).toBeInTheDocument()
      })

      const submitButton = screen.getByRole('button', { name: /submit for review/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(corporateApi.submitKyc).toHaveBeenCalledWith('corp-001')
      })
    })

    it('navigates to status page on successful submission', async () => {
      const user = userEvent.setup()
      vi.mocked(corporateApi.submitKyc).mockResolvedValue({
        id: 'corp-001',
        name: 'Test Company',
        kycStatus: 'PENDING_REVIEW',
      } as any)

      renderDocumentsPage('corp-001', mockAllRequiredDocuments)

      await waitFor(() => {
        expect(screen.getByText('certificate.pdf')).toBeInTheDocument()
      })

      const submitButton = screen.getByRole('button', { name: /submit for review/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/onboarding/status?id=corp-001')
      })
    })

    it('shows loading state during submission', async () => {
      const user = userEvent.setup()

      // Delay the submission
      vi.mocked(corporateApi.submitKyc).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({
          id: 'corp-001',
          name: 'Test Company',
          kycStatus: 'PENDING_REVIEW',
        } as any), 500))
      )

      renderDocumentsPage('corp-001', mockAllRequiredDocuments)

      await waitFor(() => {
        expect(screen.getByText('certificate.pdf')).toBeInTheDocument()
      })

      const submitButton = screen.getByRole('button', { name: /submit for review/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText('Submitting...')).toBeInTheDocument()
      })
    })

    it('disables submit button during submission', async () => {
      const user = userEvent.setup()

      vi.mocked(corporateApi.submitKyc).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({
          id: 'corp-001',
          name: 'Test Company',
          kycStatus: 'PENDING_REVIEW',
        } as any), 500))
      )

      renderDocumentsPage('corp-001', mockAllRequiredDocuments)

      await waitFor(() => {
        expect(screen.getByText('certificate.pdf')).toBeInTheDocument()
      })

      const submitButton = screen.getByRole('button', { name: /submit for review/i })
      await user.click(submitButton)

      await waitFor(() => {
        const submittingButton = screen.getByRole('button', { name: /submitting/i })
        expect(submittingButton).toBeDisabled()
      })
    })
  })

  describe('navigation', () => {
    it('navigates back to directors page when Back button is clicked', async () => {
      const user = userEvent.setup()
      renderDocumentsPage('corp-001', [])

      await waitFor(() => {
        expect(screen.getByText('Certificate of Incorporation')).toBeInTheDocument()
      })

      const backButton = screen.getByRole('button', { name: /back/i })
      await user.click(backButton)

      expect(mockNavigate).toHaveBeenCalledWith('/onboarding/directors?id=corp-001')
    })

    it('navigates to directors page when "Go to Directors" link is clicked', async () => {
      const user = userEvent.setup()
      renderDocumentsPage('corp-001', [])

      await waitFor(() => {
        expect(screen.getByText('Go to Directors')).toBeInTheDocument()
      })

      const goToDirectorsLink = screen.getByText('Go to Directors')
      await user.click(goToDirectorsLink)

      expect(mockNavigate).toHaveBeenCalledWith('/onboarding/directors?id=corp-001')
    })
  })

  describe('query parameters', () => {
    it('uses corporateId from URL search params for API calls', async () => {
      renderDocumentsPage('test-corp-xyz', [])

      await waitFor(() => {
        expect(corporateApi.listDocuments).toHaveBeenCalledWith('test-corp-xyz')
      })
    })
  })

  describe('different document types', () => {
    it('correctly identifies uploaded document types', async () => {
      const singleDoc: CorporateDocuments[] = [
        {
          id: 'doc-proof',
          documentType: 'PROOF_OF_ADDRESS',
          fileName: 'utility_bill.pdf',
          fileUrl: 'https://example.com/utility_bill.pdf',
          corporate: { id: 'corp-001' },
          dateCreated: new Date().toISOString(),
          lastUpdated: new Date().toISOString(),
          archived: false,
        },
      ]

      renderDocumentsPage('corp-001', singleDoc)

      await waitFor(() => {
        expect(screen.getByText('utility_bill.pdf')).toBeInTheDocument()
      })

      // Other document types should still show upload areas
      const uploadAreas = screen.getAllByText(/Click to upload/)
      expect(uploadAreas.length).toBe(3) // 3 empty, 1 uploaded
    })

    it('handles optional Memorandum & Articles document', async () => {
      // Upload all required docs (Memorandum is optional)
      renderDocumentsPage('corp-001', mockAllRequiredDocuments)

      await waitFor(() => {
        expect(screen.getByText('certificate.pdf')).toBeInTheDocument()
      })

      // Submit should be enabled even without Memorandum
      const submitButton = screen.getByRole('button', { name: /submit for review/i })
      expect(submitButton).not.toBeDisabled()
    })
  })
})
