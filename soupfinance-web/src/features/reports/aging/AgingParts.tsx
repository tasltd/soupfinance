/**
 * Added (SOUPFIN-105): building blocks shared by the A/R and A/P Summary and
 * Detail reports, Open Invoices and Unpaid Bills.
 *
 * Layout follows soupfinance-designs/ar-aging-report and ap-aging-report:
 * filter bar, KPI cards, a bar per aging period, then the table.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ApiErrorState } from '../../../components/feedback/ApiErrorState';
import { useFormatCurrency } from '../../../stores';
import { formatDisplayDate } from '../../../utils/date';
import { AGING_MAX_PAGES, AGING_PAGE_SIZE } from '../../../api/endpoints/aging';
import {
  BUCKET_LIMITS,
  DEFAULT_BUCKET_CONFIG,
  normaliseBucketConfig,
  type AgingBucketConfig,
  type AgingKpis,
  type AgingReconciliation,
  type AgingSummary,
} from './agingEngine';
import type { AgingSideConfig } from './agingSides';

const CARD = 'bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark';
const INPUT =
  'h-10 px-3 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark focus:ring-2 focus:ring-primary/50 focus:border-primary';

/** Text colour for an amount in a given bucket: later buckets are more urgent. */
export function bucketAmountClass(bucketIndex: number, bucketCount: number, amount: number): string {
  if (amount === 0) return 'text-subtle-text';
  if (bucketIndex === bucketCount - 1 && bucketIndex > 0) return 'text-danger';
  if (bucketIndex >= 2) return 'text-amber-600 dark:text-amber-400';
  return 'text-text-light dark:text-text-dark';
}

// =============================================================================
// Tabs: Summary | Detail | Open invoices
// =============================================================================

