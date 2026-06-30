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
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClientListPage } from '../ClientListPage';
import type { Client } from '../../../types';

vi.mock('../../../api', () => ({
  listClients: vi.fn(),
  deleteClient: vi.fn(),
}));

import { listClients, deleteClient } from '../../../api';

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

describe('ClientListPage delete flow (SOUP-1929)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the resolved display name (not a blank) in the confirm dialog when `name` is omitted', async () => {
    // Reproduces SOUP-1929 bug #1: the dialog used to bind the raw `client.name`
    // (blank from /rest/client/index.json) so it read "Are you sure you want to
    // delete ?". It must now use the same fallback as the table column.
    const user = userEvent.setup();
    vi.mocked(listClients).mockResolvedValue([
      createMockClient({ id: 'c1', name: '', firstName: 'Alice', lastName: 'Smith' }),
    ]);
    renderPage();

    await user.click(await screen.findByTestId('client-delete-c1'));

    const modal = await screen.findByTestId('delete-confirmation-modal');
    expect(modal).toHaveTextContent('Are you sure you want to delete Alice Smith?');
    expect(modal).not.toHaveTextContent(/delete\s*\?/);
  });

  it('proceeds with the soft-delete (calls deleteClient) and closes the modal on success', async () => {
    // Bug #2: the soft-delete must always proceed — there is no relatedList gate.
    const user = userEvent.setup();
    vi.mocked(listClients).mockResolvedValue([
      createMockClient({ id: 'c1', name: 'Alice Smith' }),
    ]);
    vi.mocked(deleteClient).mockResolvedValue(undefined);
    renderPage();

    await user.click(await screen.findByTestId('client-delete-c1'));
    await user.click(await screen.findByTestId('delete-confirm-button'));

    await waitFor(() => expect(deleteClient).toHaveBeenCalledWith('c1'));
    // Modal closes only after the DELETE resolves — full round-trip verified.
    await waitFor(() =>
      expect(screen.queryByTestId('delete-confirmation-modal')).not.toBeInTheDocument(),
    );
  });

  it('keeps the modal open and shows an error message when the delete fails', async () => {
    const user = userEvent.setup();
    vi.mocked(listClients).mockResolvedValue([
      createMockClient({ id: 'c1', name: 'Alice Smith' }),
    ]);
    vi.mocked(deleteClient).mockRejectedValue(new Error('500'));
    renderPage();

    await user.click(await screen.findByTestId('client-delete-c1'));
    await user.click(await screen.findByTestId('delete-confirm-button'));

    expect(await screen.findByTestId('client-delete-error')).toBeInTheDocument();
    // Modal stays open so the user can retry rather than silently stalling.
    expect(screen.getByTestId('delete-confirmation-modal')).toBeInTheDocument();
  });
});

describe('ClientListPage filter/search empty states (SOUPFIN-16)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows "No clients yet" with the New Client CTA when no clients exist AND no filters are active', async () => {
    vi.mocked(listClients).mockResolvedValue([]);
    renderPage();

    const empty = await screen.findByTestId('client-list-empty');
    expect(empty).toHaveTextContent(/No clients yet/i);
    // Empty-state CTA still points users at the create flow.
    expect(screen.getByTestId('client-create-first-button')).toBeInTheDocument();
    // The "no results" copy must NOT appear when there are no filters.
    expect(screen.queryByTestId('client-list-no-results')).not.toBeInTheDocument();
  });

  it('shows "No clients match your filters" when a search term filters everyone out', async () => {
    const user = userEvent.setup();
    // First call returns the full list, second call (after typing) returns empty.
    vi.mocked(listClients)
      .mockResolvedValueOnce([
        createMockClient({ id: 'c1', name: 'Alice Smith', clientType: 'INDIVIDUAL' }),
      ])
      .mockResolvedValue([]);

    renderPage();

    // Wait for the initial list to render so we know the page is interactive.
    await screen.findByTestId('client-link-c1');

    // Type a search term that doesn't match anything.
    const search = screen.getByTestId('client-search-input');
    await user.type(search, 'zzz-no-match');

    // Now we expect the no-results state, NOT the "No clients yet" copy.
    const noResults = await screen.findByTestId('client-list-no-results');
    expect(noResults).toHaveTextContent(/No clients match your filters/i);
    expect(noResults).toHaveTextContent(/zzz-no-match/);
    expect(screen.queryByTestId('client-list-empty')).not.toBeInTheDocument();
    // Clear-filters CTA must be present so the user can reset in one click.
    expect(screen.getByTestId('client-list-clear-filters-button')).toBeInTheDocument();
  });

  it('shows "No clients match your filters" with type-specific copy when only the type filter is active', async () => {
    const user = userEvent.setup();
    vi.mocked(listClients)
      .mockResolvedValueOnce([
        createMockClient({ id: 'c1', name: 'Bob', clientType: 'INDIVIDUAL' }),
      ])
      .mockResolvedValue([]);

    renderPage();
    await screen.findByTestId('client-link-c1');

    // Change the type filter to CORPORATE — the next fetch returns empty.
    const filter = screen.getByTestId('client-type-filter');
    await user.selectOptions(filter, 'CORPORATE');

    const noResults = await screen.findByTestId('client-list-no-results');
    expect(noResults).toHaveTextContent(/corporate clients/i);
  });

  it('applies a visible active style to the type filter when a type is selected (SOUPFIN-16)', async () => {
    const user = userEvent.setup();
    vi.mocked(listClients).mockResolvedValue([]);

    renderPage();
    const filter = (await screen.findByTestId('client-type-filter')) as HTMLSelectElement;

    // When no type is selected the filter should not have the active styling.
    // (The base class includes "focus:border-primary" so we match the
    // standalone active marker `ring-primary/20 font-semibold` instead.)
    expect(filter.className).not.toMatch(/ring-primary\/20 font-semibold/);

    await user.selectOptions(filter, 'INDIVIDUAL');

    // After selecting a type, the dropdown gets a primary-colored ring +
    // font-semibold so the user can see the filter is being applied.
    expect(filter.className).toMatch(/ring-primary\/20/);
    expect(filter.className).toMatch(/font-semibold/);
  });
});
