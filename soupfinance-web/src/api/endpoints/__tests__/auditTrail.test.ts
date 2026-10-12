/**
 * Added (SOUPFIN-159): audit trail endpoint — query building, grouping the
 * plugin's per-property rows into events, action classification, the exact
 * filters the backend cannot apply yet, and the CSV export.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import apiClient from '../../client';
import {
  AUDIT_MAX_ROWS,
  auditEventsToCsv,
  buildAuditTrailQuery,
  classifyAuditAction,
  entityLabel,
  getEntityHistory,
  groupAuditRows,
  listAuditEvents,
  propertyLabel,
  qualifiedClassName,
  summariseAuditEvent,
} from '../auditTrail';
import type { AuditTrailRow } from '../../../types/auditTrail';

vi.mock('../../client', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  normalizeToArray: (value: unknown) => (value == null ? [] : Array.isArray(value) ? value : [value]),
}));

const get = vi.mocked(apiClient.get);

const JE = 'soupbroker.finance.LedgerTransactionGroup';
const LINE = 'soupbroker.finance.LedgerTransaction';

let nextId = 1;
function row(partial: Partial<AuditTrailRow>): AuditTrailRow {
  return {
    id: nextId++,
    actor: 'ama.mensah',
    className: JE,
    persistedObjectId: 'je-1',
    eventName: 'INSERT',
    uri: '/rest/ledgerTransaction/saveMultiple',
    dateCreated: '2026-10-12T09:00:00Z',
    propertyName: 'description',
    oldValue: null,
    newValue: 'Office rent',
    ...partial,
  };
}

/** The ~40 rows one Grails save writes, most of them noise or never set. */
function insertRows(partial: Partial<AuditTrailRow> = {}): AuditTrailRow[] {
  return [
    row({ ...partial, propertyName: 'description', newValue: 'Office rent' }),
    row({ ...partial, propertyName: 'totalDebit', newValue: '350' }),
    row({ ...partial, propertyName: 'serialised', newValue: 'LedgerTransactionGroup(...)' }),
    row({ ...partial, propertyName: 'tenantId', newValue: 'tenant-1' }),
    row({ ...partial, propertyName: 'dateCreated', newValue: 'Mon Oct 12 09:00:00 UTC 2026' }),
    row({ ...partial, propertyName: 'notes', newValue: null }),
    row({ ...partial, propertyName: 'reference', newValue: 'null' }),
  ];
}

beforeEach(() => {
  get.mockReset();
  nextId = 1;
});

