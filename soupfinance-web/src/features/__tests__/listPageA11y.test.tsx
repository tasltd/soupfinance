/**
 * Cross-page accessibility regression tests for form controls (SOUPFIN-33 #6).
 *
 * Reported on app.soupfinance.com/clients:
 *   "No label associated with a form field (count: 8)"
 *   "A form field element should have an id or name attribute (count: 8)"
 *
 * The issue asks to prioritise the search inputs and type-filter dropdowns on list
 * pages. Rather than pin one control per page (which rots the moment a filter is
 * added), each test SCANS every rendered <input>/<select>/<textarea> and asserts the
 * two properties the console audit checks:
 *
 *   1. the control carries an `id` or a `name`
 *   2. the control has an accessible name (aria-label, aria-labelledby, or a
 *      <label for=…> pointing at it)
 *
 * That makes the test a standing guard: a new unlabelled filter fails it immediately.
 *
 * This also covers the Ledger/Register date filters, which is the same underlying
 * defect reported separately as #1 ("0/0/0") — an empty native date control with no
 * accessible name serialises as three anonymous "0" spinbuttons.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../api', async () => {
  const actual = await vi.importActual<typeof import('../../api')>('../../api');
  return { ...actual, listClients: vi.fn(), deleteClient: vi.fn(), listVendors: vi.fn(), deleteVendor: vi.fn() };
});
vi.mock('../../api/endpoints/ledger', async () => {
  const actual =
    await vi.importActual<typeof import('../../api/endpoints/ledger')>('../../api/endpoints/ledger');
  return { ...actual, listLedgerTransactions: vi.fn(), listLedgerAccounts: vi.fn() };
});
vi.mock('../../api/endpoints/settings', () => ({
  agentApi: { list: vi.fn(), delete: vi.fn() },
}));

import { listClients, listVendors } from '../../api';
import { listLedgerTransactions, listLedgerAccounts } from '../../api/endpoints/ledger';
import { agentApi } from '../../api/endpoints/settings';

import { ClientListPage } from '../clients/ClientListPage';
import { VendorListPage } from '../vendors/VendorListPage';
import { LedgerTransactionsPage } from '../ledger/LedgerTransactionsPage';
import UserListPage from '../settings/UserListPage';
import { TopNav } from '../../components/layout/TopNav';

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function controlsIn(container: HTMLElement): Control[] {
  return Array.from(
    container.querySelectorAll<Control>('input:not([type="hidden"]), select, textarea')
  );
}

/** A short, stable way to name a control in a failure message. */
function describeControl(el: Control): string {
  const attrs = ['id', 'name', 'type', 'placeholder', 'data-testid']
    .map((a) => (el.getAttribute(a) ? `${a}="${el.getAttribute(a)}"` : null))
    .filter(Boolean)
    .join(' ');
  return `<${el.tagName.toLowerCase()} ${attrs || '(no identifying attributes)'}>`;
}

/** Mirrors the browser console audit: aria-label / aria-labelledby / <label for>. */
function accessibleNameOf(el: Control, container: HTMLElement): string {
  const aria = el.getAttribute('aria-label');
  if (aria?.trim()) return aria.trim();

  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => container.ownerDocument.getElementById(id)?.textContent ?? '')
      .join(' ')
      .trim();
    if (text) return text;
  }

  if (el.id) {
    const label = container.ownerDocument.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (label?.textContent?.trim()) return label.textContent.trim();
  }

  const wrapping = el.closest('label');
  if (wrapping?.textContent?.trim()) return wrapping.textContent.trim();

  return '';
}

function expectAllControlsAccessible(container: HTMLElement, minimumExpected: number) {
  const controls = controlsIn(container);

  // Guard against a vacuous pass: if the page rendered no controls at all (e.g. an
  // error state swallowed the filters) the scan below would trivially succeed.
  expect(controls.length).toBeGreaterThanOrEqual(minimumExpected);

  const missingIdentity = controls.filter((el) => !el.id && !el.getAttribute('name'));
  expect(
    missingIdentity.map(describeControl),
    'controls with neither an id nor a name attribute'
  ).toEqual([]);

  const unnamed = controls.filter((el) => !accessibleNameOf(el, container));
  expect(unnamed.map(describeControl), 'controls with no accessible name').toEqual([]);
}

function renderPage(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('List page form controls are labelled and identifiable (SOUPFIN-33 #6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listClients).mockResolvedValue([]);
    vi.mocked(listVendors).mockResolvedValue([]);
    vi.mocked(listLedgerAccounts).mockResolvedValue([]);
    vi.mocked(listLedgerTransactions).mockResolvedValue([]);
    vi.mocked(agentApi.list).mockResolvedValue([]);
  });

  it('/clients — search input and type filter (the page named in the report)', async () => {
    const { container } = renderPage(<ClientListPage />);
    await screen.findByTestId('client-list-page');

    // search + type filter
    expectAllControlsAccessible(container, 2);
    expect(screen.getByLabelText('Search clients')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter clients by type')).toBeInTheDocument();
  });

  it('/vendors — search input', async () => {
    const { container } = renderPage(<VendorListPage />);
    await screen.findByTestId('vendor-list-page');

    expectAllControlsAccessible(container, 1);
    expect(screen.getByLabelText('Search vendors')).toBeInTheDocument();
  });

  it('/settings/users — search input', async () => {
    const { container } = renderPage(<UserListPage />);
    await screen.findByTestId('user-list-page');

    expectAllControlsAccessible(container, 1);
    expect(screen.getByLabelText('Search users')).toBeInTheDocument();
  });

  it('/ledger/transactions — account, date and status filters', async () => {
    const { container } = renderPage(<LedgerTransactionsPage />);
    await screen.findByTestId('ledger-filters');

    // account + from + to + status
    expectAllControlsAccessible(container, 4);
    expect(screen.getByLabelText('Filter transactions by account')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter transactions from date')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter transactions to date')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter transactions by status')).toBeInTheDocument();
  });

  it('TopNav global search — renders on EVERY authenticated page, so it counted everywhere', () => {
    const { container } = renderPage(<TopNav />);

    expectAllControlsAccessible(container, 1);
    const search = container.querySelector('#global-search') as HTMLInputElement;
    expect(search).not.toBeNull();
    expect(search.name).toBe('global-search');
  });
});

describe('The date filters are never anonymous zero spinbuttons (SOUPFIN-33 #1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listLedgerAccounts).mockResolvedValue([]);
    vi.mocked(listLedgerTransactions).mockResolvedValue([]);
  });

  it.each([
    ['Filter transactions from date', 'ledger-start-date-filter'],
    ['Filter transactions to date', 'ledger-end-date-filter'],
  ])('%s starts empty, named, and described as inactive', async (accessibleName, expectedId) => {
    renderPage(<LedgerTransactionsPage />);
    await screen.findByTestId('ledger-filters');

    const input = screen.getByLabelText(accessibleName) as HTMLInputElement;
    expect(input.type).toBe('date');
    expect(input.id).toBe(expectedId);
    expect(input.name).toBe(expectedId);
    // Empty by default — and the emptiness is ANNOUNCED rather than rendered as 0/0/0.
    expect(input.value).toBe('');
    const hintId = input.getAttribute('aria-describedby');
    expect(hintId).toBeTruthy();
    expect(document.getElementById(hintId!)?.textContent).toBe(
      'No date selected. All dates are included.'
    );
  });
});
