/**
 * Enabled modules for the current tenant (SOUPFIN-181).
 *
 * The backend gates whole controllers per tenant: FinanceModuleInterceptor answers 403
 * for invoice, bill, payment, ledger and voucher controllers when the tenant lacks the
 * FINANCE module (TradingModuleInterceptor, CisModuleInterceptor and
 * SouplifyModuleInterceptor do the same for theirs). GET /account/modules.json lists the
 * modules the tenant has, using the same rule, so the SideNav can hide pages that would
 * only ever load a 403.
 *
 * Uses accountClient: AccountController lives at /account/*, not /rest/account/*.
 */
import { accountClient } from '../client';

/** soupmarkets-web `ModuleGroup` enum names. */
export type ModuleGroup = 'FINANCE' | 'CLIENT' | 'TRADING' | 'CIS' | 'SOUPLIFY';

export interface EnabledModulesResponse {
  tenantId?: string;
  modules: string[];
}

/** True when the payload is the `{ modules: string[] }` shape AccountController.modules renders. */
export function isEnabledModulesResponse(data: unknown): data is EnabledModulesResponse {
  if (!data || typeof data !== 'object') return false;
  const modules = (data as Record<string, unknown>).modules;
  return Array.isArray(modules) && modules.every((m) => typeof m === 'string');
}

export const modulesApi = {
  /**
   * The tenant's enabled module names, upper-cased, or null when the backend has no
   * modules action yet (404 on a backend deployed before SOUPFIN-181). Null means
   * "unknown": callers must show everything, as they did before this endpoint existed.
   *
   * Every other failure throws. A 200 that is not the expected shape (for example the
   * login page an expired session is redirected to, see SOUPFIN-23) throws too, rather
   * than reading as "no modules" and hiding the whole menu.
   */
  list: async (): Promise<ModuleGroup[] | null> => {
    try {
      const response = await accountClient.get<unknown>('/account/modules.json', {
        expectedStatuses: [404],
      });
      if (!isEnabledModulesResponse(response.data)) {
        throw new Error('The enabled-modules response was not in the expected format.');
      }
      return [...new Set(response.data.modules.map((m) => m.toUpperCase()))] as ModuleGroup[];
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 404) return null;
      throw error;
    }
  },
};