describe('groupAuditRows', () => {
  it('folds the rows of one save into one event and drops noise and unset properties', () => {
    const events = groupAuditRows(insertRows());
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: 'CREATED',
      actor: 'ama.mensah',
      entityType: 'LedgerTransactionGroup',
      entityId: 'je-1',
      at: '2026-10-12T09:00:00Z',
    });
    expect(events[0].changes).toEqual([
      { property: 'description', oldValue: null, newValue: 'Office rent' },
      { property: 'totalDebit', oldValue: null, newValue: '350' },
    ]);
  });

  it('keeps saves by different users, records or seconds apart, newest first', () => {
    const events = groupAuditRows([
      ...insertRows(),
      row({ eventName: 'UPDATE', actor: 'kofi.boateng', propertyName: 'description', oldValue: 'Office rent', newValue: 'October rent', dateCreated: '2026-10-12T10:00:00Z', uri: '/rest/ledgerTransaction/updateMultiple' }),
      row({ eventName: 'UPDATE', persistedObjectId: 'je-2', propertyName: 'description', oldValue: 'a', newValue: 'b', dateCreated: '2026-10-12T08:00:00Z' }),
    ]);
    expect(events.map((e) => [e.entityId, e.action, e.actor])).toEqual([
      ['je-1', 'EDITED', 'kofi.boateng'],
      ['je-1', 'CREATED', 'ama.mensah'],
      ['je-2', 'EDITED', 'ama.mensah'],
    ]);
  });

  it('treats rows a few milliseconds apart in the same second as one save', () => {
    const events = groupAuditRows([
      row({ eventName: 'UPDATE', propertyName: 'amount', oldValue: '1', newValue: '2', dateCreated: '2026-10-12T09:00:00.120Z' }),
      row({ eventName: 'UPDATE', propertyName: 'memo', oldValue: 'x', newValue: 'y', dateCreated: '2026-10-12T09:00:00.940Z' }),
    ]);
    expect(events).toHaveLength(1);
    expect(events[0].changes).toHaveLength(2);
  });

  it('drops an UPDATE whose only change is the serialised snapshot', () => {
    const events = groupAuditRows([
      row({ eventName: 'UPDATE', propertyName: 'serialised', oldValue: 'A', newValue: 'B' }),
      row({ eventName: 'UPDATE', propertyName: 'lastUpdated', oldValue: 'A', newValue: 'B' }),
    ]);
    expect(events).toEqual([]);
  });

  it('keeps a DELETE even when the plugin recorded no property values', () => {
    const events = groupAuditRows([row({ eventName: 'DELETE', propertyName: 'description', oldValue: null, newValue: null })]);
    expect(events).toHaveLength(1);
    expect(events[0].action).toBe('DELETED');
  });

  it('labels a missing actor instead of printing an empty name', () => {
    expect(groupAuditRows([row({ actor: null })])[0].actor).toBe('Unknown user');
  });

  it('returns no events for no rows', () => {
    expect(groupAuditRows([])).toEqual([]);
  });

  it('groups 10,000 rows from 250 saves into 250 events without losing a change', () => {
    const rows: AuditTrailRow[] = [];
    for (let save = 0; save < 250; save++) {
      const second = String(save % 60).padStart(2, '0');
      const minute = String(Math.floor(save / 60)).padStart(2, '0');
      for (let prop = 0; prop < 40; prop++) {
        rows.push(row({
          eventName: 'UPDATE',
          persistedObjectId: `je-${save}`,
          propertyName: `field${prop}`,
          oldValue: '1',
          newValue: '2',
          dateCreated: `2026-10-12T09:${minute}:${second}Z`,
        }));
      }
    }
    const events = groupAuditRows(rows);
    expect(events).toHaveLength(250);
    expect(events.every((e) => e.changes.length === 40)).toBe(true);
    expect(events[0].at >= events[events.length - 1].at).toBe(true);
  });
});

describe('classifyAuditAction', () => {
  const status = (newValue: string) => [{ property: 'status', oldValue: 'PENDING', newValue }];

  it.each([
    ['INSERT', '/rest/voucher', [], 'CREATED'],
    ['DELETE', '/rest/voucher/delete/v1.json', [], 'DELETED'],
    ['UPDATE', '/rest/ledgerTransactionGroup/post/je-1.json', [], 'POSTED'],
    ['UPDATE', '/rest/voucher/batchPost.json', [], 'POSTED'],
    ['UPDATE', '/rest/ledgerTransactionGroup/reverse/je-1.json', [], 'REVERSED'],
    ['UPDATE', '/rest/voucher/cancel/v1.json', [], 'CANCELLED'],
    ['UPDATE', '/rest/ledgerTransactionApproval/approve/a1.json', status('APPROVED'), 'APPROVED'],
    ['UPDATE', '/rest/ledgerTransaction/updateMultiple', status('REVERSED'), 'REVERSED'],
    ['UPDATE', '/rest/voucher/v1', status('POSTED'), 'POSTED'],
    ['UPDATE', '/rest/voucher/v1', [{ property: 'archived', oldValue: 'false', newValue: 'true' }], 'ARCHIVED'],
    ['UPDATE', '/rest/voucher/v1', [{ property: 'amount', oldValue: '1', newValue: '2' }], 'EDITED'],
  ])('%s %s → %s', (eventName, uri, changes, expected) => {
    expect(classifyAuditAction(eventName, uri, changes)).toBe(expected);
  });

  it('does not read "post" inside a longer path segment', () => {
    expect(classifyAuditAction('UPDATE', '/rest/postcode/update/1.json', [])).toBe('EDITED');
    expect(classifyAuditAction('UPDATE', '/rest/reversedEntry/update/1.json', [])).toBe('EDITED');
  });

  it('copes with no event name and no path', () => {
    expect(classifyAuditAction(null, null, [])).toBe('EDITED');
  });
});

