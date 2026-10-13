/**
 * Client pages in German (SOUPFIN-167)
 *
 * The three client pages had no translation namespace at all. These tests render
 * each page in German and check the German copy is shown (including the delete
 * dialog, the "no results" sentences and zod validation messages) and that none
 * of the old English copy leaks through.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { render, screen, within, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ReactElement } from 'react';
import type { Client } from '../../../types';

vi.mock('../../../api', () => ({
  listClients: vi.fn(),
  deleteClient: vi.fn(),
  getClient: vi.fn(),
  createClient: vi.fn(),
  updateClient: vi.fn(),
}));

import { listClients, deleteClient, getClient, createClient } from '../../../api';
import i18n from '../../../i18n';
import { ClientListPage } from '../ClientListPage';
import { ClientDetailPage } from '../ClientDetailPage';
import { ClientFormPage } from '../ClientFormPage';

function client(overrides: Partial<Client> = {}): Client {
  return {
    id: 'c1',
    name: 'Anna Schmidt',
    clientType: 'INDIVIDUAL',
    email: 'anna@beispiel.de',
    phone: '',
    address: '',
    firstName: 'Anna',
    lastName: 'Schmidt',
    archived: false,
    dateCreated: '2024-01-15T10:00:00Z',
    lastUpdated: '2024-01-15T10:00:00Z',
    ...overrides,
  } as Client;
}

function renderAt(element: ReactElement, path: string, route = path) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path={path} element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function textNodes(root: HTMLElement): string[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const out: string[] = [];
  while (walker.nextNode()) {
    const text = walker.currentNode.textContent?.trim();
    if (text) out.push(text);
  }
  return out;
}

function expectNoEnglish(root: HTMLElement, english: string[]) {
  const texts = textNodes(root);
  for (const phrase of english) {
    expect(texts, `English "${phrase}" leaked`).not.toContain(phrase);
  }
}

beforeEach(async () => {
  vi.clearAllMocks();
  await i18n.changeLanguage('de');
});

afterAll(async () => {
  await i18n.changeLanguage('en');
});

describe('ClientListPage in German', () => {
  it('translates the header, filters, columns, type badges and action labels', async () => {
    vi.mocked(listClients).mockResolvedValue([
      client(),
      client({ id: 'c2', name: '', firstName: '', lastName: '', clientType: 'CORPORATE', companyName: 'Muster AG' }),
      // Nothing to show a name from: the placeholder must be German too
      client({ id: 'c3', name: '', firstName: '', lastName: '', companyName: '', email: '' }),
    ]);
    const { container } = renderAt(<ClientListPage />, '/clients');

    const row = await screen.findByTestId('client-row-c1');
    expect(screen.getByTestId('client-list-heading')).toHaveTextContent('Kunden');
    expect(screen.getByTestId('client-new-button')).toHaveTextContent('Neuer Kunde');
    expect(screen.getByTestId('client-search-input')).toHaveAttribute('placeholder', 'Kunden suchen...');
    expect(screen.getByTestId('client-search-input')).toHaveAccessibleName('Kunden suchen');
    const options = within(screen.getByTestId('client-type-filter')).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['Alle Typen', 'Privatperson', 'Unternehmen']);
    const headers = within(screen.getByTestId('client-list-table')).getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(['Name', 'Typ', 'E-Mail', 'Telefon', 'Aktionen']);
    expect(row).toHaveTextContent('Privatperson');
    expect(screen.getByTestId('client-row-c2')).toHaveTextContent('Unternehmen');
    expect(screen.getByTestId('client-link-c3')).toHaveTextContent('Unbenannter Kunde');
    expect(screen.getByTestId('client-edit-c1')).toHaveAccessibleName('Bearbeiten');
    expect(screen.getByTestId('client-delete-c1')).toHaveAttribute('title', 'Löschen');
    expectNoEnglish(container, ['Clients', 'New Client', 'Individual', 'Corporate', 'Email', 'Phone', 'Actions', 'Unnamed client', 'All Types']);
  });

  it('translates the delete dialog and keeps the client name bold', async () => {
    vi.mocked(listClients).mockResolvedValue([client()]);
    vi.mocked(deleteClient).mockRejectedValue(new Error('500'));
    renderAt(<ClientListPage />, '/clients');

    await userEvent.click(await screen.findByTestId('client-delete-c1'));
    const modal = screen.getByTestId('delete-confirmation-modal');
    expect(modal).toHaveTextContent('Kunde löschen');
    expect(modal).toHaveTextContent('Möchten Sie Anna Schmidt wirklich löschen?');
    expect(within(modal).getByText('Anna Schmidt')).toHaveClass('font-semibold');
    expect(within(modal).getByTestId('client-delete-modal-close')).toHaveAccessibleName('Schließen');

    await userEvent.click(screen.getByTestId('delete-confirm-button'));
    expect(await screen.findByTestId('client-delete-error')).toHaveTextContent(
      'Der Kunde konnte nicht gelöscht werden. Bitte versuchen Sie es erneut.'
    );
    expectNoEnglish(modal, ['Delete Client', 'Cancel', 'Delete']);
  });

  it('puts the search term inside a whole German sentence when nothing matches', async () => {
    vi.mocked(listClients).mockResolvedValue([]);
    renderAt(<ClientListPage />, '/clients');
    await screen.findByTestId('client-list-empty');
    expect(screen.getByTestId('client-list-empty')).toHaveTextContent('Noch keine Kunden');

    await userEvent.type(screen.getByTestId('client-search-input'), 'zzz');
    const noResults = await screen.findByTestId('client-list-no-results');
    expect(noResults).toHaveTextContent('Keine Kunden entsprechen „zzz“. Versuchen Sie einen anderen Suchbegriff.');

    await userEvent.selectOptions(screen.getByTestId('client-type-filter'), 'CORPORATE');
    await waitFor(() =>
      expect(screen.getByTestId('client-list-no-results')).toHaveTextContent(
        'Keine Firmenkunden entsprechen „zzz“. Erweitern Sie die Suche oder entfernen Sie Filter.'
      )
    );
    expect(screen.getByTestId('client-list-clear-filters-button')).toHaveTextContent('Filter zurücksetzen');
  });

  it('keeps a very long search term intact in the sentence', async () => {
    vi.mocked(listClients).mockResolvedValue([]);
    renderAt(<ClientListPage />, '/clients');
    await screen.findByTestId('client-list-empty');
    const longTerm = 'x'.repeat(300);
    await userEvent.click(screen.getByTestId('client-search-input'));
    await userEvent.paste(longTerm);
    expect(await screen.findByTestId('client-list-no-results')).toHaveTextContent(`„${longTerm}“`);
  });
});

describe('ClientDetailPage in German', () => {
  it('translates the sections, the empty-field placeholder and quick actions', async () => {
    vi.mocked(getClient).mockResolvedValue(
      client({ clientType: 'CORPORATE', name: 'Muster AG', firstName: '', lastName: '', companyName: 'Muster AG', phone: '' })
    );
    const { container } = renderAt(<ClientDetailPage />, '/clients/:id', '/clients/c1');

    expect(await screen.findByText('Firmenangaben')).toBeInTheDocument();
    expect(screen.getByText('Kontaktdaten')).toBeInTheDocument();
    expect(screen.getByText('Rechnungsadresse')).toBeInTheDocument();
    expect(screen.getAllByText('Nicht angegeben').length).toBeGreaterThanOrEqual(3);
    expect(screen.getByTestId('client-create-invoice')).toHaveTextContent('Rechnung erstellen');
    expect(screen.getByTestId('client-detail-edit')).toHaveTextContent('Bearbeiten');
    expectNoEnglish(container, ['Company Information', 'Contact Information', 'Billing Address', 'Not provided', 'Quick Actions', 'Back to Clients', 'Corporate']);
  });

  it('translates the not-found state', async () => {
    vi.mocked(getClient).mockRejectedValue(new Error('404'));
    renderAt(<ClientDetailPage />, '/clients/:id', '/clients/missing');
    expect(await screen.findByText('Kunde nicht gefunden')).toBeInTheDocument();
    expect(screen.getByText('Zurück zu den Kunden')).toBeInTheDocument();
  });
});

describe('ClientFormPage in German', () => {
  it('translates labels, placeholders and buttons', async () => {
    const { container } = renderAt(<ClientFormPage />, '/clients/new');
    expect(await screen.findByTestId('client-form-heading')).toHaveTextContent('Neuer Kunde');
    expect(screen.getByTestId('client-form-save')).toHaveTextContent('Kunde anlegen');
    expect(screen.getByLabelText(/Vorname/)).toHaveAttribute('placeholder', 'Vorname eingeben');
    expect(screen.getByLabelText(/^E-Mail/)).toBeInTheDocument();
    expectNoEnglish(container, ['New Client', 'Create Client', 'Personal Information', 'First Name', 'Contact Information', 'Billing Address', 'Cancel']);
  });

  it('shows zod validation messages in German and re-translates them on a language switch', async () => {
    renderAt(<ClientFormPage />, '/clients/new');
    await userEvent.click(await screen.findByTestId('client-type-corporate'));
    await userEvent.type(screen.getByLabelText(/^E-Mail/), 'not-an-email');
    await userEvent.click(screen.getByTestId('client-form-save'));

    expect(await screen.findByText('Ungültige E-Mail-Adresse')).toBeInTheDocument();
    expect(createClient).not.toHaveBeenCalled();

    await act(async () => {
      await i18n.changeLanguage('nl');
    });
    expect(screen.getByText('Ongeldig e-mailadres')).toBeInTheDocument();
    expect(screen.queryByText('validation.emailInvalid')).not.toBeInTheDocument();
  });

  it('translates the cross-field rule for a corporate client with no company name', async () => {
    renderAt(<ClientFormPage />, '/clients/new');
    await userEvent.click(await screen.findByTestId('client-type-corporate'));
    await userEvent.type(screen.getByLabelText(/^E-Mail/), 'firma@beispiel.de');
    await userEvent.click(screen.getByTestId('client-form-save'));
    expect(await screen.findByText('Der Firmenname ist für Firmenkunden erforderlich')).toBeInTheDocument();
  });

  it('translates the too-long message at the field limit plus one', async () => {
    renderAt(<ClientFormPage />, '/clients/new');
    const firstName = await screen.findByLabelText(/Vorname/);
    await userEvent.click(firstName);
    await userEvent.paste('a'.repeat(101));
    await userEvent.type(screen.getByLabelText(/Nachname/), 'Schmidt');
    await userEvent.type(screen.getByLabelText(/^E-Mail/), 'anna@beispiel.de');
    await userEvent.click(screen.getByTestId('client-form-save'));
    expect(await screen.findByText('Der Vorname ist zu lang')).toBeInTheDocument();
  });
});
