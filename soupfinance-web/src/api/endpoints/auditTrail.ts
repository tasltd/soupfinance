/**
 * Added (SOUPFIN-159): read the backend audit log and turn it into events.
 *
 * Source: GET /rest/auditTrail/index.json (AuditTrailController, ROLE_ADMIN or
 * ROLE_USER). AuditTrail is MultiTenant, so the backend only returns the
 * caller's tenant. The endpoint filters by `search` (an ilike over every
 * column; each space-separated word must match some column) and `from`/`to`.
 *
 * Measured on the LXC build of 2026-10-12: `className` and `persistedObjectId`
 * are applied as exact filters, `actor` and `eventName` are ignored. Older
 * builds may ignore all four. So the exact filters are sent, the same words
 * also go into `search`, and every row is re-checked here: the result is exact
 * on any build. plans/soupfin-159-audit-trail-backend.md specifies the rest.
 *
 * One AuditTrail row is one property change. groupAuditRows() folds the rows of
 * one save into one AuditEvent.
 */
import apiClient, { normalizeToArray } from '../client';
import type {
  AuditAction,
  AuditChange,
  AuditEntityRef,
  AuditEvent,
  AuditTrailFilters,
  AuditTrailRow,
} from '../../types/auditTrail';

/** AuditTrailController caps `max` at 1000. */
export const AUDIT_MAX_ROWS = 1000;

/** Rows fetched per record for a History panel. A save writes ~40 rows. */
export const HISTORY_MAX_ROWS = 500;

/** Domain packages, so a short class name can be sent as the FQN Grails stores. */
const CLASS_PACKAGES: Record<string, string> = {
  LedgerTransactionGroup: 'soupbroker.finance',
  LedgerTransaction: 'soupbroker.finance',
  LedgerTransactionApproval: 'soupbroker.finance',
  LedgerAccount: 'soupbroker.finance',
  Voucher: 'soupbroker.finance',
  Invoice: 'soupbroker.finance',
  InvoicePayment: 'soupbroker.finance',
  Bill: 'soupbroker.finance',
  BillPayment: 'soupbroker.finance',
  Vendor: 'soupbroker.finance',
  FinancialYear: 'soupbroker.finance',
  Client: 'soupbroker.kyc',
};

/** Record types offered by the Audit Trail filter, with their labels. */
export const AUDIT_ENTITY_LABELS: Record<string, string> = {
  LedgerTransactionGroup: 'Journal entry',
  LedgerTransaction: 'Journal line',
  LedgerTransactionApproval: 'Journal approval',
  LedgerAccount: 'Ledger account',
  Voucher: 'Voucher',
  Invoice: 'Invoice',
  InvoicePayment: 'Invoice payment',
  Bill: 'Bill',
  BillPayment: 'Bill payment',
  Vendor: 'Vendor',
  FinancialYear: 'Financial year',
  Client: 'Client',
};

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  CREATED: 'Created',
  EDITED: 'Edited',
  APPROVED: 'Approved',
  POSTED: 'Posted',
  REVERSED: 'Reversed',
  CANCELLED: 'Cancelled',
  ARCHIVED: 'Archived',
  DELETED: 'Deleted',
};

/**
 * Properties the plugin records that say nothing to a reader: framework
 * bookkeeping, the tenant, and `serialised` (a toString() of the whole record).
 */
const NOISE_PROPERTIES = new Set([
  'serialised',
  'callback',
  'synchronizerUri',
  'synchronizerToken',
  'SYNCHRONIZER_TOKEN',
  'SYNCHRONIZER_URI',
  'dateCreated',
  'lastUpdated',
  'tenantId',
  'version',
]);

/** soupbroker.finance.Voucher → Voucher */
export function shortClassName(className: string | null | undefined): string {
  if (!className) return '';
  const parts = className.split('.');
  return parts[parts.length - 1];
}

/** Voucher → soupbroker.finance.Voucher. An unknown or qualified name is kept as given. */
export function qualifiedClassName(className: string): string {
  if (className.includes('.')) return className;
  const pkg = CLASS_PACKAGES[className];
  return pkg ? `${pkg}.${className}` : className;
}

/** Human label for a record type: LedgerTransactionGroup → Journal entry */
export function entityLabel(className: string | null | undefined): string {
  const short = shortClassName(className);
  if (AUDIT_ENTITY_LABELS[short]) return AUDIT_ENTITY_LABELS[short];
  // Unknown class: split the camel case so it still reads as words.
  return short.replace(/([a-z])([A-Z])/g, '$1 $2');
}

