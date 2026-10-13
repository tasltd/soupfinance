/**
 * Unit tests for the chart-of-accounts template picker (SOUPFIN-147).
 *
 *   - initialSelection: server recommendation, else the tenant's licence category
 *     and country, else the first template.
 *   - The dialog preselects, previews grouped by statement section, runs a dry run,
 *     shows what will be created and kept, then applies for real and invalidates
 *     ['ledger-accounts'].
 *   - Edge cases: no templates, a dry run that creates nothing, an apply error,
 *     and a 1500-account template.
 *   - All four locales carry the same setup keys.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '../../../i18n';
import en from '../../../i18n/locales/en/ledger.json';
import de from '../../../i18n/locales/de/ledger.json';
import fr from '../../../i18n/locales/fr/ledger.json';
import nl from '../../../i18n/locales/nl/ledger.json';
import type {
  CoaApplyResult,
  CoaTemplate,
  CoaTemplateAccount,
  CoaTemplateIndex,
  CoaTemplateOverlay,
} from '../../../api/endpoints/coaTemplates';

vi.mock('../../../api/endpoints/coaTemplates', async () => {
  const actual = await vi.importActual<typeof import('../../../api/endpoints/coaTemplates')>(
    '../../../api/endpoints/coaTemplates'
  );
  return { ...actual, listCoaTemplates: vi.fn(), applyCoaTemplate: vi.fn() };
});

import { listCoaTemplates, applyCoaTemplate } from '../../../api/endpoints/coaTemplates';
import { useAccountStore } from '../../../stores';
import { CoaTemplatePicker } from '../CoaTemplatePicker';
import { initialSelection } from '../coaTemplateSelection';

const acc = (number: string, name: string, ledgerGroup?: CoaTemplateAccount['ledgerGroup']): CoaTemplateAccount => ({
  number,
  name,
  ledgerAccountCategory: 'CAT',
  ledgerGroup,
});

const services: CoaTemplate = {
  key: 'services',
  name: 'Services business',
  description: 'Sells time or expertise',
  businessLicenceCategory: 'SERVICES',
  accountCount: 6,
  categoryCount: 5,
  systemAccountCount: 2,
  preview: [
    acc('1000', 'Cash on Hand'),
    acc('1100', 'Accounts Receivable', 'ASSET'),
    acc('2000', 'Accounts Payable', 'LIABILITY'),
    acc('2310', 'Sales Tax Payable', 'LIABILITY'),
    acc('3100', 'Retained Earnings', 'EQUITY'),
    acc('4000', 'Service Revenue', 'INCOME'),
  ],
  previewTruncated: false,
};

const trading: CoaTemplate = {
  ...services,
  key: 'trading',
  name: 'Trading business',
  businessLicenceCategory: 'TRADING',
  accountCount: 3,
  preview: [acc('1000', 'Cash on Hand'), acc('1300', 'Inventory', 'ASSET'), acc('5000', 'Cost of Goods Sold', 'EXPENSE')],
};

const gh: CoaTemplateOverlay = {
  key: 'GH',
  kind: 'country',
  name: 'Ghana',
  appliesTo: ['SERVICES', 'TRADING'],
  addCount: 1,
  removeCount: 1,
  preview: [acc('1020', 'Mobile Money Wallets', 'ASSET')],
  removes: ['2310'],
};

const clinic: CoaTemplateOverlay = {
  key: 'clinic',
  kind: 'industry',
  name: 'Clinic',
  appliesTo: ['SERVICES'],
  addCount: 1,
  removeCount: 0,
  preview: [acc('4100', 'Consultation Fees', 'INCOME')],
  removes: [],
};

const index = (over: Partial<CoaTemplateIndex> = {}): CoaTemplateIndex => ({
  templates: [services, trading],
  overlays: [gh, clinic],
  recommended: { template: 'services', overlays: ['GH'] },
  ...over,
});

const result = (over: Partial<CoaApplyResult> = {}): CoaApplyResult => ({
  dryRun: true,
  template: 'services',
  overlays: ['GH'],
  composedKey: 'services+GH',
  created: [acc('1020', 'Mobile Money Wallets', 'ASSET'), acc('4000', 'Service Revenue', 'INCOME')],
  skipped: [{ number: '1000', name: 'Cash on Hand', reason: 'number-exists', existingName: 'Cash' }],
  categoriesCreated: [],
  problems: [],
  summary: { templateAccounts: 6, created: 2, skipped: 1, categoriesCreated: 0 },
  ...over,
});

function renderPicker(props: Partial<Parameters<typeof CoaTemplatePicker>[0]> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const onClose = vi.fn();
  const onApplied = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <CoaTemplatePicker onClose={onClose} onApplied={onApplied} {...props} />
    </QueryClientProvider>
  );
  return { onClose, onApplied, invalidate };
}

describe('initialSelection', () => {
  it('uses the server recommendation and splits its overlays by kind', () => {
    expect(initialSelection(index({ recommended: { template: 'services', overlays: ['GH', 'clinic'] } }), null)).toEqual({
      template: 'services',
      country: 'GH',
      industry: 'clinic',
    });
  });

  it('ignores a recommendation naming a template the index does not list', () => {
    const sel = initialSelection(index({ recommended: { template: 'brokerage', overlays: [] } }), {
      businessLicenceCategory: 'TRADING',
    });
    expect(sel).toEqual({ template: 'trading', country: '', industry: '' });
  });

  it('falls back to the tenant licence category and country of origin', () => {
    const sel = initialSelection(index({ recommended: null }), { businessLicenceCategory: 'TRADING', countryOfOrigin: 'gh' });
    expect(sel).toEqual({ template: 'trading', country: 'GH', industry: '' });
  });

  it('falls back to the first template when the tenant has no matching category', () => {
    expect(initialSelection(index({ recommended: null }), null)).toEqual({ template: 'services', country: '', industry: '' });
  });
});

describe('CoaTemplatePicker', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('en');
  });

  beforeEach(() => {
    vi.clearAllMocks();
    useAccountStore.setState({ settings: null });
  });

  it('preselects the recommendation and previews the composed accounts grouped by section', async () => {
    vi.mocked(listCoaTemplates).mockResolvedValue(index());
    renderPicker();

    await screen.findByTestId('coa-template-option-services');
    const dialog = screen.getByTestId('coa-template-picker');
    expect(dialog.querySelector('#coa-template-picker-title')).toHaveTextContent('Set up your chart of accounts');
    expect(screen.getByTestId('coa-template-option-services').querySelector('input')).toBeChecked();
    expect(screen.getByTestId('coa-template-option-services')).toHaveTextContent('Recommended');
    expect(screen.getByTestId('coa-country-select')).toHaveValue('GH');
    expect(screen.getByTestId('coa-industry-select')).toHaveValue('');

    // services (6) - GH removes 2310 + GH adds 1020 = 6
    expect(screen.getByTestId('coa-template-preview-count')).toHaveTextContent('6 accounts');
    const asset = screen.getByTestId('coa-template-preview-group-asset');
    expect(asset).toHaveTextContent('Assets (3)');
    expect(asset).toHaveTextContent('Mobile Money Wallets');
    expect(screen.getByTestId('coa-template-preview-group-liability')).toHaveTextContent('Liabilities (1)');
    expect(screen.queryByText('Sales Tax Payable')).not.toBeInTheDocument();
    expect(screen.getByTestId('coa-template-preview-group-equity')).toHaveTextContent('Equity (1)');
    expect(screen.getByTestId('coa-template-preview-group-income')).toHaveTextContent('Income (1)');
    // No expense rows in this template, so no empty section
    expect(screen.queryByTestId('coa-template-preview-group-expense')).not.toBeInTheDocument();
  });

  it('updates the preview when the overlay or template changes, dropping overlays that do not fit', async () => {
    vi.mocked(listCoaTemplates).mockResolvedValue(index());
    renderPicker();
    await screen.findByTestId('coa-industry-select');

    await userEvent.selectOptions(screen.getByTestId('coa-industry-select'), 'clinic');
    expect(screen.getByTestId('coa-template-preview-count')).toHaveTextContent('7 accounts');
    expect(screen.getByTestId('coa-template-preview-group-income')).toHaveTextContent('Consultation Fees');

    // Clinic only applies to SERVICES; Ghana applies to both and is kept
    await userEvent.click(screen.getByTestId('coa-template-option-trading').querySelector('input')!);
    expect(screen.queryByTestId('coa-industry-select')).not.toBeInTheDocument();
    expect(screen.getByTestId('coa-country-select')).toHaveValue('GH');
    expect(screen.getByTestId('coa-template-preview-count')).toHaveTextContent('4 accounts');
    expect(screen.getByTestId('coa-template-preview-group-expense')).toHaveTextContent('Cost of Goods Sold');
  });

  it('dry-runs the selection, then applies it for real and invalidates the account list', async () => {
    vi.mocked(listCoaTemplates).mockResolvedValue(index());
    vi.mocked(applyCoaTemplate)
      .mockResolvedValueOnce(result())
      .mockResolvedValueOnce(result({ dryRun: false }));
    const { onApplied, invalidate } = renderPicker();
    await screen.findByTestId('coa-template-preview');

    await userEvent.click(screen.getByTestId('coa-template-review'));

    expect(applyCoaTemplate).toHaveBeenNthCalledWith(1, { template: 'services', overlays: ['GH'], dryRun: true });
    const panel = await screen.findByTestId('coa-template-review-panel');
    expect(screen.getByRole('heading', { name: 'Review changes' })).toBeInTheDocument();
    expect(within(panel).getByTestId('coa-template-summary')).toHaveTextContent('2 accounts will be created.');
    expect(within(panel).getByTestId('coa-template-summary')).toHaveTextContent('1 account you already have will be kept as it is.');
    expect(screen.getByTestId('coa-template-created-group-asset')).toHaveTextContent('Mobile Money Wallets');
    expect(screen.getByTestId('coa-template-skipped')).toHaveTextContent('Number already used by Cash');
    // Nothing written yet
    expect(invalidate).not.toHaveBeenCalled();

    await userEvent.click(screen.getByTestId('coa-template-apply'));

    await waitFor(() => expect(onApplied).toHaveBeenCalledTimes(1));
    expect(applyCoaTemplate).toHaveBeenNthCalledWith(2, { template: 'services', overlays: ['GH'], dryRun: false });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['ledger-accounts'] });
    expect(onApplied.mock.calls[0][0].dryRun).toBe(false);
    expect(onApplied.mock.calls[0][1]).toBe('Services business');
  });

  it('Back returns to the choice without applying', async () => {
    vi.mocked(listCoaTemplates).mockResolvedValue(index());
    vi.mocked(applyCoaTemplate).mockResolvedValueOnce(result());
    renderPicker();
    await screen.findByTestId('coa-template-preview');

    await userEvent.click(screen.getByTestId('coa-template-review'));
    await screen.findByTestId('coa-template-review-panel');
    await userEvent.click(screen.getByTestId('coa-template-back'));

    expect(screen.getByTestId('coa-template-preview')).toBeInTheDocument();
    expect(applyCoaTemplate).toHaveBeenCalledTimes(1);
  });

  it('disables Apply when the dry run would create nothing (zero-change apply)', async () => {
    vi.mocked(listCoaTemplates).mockResolvedValue(index());
    vi.mocked(applyCoaTemplate).mockResolvedValueOnce(
      result({ created: [], summary: { templateAccounts: 6, created: 0, skipped: 6, categoriesCreated: 0 } })
    );
    renderPicker();
    await screen.findByTestId('coa-template-preview');
    await userEvent.click(screen.getByTestId('coa-template-review'));

    expect(await screen.findByTestId('coa-template-summary')).toHaveTextContent(
      'You already have every account in this template. Nothing will be created.'
    );
    expect(screen.getByTestId('coa-template-apply')).toBeDisabled();
  });

  it('shows the server error when applying fails and does not report success', async () => {
    vi.mocked(listCoaTemplates).mockResolvedValue(index());
    vi.mocked(applyCoaTemplate)
      .mockResolvedValueOnce(result())
      .mockRejectedValueOnce(
        Object.assign(new Error('Request failed with status code 409'), {
          isAxiosError: true,
          config: { url: '/ledgerAccount/applyTemplate.json' },
          response: { status: 409, data: { status: 409, code: 'apply-conflict', message: 'Nothing was saved. Please try again.' } },
        })
      );
    const { onApplied, invalidate } = renderPicker();
    await screen.findByTestId('coa-template-preview');
    await userEvent.click(screen.getByTestId('coa-template-review'));
    await screen.findByTestId('coa-template-review-panel');
    await userEvent.click(screen.getByTestId('coa-template-apply'));

    const alert = await screen.findByTestId('coa-template-error');
    expect(alert).toHaveTextContent('We could not set up your chart of accounts.');
    expect(alert).toHaveTextContent('Nothing was saved. Please try again.');
    expect(alert).not.toHaveTextContent('apply-conflict');
    expect(onApplied).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('explains when no templates are available (zero templates)', async () => {
    vi.mocked(listCoaTemplates).mockResolvedValue({ templates: [], overlays: [], recommended: null });
    renderPicker();
    expect(await screen.findByTestId('coa-template-none')).toHaveTextContent('No templates are available yet.');
    expect(screen.getByTestId('coa-template-review')).toBeDisabled();
  });

  it('shows a load error with a retry when the index fails', async () => {
    vi.mocked(listCoaTemplates)
      .mockRejectedValueOnce(Object.assign(new Error('Network Error'), { isAxiosError: true }))
      .mockResolvedValueOnce(index());
    renderPicker();

    expect(await screen.findByTestId('coa-template-load-error')).toHaveTextContent('We could not load the templates.');
    await userEvent.click(screen.getByRole('button', { name: 'Refresh accounts' }));
    expect(await screen.findByTestId('coa-template-preview')).toBeInTheDocument();
  });

  it('renders an overflow-sized template (1500 accounts) with correct section counts', async () => {
    const big: CoaTemplate = {
      ...services,
      accountCount: 1500,
      preview: Array.from({ length: 1500 }, (_, i) => acc(String(1000 + i * 5), `Account ${i}`)),
    };
    vi.mocked(listCoaTemplates).mockResolvedValue(index({ templates: [big], overlays: [], recommended: null }));
    renderPicker();

    expect(await screen.findByTestId('coa-template-preview-count')).toHaveTextContent('1500 accounts');
    // numbers 1000..8495: 1xxx=200, 2xxx=200, 3xxx=200, 4xxx=200, 5xxx-8xxx=700
    expect(screen.getByTestId('coa-template-preview-group-asset')).toHaveTextContent('Assets (200)');
    expect(screen.getByTestId('coa-template-preview-group-expense')).toHaveTextContent('Expenses (700)');
  });

  it('closes on Escape and on Cancel', async () => {
    vi.mocked(listCoaTemplates).mockResolvedValue(index());
    const { onClose } = renderPicker();
    await screen.findByTestId('coa-template-preview');

    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByTestId('coa-template-cancel'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe('ledger locales (SOUPFIN-147)', () => {
  const keys = (obj: unknown, prefix = ''): string[] =>
    Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
      v && typeof v === 'object' ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]
    );
  const setupKeys = (locale: { chartOfAccounts: { setup: unknown } }) => keys(locale.chartOfAccounts.setup).sort();

  it('de, fr and nl carry every chartOfAccounts.setup key that en has', () => {
    const expected = setupKeys(en);
    expect(expected.length).toBeGreaterThan(30);
    // Plural keys may differ in suffixes per language; compare the base names
    const base = (list: string[]) => [...new Set(list.map((k) => k.replace(/_(one|other|few|many|zero|two)$/, '')))];
    for (const locale of [de, fr, nl]) {
      expect(base(setupKeys(locale))).toEqual(base(expected));
    }
  });
});
