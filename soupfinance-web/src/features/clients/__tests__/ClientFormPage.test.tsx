/**
 * Unit tests for ClientFormPage (SOUPFIN-14 frontend fixes).
 *
 * Verifies:
 *  - When editing an existing INDIVIDUAL client, the "Personal Information"
 *    section is rendered even if the backend mislabels the record as CORPORATE
 *    (the reported bug — Personal Information was "missing entirely").
 *  - The clientType toggle remains enabled while editing, so users can fix
 *    records that were saved with the wrong type.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClientFormPage } from '../ClientFormPage';
import type { Client } from '../../../types';

vi.mock('../../../api', () => ({
  getClient: vi.fn(),
  createClient: vi.fn(),
  updateClient: vi.fn(),
}));

import { getClient } from '../../../api';

function createMockClient(overrides: Partial<Client> = {}): Client {
  return {
    id: 'client-abc',
    name: 'Alice Smith',
    clientType: 'INDIVIDUAL',
    email: 'alice@example.com',
    phone: '',
    address: '',
    firstName: 'Alice',
    lastName: 'Smith',
    companyName: '',
    archived: false,
    dateCreated: '2024-01-15T10:00:00Z',
    lastUpdated: '2024-01-15T10:00:00Z',
    tenantId: 'tenant-1',
    ...overrides,
  } as Client;
}

function renderEditPage(clientId: string) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/clients/${clientId}/edit`]}>
        <Routes>
          <Route path="/clients/:id/edit" element={<ClientFormPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('ClientFormPage (SOUPFIN-14 fixes)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the Personal Information section when editing an INDIVIDUAL', async () => {
    vi.mocked(getClient).mockResolvedValue(
      createMockClient({ clientType: 'INDIVIDUAL', firstName: 'Alice', lastName: 'Smith' })
    );
    renderEditPage('client-abc');

    await waitFor(() =>
      expect(screen.getByTestId('client-form-first-name')).toBeInTheDocument()
    );
    expect(screen.getByTestId('client-form-last-name')).toBeInTheDocument();
  });

  it('infers INDIVIDUAL when the backend mislabels the record as CORPORATE but firstName/lastName are present', async () => {
    // The reported SOUPFIN-14 bug: backend always returns clientType=CORPORATE,
    // hiding the Personal Information section. We infer the type from populated
    // fields so the user can still see and edit firstName/lastName.
    vi.mocked(getClient).mockResolvedValue(
      createMockClient({
        clientType: 'CORPORATE' as never,
        firstName: 'Alice',
        lastName: 'Smith',
        companyName: '',
      })
    );
    renderEditPage('client-abc');

    await waitFor(() =>
      expect(screen.getByTestId('client-form-first-name')).toBeInTheDocument()
    );
    const firstNameInput = screen.getByTestId('client-form-first-name') as HTMLInputElement;
    expect(firstNameInput.value).toBe('Alice');
  });

  it('keeps the clientType toggle enabled while editing so misclassified records can be corrected', async () => {
    vi.mocked(getClient).mockResolvedValue(createMockClient());
    renderEditPage('client-abc');

    await waitFor(() => expect(screen.getByTestId('client-type-individual')).toBeInTheDocument());
    const individualButton = screen.getByTestId('client-type-individual') as HTMLButtonElement;
    const corporateButton = screen.getByTestId('client-type-corporate') as HTMLButtonElement;
    expect(individualButton.disabled).toBe(false);
    expect(corporateButton.disabled).toBe(false);
  });

  it('renders Company Information when editing a CORPORATE client with companyName but no individual fields', async () => {
    vi.mocked(getClient).mockResolvedValue(
      createMockClient({
        clientType: 'CORPORATE',
        firstName: '',
        lastName: '',
        companyName: 'Acme Corp',
      })
    );
    renderEditPage('client-abc');

    await waitFor(() =>
      expect(screen.getByTestId('client-form-company-name')).toBeInTheDocument()
    );
    const companyInput = screen.getByTestId('client-form-company-name') as HTMLInputElement;
    expect(companyInput.value).toBe('Acme Corp');
  });

  it('renders First Name and Last Name fields when editing a client that has them even after toggling to CORPORATE (SOUPFIN-16)', async () => {
    // SOUPFIN-16: The reported bug was that the Edit Client form was "missing the
    // First Name and Last Name input fields" — happens when the user toggles a
    // record with populated names to CORPORATE, hiding the Personal Information
    // section entirely. With the fix, the section continues to render while
    // editing so the user can still update name details.
    vi.mocked(getClient).mockResolvedValue(
      createMockClient({
        clientType: 'CORPORATE' as never,
        firstName: 'Alice',
        lastName: 'Smith',
        companyName: 'Acme Corp', // Hybrid record with BOTH individual + corporate fields
      })
    );
    renderEditPage('client-abc');

    // Even though the resolved type may swing to CORPORATE on this hybrid record,
    // First/Last Name must remain editable because they're populated in the DB.
    await waitFor(() =>
      expect(screen.getByTestId('client-form-personal-section')).toBeInTheDocument()
    );
    const firstNameInput = screen.getByTestId('client-form-first-name') as HTMLInputElement;
    const lastNameInput = screen.getByTestId('client-form-last-name') as HTMLInputElement;
    expect(firstNameInput.value).toBe('Alice');
    expect(lastNameInput.value).toBe('Smith');
  });
});

describe('ClientFormPage (SOUP-1836 corporate/unknown name mapping)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('back-fills Company Name from the generic `name` field when companyName is empty', async () => {
    // The backend /client/show response for a corporate record can surface the
    // company name only in the generic `name` field (companyName empty). The form
    // must still populate the Company Name input so it does not render blank.
    vi.mocked(getClient).mockResolvedValue(
      createMockClient({
        clientType: 'CORPORATE',
        name: 'Globex Industries',
        firstName: '',
        lastName: '',
        companyName: '',
      })
    );
    renderEditPage('client-abc');

    await waitFor(() =>
      expect(screen.getByTestId('client-form-company-name')).toBeInTheDocument()
    );
    const companyInput = screen.getByTestId('client-form-company-name') as HTMLInputElement;
    expect(companyInput.value).toBe('Globex Industries');
  });

  it('renders an editable name field for an "UNKNOWN" client type (only `name` returned)', async () => {
    // ITF / UNKNOWN client types return only `name` — neither firstName/lastName
    // nor companyName. Previously the form rendered neither the Personal nor the
    // Company section, leaving the client name completely uneditable. The fix
    // resolves these to the CORPORATE branch so a name field is always shown.
    vi.mocked(getClient).mockResolvedValue(
      createMockClient({
        clientType: 'UNKNOWN' as never,
        name: 'Estate of John Doe',
        firstName: '',
        lastName: '',
        companyName: '',
      })
    );
    renderEditPage('client-abc');

    await waitFor(() =>
      expect(screen.getByTestId('client-form-company-name')).toBeInTheDocument()
    );
    const nameInput = screen.getByTestId('client-form-company-name') as HTMLInputElement;
    expect(nameInput.value).toBe('Estate of John Doe');
  });
});
