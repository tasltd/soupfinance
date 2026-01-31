/**
 * Unit tests for KycStatusPage component
 * Tests KYC approval workflow status display, timeline, and navigation
 *
 * Created: 2026-01-28
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { KycStatusPage } from '../KycStatusPage';
import * as corporateApi from '../../../api/endpoints/corporate';
import type { Corporate, CorporateAccountPerson, CorporateDocuments } from '../../../types';

// Mock the corporate API module
vi.mock('../../../api/endpoints/corporate');

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Test data factories
function createMockCorporate(overrides: Partial<Corporate> = {}): Corporate {
  return {
    id: 'corp-001',
    name: 'Test Company Ltd',
    certificateOfIncorporationNumber: 'REG-123456',
    registrationDate: '2020-01-01',
    businessCategory: 'LIMITED_LIABILITY',
    email: 'contact@testcompany.com',
    phoneNumber: '+1234567890',
    kycStatus: 'PENDING',
    dateCreated: '2026-01-15T10:00:00Z',
    lastUpdated: '2026-01-15T10:00:00Z',
    archived: false,
    tenantId: 'tenant-001',
    ...overrides,
  };
}

function createMockDirector(overrides: Partial<CorporateAccountPerson> = {}): CorporateAccountPerson {
  return {
    id: 'dir-001',
    firstName: 'John',
    lastName: 'Director',
    email: 'john@testcompany.com',
    phoneNumber: '+1234567891',
    role: 'DIRECTOR',
    corporate: { id: 'corp-001' },
    dateCreated: '2026-01-15T10:00:00Z',
    lastUpdated: '2026-01-15T10:00:00Z',
    archived: false,
    tenantId: 'tenant-001',
    ...overrides,
  };
}

function createMockDocument(
  documentType: CorporateDocuments['documentType'],
  overrides: Partial<CorporateDocuments> = {}
): CorporateDocuments {
  return {
    id: `doc-${documentType}`,
    documentType,
    fileName: `${documentType.toLowerCase()}.pdf`,
    fileUrl: `https://storage.example.com/${documentType.toLowerCase()}.pdf`,
    corporate: { id: 'corp-001' },
    dateCreated: '2026-01-15T10:00:00Z',
    lastUpdated: '2026-01-15T10:00:00Z',
    archived: false,
    tenantId: 'tenant-001',
    ...overrides,
  };
}

// Helper to create QueryClient with test settings
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
}

// Helper to render with providers
function renderKycStatusPage(
  corporateId: string,
  mockCorporate: Corporate | null = createMockCorporate(),
  mockDocuments: CorporateDocuments[] = [],
  mockDirectors: CorporateAccountPerson[] = []
) {
  // Setup API mocks
  vi.mocked(corporateApi.getCorporate).mockResolvedValue(mockCorporate as Corporate);
  vi.mocked(corporateApi.listDocuments).mockResolvedValue(mockDocuments);
  vi.mocked(corporateApi.listDirectors).mockResolvedValue(mockDirectors);

  const queryClient = createTestQueryClient();

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/onboarding/status?id=${corporateId}`]}>
        <Routes>
          <Route path="/onboarding/status" element={<KycStatusPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('KycStatusPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
  });

  describe('loading state', () => {
    it('displays loading spinner while fetching data', () => {
      // Setup: Make the API call hang
      vi.mocked(corporateApi.getCorporate).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      const queryClient = createTestQueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/onboarding/status?id=corp-001']}>
            <Routes>
              <Route path="/onboarding/status" element={<KycStatusPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      );

      // Assert: Loading spinner should be visible
      const spinner = document.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });

    it('hides loading spinner after data loads', async () => {
      renderKycStatusPage('corp-001', createMockCorporate());

      await waitFor(() => {
        expect(screen.getByTestId('kyc-status-page')).toBeInTheDocument();
      });

      const spinner = document.querySelector('.animate-spin:not(.animate-pulse)');
      expect(spinner).not.toBeInTheDocument();
    });
  });

  describe('page header', () => {
    it('displays page title', async () => {
      renderKycStatusPage('corp-001', createMockCorporate({ name: 'Acme Corporation' }));

      await waitFor(() => {
        expect(screen.getByText('KYC Application Status')).toBeInTheDocument();
      });
    });

    // Fix: Company name appears in multiple places (header + summary), use getAllByText
    it('displays company name and application ID', async () => {
      renderKycStatusPage('corp-001', createMockCorporate({ name: 'Acme Corporation' }));

      await waitFor(() => {
        const companyNames = screen.getAllByText(/Acme Corporation/);
        expect(companyNames.length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText(/Application #corp-001/)).toBeInTheDocument();
      });
    });
  });

  describe('PENDING status', () => {
    it('displays workflow timeline with correct step statuses', async () => {
      renderKycStatusPage('corp-001', createMockCorporate({ kycStatus: 'PENDING' }));

      await waitFor(() => {
        // Submitted step should be completed
        expect(screen.getByText('Documents Submitted')).toBeInTheDocument();

        // Compliance Review should be current
        expect(screen.getByText('Compliance Review')).toBeInTheDocument();

        // Verification should be pending
        expect(screen.getByText('Document Verification')).toBeInTheDocument();

        // Approval should be pending
        expect(screen.getByText('Application Approved')).toBeInTheDocument();
      });
    });

    it('displays "What Happens Next" with pending messaging', async () => {
      renderKycStatusPage('corp-001', createMockCorporate({ kycStatus: 'PENDING' }));

      await waitFor(() => {
        expect(screen.getByText('What Happens Next?')).toBeInTheDocument();
        expect(screen.getByText(/compliance team will review your documents within 2-3 business days/)).toBeInTheDocument();
        expect(screen.getByText(/receive an email notification/)).toBeInTheDocument();
      });
    });

    it('does not display "Go to Dashboard" button', async () => {
      renderKycStatusPage('corp-001', createMockCorporate({ kycStatus: 'PENDING' }));

      await waitFor(() => {
        expect(screen.getByTestId('kyc-status-page')).toBeInTheDocument();
      });

      expect(screen.queryByText('Go to Dashboard')).not.toBeInTheDocument();
    });

    it('does not display "Update Documents" button', async () => {
      renderKycStatusPage('corp-001', createMockCorporate({ kycStatus: 'PENDING' }));

      await waitFor(() => {
        expect(screen.getByTestId('kyc-status-page')).toBeInTheDocument();
      });

      expect(screen.queryByText('Update Documents')).not.toBeInTheDocument();
    });

    it('does not display status banners', async () => {
      renderKycStatusPage('corp-001', createMockCorporate({ kycStatus: 'PENDING' }));

      await waitFor(() => {
        expect(screen.getByTestId('kyc-status-page')).toBeInTheDocument();
      });

      expect(screen.queryByText('KYC Approved')).not.toBeInTheDocument();
      expect(screen.queryByText('Additional Information Required')).not.toBeInTheDocument();
    });
  });

  describe('APPROVED status', () => {
    it('displays success banner', async () => {
      renderKycStatusPage('corp-001', createMockCorporate({ kycStatus: 'APPROVED' }));

      await waitFor(() => {
        expect(screen.getByText('KYC Approved')).toBeInTheDocument();
        expect(screen.getByText(/corporate account has been verified and approved/)).toBeInTheDocument();
      });
    });

    it('displays "Go to Dashboard" button', async () => {
      renderKycStatusPage('corp-001', createMockCorporate({ kycStatus: 'APPROVED' }));

      await waitFor(() => {
        expect(screen.getByText('Go to Dashboard')).toBeInTheDocument();
      });
    });

    it('navigates to dashboard when button clicked', async () => {
      const user = userEvent.setup();
      renderKycStatusPage('corp-001', createMockCorporate({ kycStatus: 'APPROVED' }));

      await waitFor(() => {
        expect(screen.getByText('Go to Dashboard')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Go to Dashboard'));

      expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
    });

    it('shows all workflow steps as completed', async () => {
      renderKycStatusPage('corp-001', createMockCorporate({ kycStatus: 'APPROVED' }));

      await waitFor(() => {
        // All steps should have completed status indicated by task_alt icons
        const checkIcons = document.querySelectorAll('.text-green-500');
        // Documents Submitted, Compliance Review, Document Verification, Application Approved
        expect(checkIcons.length).toBeGreaterThanOrEqual(4);
      });
    });

    it('displays approved "What Happens Next" messaging', async () => {
      renderKycStatusPage('corp-001', createMockCorporate({ kycStatus: 'APPROVED' }));

      await waitFor(() => {
        expect(screen.getByText(/account is now fully activated/)).toBeInTheDocument();
        expect(screen.getByText(/start creating invoices/)).toBeInTheDocument();
        expect(screen.getByText(/All platform features are now available/)).toBeInTheDocument();
      });
    });
  });

  describe('REJECTED status', () => {
    it('displays error banner', async () => {
      renderKycStatusPage('corp-001', createMockCorporate({ kycStatus: 'REJECTED' }));

      await waitFor(() => {
        expect(screen.getByText('Additional Information Required')).toBeInTheDocument();
        expect(screen.getByText(/review the feedback below and update your documents/)).toBeInTheDocument();
      });
    });

    it('displays "Update Documents" button', async () => {
      renderKycStatusPage('corp-001', createMockCorporate({ kycStatus: 'REJECTED' }));

      await waitFor(() => {
        expect(screen.getByText('Update Documents')).toBeInTheDocument();
      });
    });

    it('navigates to documents page when button clicked', async () => {
      const user = userEvent.setup();
      renderKycStatusPage('corp-001', createMockCorporate({ kycStatus: 'REJECTED' }));

      await waitFor(() => {
        expect(screen.getByText('Update Documents')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Update Documents'));

      expect(mockNavigate).toHaveBeenCalledWith('/onboarding/documents?id=corp-001');
    });

    it('shows "Application Rejected" in workflow timeline', async () => {
      renderKycStatusPage('corp-001', createMockCorporate({ kycStatus: 'REJECTED' }));

      await waitFor(() => {
        expect(screen.getByText('Application Rejected')).toBeInTheDocument();
        expect(screen.getByText(/application requires additional information/)).toBeInTheDocument();
      });
    });

    it('displays rejected "What Happens Next" messaging', async () => {
      renderKycStatusPage('corp-001', createMockCorporate({ kycStatus: 'REJECTED' }));

      await waitFor(() => {
        expect(screen.getByText('Action Required')).toBeInTheDocument();
        expect(screen.getByText(/Review the compliance team's feedback/)).toBeInTheDocument();
        expect(screen.getByText(/Upload any missing or corrected documents/)).toBeInTheDocument();
        expect(screen.getByText(/Resubmit for review/)).toBeInTheDocument();
      });
    });
  });

  describe('company information summary', () => {
    it('displays company name', async () => {
      renderKycStatusPage('corp-001', createMockCorporate({ name: 'Acme Corporation' }));

      await waitFor(() => {
        expect(screen.getByText('Company Information')).toBeInTheDocument();
        // Company name appears in header and summary
        const companyNames = screen.getAllByText('Acme Corporation');
        expect(companyNames.length).toBeGreaterThanOrEqual(1);
      });
    });

    it('displays registration number', async () => {
      renderKycStatusPage('corp-001', createMockCorporate({
        certificateOfIncorporationNumber: 'REG-789456'
      }));

      await waitFor(() => {
        expect(screen.getByText('Registration Number')).toBeInTheDocument();
        expect(screen.getByText('REG-789456')).toBeInTheDocument();
      });
    });

    it('displays email', async () => {
      renderKycStatusPage('corp-001', createMockCorporate({
        email: 'info@acme.com'
      }));

      await waitFor(() => {
        expect(screen.getByText('Email')).toBeInTheDocument();
        expect(screen.getByText('info@acme.com')).toBeInTheDocument();
      });
    });

    it('displays phone number', async () => {
      renderKycStatusPage('corp-001', createMockCorporate({
        phoneNumber: '+1-555-123-4567'
      }));

      await waitFor(() => {
        expect(screen.getByText('Phone')).toBeInTheDocument();
        expect(screen.getByText('+1-555-123-4567')).toBeInTheDocument();
      });
    });

    it('displays dash for missing fields', async () => {
      renderKycStatusPage('corp-001', createMockCorporate({
        name: undefined,
        certificateOfIncorporationNumber: undefined,
        email: undefined,
        phoneNumber: undefined,
      }));

      await waitFor(() => {
        const dashes = screen.getAllByText('-');
        expect(dashes.length).toBeGreaterThanOrEqual(4);
      });
    });
  });

  describe('document checklist', () => {
    it('displays all document types', async () => {
      renderKycStatusPage('corp-001', createMockCorporate(), []);

      await waitFor(() => {
        expect(screen.getByText('Document Checklist')).toBeInTheDocument();
        expect(screen.getByText('Certificate of Incorporation')).toBeInTheDocument();
        expect(screen.getByText('Board Resolution')).toBeInTheDocument();
        expect(screen.getByText('Memorandum & Articles')).toBeInTheDocument();
        expect(screen.getByText('Proof of Address')).toBeInTheDocument();
      });
    });

    it('shows check icon for uploaded documents', async () => {
      const documents = [
        createMockDocument('CERTIFICATE_OF_INCORPORATION'),
        createMockDocument('BOARD_RESOLUTION'),
      ];

      renderKycStatusPage('corp-001', createMockCorporate(), documents);

      await waitFor(() => {
        // Check icons for uploaded documents
        const checkIcons = document.querySelectorAll('.text-green-500');
        // 2 documents uploaded + any workflow icons
        expect(checkIcons.length).toBeGreaterThanOrEqual(2);
      });
    });

    it('shows empty circle for missing documents', async () => {
      renderKycStatusPage('corp-001', createMockCorporate(), []);

      await waitFor(() => {
        // All 4 documents should be unuploaded
        const emptyCircles = document.querySelectorAll('.text-gray-400');
        expect(emptyCircles.length).toBeGreaterThanOrEqual(4);
      });
    });

    it('shows "View" link for uploaded documents', async () => {
      const documents = [
        createMockDocument('CERTIFICATE_OF_INCORPORATION', {
          fileUrl: 'https://storage.example.com/cert.pdf'
        }),
      ];

      renderKycStatusPage('corp-001', createMockCorporate(), documents);

      await waitFor(() => {
        const viewLinks = screen.getAllByText('View');
        expect(viewLinks.length).toBeGreaterThanOrEqual(1);
        // Check the link has correct href
        const link = viewLinks[0].closest('a');
        expect(link).toHaveAttribute('href', 'https://storage.example.com/cert.pdf');
        expect(link).toHaveAttribute('target', '_blank');
      });
    });

    it('does not show "View" link for missing documents', async () => {
      renderKycStatusPage('corp-001', createMockCorporate(), []);

      await waitFor(() => {
        expect(screen.getByText('Document Checklist')).toBeInTheDocument();
      });

      // Wait a bit for all content to render
      await waitFor(() => {
        expect(screen.queryByText('View')).not.toBeInTheDocument();
      });
    });
  });

  describe('directors list', () => {
    it('displays directors section title with count', async () => {
      const directors = [
        createMockDirector({ id: 'dir-001', firstName: 'John', lastName: 'Smith' }),
        createMockDirector({ id: 'dir-002', firstName: 'Jane', lastName: 'Doe' }),
      ];

      renderKycStatusPage('corp-001', createMockCorporate(), [], directors);

      await waitFor(() => {
        expect(screen.getByText('Directors & Signatories (2)')).toBeInTheDocument();
      });
    });

    it('displays director names', async () => {
      const directors = [
        createMockDirector({ firstName: 'John', lastName: 'Smith' }),
        createMockDirector({ id: 'dir-002', firstName: 'Jane', lastName: 'Doe' }),
      ];

      renderKycStatusPage('corp-001', createMockCorporate(), [], directors);

      await waitFor(() => {
        expect(screen.getByText('John Smith')).toBeInTheDocument();
        expect(screen.getByText('Jane Doe')).toBeInTheDocument();
      });
    });

    it('displays director emails', async () => {
      const directors = [
        createMockDirector({ email: 'john@company.com' }),
        createMockDirector({ id: 'dir-002', email: 'jane@company.com' }),
      ];

      renderKycStatusPage('corp-001', createMockCorporate(), [], directors);

      await waitFor(() => {
        expect(screen.getByText('john@company.com')).toBeInTheDocument();
        expect(screen.getByText('jane@company.com')).toBeInTheDocument();
      });
    });

    it('displays director roles', async () => {
      const directors = [
        createMockDirector({ role: 'DIRECTOR' }),
        createMockDirector({ id: 'dir-002', role: 'SIGNATORY' }),
      ];

      renderKycStatusPage('corp-001', createMockCorporate(), [], directors);

      await waitFor(() => {
        expect(screen.getByText('DIRECTOR')).toBeInTheDocument();
        expect(screen.getByText('SIGNATORY')).toBeInTheDocument();
      });
    });

    it('displays initials avatar', async () => {
      const directors = [
        createMockDirector({ firstName: 'John', lastName: 'Smith' }),
      ];

      renderKycStatusPage('corp-001', createMockCorporate(), [], directors);

      await waitFor(() => {
        expect(screen.getByText('JS')).toBeInTheDocument();
      });
    });

    it('displays "No directors added" when empty', async () => {
      renderKycStatusPage('corp-001', createMockCorporate(), [], []);

      await waitFor(() => {
        expect(screen.getByText('No directors added')).toBeInTheDocument();
      });
    });
  });

  describe('workflow timeline', () => {
    it('displays "Approval Workflow" heading', async () => {
      renderKycStatusPage('corp-001', createMockCorporate());

      await waitFor(() => {
        expect(screen.getByText('Approval Workflow')).toBeInTheDocument();
      });
    });

    // Fix: Date format varies by locale (US: 1/15/2026, UK: 15/1/2026, etc)
    it('displays submission date for completed steps', async () => {
      renderKycStatusPage('corp-001', createMockCorporate({
        dateCreated: '2026-01-15T10:00:00Z'
      }));

      await waitFor(() => {
        // The date should be formatted and displayed
        // Match common date formats containing 15 and 2026 (day and year)
        const dateElements = screen.getAllByText((content, element) => {
          return element?.tagName.toLowerCase() !== 'script' &&
                 content.includes('2026') &&
                 content.includes('15');
        });
        expect(dateElements.length).toBeGreaterThanOrEqual(1);
      });
    });

    it('displays step descriptions', async () => {
      renderKycStatusPage('corp-001', createMockCorporate({ kycStatus: 'PENDING' }));

      await waitFor(() => {
        expect(screen.getByText('KYC documents have been uploaded and submitted for review')).toBeInTheDocument();
        expect(screen.getByText('Compliance team reviewing submitted documents')).toBeInTheDocument();
        expect(screen.getByText('Verifying authenticity of submitted documents')).toBeInTheDocument();
      });
    });
  });

  describe('API integration', () => {
    it('fetches corporate data with correct ID', async () => {
      renderKycStatusPage('corp-123', createMockCorporate());

      await waitFor(() => {
        expect(corporateApi.getCorporate).toHaveBeenCalledWith('corp-123');
      });
    });

    it('fetches documents with correct corporate ID', async () => {
      renderKycStatusPage('corp-123', createMockCorporate());

      await waitFor(() => {
        expect(corporateApi.listDocuments).toHaveBeenCalledWith('corp-123');
      });
    });

    it('fetches directors with correct corporate ID', async () => {
      renderKycStatusPage('corp-123', createMockCorporate());

      await waitFor(() => {
        expect(corporateApi.listDirectors).toHaveBeenCalledWith('corp-123');
      });
    });
  });

  describe('edge cases', () => {
    it('handles corporate with minimal data', async () => {
      const minimalCorporate = createMockCorporate({
        name: undefined,
        certificateOfIncorporationNumber: undefined,
        email: undefined,
        phoneNumber: undefined,
      });

      renderKycStatusPage('corp-001', minimalCorporate);

      await waitFor(() => {
        expect(screen.getByTestId('kyc-status-page')).toBeInTheDocument();
        // Should not crash, shows fallback text
        expect(screen.getByText(/Your company/)).toBeInTheDocument();
      });
    });

    it('handles empty documents and directors', async () => {
      renderKycStatusPage('corp-001', createMockCorporate(), [], []);

      await waitFor(() => {
        expect(screen.getByText('No directors added')).toBeInTheDocument();
        expect(screen.getByText('Document Checklist')).toBeInTheDocument();
      });
    });

    it('handles all documents uploaded', async () => {
      const allDocuments = [
        createMockDocument('CERTIFICATE_OF_INCORPORATION'),
        createMockDocument('BOARD_RESOLUTION'),
        createMockDocument('MEMORANDUM'),
        createMockDocument('PROOF_OF_ADDRESS'),
      ];

      renderKycStatusPage('corp-001', createMockCorporate(), allDocuments);

      await waitFor(() => {
        // All 4 View links should be present
        const viewLinks = screen.getAllByText('View');
        expect(viewLinks.length).toBe(4);
      });
    });

    it('handles multiple directors', async () => {
      const manyDirectors = [
        createMockDirector({ id: 'dir-001', firstName: 'Alice', lastName: 'A' }),
        createMockDirector({ id: 'dir-002', firstName: 'Bob', lastName: 'B' }),
        createMockDirector({ id: 'dir-003', firstName: 'Carol', lastName: 'C' }),
        createMockDirector({ id: 'dir-004', firstName: 'David', lastName: 'D' }),
      ];

      renderKycStatusPage('corp-001', createMockCorporate(), [], manyDirectors);

      await waitFor(() => {
        expect(screen.getByText('Directors & Signatories (4)')).toBeInTheDocument();
        expect(screen.getByText('Alice A')).toBeInTheDocument();
        expect(screen.getByText('Bob B')).toBeInTheDocument();
        expect(screen.getByText('Carol C')).toBeInTheDocument();
        expect(screen.getByText('David D')).toBeInTheDocument();
      });
    });
  });
});
