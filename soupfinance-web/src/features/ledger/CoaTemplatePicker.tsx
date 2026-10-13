/**
 * Chart-of-accounts template picker (SOUPFIN-147)
 *
 * Two steps in one dialog:
 *   1. Choose — templates from coaTemplate/index, preselected to the tenant's
 *      businessLicenceCategory and country, with a preview grouped by
 *      Asset / Liability / Equity / Income / Expense.
 *   2. Review — a dry run of applyTemplate: what will be created and what is kept.
 * Applying runs applyTemplate for real, then invalidates ['ledger-accounts'].
 *
 * Contract: plans/soupfin-145-apply-template-endpoints.html (revision 2).
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  applyCoaTemplate,
  composeTemplatePreview,
  listCoaTemplates,
  templateAccountGroup,
  type CoaApplyResult,
  type CoaApplySkipped,
  type CoaTemplate,
  type CoaTemplateAccount,
  type CoaTemplateGroup,
} from '../../api/endpoints/coaTemplates';
import { parseApiError } from '../../api/errors';
import { useAccountStore } from '../../stores';
import { initialSelection, type Selection } from './coaTemplateSelection';

const GROUPS: CoaTemplateGroup[] = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'];

interface CoaTemplatePickerProps {
  onClose: () => void;
  /** Called after a real run succeeds and the account list has been invalidated. */
  onApplied: (result: CoaApplyResult, templateName: string) => void;
}

function groupAccounts<T extends Pick<CoaTemplateAccount, 'number' | 'ledgerGroup'>>(accounts: T[]) {
  const groups = new Map<CoaTemplateGroup, T[]>(GROUPS.map((g) => [g, []]));
  for (const account of accounts) groups.get(templateAccountGroup(account))!.push(account);
  return groups;
}