describe('labels and summaries', () => {
  it('names known record types and splits unknown ones into words', () => {
    expect(entityLabel(JE)).toBe('Journal entry');
    expect(entityLabel('soupbroker.finance.Voucher')).toBe('Voucher');
    expect(entityLabel('soupbroker.trading.TradeTicket')).toBe('Trade Ticket');
    expect(entityLabel(null)).toBe('');
  });

  it('turns a property name into a sentence-case label', () => {
    expect(propertyLabel('creditLedgerAccount')).toBe('Credit ledger account');
    expect(propertyLabel('amount')).toBe('Amount');
  });

  it('qualifies a short class name and keeps a qualified or unknown one', () => {
    expect(qualifiedClassName('Voucher')).toBe('soupbroker.finance.Voucher');
    expect(qualifiedClassName('soupbroker.kyc.Client')).toBe('soupbroker.kyc.Client');
    expect(qualifiedClassName('Mystery')).toBe('Mystery');
  });

  it('summarises a status change, an edit, and an edit of many fields', () => {
    const base = groupAuditRows(insertRows())[0];
    expect(summariseAuditEvent({ ...base, action: 'APPROVED', changes: [{ property: 'status', oldValue: null, newValue: 'APPROVED' }] }))
      .toBe('Status: none → APPROVED');
    expect(summariseAuditEvent({ ...base, action: 'EDITED', changes: [{ property: 'memo', oldValue: 'a', newValue: 'b' }] }))
      .toBe('Changed memo');
    const many = Array.from({ length: 7 }, (_, i) => ({ property: `field${i}`, oldValue: '1', newValue: '2' }));
    expect(summariseAuditEvent({ ...base, action: 'EDITED', changes: many })).toBe('Changed field0, field1, field2, field3 and 3 more');
    expect(summariseAuditEvent(base)).toBe('Journal entry created');
  });
});

describe('buildAuditTrailQuery', () => {
  it('sends the date range, newest first, and only the paging when nothing else is set', () => {
    const q = new URLSearchParams(buildAuditTrailQuery({ from: '2026-10-01', to: '2026-10-12' }, 1000));
    expect(Object.fromEntries(q)).toEqual({
      max: '1000', offset: '0', sort: 'dateCreated', order: 'desc', from: '2026-10-01', to: '2026-10-12',
    });
  });

  it('sends the exact filters for the planned backend and the same words in search for today\'s', () => {
    const q = new URLSearchParams(
      buildAuditTrailQuery({ className: 'Voucher', entityId: ' v1 ', actor: 'ama.mensah', search: 'rent  October' }, 500)
    );
    expect(q.get('className')).toBe('soupbroker.finance.Voucher');
    expect(q.get('persistedObjectId')).toBe('v1');
    expect(q.get('actor')).toBe('ama.mensah');
    expect(q.get('search')).toBe('v1 ama.mensah soupbroker.finance.Voucher rent October');
  });
});

