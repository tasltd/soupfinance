/**
 * SOUPFIN-102: permission catalog — authority naming and the "may this user do X?" rules.
 */
import { describe, it, expect } from 'vitest';
import {
  PERMISSION_CATALOG,
  allPermissionAuthorities,
  hasPermission,
  isRestricted,
  parsePermissionAuthority,
  permissionAuthority,
} from '../catalog';

describe('permissionAuthority / parsePermissionAuthority', () => {
  it('builds ROLE_PERM_{AREA}_{ACTION} and parses it back', () => {
    expect(permissionAuthority('invoices', 'create')).toBe('ROLE_PERM_INVOICES_CREATE');
    expect(parsePermissionAuthority('ROLE_PERM_INVOICES_CREATE')).toEqual({ area: 'invoices', action: 'create' });
  });

  it('round-trips every catalogued cell', () => {
    for (const authority of allPermissionAuthorities()) {
      const parsed = parsePermissionAuthority(authority);
      expect(parsed).not.toBeNull();
      expect(permissionAuthority(parsed!.area, parsed!.action)).toBe(authority);
    }
  });

  it('rejects non-permission and uncatalogued authorities', () => {
    expect(parsePermissionAuthority('ROLE_ADMIN')).toBeNull();
    expect(parsePermissionAuthority('ROLE_PERM_')).toBeNull();
    expect(parsePermissionAuthority('ROLE_PERM_INVOICES')).toBeNull();
    // Reports has no create cell
    expect(parsePermissionAuthority('ROLE_PERM_REPORTS_CREATE')).toBeNull();
    expect(parsePermissionAuthority('ROLE_PERM_PAYROLL_VIEW')).toBeNull();
  });

  it('has a unique authority per cell (33 cells)', () => {
    const all = allPermissionAuthorities();
    expect(new Set(all).size).toBe(all.length);
    expect(all).toHaveLength(PERMISSION_CATALOG.reduce((n, d) => n + d.actions.length, 0));
    expect(all).toHaveLength(33);
  });
});

describe('isRestricted', () => {
  it.each([
    ['no roles at all (zero)', [], false],
    ['null roles', null, false],
    ['undefined roles', undefined, false],
    ['legacy ROLE_USER only', ['ROLE_USER'], false],
    ['admin with permissions', ['ROLE_ADMIN', 'ROLE_PERM_INVOICES_VIEW'], false],
    ['super admin with permissions', ['ROLE_SUPER_ADMIN', 'ROLE_PERM_BILLS_VIEW'], false],
    ['custom role user', ['ROLE_USER', 'ROLE_PERM_INVOICES_VIEW'], true],
  ] as const)('%s → %s', (_label, roles, expected) => {
    expect(isRestricted(roles as string[] | null | undefined)).toBe(expected);
  });
});

describe('hasPermission', () => {
  const sales = ['ROLE_USER', 'ROLE_PERM_INVOICES_VIEW', 'ROLE_PERM_INVOICES_CREATE'];

  it('lets a "Sales" role create invoices but not touch bills', () => {
    expect(hasPermission(sales, 'invoices', 'view')).toBe(true);
    expect(hasPermission(sales, 'invoices', 'create')).toBe(true);
    expect(hasPermission(sales, 'invoices', 'edit')).toBe(false);
    expect(hasPermission(sales, 'invoices', 'delete')).toBe(false);
    expect(hasPermission(sales, 'bills', 'view')).toBe(false);
    expect(hasPermission(sales, 'bills', 'create')).toBe(false);
    expect(hasPermission(sales, 'settings', 'view')).toBe(false);
  });

  it('treats any action in an area as implying view of that area', () => {
    expect(hasPermission(['ROLE_PERM_BILLS_APPROVE'], 'bills', 'view')).toBe(true);
    expect(hasPermission(['ROLE_PERM_BILLS_APPROVE'], 'bills', 'edit')).toBe(false);
    expect(hasPermission(['ROLE_PERM_BILLS_APPROVE'], 'invoices', 'view')).toBe(false);
  });

  it('does not let a malformed permission authority imply view', () => {
    // Looks like the bills prefix but is not a catalogued cell
    expect(hasPermission(['ROLE_PERM_BILLS_FROBNICATE'], 'bills', 'view')).toBe(false);
  });

  it('lets admins and legacy users do everything', () => {
    for (const roles of [['ROLE_ADMIN'], ['ROLE_USER'], [], null, undefined]) {
      for (const d of PERMISSION_CATALOG) {
        for (const a of d.actions) {
          expect(hasPermission(roles as string[] | null | undefined, d.area, a)).toBe(true);
        }
      }
    }
  });

  it('copes with an overloaded authority list (1,000 unrelated roles + one grant)', () => {
    const roles = Array.from({ length: 1000 }, (_, i) => `ROLE_CUSTOM_${i}`);
    roles.push('ROLE_PERM_REPORTS_VIEW');
    expect(isRestricted(roles)).toBe(true);
    expect(hasPermission(roles, 'reports', 'view')).toBe(true);
    expect(hasPermission(roles, 'invoices', 'view')).toBe(false);
  });

  it('grants nothing beyond the catalogue when a role holds every permission', () => {
    const everything = allPermissionAuthorities();
    for (const d of PERMISSION_CATALOG) {
      for (const a of d.actions) expect(hasPermission(everything, d.area, a)).toBe(true);
    }
    // Reports has no create cell, so no authority can grant it
    expect(hasPermission(everything, 'reports', 'create')).toBe(false);
  });
});