/** creditLedgerAccount → Credit ledger account */
export function propertyLabel(property: string): string {
  const words = property.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The plugin stores a missing value as null, "null" or "undefined". */
function cleanValue(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (value === 'null' || value === 'undefined' || value === '') return null;
  return value;
}

/** Path segment test that does not match /reversed-entries or /postcode. */
function uriHasAction(uri: string | null, action: string): boolean {
  if (!uri) return false;
  return new RegExp(`/${action}(?=[/.?]|$)`, 'i').test(uri);
}

/**
 * What an UPDATE did. The request path names the action when the backend has
 * one (/post, /reverse, /approve, /cancel); otherwise the status change does.
 */
export function classifyAuditAction(eventName: string | null | undefined, uri: string | null, changes: AuditChange[]): AuditAction {
  const event = (eventName || '').toUpperCase();
  if (event === 'INSERT') return 'CREATED';
  if (event === 'DELETE') return 'DELETED';

  const status = changes.find((c) => c.property === 'status')?.newValue?.toUpperCase() ?? null;

  if (uriHasAction(uri, 'reverse') || status === 'REVERSED') return 'REVERSED';
  if (uriHasAction(uri, 'cancel') || status === 'CANCELLED' || status === 'CANCELED') return 'CANCELLED';
  if (uriHasAction(uri, 'post') || uriHasAction(uri, 'batchPost') || status === 'POSTED') return 'POSTED';
  if (changes.some((c) => c.property === 'posted' && c.newValue === 'true')) return 'POSTED';
  if (uriHasAction(uri, 'approve') || status === 'APPROVED') return 'APPROVED';
  if (changes.some((c) => c.property === 'archived' && c.newValue === 'true')) return 'ARCHIVED';
  return 'EDITED';
}

/**
 * Fold the rows of one save into one event.
 *
 * Rows belong together when they share record, event, actor, request path and
 * second. Noise properties are dropped; an UPDATE left with no real change
 * (only `serialised` moved) is not an event. Newest event first.
 */
export function groupAuditRows(rows: AuditTrailRow[]): AuditEvent[] {
  const groups = new Map<string, { rows: AuditTrailRow[]; changes: AuditChange[] }>();

  for (const row of rows) {
    const at = row.dateCreated ?? '';
    const key = [
      row.className ?? '',
      row.persistedObjectId ?? '',
      (row.eventName ?? '').toUpperCase(),
      row.actor ?? '',
      row.uri ?? '',
      // Seconds are enough: the plugin stamps the rows of one flush together.
      at.slice(0, 19),
    ].join('|');

    let group = groups.get(key);
    if (!group) {
      group = { rows: [], changes: [] };
      groups.set(key, group);
    }
    group.rows.push(row);

    const property = row.propertyName ?? '';
    if (!property || NOISE_PROPERTIES.has(property)) continue;
    const oldValue = cleanValue(row.oldValue);
    const newValue = cleanValue(row.newValue);
    // An INSERT lists every property; one that was never set is not a change.
    if (oldValue === null && newValue === null) continue;
    if (oldValue === newValue) continue;
    group.changes.push({ property, oldValue, newValue });
  }

  const events: AuditEvent[] = [];
  for (const [key, group] of groups) {
    const first = group.rows[0];
    const eventName = (first.eventName ?? '').toUpperCase();
    if (eventName === 'UPDATE' && group.changes.length === 0) continue;

    const uri = first.uri ?? null;
    group.changes.sort((a, b) => a.property.localeCompare(b.property));
    events.push({
      key,
      at: first.dateCreated ?? '',
      actor: first.actor || 'Unknown user',
      action: classifyAuditAction(eventName, uri, group.changes),
      className: first.className ?? '',
      entityType: shortClassName(first.className),
      entityId: first.persistedObjectId ?? '',
      uri,
      changes: group.changes,
    });
  }

  return events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

/** One line a reader can scan: "Changed amount, description" or "Status: PENDING → APPROVED". */
export function summariseAuditEvent(event: AuditEvent): string {
  const status = event.changes.find((c) => c.property === 'status');
  if (status && event.action !== 'CREATED') {
    return `Status: ${status.oldValue ?? 'none'} → ${status.newValue ?? 'none'}`;
  }
  switch (event.action) {
    case 'CREATED':
      return `${entityLabel(event.className)} created`;
    case 'DELETED':
      return `${entityLabel(event.className)} deleted`;
    case 'EDITED': {
      const names = event.changes.slice(0, 4).map((c) => propertyLabel(c.property).toLowerCase());
      const more = event.changes.length > 4 ? ` and ${event.changes.length - 4} more` : '';
      return names.length ? `Changed ${names.join(', ')}${more}` : 'Changed';
    }
    default:
      return AUDIT_ACTION_LABELS[event.action];
  }
}

/** True when an event passes the filters the backend could not apply. */
export function matchesAuditFilters(event: AuditEvent, filters: AuditTrailFilters): boolean {
  if (filters.actor && event.actor.toLowerCase() !== filters.actor.trim().toLowerCase()) return false;
  if (filters.className && event.entityType !== shortClassName(filters.className)) return false;
  if (filters.entityId && event.entityId !== filters.entityId.trim()) return false;
  if (filters.action && event.action !== filters.action) return false;
  return true;
}

/** Query string for /rest/auditTrail/index.json. */
export function buildAuditTrailQuery(filters: AuditTrailFilters, max: number, offset = 0): string {
  const params = new URLSearchParams();
  params.set('max', String(max));
  params.set('offset', String(offset));
  params.set('sort', 'dateCreated');
  params.set('order', 'desc');
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);

  // Exact filters from plans/soupfin-159-audit-trail-backend.md; ignored until it ships.
  if (filters.className) params.set('className', qualifiedClassName(filters.className));
  if (filters.entityId) params.set('persistedObjectId', filters.entityId.trim());
  if (filters.actor) params.set('actor', filters.actor.trim());

  // Today's narrowing: each word must match some column.
  const words = [
    filters.entityId?.trim(),
    filters.actor?.trim(),
    filters.className ? qualifiedClassName(filters.className) : undefined,
    ...(filters.search?.trim().split(/\s+/) ?? []),
  ].filter((w): w is string => !!w);
  if (words.length) params.set('search', words.join(' '));

  return params.toString();
}

/** Raw rows for the filters, newest first. */
export async function listAuditTrailRows(
  filters: AuditTrailFilters,
  max = AUDIT_MAX_ROWS,
  offset = 0
): Promise<AuditTrailRow[]> {
  const response = await apiClient.get<AuditTrailRow[]>(
    `/auditTrail/index.json?${buildAuditTrailQuery(filters, max, offset)}`
  );
  return normalizeToArray<AuditTrailRow>(response.data);
}

export interface AuditTrailResult {
  events: AuditEvent[];
  /** Rows the backend returned before grouping */
  rowCount: number;
  /** True when the backend hit its row cap, so older changes were cut off */
  truncated: boolean;
}

/** Events for the Audit Trail report. */
export async function listAuditEvents(filters: AuditTrailFilters): Promise<AuditTrailResult> {
  const rows = await listAuditTrailRows(filters, AUDIT_MAX_ROWS);
  const events = groupAuditRows(rows).filter((e) => matchesAuditFilters(e, filters));
  return { events, rowCount: rows.length, truncated: rows.length >= AUDIT_MAX_ROWS };
}

/**
 * History of one or more records, merged and newest first.
 *
 * A journal entry needs its lines as well as the group: approving or posting
 * changes the lines' status, not the group's. `search` ANDs its words, so each
 * record is its own request.
 */
export async function getEntityHistory(entities: AuditEntityRef[]): Promise<AuditEvent[]> {
  const unique = entities.filter(
    (e, i) => e.id && entities.findIndex((o) => o.id === e.id) === i
  );
  const perEntity = await Promise.all(
    unique.map(async (entity) => {
      const filters: AuditTrailFilters = { className: entity.className, entityId: entity.id };
      const rows = await listAuditTrailRows(filters, HISTORY_MAX_ROWS);
      return groupAuditRows(rows).filter((e) => matchesAuditFilters(e, filters));
    })
  );
  return perEntity.flat().sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

/** Quote a CSV cell, and defuse a leading = + - @ so a spreadsheet does not run it. */
function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** The Audit Trail export: one row per event, every change in the last column. */
export function auditEventsToCsv(events: AuditEvent[]): string {
  const header = ['Timestamp', 'User', 'Event', 'Record type', 'Record ID', 'Summary', 'Changes'];
  const lines = events.map((e) =>
    [
      e.at,
      e.actor,
      AUDIT_ACTION_LABELS[e.action],
      entityLabel(e.className),
      e.entityId,
      summariseAuditEvent(e),
      e.changes
        .map((c) => `${propertyLabel(c.property)}: ${c.oldValue ?? ''} → ${c.newValue ?? ''}`)
        .join('; '),
    ]
      .map(csvCell)
      .join(',')
  );
  return [header.join(','), ...lines].join('\r\n') + '\r\n';
}
