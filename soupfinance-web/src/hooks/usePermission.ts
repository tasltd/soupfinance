/**
 * Permission hooks (SOUPFIN-102)
 *
 * Read the signed-in user's authorities from the auth store and answer
 * "may this user do X?" so pages can hide actions the user's role does not grant.
 *
 * The API stays the authority: hiding a button is a courtesy, not a security
 * control. A request the role does not cover still returns 403, and the page
 * shows ApiErrorState's "You do not have permission" card.
 */
import { useCallback } from 'react';
import { useAuthStore } from '../stores/authStore';
import {
  hasPermission,
  isRestricted,
  type PermissionAction,
  type PermissionArea,
} from '../permissions/catalog';

export interface UsePermissionsReturn {
  /** True when the user's role allows `action` on `area`. */
  can: (area: PermissionArea, action: PermissionAction) => boolean;
  /** True when the user is on a custom role (holds ROLE_PERM_* authorities and is not an admin). */
  isRestricted: boolean;
}

export function usePermissions(): UsePermissionsReturn {
  const roles = useAuthStore((state) => state.user?.roles);
  const can = useCallback(
    (area: PermissionArea, action: PermissionAction) => hasPermission(roles, area, action),
    [roles]
  );
  return { can, isRestricted: isRestricted(roles) };
}

/** Single-check form: `const canCreate = usePermission('invoices', 'create')`. */
export function usePermission(area: PermissionArea, action: PermissionAction): boolean {
  const roles = useAuthStore((state) => state.user?.roles);
  return hasPermission(roles, area, action);
}