function GroupedAccounts({ accounts, testId }: { accounts: CoaTemplateAccount[]; testId: string }) {
  const { t } = useTranslation('ledger');
  const groups = groupAccounts(accounts);
  return (
    <div className="flex flex-col gap-4" data-testid={testId}>
      {GROUPS.map((group) => {
        const rows = groups.get(group) ?? [];
        if (rows.length === 0) return null;
        return (
          <section key={group} data-testid={`${testId}-group-${group.toLowerCase()}`}>
            <h4 className="text-xs font-semibold uppercase text-subtle-text mb-1">
              {t(`chartOfAccounts.setup.groups.${group}`)}{' '}
              <span className="font-normal normal-case">({rows.length})</span>
            </h4>
            <ul className="rounded-lg border border-border-light dark:border-border-dark divide-y divide-border-light dark:divide-border-dark">
              {rows.map((account) => (
                <li key={account.number} className="flex gap-3 px-3 py-1.5 text-sm">
                  <span className="font-mono text-subtle-text w-14 shrink-0">{account.number}</span>
                  <span className="text-text-light dark:text-text-dark truncate">{account.name}</span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function skipReason(t: TFunction<'ledger'>, s: CoaApplySkipped) {
  if (s.reason === 'number-exists') return t('chartOfAccounts.setup.reasonNumber', { existing: s.existingName ?? s.number });
  if (s.reason === 'name-exists') return t('chartOfAccounts.setup.reasonName', { existing: s.existingNumber ?? s.name });
  return s.reason;
}

export function CoaTemplatePicker({ onClose, onApplied }: CoaTemplatePickerProps) {
  const { t } = useTranslation('ledger');
  const queryClient = useQueryClient();
  const tenant = useAccountStore((state) => state.settings);

  const { data: index, isLoading, error, refetch } = useQuery({
    queryKey: ['coa-templates'],
    queryFn: listCoaTemplates,
    retry: false,
  });

  // The user's choice; until they change something, the preselection derived from the index
  const [chosen, setChosen] = useState<Selection | null>(null);
  const [review, setReview] = useState<CoaApplyResult | null>(null);
  const preselected = useMemo(
    () => (index && index.templates.length > 0 ? initialSelection(index, tenant) : null),
    [index, tenant]
  );
  const selection = chosen ?? preselected;
  const setSelection = (update: (prev: Selection | null) => Selection | null) => setChosen(update(selection));

  // Escape closes the dialog
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const template: CoaTemplate | undefined = index?.templates.find((tpl) => tpl.key === selection?.template);
  const applicable = useMemo(
    () => (index?.overlays ?? []).filter((o) => template && o.appliesTo.includes(template.businessLicenceCategory)),
    [index, template]
  );
  const countries = applicable.filter((o) => o.kind === 'country');
  const industries = applicable.filter((o) => o.kind === 'industry');
  const chosenOverlays = [selection?.country, selection?.industry]
    .filter((k): k is string => Boolean(k))
    .map((k) => applicable.find((o) => o.key === k))
    .filter((o): o is NonNullable<typeof o> => Boolean(o));
  const preview = template ? composeTemplatePreview(template, chosenOverlays) : [];
  const request = template ? { template: template.key, overlays: chosenOverlays.map((o) => o.key) } : null;

  const dryRun = useMutation({
    mutationFn: () => applyCoaTemplate({ ...request!, dryRun: true }),
    onSuccess: (result) => setReview(result),
  });

  const apply = useMutation({
    mutationFn: () => applyCoaTemplate({ ...request!, dryRun: false }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['ledger-accounts'] });
      onApplied(result, template?.name ?? result.template);
    },
  });

  const chooseTemplate = (key: string) => {
    const next = index?.templates.find((tpl) => tpl.key === key);
    const fits = (k: string) =>
      Boolean(k && next && index?.overlays.find((o) => o.key === k)?.appliesTo.includes(next.businessLicenceCategory));
    setSelection((prev) => ({
      template: key,
      country: prev && fits(prev.country) ? prev.country : '',
      industry: prev && fits(prev.industry) ? prev.industry : '',
    }));
  };

  const mutationError = dryRun.error ?? apply.error;
  const busy = dryRun.isPending || apply.isPending;

  const selectClass =
    'w-full h-10 px-3 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-background-dark text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/50 focus:outline-none';
  const neutralButton =
    'flex items-center justify-center rounded-lg h-10 px-4 bg-[#f5f1f0] dark:bg-white/10 text-text-light dark:text-text-dark text-sm font-bold hover:bg-gray-200 dark:hover:bg-white/20 disabled:opacity-50';
  const primaryButton =
    'flex items-center justify-center gap-2 rounded-lg h-10 px-4 bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="coa-template-picker-title"
        className="bg-surface-light dark:bg-surface-dark rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        data-testid="coa-template-picker"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-border-light dark:border-border-dark p-6">
          <div>
            <h2 id="coa-template-picker-title" className="text-xl font-bold text-text-light dark:text-text-dark">
              {review ? t('chartOfAccounts.setup.reviewTitle') : t('chartOfAccounts.setup.pickerTitle')}
            </h2>
            {!review && <p className="text-sm text-subtle-text mt-1">{t('chartOfAccounts.setup.pickerSubtitle')}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('chartOfAccounts.setup.close')}
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-subtle-text hover:bg-black/10 dark:hover:bg-white/10"
          >
            <span className="material-symbols-outlined" aria-hidden="true">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
          {mutationError && (
            <div
              role="alert"
              className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger"
              data-testid="coa-template-error"
            >
              <p className="font-bold">{t('chartOfAccounts.setup.applyError')}</p>
              <p>{parseApiError(mutationError).message}</p>
            </div>
          )}

          {isLoading ? (
            <p className="text-center text-subtle-text py-8" data-testid="coa-template-loading">
              {t('chartOfAccounts.setup.loadingTemplates')}
            </p>
          ) : error ? (
            <div className="text-center py-6" data-testid="coa-template-load-error">
              <p className="font-bold text-text-light dark:text-text-dark">{t('chartOfAccounts.setup.loadError')}</p>
              <p className="text-sm text-subtle-text mt-1">{parseApiError(error).message}</p>
              <button type="button" className={`${neutralButton} mx-auto mt-4`} onClick={() => refetch()}>
                {t('chartOfAccounts.setup.refresh')}
              </button>
            </div>
          ) : !index || index.templates.length === 0 ? (
            <p className="text-center text-subtle-text py-8" data-testid="coa-template-none">
              {t('chartOfAccounts.setup.noTemplates')}
            </p>
          ) : review ? (
            <div className="flex flex-col gap-4" data-testid="coa-template-review-panel">
              <div className="bg-primary/10 dark:bg-primary/20 rounded-lg border border-primary/30 p-4" data-testid="coa-template-summary">
                {review.summary.created > 0 ? (
                  <p className="font-bold text-primary">
                    {t('chartOfAccounts.setup.willCreate', { count: review.summary.created })}
                  </p>
                ) : (
                  <p className="font-bold text-primary">{t('chartOfAccounts.setup.nothingToCreate')}</p>
                )}
                {review.summary.skipped > 0 && (
                  <p className="text-sm text-text-light dark:text-text-dark mt-1">
                    {t('chartOfAccounts.setup.willSkip', { count: review.summary.skipped })}
                  </p>
                )}
              </div>
              {review.created.length > 0 && <GroupedAccounts accounts={review.created} testId="coa-template-created" />}
              {review.skipped.length > 0 && (
                <details className="rounded-lg border border-border-light dark:border-border-dark" data-testid="coa-template-skipped">
                  <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-text-light dark:text-text-dark">
                    {t('chartOfAccounts.setup.skippedTitle')} ({review.skipped.length})
                  </summary>
                  <ul className="divide-y divide-border-light dark:divide-border-dark">
                    {review.skipped.map((s) => (
                      <li key={`${s.number}-${s.reason}`} className="flex flex-wrap gap-x-3 px-3 py-1.5 text-sm">
                        <span className="font-mono text-subtle-text w-14 shrink-0">{s.number}</span>
                        <span className="text-text-light dark:text-text-dark">{s.name}</span>
                        <span className="text-subtle-text">{skipReason(t, s)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {review.problems.length > 0 && (
                <div data-testid="coa-template-problems">
                  <h4 className="text-xs font-semibold uppercase text-subtle-text mb-1">{t('chartOfAccounts.setup.problemsTitle')}</h4>
                  <ul className="list-disc pl-5 text-sm text-text-light dark:text-text-dark">
                    {review.problems.map((p) => <li key={p}>{p}</li>)}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Templates */}
              <fieldset>
                <legend className="text-sm font-medium text-text-light dark:text-text-dark pb-2">
                  {t('chartOfAccounts.setup.templateLabel')}
                </legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {index.templates.map((tpl) => {
                    const checked = tpl.key === selection?.template;
                    return (
                      <label
                        key={tpl.key}
                        className={`flex cursor-pointer gap-3 rounded-xl border p-4 ${
                          checked
                            ? 'border-primary bg-primary/5 dark:bg-primary/10'
                            : 'border-border-light dark:border-border-dark hover:bg-primary/5'
                        }`}
                        data-testid={`coa-template-option-${tpl.key}`}
                      >
                        <input
                          type="radio"
                          name="coa-template"
                          value={tpl.key}
                          checked={checked}
                          onChange={() => chooseTemplate(tpl.key)}
                          className="mt-1 text-primary focus:ring-primary/50"
                        />
                        <span className="flex flex-col gap-1 min-w-0">
                          <span className="flex flex-wrap items-center gap-2 font-bold text-text-light dark:text-text-dark">
                            {tpl.name}
                            {index.recommended?.template === tpl.key && (
                              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-primary/10 text-primary">
                                {t('chartOfAccounts.setup.recommended')}
                              </span>
                            )}
                          </span>
                          {tpl.description && <span className="text-sm text-subtle-text">{tpl.description}</span>}
                          <span className="text-xs text-subtle-text">
                            {t('chartOfAccounts.setup.accountCount', { count: tpl.accountCount })}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              {/* Overlays */}
              {(countries.length > 0 || industries.length > 0) && (
                <div className="grid gap-4 sm:grid-cols-2">
                  {countries.length > 0 && (
                    <label className="flex flex-col">
                      <span className="text-sm font-medium text-text-light dark:text-text-dark pb-2">
                        {t('chartOfAccounts.setup.countryLabel')}
                      </span>
                      <select
                        className={selectClass}
                        value={selection?.country ?? ''}
                        onChange={(e) => setSelection((prev) => prev && { ...prev, country: e.target.value })}
                        data-testid="coa-country-select"
                      >
                        <option value="">{t('chartOfAccounts.setup.none')}</option>
                        {countries.map((o) => <option key={o.key} value={o.key}>{o.name}</option>)}
                      </select>
                    </label>
                  )}
                  {industries.length > 0 && (
                    <label className="flex flex-col">
                      <span className="text-sm font-medium text-text-light dark:text-text-dark pb-2">
                        {t('chartOfAccounts.setup.industryLabel')}
                      </span>
                      <select
                        className={selectClass}
                        value={selection?.industry ?? ''}
                        onChange={(e) => setSelection((prev) => prev && { ...prev, industry: e.target.value })}
                        data-testid="coa-industry-select"
                      >
                        <option value="">{t('chartOfAccounts.setup.none')}</option>
                        {industries.map((o) => <option key={o.key} value={o.key}>{o.name}</option>)}
                      </select>
                    </label>
                  )}
                </div>
              )}

              {/* Preview */}
              {template && (
                <div>
                  <h3 className="text-base font-bold text-text-light dark:text-text-dark mb-2">
                    {t('chartOfAccounts.setup.previewTitle')}{' '}
                    <span className="text-sm font-normal text-subtle-text" data-testid="coa-template-preview-count">
                      ({t('chartOfAccounts.setup.accountCount', { count: preview.length })})
                    </span>
                  </h3>
                  {template.previewTruncated && (
                    <p className="text-xs text-subtle-text mb-2">
                      {t('chartOfAccounts.setup.previewTruncated', { count: template.preview.length })}
                    </p>
                  )}
                  <GroupedAccounts accounts={preview} testId="coa-template-preview" />
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap justify-end gap-3 border-t border-border-light dark:border-border-dark p-6">
          {review ? (
            <>
              <button
                type="button"
                className={neutralButton}
                onClick={() => {
                  setReview(null);
                  apply.reset();
                }}
                disabled={busy}
                data-testid="coa-template-back"
              >
                {t('chartOfAccounts.setup.back')}
              </button>
              <button
                type="button"
                className={primaryButton}
                onClick={() => apply.mutate()}
                disabled={busy || review.summary.created === 0}
                data-testid="coa-template-apply"
              >
                {apply.isPending && <span className="material-symbols-outlined text-base animate-spin" aria-hidden="true">progress_activity</span>}
                {apply.isPending ? t('chartOfAccounts.setup.applying') : t('chartOfAccounts.setup.apply')}
              </button>
            </>
          ) : (
            <>
              <button type="button" className={neutralButton} onClick={onClose} data-testid="coa-template-cancel">
                {t('chartOfAccounts.setup.cancel')}
              </button>
              <button
                type="button"
                className={primaryButton}
                onClick={() => dryRun.mutate()}
                disabled={!request || busy}
                data-testid="coa-template-review"
              >
                {dryRun.isPending && <span className="material-symbols-outlined text-base animate-spin" aria-hidden="true">progress_activity</span>}
                {dryRun.isPending ? t('chartOfAccounts.setup.reviewing') : t('chartOfAccounts.setup.review')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
