/**
 * Unit tests for ClientListPage (SOUPFIN-14 frontend fixes).
 *
 * Verifies:
 *  - The NAME column never renders blank — falls back to firstName+lastName,
 *    then companyName, then email, then a deterministic placeholder when
 *    the backend response omits `name` (the reported bug).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClientListPage } from '../ClientListPage';
import type { Client } from '../../../types';

vi.mock('../../../api', () => ({
  listClients: vi.fn(),
  deleteClient: vi.fn(),
}));

import { listClients } from '../../../api';

function createMockClient(overrides: Partial<Client> = {}): Client {
  return {
    id: 'client-123',
    name: '',
    clientType: 'INDIVIDUAL',
    email: '',
    phone: '',
    address: '',
    firstName: '',
    lastName: '',
    companyName: '',
    archived: false,
    dateCreated: '2024-01-15T10:00:00Z',
    lastUpdated: '2024-01-15T10:00:00Z',
    tenantId: 'tenant-1',
    ...overrides,
  } as Client;
}

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ClientListPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('ClientListPage (SOUPFIN-14 name fallback)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses backend `name` when it is populated', async () => {
    vi.mocked(listClients).mockResolvedValue([
      createMockClient({ id: 'c1', name: 'Alice Smith' }),
    ]);
    renderPage();
    await waitFor(() => expect(screen.getByTestId('client-link-c1')).toHaveTextContent('Alice Smith'));
  });

  it('falls back to firstName + lastName when `name` is omitted (the reported bug)', async () => {
    // Reproduces SOUPFIN-14: /rest/client/index.json returns blank `name` so
    // the NAME column was rendering empty. With the fix we synthesise the
    // display name on the client.
    vi.mocked(listClients).mockResolvedValue([
      createMockClient({
        id: 'c2',
        name: '',
        firstName: 'Alice',
        lastName: 'Smith',
        clientType: 'INDIVIDUAL',
      }),
    ]);
    renderPage();
    await waitFor(() => expect(screen.getByTestId('client-link-c2')).toHaveTextContent('Alice Smith'));
  });

  it('falls back to companyName for corporate clients when `name` is missing', async () => {
    vi.mocked(listClients).mockResolvedValue([
      createMockClient({
        id: 'c3',
        name: '',
        firstName: '',
        lastName: '',
        companyName: 'Acme Corp',
        clientType: 'CORPORATE',
      }),
    ]);
    renderPage();
    await waitFor(() => expect(screen.getByTestId('client-link-c3')).toHaveTextContent('Acme Corp'));
  });

  it('falls back to email when no name or company is available', async () => {
    vi.mocked(listClients).mockResolvedValue([
      createMockClient({
        id: 'c4',
        name: '',
        email: 'unknown@example.com',
      }),
    ]);
    renderPage();
    await waitFor(() => expect(screen.getByTestId('client-link-c4')).toHaveTextContent('unknown@example.com'));
  });

  it('falls back to "Unnamed client" as the last resort', async () => {
    vi.mocked(listClients).mockResolvedValue([
      createMockClient({ id: 'c5', name: '', email: '' }),
    ]);
    renderPage();
    await waitFor(() => expect(screen.getByTestId('client-link-c5')).toHaveTextContent('Unnamed client'));
  });
});