describe('listAuditEvents', () => {
  it('asks for the backend maximum and re-applies the filters the backend ignores', async () => {
    get.mockResolvedValue({
      data: [
        ...insertRows({ actor: 'ama.mensah' }),
        // A search hit in another column: the actor appears in a value, not as the actor.
        row({ actor: 'kofi.boateng', persistedObjectId: 'je-9', eventName: 'UPDATE', propertyName: 'memo', oldValue: 'x', newValue: 'ama.mensah' }),
      ],
    });
    const result = await listAuditEvents({ actor: 'ama.mensah' });
    expect(get.mock.calls[0][0]).toMatch(/^\/auditTrail\/index\.json\?max=1000&/);
    expect(result.events.map((e) => e.actor)).toEqual(['ama.mensah']);
    expect(result.rowCount).toBe(8);
    expect(result.truncated).toBe(false);
  });

  it('reports a cut-off when the backend returns its row cap', async () => {
    get.mockResolvedValue({ data: Array.from({ length: AUDIT_MAX_ROWS }, () => row({})) });
    expect((await listAuditEvents({})).truncated).toBe(true);
  });

  it('returns nothing, not an error, for an empty log', async () => {
    get.mockResolvedValue({ data: [] });
    expect(await listAuditEvents({})).toEqual({ events: [], rowCount: 0, truncated: false });
  });

  it('lets a backend failure through so the page can show it', async () => {
    get.mockRejectedValue(Object.assign(new Error('Request failed with status code 403'), { response: { status: 403 } }));
    await expect(listAuditEvents({})).rejects.toThrow('403');
  });
});

describe('getEntityHistory', () => {
  it('asks once per record, keeps only that record\'s rows, and merges them newest first', async () => {
    get.mockImplementation(async (url: string) => {
      const id = new URLSearchParams(url.split('?')[1]).get('persistedObjectId');
      if (id === 'je-1') {
        return { data: [...insertRows(), row({ persistedObjectId: 'other', eventName: 'UPDATE', propertyName: 'memo', oldValue: 'a', newValue: 'je-1' })] };
      }
      return {
        data: [
          row({ className: LINE, persistedObjectId: 'line-1', eventName: 'UPDATE', propertyName: 'status', oldValue: 'PENDING', newValue: 'APPROVED', actor: 'kofi.boateng', uri: '/rest/ledgerTransactionApproval/approve/a1.json', dateCreated: '2026-10-12T11:00:00Z' }),
        ],
      };
    });

    const events = await getEntityHistory([
      { className: 'LedgerTransactionGroup', id: 'je-1' },
      { className: 'LedgerTransaction', id: 'line-1' },
      { className: 'LedgerTransaction', id: 'line-1' },
      { className: 'LedgerTransaction', id: '' },
    ]);

    expect(get).toHaveBeenCalledTimes(2);
    expect(events.map((e) => [e.action, e.actor, e.entityId])).toEqual([
      ['APPROVED', 'kofi.boateng', 'line-1'],
      ['CREATED', 'ama.mensah', 'je-1'],
    ]);
  });

  it('asks nothing for no records', async () => {
    expect(await getEntityHistory([])).toEqual([]);
    expect(get).not.toHaveBeenCalled();
  });
});

describe('auditEventsToCsv', () => {
  it('writes one quoted row per event with every change in the last column', () => {
    const events = groupAuditRows([
      row({ eventName: 'UPDATE', propertyName: 'description', oldValue: 'Rent, Sept', newValue: 'Rent "Oct"' }),
    ]);
    const csv = auditEventsToCsv(events);
    const [header, line] = csv.trim().split('\r\n');
    expect(header).toBe('Timestamp,User,Event,Record type,Record ID,Summary,Changes');
    expect(line).toBe('2026-10-12T09:00:00Z,ama.mensah,Edited,Journal entry,je-1,Changed description,"Description: Rent, Sept → Rent ""Oct"""');
  });

  it('defuses a value a spreadsheet would run as a formula', () => {
    const events = groupAuditRows([row({ actor: '=HYPERLINK("x")', eventName: 'UPDATE', propertyName: 'memo', oldValue: 'a', newValue: 'b' })]);
    expect(auditEventsToCsv(events)).toContain(`"'=HYPERLINK(""x"")"`);
  });

  it('writes only the header for no events', () => {
    expect(auditEventsToCsv([])).toBe('Timestamp,User,Event,Record type,Record ID,Summary,Changes\r\n');
  });
});
