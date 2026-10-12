/**
 * Unit tests for the journal entry lifecycle on the entry page (SOUPFIN-155).
 *
 * Before the fix "Save Draft" and "Save & Post" ran the same handler, so
 * "Save & Post" left the entry pending, and a saved entry offered no way to
 * post, reverse or delete it without going back to the register menu.
 *
 * Each test renders the page under its real routes with the real
 * ToastProvider and asserts the round trip: click -> API calls (and which ones
 * were NOT made) -> toast or banner -> where the user lands.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { JournalEntryPage } from '../JournalEntryPage';
import { ToastProvider } from '../../../components/feedback';
import {
  createJournalEntry,
  updateJournalEntry,
  getTransactionGroup,
  postTransactionGroup,
  reverseTransactionGroup,
  deleteTransactionGroup,
} from '../../../api/endpoints/ledger';
import type { LedgerTransactionGroup } from '../../../types';

vi.mock('../../../api/endpoints/ledger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api/endpoints/ledger')>();
  return {
    ...actual,
    createJournalEntry: vi.fn(),
    updateJournalEntry: vi.fn(),
    getTransactionGroup: vi.fn(),
    postTransactionGroup: vi.fn(),
    reverseTransactionGroup: vi.fn(),
    deleteTransactionGroup: vi.fn(),
  };
});

vi.mock('../../../hooks/useLedgerAccounts', () => ({
  useLedgerAccounts: () => ({
    data: [
      { id: 'acc-cash', code: '1001', name: 'Cash', ledgerGroup: 'ASSET', isActive: true, balance: 0 },
      { id: 'acc-revenue', code: '4001', name: 'Service Revenue', ledgerGroup: 'REVENUE', isActive: true, balance: 0 },
    ],
    isLoading: false,
    error: null,
  }),
}));

const mockedCreate = vi.mocked(createJournalEntry);
const mockedUpdate = vi.mocked(updateJournalEntry);
const mockedGet = vi.mocked(getTransactionGroup);
const mockedPost = vi.mocked(postTransactionGroup);
const mockedReverse = vi.mocked(reverseTransactionGroup);
const mockedDelete = vi.mocked(deleteTransactionGroup);

function makeGroup(overrides: Partial<LedgerTransactionGroup> = {}, lineCount = 2, amount = 1500): LedgerTransactionGroup {
  // Lines alternate debit/credit with equal amounts, so any even count balances.
  const ledgerTransactionList = Array.from({ length: lineCount }, (_, i) => ({
    id: `tx-${i}`,
    ledgerAccount: i % 2 === 0 ? { id: 'acc-cash', code: '1001', name: 'Cash' } : { id: 'acc-revenue', code: '4001', name: 'Service Revenue' },
    transactionState: i % 2 === 0 ? 'DEBIT' : 'CREDIT',
    amount,
    description: `Line ${i + 1}`,
  }));
  return {
    id: 'group-001',
    reference: 'JE-2026-001',
    description: 'Consulting income',
    groupDate: '2026-10-01',
    balanced: true,
    totalDebit: amount * (lineCount / 2),
    totalCredit: amount * (lineCount / 2),
    status: 'PENDING',
    ledgerTransactionList,
    ...overrides,
  } as unknown as LedgerTransactionGroup;
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/accounting/journal-entry/new" element={<JournalEntryPage />} />
            <Route path="/accounting/journal-entry/:id" element={<JournalEntryPage />} />
            <Route path="/accounting/journal-entry/:id/edit" element={<JournalEntryPage />} />
            <Route path="/accounting/transactions" element={<div data-testid="register">Register</div>} />
          </Routes>
          <LocationProbe />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

/** Fill a balanced two-line entry on the new-entry form. */
async function fillBalancedEntry(user: ReturnType<typeof userEvent.setup>, amount = '250') {
  await user.type(screen.getByTestId('journal-entry-description-input'), 'Monthly consulting fee');
  await user.selectOptions(screen.getByTestId('journal-entry-line-0-account'), 'acc-cash');
  await user.type(screen.getByTestId('journal-entry-line-0-debit'), amount);
  await user.selectOptions(screen.getByTestId('journal-entry-line-1-account'), 'acc-revenue');
  await user.type(screen.getByTestId('journal-entry-line-1-credit'), amount);
  await waitFor(() => expect(screen.getByTestId('journal-entry-balance-indicator')).toHaveTextContent('Balanced'));
}