export function AgingViewTabs({ config }: { config: AgingSideConfig }) {
  const tabs = [
    { key: 'summary', to: config.paths.summary, label: config.tabLabels.summary },
    { key: 'detail', to: config.paths.detail, label: config.tabLabels.detail },
    { key: 'open', to: config.paths.open, label: config.tabLabels.open },
  ];
  return (
    <nav
      className="flex flex-wrap gap-2 border-b border-border-light dark:border-border-dark"
      aria-label={`${config.shortLabel} reports`}
      data-testid="aging-view-tabs"
    >
      {tabs.map((tab) => (
        <NavLink
          key={tab.key}
          to={tab.to}
          end
          className={({ isActive }) =>
            `px-4 py-2 -mb-px border-b-2 text-sm font-bold ${
              isActive
                ? 'border-primary text-primary'
                : 'border-transparent text-subtle-text hover:text-text-light dark:hover:text-text-dark'
            }`
          }
          data-testid={`aging-tab-${tab.key}`}
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}

// =============================================================================
// Filters (rendered in the report shell's filter slot)
// =============================================================================

interface AgingFiltersProps {
  config: AgingSideConfig;
  testIdPrefix: string;
  /** Omit to hide the aging-period controls (Open Invoices / Unpaid Bills). */
  bucketConfig?: AgingBucketConfig;
  onBucketConfigChange?: (config: AgingBucketConfig) => void;
  parties: { id: string; name: string }[];
  partyId: string;
  onPartyChange: (partyId: string) => void;
}

/**
 * Customer/vendor filter, and the two aging-period settings. The number inputs
 * keep what the user is typing and only apply a valid value, so clearing a box
 * to type a new number never resets the report.
 */
export function AgingFilters({
  config,
  testIdPrefix,
  bucketConfig,
  onBucketConfigChange,
  parties,
  partyId,
  onPartyChange,
}: AgingFiltersProps) {
  const [days, setDays] = useState(String(bucketConfig?.daysPerPeriod ?? DEFAULT_BUCKET_CONFIG.daysPerPeriod));
  const [periods, setPeriods] = useState(String(bucketConfig?.periods ?? DEFAULT_BUCKET_CONFIG.periods));

  // Follow outside changes (Today/reset), without fighting the user's typing.
  useEffect(() => {
    if (bucketConfig) {
      setDays(String(bucketConfig.daysPerPeriod));
      setPeriods(String(bucketConfig.periods));
    }
  }, [bucketConfig]);

  const apply = (nextDays: string, nextPeriods: string) => {
    if (!onBucketConfigChange || !bucketConfig) return;
    const d = Number(nextDays);
    const p = Number(nextPeriods);
    const valid =
      Number.isInteger(d) &&
      Number.isInteger(p) &&
      d >= BUCKET_LIMITS.minDays &&
      d <= BUCKET_LIMITS.maxDays &&
      p >= BUCKET_LIMITS.minPeriods &&
      p <= BUCKET_LIMITS.maxPeriods;
    if (valid) onBucketConfigChange(normaliseBucketConfig({ daysPerPeriod: d, periods: p }));
  };

  return (
    <>
      <label className="flex flex-col gap-1" htmlFor={`${testIdPrefix}-party`}>
        <span className="text-sm font-medium text-text-light dark:text-text-dark">{config.partyLabel}</span>
        <select
          id={`${testIdPrefix}-party`}
          value={partyId}
          onChange={(e) => onPartyChange(e.target.value)}
          className={`${INPUT} min-w-[12rem]`}
          data-testid={`${testIdPrefix}-party-filter`}
        >
          <option value="">{`All ${config.partyPlural}`}</option>
          {parties.map((party) => (
            <option key={party.id} value={party.id}>
              {party.name}
            </option>
          ))}
        </select>
      </label>

      {bucketConfig && onBucketConfigChange && (
        <>
          <label className="flex flex-col gap-1" htmlFor={`${testIdPrefix}-days-per-period`}>
            <span className="text-sm font-medium text-text-light dark:text-text-dark">Days per period</span>
            <input
              id={`${testIdPrefix}-days-per-period`}
              type="number"
              inputMode="numeric"
              min={BUCKET_LIMITS.minDays}
              max={BUCKET_LIMITS.maxDays}
              step={1}
              value={days}
              onChange={(e) => {
                setDays(e.target.value);
                apply(e.target.value, periods);
              }}
              className={`${INPUT} w-28`}
              data-testid={`${testIdPrefix}-days-per-period`}
            />
          </label>
          <label className="flex flex-col gap-1" htmlFor={`${testIdPrefix}-periods`}>
            <span className="text-sm font-medium text-text-light dark:text-text-dark">Number of periods</span>
            <input
              id={`${testIdPrefix}-periods`}
              type="number"
              inputMode="numeric"
              min={BUCKET_LIMITS.minPeriods}
              max={BUCKET_LIMITS.maxPeriods}
              step={1}
              value={periods}
              onChange={(e) => {
                setPeriods(e.target.value);
                apply(days, e.target.value);
              }}
              className={`${INPUT} w-28`}
              data-testid={`${testIdPrefix}-periods`}
            />
          </label>
        </>
      )}
    </>
  );
}

// =============================================================================
// KPI cards
// =============================================================================

export function AgingKpiCards({
  kpis,
  config,
  testIdPrefix,
}: {
  kpis: AgingKpis;
  config: AgingSideConfig;
  testIdPrefix: string;
}) {
  const formatCurrency = useFormatCurrency();
  const cards: { key: string; label: string; value: string; tone: string }[] = [
    {
      key: 'total',
      label: `Total outstanding ${config.shortLabel}`,
      value: formatCurrency(kpis.totalOpen),
      tone: 'text-text-light dark:text-text-dark',
    },
    {
      key: 'overdue',
      label: 'Total overdue',
      value: formatCurrency(kpis.totalOverdue),
      tone: kpis.totalOverdue > 0 ? 'text-danger' : 'text-text-light dark:text-text-dark',
    },
    {
      key: 'overdue-count',
      label: `Overdue ${config.documentPlural}`,
      value: kpis.overdueCount.toLocaleString(),
      tone: 'text-text-light dark:text-text-dark',
    },
    {
      key: 'parties',
      label: `${config.partyLabel}s with a balance`,
      value: kpis.partyCount.toLocaleString(),
      tone: 'text-text-light dark:text-text-dark',
    },
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4" data-testid={`${testIdPrefix}-kpis`}>
      {cards.map((card) => (
        <div key={card.key} className={`${CARD} p-6 min-w-0`} data-testid={`${testIdPrefix}-kpi-${card.key}`}>
          <p className="text-sm font-medium text-subtle-text">{card.label}</p>
          <p className={`mt-2 text-2xl font-bold tracking-tight truncate ${card.tone}`} title={card.value}>
            {card.value}
          </p>
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// Chart: open amount per aging period
// =============================================================================

// Lightest for Current, darkest for the oldest period (ar-aging-report design).
const BAR_SHADES = ['#fac6b3', '#f7a285', '#f47e57', '#f24a0d', '#c63a08', '#9b2d06'];

function shadeFor(index: number, count: number): string {
  if (count <= 1) return BAR_SHADES[0];
  const position = Math.round((index / (count - 1)) * (BAR_SHADES.length - 1));
  return BAR_SHADES[position];
}

export function AgingBucketChart({
  summary,
  title,
  testIdPrefix,
}: {
  summary: AgingSummary;
  title: string;
  testIdPrefix: string;
}) {
  const formatCurrency = useFormatCurrency();
  const data = summary.buckets.map((bucket, i) => ({ label: bucket.label, amount: summary.totals[i] }));
  return (
    <div className={`${CARD} p-6`} data-testid={`${testIdPrefix}-chart`}>
      <h2 className="text-lg font-bold text-text-light dark:text-text-dark mb-4">{title}</h2>
      <div className="h-64" role="img" aria-label={`${title}: ${data.map((d) => `${d.label} ${formatCurrency(d.amount)}`).join(', ')}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" strokeOpacity={0.1} />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="currentColor" strokeOpacity={0.5} />
            <YAxis
              tick={{ fontSize: 12 }}
              stroke="currentColor"
              strokeOpacity={0.5}
              width={90}
              tickFormatter={(value: number) => formatCurrency(value)}
            />
            <Tooltip formatter={(value) => formatCurrency(Number(value))} cursor={{ fillOpacity: 0.05 }} />
            <Bar dataKey="amount" radius={[6, 6, 0, 0]}>
              {data.map((entry, i) => (
                <Cell key={entry.label} fill={shadeFor(i, data.length)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// =============================================================================
// Reconciliation with the Balance Sheet
// =============================================================================

export function ReconciliationPanel({
  reconciliation,
  isLoading,
  error,
  onRetry,
  config,
  asOf,
  testIdPrefix,
}: {
  reconciliation: AgingReconciliation | null;
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
  config: AgingSideConfig;
  asOf: string;
  testIdPrefix: string;
}) {
  const formatCurrency = useFormatCurrency();
  const id = `${testIdPrefix}-reconciliation`;

  let body: ReactNode;
  let tone = 'border-border-light dark:border-border-dark';
  if (isLoading) {
    body = <p className="text-sm text-subtle-text">Checking against the Balance Sheet…</p>;
  } else if (error) {
    tone = 'border-amber-300 dark:border-amber-700';
    body = (
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-subtle-text" data-testid={`${id}-error`}>
          {`Couldn't load the Balance Sheet to check these totals. ${error.message}`}
        </p>
        <button type="button" onClick={onRetry} className="text-sm font-bold text-primary hover:underline">
          Try again
        </button>
      </div>
    );
  } else if (!reconciliation?.control) {
    tone = 'border-amber-300 dark:border-amber-700';
    body = (
      <p className="text-sm text-subtle-text" data-testid={`${id}-no-account`}>
        {`No ${config.shortLabel} control account was found on the Balance Sheet, so these totals can't be checked.`}
      </p>
    );
  } else {
    const { agingTotal, control, difference, reconciled } = reconciliation;
    tone = reconciled ? 'border-green-300 dark:border-green-800' : 'border-amber-300 dark:border-amber-700';
    body = (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span
            className={`material-symbols-outlined ${reconciled ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}
          >
            {reconciled ? 'check_circle' : 'warning'}
          </span>
          <p className="font-bold text-text-light dark:text-text-dark" data-testid={`${id}-status`}>
            {reconciled
              ? 'Matches the Balance Sheet'
              : `Differs from the Balance Sheet by ${formatCurrency(Math.abs(difference ?? 0))}`}
          </p>
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <dt className="text-subtle-text">{`${config.shortLabel} aging total`}</dt>
            <dd className="font-mono font-bold text-text-light dark:text-text-dark" data-testid={`${id}-aging-total`}>
              {formatCurrency(agingTotal)}
            </dd>
          </div>
          <div>
            <dt className="text-subtle-text" title={control.accountNames.join(', ')}>
              {config.balanceSheetAccountLabel}
            </dt>
            <dd className="font-mono font-bold text-text-light dark:text-text-dark" data-testid={`${id}-control-balance`}>
              {formatCurrency(control.balance)}
            </dd>
          </div>
          <div>
            <dt className="text-subtle-text">Difference</dt>
            <dd
              className={`font-mono font-bold ${reconciled ? 'text-text-light dark:text-text-dark' : 'text-amber-600 dark:text-amber-400'}`}
              data-testid={`${id}-difference`}
            >
              {formatCurrency(difference ?? 0)}
            </dd>
          </div>
        </dl>
        <p className="text-xs text-subtle-text" data-testid={`${id}-accounts`}>
          {`Compared with ${control.accountNames.join(', ')} as of ${formatDisplayDate(asOf)}, across all ${config.partyPlural}.`}
          {!reconciled &&
            ` A difference usually means a journal entry was posted straight to this account, or a ${config.documentLabel.toLowerCase()} was edited after it was posted.`}
        </p>
      </div>
    );
  }

  return (
    <section className={`${CARD} ${tone} p-6`} data-testid={id} aria-label="Balance Sheet check">
      {body}
    </section>
  );
}

// =============================================================================
// States, notices, links
// =============================================================================

export function AgingLoading({ testIdPrefix }: { testIdPrefix: string }) {
  return (
    <div className={`${CARD} p-12 text-center`} data-testid={`${testIdPrefix}-loading`}>
      <span className="material-symbols-outlined text-5xl text-subtle-text/50 mb-3 animate-pulse">hourglass_empty</span>
      <p className="text-subtle-text">Loading report…</p>
    </div>
  );
}

export function AgingError({
  error,
  onRetry,
  testIdPrefix,
}: {
  error: Error | null;
  onRetry: () => void;
  testIdPrefix: string;
}) {
  return <ApiErrorState error={error} onRetry={onRetry} testId={`${testIdPrefix}-error`} />;
}

export function AgingEmpty({
  config,
  testIdPrefix,
  filtered,
}: {
  config: AgingSideConfig;
  testIdPrefix: string;
  filtered: boolean;
}) {
  return (
    <div className={`${CARD} p-12 text-center`} data-testid={`${testIdPrefix}-empty`}>
      <span className="material-symbols-outlined text-5xl text-subtle-text/50 mb-3">task_alt</span>
      <h2 className="text-base font-bold text-text-light dark:text-text-dark mb-2">
        {`No unpaid ${config.documentPlural}`}
      </h2>
      <p className="text-subtle-text text-sm">
        {filtered
          ? `This ${config.partyLabel.toLowerCase()} owes nothing on this date.`
          : `Every ${config.documentLabel.toLowerCase()} was paid in full on this date.`}
      </p>
    </div>
  );
}

/** Shown when the document list hit the page cap: the totals may be short. */
export function TruncatedNotice({ config, testIdPrefix }: { config: AgingSideConfig; testIdPrefix: string }) {
  const cap = (AGING_PAGE_SIZE * AGING_MAX_PAGES).toLocaleString();
  return (
    <div
      className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-4 text-sm text-amber-800 dark:text-amber-200"
      role="status"
      data-testid={`${testIdPrefix}-truncated`}
    >
      {`This report read the first ${cap} ${config.documentPlural} and payments only, so its totals may be too low. Filter by ${config.partyLabel.toLowerCase()} or contact support.`}
    </div>
  );
}

export function PartyName({ name, path, testId }: { name: string; path: string | null; testId?: string }) {
  if (!path) {
    return (
      <span className="font-medium text-text-light dark:text-text-dark" data-testid={testId}>
        {name}
      </span>
    );
  }
  return (
    <Link to={path} className="font-medium text-primary hover:underline" data-testid={testId}>
      {name}
    </Link>
  );
}
