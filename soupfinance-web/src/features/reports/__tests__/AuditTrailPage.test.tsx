/**
 * Added (SOUPFIN-159): the Audit Trail report.
 *
 * Only the HTTP client is mocked. Rows go through the real endpoint module, so
 * the request the page sends and the grouping it shows are both checked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import apiClient from '../../../api/client';
import { AuditTrailPage } from '../AuditTrailPage';
import type { AuditTrailRow } from '../../../types/auditTrail';

vi.mock('../../../api/client', () => ({
  default: { get: vi.fn() },
  normalizeToArray: (value: unknown) => (value == null ? [] : Array.isArray(value) ? value : [value]),
}));

const get = vi.mocked(apiClient.get);

const ROWS: AuditTrailRow[] = [
  { id: 1, className: 'soupbroker.finance.LedgerTransactionGroup', persistedObjectId: 'je-1', eventName: 'INSERT', actor: 'ama.mensah', uri: '/rest/ledgerTransaction/saveMultiple', dateCreated: '2026-10-12T09:00:00Z', propertyName: 'description', newValue: 'Office rent' },
  { id: 2, className: 'soupbroker.finance.LedgerTransactionGroup', persistedObjectId: 'je-1', eventName: 'UPDATE', actor: 'ama.mensah', uri: '/rest/ledgerTransactionGroup/post/je-1.json', dateCreated: '2026-10-12T10:00:00Z', propertyName: 'status', oldValue: 'PENDING', newValue: 'POSTED' },
  { id: 3, className: 'soupbroker.finance.LedgerTransactionGroup', persistedObjectId: 'je-1', eventName: 'UPDATE', actor: 'kofi.boateng', uri: '/rest/ledgerTransactionGroup/reverse/je-1.json', dateCreated: '2026-10-12T11:00:00Z', propertyName: 'status', oldValue: 'POSTED', newValue: 'REVERSED' },
  { id: 4, className: 'soupbroker.finance.Voucher', persistedObjectId: 'v-1', eventName: 'UPDATE', actor: 'kofi.boateng', uri: '/rest/voucher/update/v-1.json', dateCreated: '2026-10-11T08:00:00Z', propertyName: 'amount', oldValue: '100', newValue: '150' },
];

function lastQuery(): URLSearchParams {
  const url = get.mock.calls[get.mock.calls.length - 1][0] as string;
  return new URLSearchParams(url.split('?')[1]);
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AuditTrailPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  get.mockReset();
  get.mockResolvedValue({ data: ROWS });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AuditTrailPage', () => {
  it('asks for the last 30 days and lists one row per event with its user', async () => {
    renderPage();
    const table = await screen.findByTestId('audit-trail-table');
    await within(table).findByText('Status: POSTED → REVERSED');

    const q = lastQuery();
    expect(q.get('max')).toBe('1000');
    expect(q.get('from')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(q.get('to')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const days = (Date.parse(q.get('to')!) - Date.parse(q.get('from')!)) / 86_400_000;
    expect(days).toBe(29);

    const rows = within(table).getAllByTestId(/^audit-row-\d+$/);
    expect(rows.map((r) => [r.dataset.action, r.dataset.actor])).toEqual([
      ['REVERSED', 'kofi.boateng'],
      ['POSTED', 'ama.mensah'],
      ['CREATED', 'ama.mensah'],
      ['EDITED', 'kofi.boateng'],
    ]);
    expect(screen.getByTestId('audit-trail-total')).toHaveTextContent('4');
    expect(screen.getByTestId('audit-trail-users')).toHaveTextContent('2');
  });

  it('applies the event and user filters on submit, not while typing', async () => {
    renderPage();
    await screen.findByText('Status: POSTED → REVERSED');
    const callsBefore = get.mock.calls.length;

    await userEvent.selectOptions(screen.getByTestId('audit-filter-event'), 'POSTED');
    await userEvent.type(screen.getByTestId('audit-filter-user'), 'ama.mensah');
    expect(get.mock.calls.length).toBe(callsBefore);

    await userEvent.click(screen.getByTestId('audit-filter-apply'));
    await screen.findByText('Total events:');
    const table = screen.getByTestId('audit-trail-table');
    await vi.waitFor(() => expect(within(table).getAllByTestId(/^audit-row-\d+$/)).toHaveLength(1));
    expect(within(table).getByTestId('audit-row-0').dataset.action).toBe('POSTED');
    expect(lastQuery().get('actor')).toBe('ama.mensah');
    expect(lastQuery().get('search')).toBe('ama.mensah');
  });

  it('opens a row to show before and after values', async () => {
    renderPage();
    await screen.findByText('Status: POSTED → REVERSED');
    await userEvent.click(screen.getByTestId('audit-row-toggle-3'));
    const changes = screen.getByTestId('audit-row-changes-3');
    expect(changes).toHaveTextContent('Amount');
    expect(changes).toHaveTextContent('100');
    expect(changes).toHaveTextContent('150');
  });

  it('links a journal entry to its page and leaves an unroutable record as text', async () => {
    get.mockResolvedValue({
      data: [...ROWS, { id: 9, className: 'soupbroker.finance.LedgerTransaction', persistedObjectId: 'line-1', eventName: 'UPDATE', actor: 'ama.mensah', uri: '/rest/x', dateCreated: '2026-10-10T08:00:00Z', propertyName: 'memo', oldValue: 'a', newValue: 'b' }],
    });
    renderPage();
    await screen.findByText('Status: POSTED → REVERSED');
    expect(within(screen.getByTestId('audit-row-0')).getByRole('link')).toHaveAttribute('href', '/accounting/journal-entry/je-1');
    expect(within(screen.getByTestId('audit-row-3')).getByRole('link')).toHaveAttribute('href', '/accounting/vouchers/v-1');
    expect(within(screen.getByTestId('audit-row-4')).queryByRole('link')).toBeNull();
  });

  it('exports the filtered events as CSV', async () => {
    let saved: Blob | null = null;
    const createObjectURL = vi.fn((blob: Blob) => {
      saved = blob;
      return 'blob:audit';
    });
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });

    renderPage();
    await screen.findByText('Status: POSTED → REVERSED');
    await userEvent.click(screen.getByTestId('audit-trail-export-csv'));

    expect(saved).not.toBeNull();
    // jsdom's Blob has no text(); FileReader reads it the way a browser would.
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(saved!);
    });
    const lines = text.trim().split('\r\n');
    expect(lines[0]).toBe('Timestamp,User,Event,Record type,Record ID,Summary,Changes');
    expect(lines).toHaveLength(5);
    expect(lines[1]).toContain('kofi.boateng,Reversed,Journal entry,je-1');
  });

  it('refuses a start date after the end date', async () => {
    renderPage();
    await screen.findByText('Status: POSTED → REVERSED');
    const from = screen.getByTestId('audit-filter-from');
    await userEvent.clear(from);
    await userEvent.type(from, '2030-01-01');
    expect(screen.getByTestId('audit-filter-range-error')).toBeInTheDocument();
    expect(screen.getByTestId('audit-filter-apply')).toBeDisabled();
  });

  it('shows an empty state and disables export when nothing matches', async () => {
    get.mockResolvedValue({ data: [] });
    renderPage();
    expect(await screen.findByTestId('audit-trail-empty')).toHaveTextContent('No changes match these filters');
    expect(screen.getByTestId('audit-trail-export-csv')).toBeDisabled();
  });

  it('says when the backend cut the log off at its row cap', async () => {
    get.mockResolvedValue({
      data: Array.from({ length: 1000 }, (_, i) => ({
        id: i, className: 'soupbroker.finance.Voucher', persistedObjectId: `v-${i}`, eventName: 'INSERT',
        actor: 'ama.mensah', uri: '/rest/voucher', dateCreated: `2026-10-12T09:${String(Math.floor(i / 60) % 60).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}Z`,
        propertyName: 'amount', newValue: String(i),
      })),
    });
    renderPage();
    expect(await screen.findByTestId('audit-trail-truncated')).toHaveTextContent('Only the latest 1,000 field changes');
    // 1000 events, 25 to a page
    expect(screen.getByTestId('audit-trail-pagination')).toHaveTextContent('Showing 1 to 25 of 1000 events');
    await userEvent.click(screen.getByTestId('audit-trail-next'));
    expect(screen.getByTestId('audit-trail-pagination')).toHaveTextContent('Showing 26 to 50 of 1000 events');
    expect(screen.getByTestId('audit-trail-prev')).toBeEnabled();
  });

  it('shows a backend failure instead of an empty table', async () => {
    get.mockRejectedValue({
      isAxiosError: true,
      message: 'Request failed with status code 500',
      response: { status: 500, data: { error: 'Internal Server Error' } },
    });
    renderPage();
    expect(await screen.findByTestId('audit-trail-error')).toBeInTheDocument();
    expect(screen.queryByTestId('audit-trail-empty')).toBeNull();
  });
});