describe('JournalEntryPage lifecycle (SOUPFIN-155)', () => {
  beforeEach(() => {
    mockedCreate.mockReset();
    mockedUpdate.mockReset();
    mockedGet.mockReset();
    mockedPost.mockReset();
    mockedReverse.mockReset();
    mockedDelete.mockReset();
  });

  describe('new entry', () => {
    it('Save Draft creates the entry and does NOT post it', async () => {
      const user = userEvent.setup();
      mockedCreate.mockResolvedValue(makeGroup({ id: 'group-new' }));
      renderAt('/accounting/journal-entry/new');

      await fillBalancedEntry(user);
      await user.click(screen.getByTestId('journal-entry-save-draft-button'));

      await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/accounting/transactions'));
      expect(mockedCreate).toHaveBeenCalledTimes(1);
      expect(mockedCreate.mock.calls[0][0]).toMatchObject({
        description: 'Monthly consulting fee',
        lines: [
          { accountId: 'acc-cash', debitAmount: 250, creditAmount: 0 },
          { accountId: 'acc-revenue', debitAmount: 0, creditAmount: 250 },
        ],
      });
      expect(mockedPost).not.toHaveBeenCalled();
      expect(await screen.findByText('Journal entry saved as a draft.')).toBeInTheDocument();
    });

    it('Save & Post creates the entry, then posts it by the returned id', async () => {
      const user = userEvent.setup();
      mockedCreate.mockResolvedValue(makeGroup({ id: 'group-new' }));
      mockedPost.mockResolvedValue(makeGroup({ id: 'group-new', status: 'POSTED' }));
      renderAt('/accounting/journal-entry/new');

      await fillBalancedEntry(user);
      await user.click(screen.getByTestId('journal-entry-save-post-button'));

      await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/accounting/transactions'));
      expect(mockedCreate).toHaveBeenCalledTimes(1);
      expect(mockedPost).toHaveBeenCalledTimes(1);
      expect(mockedPost).toHaveBeenCalledWith('group-new');
      // Post must run after the save, never before or instead of it.
      expect(mockedCreate.mock.invocationCallOrder[0]).toBeLessThan(mockedPost.mock.invocationCallOrder[0]);
      expect(await screen.findByText('Journal entry saved and posted.')).toBeInTheDocument();
    });

    it('Save & Post reports a partial failure and keeps the user on the saved entry', async () => {
      const user = userEvent.setup();
      mockedCreate.mockResolvedValue(makeGroup({ id: 'group-new' }));
      mockedPost.mockRejectedValue(new Error('Journal entry is not balanced'));
      mockedGet.mockResolvedValue(makeGroup({ id: 'group-new' }));
      renderAt('/accounting/journal-entry/new');

      await fillBalancedEntry(user);
      await user.click(screen.getByTestId('journal-entry-save-post-button'));

      await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/accounting/journal-entry/group-new'));
      expect(mockedCreate).toHaveBeenCalledTimes(1);
      expect(mockedPost).toHaveBeenCalledWith('group-new');
      const message = 'Journal entry saved as a draft, but posting failed: Journal entry is not balanced';
      // Toast plus the in-page banner, so the warning survives the toast timeout.
      expect(await screen.findAllByText(message)).not.toHaveLength(0);
      expect(await screen.findByTestId('journal-entry-error')).toHaveTextContent(message);
      // The saved entry is loaded, so posting again cannot create a duplicate.
      await waitFor(() => expect(mockedGet).toHaveBeenCalledWith('group-new'));
      expect(screen.getByTestId('journal-entry-save-post-button')).toHaveTextContent('Post');
    });

    it('a failed save never posts', async () => {
      const user = userEvent.setup();
      mockedCreate.mockRejectedValue(new Error('Ledger module is not enabled for this tenant'));
      renderAt('/accounting/journal-entry/new');

      await fillBalancedEntry(user);
      await user.click(screen.getByTestId('journal-entry-save-post-button'));

      expect(await screen.findByTestId('journal-entry-error')).toHaveTextContent('Ledger module is not enabled');
      expect(mockedPost).not.toHaveBeenCalled();
      expect(screen.getByTestId('location')).toHaveTextContent('/accounting/journal-entry/new');
    });

    it('a new entry shows no Delete or Reverse action', () => {
      renderAt('/accounting/journal-entry/new');
      expect(screen.queryByTestId('journal-entry-delete-button')).toBeNull();
      expect(screen.queryByTestId('journal-entry-reverse-button')).toBeNull();
      expect(screen.getByTestId('journal-entry-save-post-button')).toHaveTextContent('Save & Post');
    });
  });

  describe('saved pending entry', () => {
    it('shows Delete, Save Draft and Post, but not Reverse', async () => {
      mockedGet.mockResolvedValue(makeGroup());
      renderAt('/accounting/journal-entry/group-001/edit');

      expect(await screen.findByTestId('journal-entry-delete-button')).toBeEnabled();
      expect(screen.getByTestId('journal-entry-save-draft-button')).toBeInTheDocument();
      expect(screen.getByTestId('journal-entry-save-post-button')).toHaveTextContent('Post');
      expect(screen.queryByTestId('journal-entry-reverse-button')).toBeNull();
      expect(screen.queryByTestId('journal-entry-readonly-banner')).toBeNull();
    });

    it('treats a group with no status (today\'s backend) as pending', async () => {
      mockedGet.mockResolvedValue(makeGroup({ status: undefined }));
      renderAt('/accounting/journal-entry/group-001');

      expect(await screen.findByTestId('journal-entry-delete-button')).toBeInTheDocument();
      expect(screen.queryByTestId('journal-entry-reverse-button')).toBeNull();
    });

    it('Post on an unchanged entry posts it without re-saving', async () => {
      const user = userEvent.setup();
      mockedGet.mockResolvedValue(makeGroup());
      mockedPost.mockResolvedValue(makeGroup({ status: 'POSTED' }));
      renderAt('/accounting/journal-entry/group-001');

      await waitFor(() => expect(screen.getByTestId('journal-entry-reference-input')).toHaveValue('JE-2026-001'));
      await user.click(screen.getByTestId('journal-entry-save-post-button'));

      await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/accounting/transactions'));
      expect(mockedUpdate).not.toHaveBeenCalled();
      expect(mockedPost).toHaveBeenCalledWith('group-001');
    });

    it('Update & Post on an edited entry saves the edit, then posts', async () => {
      const user = userEvent.setup();
      mockedGet.mockResolvedValue(makeGroup());
      mockedUpdate.mockResolvedValue(makeGroup({ description: 'Consulting income, corrected' }));
      mockedPost.mockResolvedValue(makeGroup({ status: 'POSTED' }));
      renderAt('/accounting/journal-entry/group-001/edit');

      const description = await screen.findByTestId('journal-entry-description-input');
      await waitFor(() => expect(description).toHaveValue('Consulting income'));
      await user.clear(description);
      await user.type(description, 'Consulting income, corrected');
      await waitFor(() => expect(screen.getByTestId('journal-entry-save-post-button')).toHaveTextContent('Update & Post'));
      await user.click(screen.getByTestId('journal-entry-save-post-button'));

      await waitFor(() => expect(mockedPost).toHaveBeenCalledWith('group-001'));
      expect(mockedUpdate).toHaveBeenCalledWith('group-001', expect.objectContaining({ description: 'Consulting income, corrected' }));
      expect(mockedUpdate.mock.invocationCallOrder[0]).toBeLessThan(mockedPost.mock.invocationCallOrder[0]);
    });

    it('Save Draft on an edited entry updates it and does NOT post', async () => {
      const user = userEvent.setup();
      mockedGet.mockResolvedValue(makeGroup());
      mockedUpdate.mockResolvedValue(makeGroup());
      renderAt('/accounting/journal-entry/group-001/edit');

      await waitFor(() => expect(screen.getByTestId('journal-entry-reference-input')).toHaveValue('JE-2026-001'));
      await user.click(screen.getByTestId('journal-entry-save-draft-button'));

      await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/accounting/transactions'));
      expect(mockedUpdate).toHaveBeenCalledTimes(1);
      expect(mockedPost).not.toHaveBeenCalled();
    });

    it('posts a 60-line entry with seven-figure amounts in a single call', async () => {
      const user = userEvent.setup();
      mockedGet.mockResolvedValue(makeGroup({}, 60, 4_750_000.55));
      mockedPost.mockResolvedValue(makeGroup({ status: 'POSTED' }, 60, 4_750_000.55));
      renderAt('/accounting/journal-entry/group-001');

      await screen.findByTestId('journal-entry-line-59');
      await waitFor(() => expect(screen.getByTestId('journal-entry-balance-indicator')).toHaveTextContent('Balanced'));
      await user.click(screen.getByTestId('journal-entry-save-post-button'));

      await waitFor(() => expect(mockedPost).toHaveBeenCalledTimes(1));
      expect(mockedPost).toHaveBeenCalledWith('group-001');
      expect(mockedUpdate).not.toHaveBeenCalled();
    });

    it('Delete asks first, deletes, and returns to the register', async () => {
      const user = userEvent.setup();
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      mockedGet.mockResolvedValue(makeGroup());
      mockedDelete.mockResolvedValue(undefined);
      renderAt('/accounting/journal-entry/group-001');

      await user.click(await screen.findByTestId('journal-entry-delete-button'));

      expect(confirmSpy).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/accounting/transactions'));
      expect(mockedDelete).toHaveBeenCalledWith('group-001');
      expect(await screen.findByText('Journal entry deleted.')).toBeInTheDocument();
    });

    it('Delete does nothing when the user says no', async () => {
      const user = userEvent.setup();
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      mockedGet.mockResolvedValue(makeGroup());
      renderAt('/accounting/journal-entry/group-001');

      await user.click(await screen.findByTestId('journal-entry-delete-button'));

      expect(mockedDelete).not.toHaveBeenCalled();
      expect(screen.getByTestId('location')).toHaveTextContent('/accounting/journal-entry/group-001');
    });

    it('a failed delete shows the API error and stays on the entry', async () => {
      const user = userEvent.setup();
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      mockedGet.mockResolvedValue(makeGroup());
      mockedDelete.mockRejectedValue(new Error('Only a pending journal entry can be deleted'));
      renderAt('/accounting/journal-entry/group-001');

      await user.click(await screen.findByTestId('journal-entry-delete-button'));

      expect(await screen.findByText('Only a pending journal entry can be deleted')).toBeInTheDocument();
      expect(screen.getByTestId('location')).toHaveTextContent('/accounting/journal-entry/group-001');
    });
  });

  describe('posted entry', () => {
    it('is read-only and offers Reverse only', async () => {
      mockedGet.mockResolvedValue(makeGroup({ status: 'POSTED' }));
      renderAt('/accounting/journal-entry/group-001');

      expect(await screen.findByTestId('journal-entry-reverse-button')).toBeEnabled();
      expect(screen.getByTestId('journal-entry-readonly-banner')).toHaveTextContent('Use Reverse to undo it.');
      expect(screen.queryByTestId('journal-entry-delete-button')).toBeNull();
      expect(screen.queryByTestId('journal-entry-save-draft-button')).toBeNull();
      expect(screen.queryByTestId('journal-entry-save-post-button')).toBeNull();
    });

    it('Reverse confirms in a dialog, sends the chosen date, and the entry shows as reversed', async () => {
      const user = userEvent.setup();
      mockedGet
        .mockResolvedValueOnce(makeGroup({ status: 'POSTED' }))
        .mockResolvedValue(makeGroup({ status: 'REVERSED' }));
      mockedReverse.mockResolvedValue(makeGroup({ id: 'group-reversal', status: 'POSTED' }));
      renderAt('/accounting/journal-entry/group-001');

      await user.click(await screen.findByTestId('journal-entry-reverse-button'));
      expect(screen.getByTestId('journal-entry-reverse-dialog')).toBeInTheDocument();
      // Opening the dialog alone must not reverse anything.
      expect(mockedReverse).not.toHaveBeenCalled();

      const dateInput = screen.getByTestId('journal-entry-reversal-date-input');
      await user.clear(dateInput);
      await user.type(dateInput, '2026-10-31');
      await user.click(screen.getByTestId('journal-entry-reverse-confirm-button'));

      await waitFor(() => expect(mockedReverse).toHaveBeenCalledWith('group-001', { reversalDate: '2026-10-31' }));
      expect(await screen.findByText('Journal entry reversed.')).toBeInTheDocument();
      // The refetched entry is REVERSED: the dialog closes and Reverse disappears.
      await waitFor(() => expect(screen.queryByTestId('journal-entry-reverse-button')).toBeNull());
      expect(screen.queryByTestId('journal-entry-reverse-dialog')).toBeNull();
      expect(screen.getByTestId('journal-entry-readonly-banner')).toHaveTextContent('reversed');
    });

    it('Keep entry closes the dialog without reversing', async () => {
      const user = userEvent.setup();
      mockedGet.mockResolvedValue(makeGroup({ status: 'POSTED' }));
      renderAt('/accounting/journal-entry/group-001');

      await user.click(await screen.findByTestId('journal-entry-reverse-button'));
      await user.click(screen.getByTestId('journal-entry-reverse-cancel-button'));

      expect(screen.queryByTestId('journal-entry-reverse-dialog')).toBeNull();
      expect(mockedReverse).not.toHaveBeenCalled();
    });

    it('a failed reverse shows the API error and keeps the dialog open', async () => {
      const user = userEvent.setup();
      mockedGet.mockResolvedValue(makeGroup({ status: 'POSTED' }));
      mockedReverse.mockRejectedValue(new Error('Only a posted journal entry can be reversed'));
      renderAt('/accounting/journal-entry/group-001');

      await user.click(await screen.findByTestId('journal-entry-reverse-button'));
      await user.click(screen.getByTestId('journal-entry-reverse-confirm-button'));

      expect(await screen.findByText('Only a posted journal entry can be reversed')).toBeInTheDocument();
      expect(screen.getByTestId('journal-entry-reverse-dialog')).toBeInTheDocument();
      expect(screen.getByTestId('journal-entry-reverse-button')).toBeInTheDocument();
    });
  });

  describe('reversed entry', () => {
    it('offers no lifecycle action', async () => {
      mockedGet.mockResolvedValue(makeGroup({ status: 'REVERSED' }));
      renderAt('/accounting/journal-entry/group-001');

      expect(await screen.findByTestId('journal-entry-readonly-banner')).toHaveTextContent('reversed');
      expect(screen.queryByTestId('journal-entry-reverse-button')).toBeNull();
      expect(screen.queryByTestId('journal-entry-delete-button')).toBeNull();
      expect(screen.queryByTestId('journal-entry-save-post-button')).toBeNull();
      expect(screen.getByTestId('journal-entry-cancel-button')).toHaveTextContent('Back');
    });
  });

  it('Cancel returns to the transaction register', async () => {
    const user = userEvent.setup();
    renderAt('/accounting/journal-entry/new');
    await user.click(screen.getByTestId('journal-entry-cancel-button'));
    expect(screen.getByTestId('location')).toHaveTextContent('/accounting/transactions');
  });
});
