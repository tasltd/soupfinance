/**
 * Added (SOUPFIN-159): audit trail types.
 *
 * `AuditTrailRow` mirrors the Grails domain `soupbroker.AuditTrail` (table
 * `audit_log`), written by the audit-logging plugin for every domain that
 * implements `Auditable`. One row is one property change, so a single save
 * writes many rows that share className, persistedObjectId, actor, uri and
 * dateCreated.
 *
 * `AuditEvent` is UI-only: the rows of one save grouped into one event.
 */

/** soupbroker.AuditTrail, as rendered by /rest/auditTrail/index.json */
export interface AuditTrailRow {
  id: number | string;
  /** Username of the acting user; "SYS" for scheduled jobs. */
  actor?: string | null;
  /** Request path that caused the change, e.g. /rest/voucher/post/abc.json */
  uri?: string | null;
  /** Fully qualified domain class, e.g. soupbroker.finance.Voucher */
  className?: string | null;
  persistedObjectId?: string | null;
  persistedObjectVersion?: number | null;
  /** INSERT, UPDATE or DELETE */
  eventName?: string | null;
  propertyName?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  dateCreated?: string | null;
}

/** What happened to a record, in the words the History panel uses. */
export type AuditAction =
  | 'CREATED'
  | 'EDITED'
  | 'APPROVED'
  | 'POSTED'
  | 'REVERSED'
  | 'CANCELLED'
  | 'ARCHIVED'
  | 'DELETED';

export interface AuditChange {
  property: string;
  oldValue: string | null;
  newValue: string | null;
}

/** UI-only: the rows of one save, grouped. */
export interface AuditEvent {
  key: string;
  /** dateCreated of the rows, as sent by the backend */
  at: string;
  actor: string;
  action: AuditAction;
  className: string;
  /** Short class name, e.g. LedgerTransactionGroup */
  entityType: string;
  entityId: string;
  uri: string | null;
  changes: AuditChange[];
}

/** A record whose history is wanted: the Grails class and its id. */
export interface AuditEntityRef {
  /** Short or fully qualified class name */
  className: string;
  id: string;
}

export interface AuditTrailFilters {
  /** YYYY-MM-DD, inclusive */
  from?: string;
  /** YYYY-MM-DD, inclusive */
  to?: string;
  /** Exact username */
  actor?: string;
  /** Short class name, e.g. Voucher */
  className?: string;
  /** Record id */
  entityId?: string;
  action?: AuditAction;
  /** Free text, matched against every column */
  search?: string;
}
