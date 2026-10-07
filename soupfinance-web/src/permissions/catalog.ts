/**
 * Permission catalog (SOUPFIN-102)
 *
 * A custom role is an SbRoleGroup whose authorities are permission roles named
 * `ROLE_PERM_{AREA}_{ACTION}` — e.g. `ROLE_PERM_INVOICES_CREATE`. The backend owns
 * enforcement (it returns 403 for anything a role does not grant); this catalog
 * only lets the UI build the role editor's matrix and hide actions a user cannot
 * perform. See plans/soupfin-102-custom-roles-backend.md for the server side.
 *
 * Who is restricted:
 *  - ROLE_ADMIN / ROLE_SUPER_ADMIN can do everything.
 *  - A user who holds NO `ROLE_PERM_*` authority is a legacy user. Today the
 *    backend lets ROLE_USER reach every finance controller, so hiding actions from
 *    them would hide things they can in fact do. They stay unrestricted.
 *  - A user who holds at least one `ROLE_PERM_*` authority is on a custom role and
 *    sees only what those authorities grant.
 */

export const PERMISSION_ACTIONS = ['view', 'create', 'edit', 'delete', 'approve'] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export const PERMISSION_AREAS = [
  'invoices',
  'bills',
  'vendors',
  'clients',
  'payments',
  'ledger',
  'reports',
  'settings',
] as const;
export type PermissionArea = (typeof PERMISSION_AREAS)[number];

export interface PermissionAreaDefinition {
  area: PermissionArea;
  label: string;
  description: string;
  /** Actions that exist for this area. A matrix cell outside this list renders as "—". */
  actions: readonly PermissionAction[];
}

// Order here is the row order of the role editor's matrix.
export const PERMISSION_CATALOG: readonly PermissionAreaDefinition[] = [
  {
    area: 'invoices',
    label: 'Sales: Invoices',
    description: 'Customer invoices and their payments',
    actions: ['view', 'create', 'edit', 'delete', 'approve'],
  },
  {
    area: 'bills',
    label: 'Purchases: Bills',
    description: 'Supplier bills and their payments',
    actions: ['view', 'create', 'edit', 'delete', 'approve'],
  },
  {
    area: 'vendors',
    label: 'Vendors',
    description: 'Supplier records',
    actions: ['view', 'create', 'edit', 'delete'],
  },
  {
    area: 'clients',
    label: 'Clients',
    description: 'Customer records',
    actions: ['view', 'create', 'edit', 'delete'],
  },
  {
    area: 'payments',
    label: 'Payments',
    description: 'Payments in and out',
    actions: ['view', 'create', 'edit', 'delete', 'approve'],
  },
  {
    area: 'ledger',
    label: 'Ledger & Journals',
    description: 'Chart of accounts, journal entries and vouchers',
    actions: ['view', 'create', 'edit', 'delete', 'approve'],
  },
  {
    area: 'reports',
    label: 'Reports',
    description: 'Financial statements and scheduled reports',
    actions: ['view'],
  },
  {
    area: 'settings',
    label: 'Settings: Users & Roles',
    description: 'Staff users, roles and company settings',
    actions: ['view', 'create', 'edit', 'delete'],
  },
];

export const ACTION_LABELS: Record<PermissionAction, string> = {
  view: 'View',
  create: 'Create',
  edit: 'Edit',
  delete: 'Delete',
  approve: 'Approve',
};

/** Authorities that bypass every permission check. */
export const UNRESTRICTED_AUTHORITIES = ['ROLE_ADMIN', 'ROLE_SUPER_ADMIN'] as const;

export const PERMISSION_AUTHORITY_PREFIX = 'ROLE_PERM_';

/** `('invoices', 'create')` → `'ROLE_PERM_INVOICES_CREATE'` */
export function permissionAuthority(area: PermissionArea, action: PermissionAction): string {
  return `${PERMISSION_AUTHORITY_PREFIX}${area.toUpperCase()}_${action.toUpperCase()}`;
}

/** Inverse of permissionAuthority. Returns null for anything that is not a catalogued permission. */
export function parsePermissionAuthority(
  authority: string
): { area: PermissionArea; action: PermissionAction } | null {
  if (!authority.startsWith(PERMISSION_AUTHORITY_PREFIX)) return null;
  const rest = authority.slice(PERMISSION_AUTHORITY_PREFIX.length).toLowerCase();
  const split = rest.lastIndexOf('_');
  if (split <= 0) return null;
  const area = rest.slice(0, split) as PermissionArea;
  const action = rest.slice(split + 1) as PermissionAction;
  const definition = PERMISSION_CATALOG.find((d) => d.area === area);
  if (!definition || !definition.actions.includes(action)) return null;
  return { area, action };
}

/** Every permission authority the catalog defines, in matrix order. */
export function allPermissionAuthorities(): string[] {
  return PERMISSION_CATALOG.flatMap((d) => d.actions.map((a) => permissionAuthority(d.area, a)));
}

/** True when these authorities place the user on a custom role. */
export function isRestricted(roles: readonly string[] | null | undefined): boolean {
  const list = roles ?? [];
  if (list.some((r) => (UNRESTRICTED_AUTHORITIES as readonly string[]).includes(r))) return false;
  return list.some((r) => r.startsWith(PERMISSION_AUTHORITY_PREFIX));
}

/**
 * Whether these authorities allow `action` on `area`.
 *
 * Any granted action in an area implies `view` of that area — an editor who could
 * create invoices but not open the list would be a dead end.
 */
export function hasPermission(
  roles: readonly string[] | null | undefined,
  area: PermissionArea,
  action: PermissionAction
): boolean {
  const list = roles ?? [];
  if (!isRestricted(list)) return true;
  if (list.includes(permissionAuthority(area, action))) return true;
  if (action === 'view') {
    const areaPrefix = `${PERMISSION_AUTHORITY_PREFIX}${area.toUpperCase()}_`;
    return list.some((r) => r.startsWith(areaPrefix) && parsePermissionAuthority(r) !== null);
  }
  return false;
}
