/**
 * Added (SOUPFIN-159): the History panel on journal entry and voucher pages.
 *
 * The endpoint module is real; only the HTTP client is mocked, so the rows go
 * through the same grouping the page uses in production.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import apiClient from '../../../api/client';
import { AuditHistoryPanel } from '../AuditHistoryPanel';
import type { AuditTrailRow } from '../../../types/auditTrail';

vi.mock('../../../api/client', () => ({
  default: { get: vi.fn() },
  normalizeToArray: (value: unknown) => (value == null ? [] : Array.isArray(value) ? value : [value]),
}));

const get = vi.mocked(apiClient.get);

function rowsFor(id: string): AuditTrailRow[] {
  if (id === 'je-1') {
    return [
      { id: 1, className: 'soupbroker.finance.LedgerTransactionGroup', persistedObjectId: 'je-1', eventName: 'INSERT', actor: 'ama.mensah', uri: '/rest/ledgerTransaction/saveMultiple', dateCreated: '2026-10-12T09:00:00Z', propertyName: 'description', newValue: 'Office rent' },
      { id: 2, className: 'soupbroker.finance.LedgerTransactionGroup', persistedObjectId: 'je-1', eventName: 'UPDATE', actor: 'ama.mensah', uri: '/rest/ledgerTransactionGroup/post/je-1.json', dateCreated: '2026-10-12T10:00:00Z', propertyName: 'status', oldValue: 'PENDING', newValue: 'POSTED' },
      { id: 3, className: 'soupbroker.finance.LedgerTransactionGroup', persistedObjectId: 'je-1', eventName: 'UPDATE', actor: 'kofi.boateng', uri: '/rest/ledgerTransactionGroup/reverse/je-1.json', dateCreated: '2026-10-12T11:00:00Z', propertyName: 'status', oldValue: 'POSTED', newValue: 'REVERSED' },
    ];
  }
  return [];
}

function renderPanel(entities = [{ className: 'LedgerTransactionGroup', id: 'je-1' }, { className: 'LedgerTransaction', id: 'line-1' }]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AuditHistoryPanel entities={entities} testId="journal-entry-history" />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  get.mockReset();
  get.mockImplementation(async (url: string) => {
    const id = new URLSearchParams(url.split('?')[1]).get('persistedObjectId') ?? '';
    return { data: rowsFor(id) };
  });
});

describe('AuditHistoryPanel', () => {
  it('lists reversed, posted and created, newest first, each with the acting user', async () => {
    renderPanel();
    const list = await screen.findByTestId('journal-entry-history-list');
    const items = within(list).getAllByRole('listitem');
    expect(items.map((i) => i.getAttribute('data-action'))).toEqual(['REVERSED', 'POSTED', 'CREATED']);
    expect(screen.getByTestId('journal-entry-history-event-0-actor')).toHaveTextContent('kofi.boateng');
    expect(screen.getByTestId('journal-entry-history-event-1-actor')).toHaveTextContent('ama.mensah');
    expect(screen.getByTestId('journal-entry-history-event-0')).toHaveTextContent('Reversed by kofi.boateng');
    expect(screen.getByTestId('journal-entry-history-event-0')).toHaveTextContent('Status: POSTED → REVERSED');
    expect(screen.getByTestId('journal-entry-history-event-0-time')).toHaveAttribute('dateTime', '2026-10-12T11:00:00Z');
    // One request per record: the group and its line
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('opens an event to show the fields it changed', async () => {
    renderPanel();
    await screen.findByTestId('journal-entry-history-list');
    await userEvent.click(screen.getByTestId('journal-entry-history-event-2-toggle'));
    const changes = screen.getByTestId('journal-entry-history-event-2-changes');
    expect(changes).toHaveTextContent('Description');
    expect(changes).toHaveTextContent('Office rent');
    expect(screen.getByTestId('journal-entry-history-event-2-toggle')).toHaveAttribute('aria-expanded', 'true');
  });

  it('says so when nothing has been recorded', async () => {
    get.mockResolvedValue({ data: [] });
    renderPanel([{ className: 'Voucher', id: 'v-1' }]);
    expect(await screen.findByTestId('journal-entry-history-empty')).toHaveTextContent('No changes have been recorded');
  });

  it('shows a role denial as an error, not as an empty history', async () => {
    get.mockRejectedValue({
      isAxiosError: true,
      message: 'Request failed with status code 403',
      response: { status: 403, data: { status: 403, error: 'Forbidden', path: '/rest/auditTrail/index.json' } },
    });
    renderPanel([{ className: 'Voucher', id: 'v-1' }]);
    const error = await screen.findByTestId('journal-entry-history-error');
    expect(error).toHaveTextContent('The history could not be loaded');
    expect(error).not.toHaveTextContent('Request failed with status code');
    expect(screen.queryByTestId('journal-entry-history-empty')).toBeNull();
  });

  it('asks nothing when there is no record yet', () => {
    renderPanel([]);
    expect(get).not.toHaveBeenCalled();
  });
});
