/**
 * SOUPFIN-102: role editor matrix helpers.
 */
import { describe, it, expect } from 'vitest';
import {
  authoritiesToIds,
  groupPermissionAuthorities,
  indexRolesByAuthority,
  missingPermissionAuthorities,
  togglePermission,
} from '../roleMatrix';
import { allPermissionAuthorities } from '../catalog';
import type { SbRole, SbRoleGroup } from '../../types/settings';

const roles: SbRole[] = [
  { id: 1, authority: 'ROLE_ADMIN' },
  { id: 10, authority: 'ROLE_PERM_INVOICES_VIEW' },
  { id: 11, authority: 'ROLE_PERM_INVOICES_CREATE' },
  // Serialised-only, as the backend sometimes sends (SOUPFIN-24)
  { id: 12, serialised: 'SbRole(authority:ROLE_PERM_BILLS_VIEW)' },
  // Unresolvable — must be ignored, not crash
  { id: 13 },
];

describe('indexRolesByAuthority', () => {
  it('maps resolvable authorities to ids, including serialised-only roles', () => {
    const index = indexRolesByAuthority(roles);
    expect(index.get('ROLE_PERM_INVOICES_VIEW')).toBe(10);
    expect(index.get('ROLE_PERM_BILLS_VIEW')).toBe(12);
    expect(index.size).toBe(4);
  });

  it('returns an empty index for no roles', () => {
    expect(indexRolesByAuthority(undefined).size).toBe(0);
    expect(indexRolesByAuthority([]).size).toBe(0);
  });
});

describe('missingPermissionAuthorities', () => {
  it('lists every cell when the server has none (empty backend)', () => {
    expect(missingPermissionAuthorities(new Map())).toEqual(allPermissionAuthorities());
  });

  it('lists nothing when every cell is seeded', () => {
    const full = new Map(allPermissionAuthorities().map((a, i) => [a, i + 1]));
    expect(missingPermissionAuthorities(full)).toEqual([]);
  });
});

describe('groupPermissionAuthorities', () => {
  it('reads permission authorities and ignores system roles', () => {
    const group: SbRoleGroup = { id: 5, name: 'Sales', authorities: roles };
    expect(groupPermissionAuthorities(group)).toEqual([
      'ROLE_PERM_INVOICES_VIEW',
      'ROLE_PERM_INVOICES_CREATE',
      'ROLE_PERM_BILLS_VIEW',
    ]);
  });

  it('accepts a single authority object instead of a list', () => {
    const group: SbRoleGroup = { id: 5, name: 'Sales', authorities: { id: 10, authority: 'ROLE_PERM_INVOICES_VIEW' } };
    expect(groupPermissionAuthorities(group)).toEqual(['ROLE_PERM_INVOICES_VIEW']);
  });

  it('returns [] for a missing group or no authorities', () => {
    expect(groupPermissionAuthorities(undefined)).toEqual([]);
    expect(groupPermissionAuthorities({ id: 1, name: 'Empty' })).toEqual([]);
  });

  it('de-duplicates repeated authorities', () => {
    const group: SbRoleGroup = {
      id: 5,
      name: 'Dup',
      authorities: [
        { id: 10, authority: 'ROLE_PERM_INVOICES_VIEW' },
        { id: 10, authority: 'ROLE_PERM_INVOICES_VIEW' },
      ],
    };
    expect(groupPermissionAuthorities(group)).toEqual(['ROLE_PERM_INVOICES_VIEW']);
  });
});

describe('togglePermission', () => {
  it('ticking create also ticks view', () => {
    expect(togglePermission([], 'invoices', 'create').sort()).toEqual(
      ['ROLE_PERM_INVOICES_CREATE', 'ROLE_PERM_INVOICES_VIEW'].sort()
    );
  });

  it('clearing view clears the whole row but leaves other rows alone', () => {
    const start = [
      'ROLE_PERM_INVOICES_VIEW',
      'ROLE_PERM_INVOICES_CREATE',
      'ROLE_PERM_INVOICES_APPROVE',
      'ROLE_PERM_BILLS_VIEW',
    ];
    expect(togglePermission(start, 'invoices', 'view')).toEqual(['ROLE_PERM_BILLS_VIEW']);
  });

  it('clearing a non-view action keeps view', () => {
    const start = ['ROLE_PERM_INVOICES_VIEW', 'ROLE_PERM_INVOICES_CREATE'];
    expect(togglePermission(start, 'invoices', 'create')).toEqual(['ROLE_PERM_INVOICES_VIEW']);
  });

  it('does not mutate its input', () => {
    const start = ['ROLE_PERM_INVOICES_VIEW'];
    togglePermission(start, 'invoices', 'edit');
    expect(start).toEqual(['ROLE_PERM_INVOICES_VIEW']);
  });

  it('ticking every cell yields the full catalogue with no duplicates', () => {
    let granted: string[] = [];
    for (const authority of allPermissionAuthorities()) {
      const [area, action] = authority.replace('ROLE_PERM_', '').toLowerCase().split('_') as [never, never];
      if (!granted.includes(authority)) granted = togglePermission(granted, area, action);
    }
    expect(granted.sort()).toEqual(allPermissionAuthorities().sort());
  });
});

describe('authoritiesToIds', () => {
  it('maps to ids and drops authorities the server lacks', () => {
    const index = indexRolesByAuthority(roles);
    expect(authoritiesToIds(['ROLE_PERM_INVOICES_VIEW', 'ROLE_PERM_LEDGER_VIEW'], index)).toEqual([10]);
    expect(authoritiesToIds([], index)).toEqual([]);
  });
});
