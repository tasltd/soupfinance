/**
 * Unit tests for ClientDetailPage delete flow (SOUP-1929).
 *
 * Verifies:
 *  - The header + delete dialog show a resolved display name, never blank, even
 *    when the `show` payload omits the computed `name` field.
 *  - The soft-delete proceeds (calls deleteClient) and navigates back on success.
 *  - A failed delete keeps the modal open and surfaces an error.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClientDetailPage } from '../ClientDetailPage';
import type { Client } from '../../../types';

const navigateMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock('../../../api', () => ({
  getClient: vi.fn(),
  deleteClient: vi.fn(),
}));

import { getClient, deleteClient } from '../../../api';

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

function renderPage(id = 'client-123') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/clients/${id}`]}>
        <Routes>
          <Route path="/clients/:id" element={<ClientDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ClientDetailPage delete flow (SOUP-1929)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the resolved display name in the delete dialog when `name` is omitted', async () => {
    const user = userEvent.setup();
    vi.mocked(getClient).mockResolvedValue(
      createMockClient({ id: 'client-123', name: '', firstName: 'Alice', lastName: 'Smith' }),
    );
    renderPage();

    await user.click(await screen.findByTestId('client-detail-delete'));

    const modal = await screen.findByTestId('delete-confirmation-modal');
    expect(modal).toHaveTextContent('Are you sure you want to delete Alice Smith?');
  });

  it('proceeds with the soft-delete and navigates back on success', async () => {
    const user = userEvent.setup();
    vi.mocked(getClient).mockResolvedValue(createMockClient({ id: 'client-123', name: 'Alice Smith' }));
    vi.mocked(deleteClient).mockResolvedValue(undefined);
    renderPage();

    await user.click(await screen.findByTestId('client-detail-delete'));
    await user.click(await screen.findByTestId('delete-confirm-button'));

    await waitFor(() => expect(deleteClient).toHaveBeenCalledWith('client-123'));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/clients'));
  });

  it('keeps the modal open and shows an error when the delete fails', async () => {
    const user = userEvent.setup();
    vi.mocked(getClient).mockResolvedValue(createMockClient({ id: 'client-123', name: 'Alice Smith' }));
    vi.mocked(deleteClient).mockRejectedValue(new Error('500'));
    renderPage();

    await user.click(await screen.findByTestId('client-detail-delete'));
    await user.click(await screen.findByTestId('delete-confirm-button'));

    expect(await screen.findByTestId('client-delete-error')).toBeInTheDocument();
    expect(screen.getByTestId('delete-confirmation-modal')).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
