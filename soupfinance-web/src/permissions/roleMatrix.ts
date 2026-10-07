/**
 * Role editor matrix helpers (SOUPFIN-102)
 *
 * Pure functions behind RoleFormPage: map the catalog's permission authorities to
 * the SbRole ids the backend needs, read a role group's current grants, and apply
 * the matrix's toggle rules.
 */
import { normalizeToArray } from '../api/client';
import { getRoleAuthority, type SbRole, type SbRoleGroup } from '../types/settings';
import {
  PERMISSION_CATALOG,
  parsePermissionAuthority,
  permissionAuthority,
  type PermissionAction,
  type PermissionArea,
} from './catalog';

/** authority → SbRole id, for every SbRole whose authority resolves. */
export function indexRolesByAuthority(roles: SbRole[] | undefined): Map<string, number> {
  const index = new Map<string, number>();
  for (const role of roles ?? []) {
    const authority = getRoleAuthority(role);
    if (authority && role.id !== undefined && role.id !== null) index.set(authority, role.id);
  }
  return index;
}

/** Catalogued permission authorities granted by a role group. Non-permission roles are ignored. */
export function groupPermissionAuthorities(group: SbRoleGroup | undefined): string[] {
  if (!group) return [];
  const roles = normalizeToArray<SbRole>(group.authorities as SbRole[] | SbRole | undefined);
  const result: string[] = [];
  for (const role of roles) {
    const authority = getRoleAuthority(role);
    if (authority && parsePermissionAuthority(authority) && !result.includes(authority)) {
      result.push(authority);
    }
  }
  return result;
}

/** Catalogued authorities the backend has no SbRole for, so they cannot be granted yet. */
export function missingPermissionAuthorities(index: Map<string, number>): string[] {
  return PERMISSION_CATALOG.flatMap((d) =>
    d.actions.map((a) => permissionAuthority(d.area, a)).filter((auth) => !index.has(auth))
  );
}

/**
 * Toggle one matrix cell and apply the row rules:
 *  - granting any action also grants `view` (create-but-cannot-open is a dead end);
 *  - revoking `view` revokes every action in that row.
 */
export function togglePermission(
  current: readonly string[],
  area: PermissionArea,
  action: PermissionAction
): string[] {
  const authority = permissionAuthority(area, action);
  const viewAuthority = permissionAuthority(area, 'view');
  const granted = new Set(current);

  if (granted.has(authority)) {
    if (action === 'view') {
      for (const a of PERMISSION_CATALOG.find((d) => d.area === area)?.actions ?? []) {
        granted.delete(permissionAuthority(area, a));
      }
    } else {
      granted.delete(authority);
    }
  } else {
    granted.add(authority);
    if (action !== 'view') granted.add(viewAuthority);
  }
  return [...granted];
}

/** Convert granted authorities to the SbRole ids sent to the backend, dropping any it lacks. */
export function authoritiesToIds(authorities: readonly string[], index: Map<string, number>): number[] {
  return authorities.map((a) => index.get(a)).filter((id): id is number => id !== undefined);
}
