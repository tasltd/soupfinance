/**
 * Settings API Endpoints
 *
 * Endpoints for:
 * - Agent/Staff management
 * - Account Bank Details
 * - Account Persons (directors, signatories)
 * - Account configuration
 */
// Changed: Added CSRF token imports for mutation operations (POST/PUT/DELETE)
// Fix: Use shared accountClient from client.ts (has proper interceptors for 401/logging)
import apiClient, { accountClient, toQueryString, getCsrfToken, getCsrfTokenForEdit, csrfQueryString } from '../client';
// Changed: Static import for authStore (used by accountSettingsApi.get() to read tenantId)
import { useAuthStore } from '../../stores/authStore';
import type {
  Agent,
  AgentFormData,
  AccountBankDetails,
  AccountBankDetailsFormData,
  AccountPerson,
  AccountPersonFormData,
  AccountSettings,
  SbRole,
  Bank,
} from '../../types/settings';

// ============================================================================
// Common Types
// ============================================================================

export interface ListParams {
  max?: number;
  offset?: number;
  sort?: string;
  order?: 'asc' | 'desc';
  search?: string;
  from?: string;
  to?: string;
  [key: string]: unknown;
}

// ============================================================================
// Agent/Staff API
// ============================================================================

/**
 * Transform AgentFormData to backend JSON format
 */
function transformAgentData(data: AgentFormData): Record<string, unknown> {
  const transformed: Record<string, unknown> = {
    firstName: data.firstName,
    lastName: data.lastName,
    otherNames: data.otherNames,
    designation: data.designation,
    address: data.address,
  };

  // Handle user access (login credentials) as nested object
  if (data.username || data.password) {
    transformed.userAccess = {
      ...(data.username && { username: data.username }),
      ...(data.password && { password: data.password }),
    };
  }

  // Handle roles as authorities array
  if (data.roles && data.roles.length > 0) {
    transformed.authorities = data.roles.map((roleAuthority) => ({
      authority: roleAuthority,
    }));
  }

  return transformed;
}

export const agentApi = {
  /**
   * List active agents/staff
   */
  list: async (params?: ListParams): Promise<Agent[]> => {
    const queryString = params ? `?${toQueryString(params)}` : '';
    const response = await apiClient.get<Agent[]>(`/agent/index.json${queryString}`);
    return response.data;
  },

  /**
   * List archived/disabled agents
   */
  listArchived: async (params?: ListParams): Promise<Agent[]> => {
    const queryString = params ? `?${toQueryString(params)}` : '';
    const response = await apiClient.get<Agent[]>(`/agent/archived.json${queryString}`);
    return response.data;
  },

  /**
   * Get single agent by ID
   *
   * WARNING (SOUPFIN-50): `/agent/show/{id}.json` can serve a STALE read.
   * The backend caches it via `@Cacheable(value='agent', key={id})` (plain String) but
   * evicted on save via `@CacheEvict(value='agent', key={"${agent?.id}"})` (GString), and
   * the two key types never compare equal — so the entry was never evicted. Because
   * `update()` below fetches its CSRF token from `/agent/edit/{id}.json`, which hits the
   * SAME cached read, every save warms the cache with pre-update data first. The stale
   * value then survives until the backend JVM restarts.
   *
   * So if the Edit form shows old values after a save, the WRITE IS FINE — do not go
   * looking for a bug in the update path.
   *
   * Do NOT verify an agent write through this endpoint. `/agent/index.json` is uncached
   * and always fresh — assert against that instead (see the SOUPFIN-45 regression spec).
   * There is no correct client-side workaround: `edit/{id}.json` hits the same cached
   * read, and `index.json` ignores an `id=` filter.
   *
   * Fix lives in soupmarkets-web, not here (.claude/rules/backend-changes-workflow.md);
   * see plans/soupfin-50-agent-cache-evict-key-backend.md. It has landed there (the evict
   * key is now `key={agent?.id}`), so this staleness ends per-environment as each backend
   * is redeployed — keep this note until every environment is on that build.
   */
  get: async (id: string): Promise<Agent> => {
    const response = await apiClient.get<Agent>(`/agent/show/${id}.json`);
    return response.data;
  },

  /**
   * Create new agent/staff member
   * Changed: Added CSRF token for Grails withForm protection
   */
  create: async (data: AgentFormData): Promise<Agent> => {
    const csrf = await getCsrfToken('agent');
    const transformed = transformAgentData(data);
    const response = await apiClient.post<Agent>(
      `/agent/save.json?${csrfQueryString(csrf)}`,
      transformed
    );
    return response.data;
  },

  /**
   * Update existing agent
   * Changed: Added CSRF token for Grails withForm protection
   */
  update: async (id: string, data: AgentFormData): Promise<Agent> => {
    const csrf = await getCsrfTokenForEdit('agent', id);
    const transformed = { id, ...transformAgentData(data) };
    // Fix: Include /{id} in update URL (standard Grails CRUD pattern)
    const response = await apiClient.put<Agent>(
      `/agent/update/${id}.json?${csrfQueryString(csrf)}`,
      transformed
    );
    return response.data;
  },

  /**
   * Delete agent (soft delete - archives)
   * Changed: Added CSRF token for Grails withForm protection
   */
  delete: async (id: string): Promise<void> => {
    const csrf = await getCsrfTokenForEdit('agent', id);
    await apiClient.delete(`/agent/delete/${id}.json?${csrfQueryString(csrf)}`);
  },

  /**
   * Update agent password/access credentials
   */
  updatePassword: async (id: string, password: string): Promise<void> => {
    await apiClient.put(`/agent/updateAccess/${id}`, { password });
  },
};

// ============================================================================
// Account Bank Details API
// ============================================================================

/**
 * Transform AccountBankDetailsFormData to backend JSON format
 */
function transformBankDetailsData(data: AccountBankDetailsFormData): Record<string, unknown> {
  const transformed: Record<string, unknown> = {
    accountName: data.accountName,
    accountNumber: data.accountNumber,
    bankBranch: data.bankBranch,
    priority: data.priority,
    currency: data.currency,
    defaultClientDebtAccount: data.defaultClientDebtAccount,
    defaultClientEquityAccount: data.defaultClientEquityAccount,
  };

  // Handle bank reference as nested object
  if (data.bankId) {
    transformed.bank = { id: data.bankId };
  } else if (data.bankForOtherOption) {
    transformed.bankForOtherOption = data.bankForOtherOption;
  }

  // Handle ledger account link as nested object
  if (data.ledgerAccountId) {
    transformed.ledgerAccount = { id: data.ledgerAccountId };
  }

  return transformed;
}

export const accountBankDetailsApi = {
  /**
   * List active bank accounts
   */
  list: async (params?: ListParams): Promise<AccountBankDetails[]> => {
    const queryString = params ? `?${toQueryString(params)}` : '';
    const response = await apiClient.get<AccountBankDetails[]>(
      `/accountBankDetails/index.json${queryString}`
    );
    return response.data;
  },

  /**
   * Get single bank account by ID
   */
  get: async (id: string): Promise<AccountBankDetails> => {
    const response = await apiClient.get<AccountBankDetails>(`/accountBankDetails/show/${id}.json`);
    return response.data;
  },

  /**
   * Create new bank account
   * Changed: Added CSRF token for Grails withForm protection
   */
  create: async (data: AccountBankDetailsFormData): Promise<AccountBankDetails> => {
    const csrf = await getCsrfToken('accountBankDetails');
    const transformed = transformBankDetailsData(data);
    const response = await apiClient.post<AccountBankDetails>(
      `/accountBankDetails/save.json?${csrfQueryString(csrf)}`,
      transformed
    );
    return response.data;
  },

  /**
   * Update existing bank account
   * Changed: Added CSRF token for Grails withForm protection
   */
  update: async (id: string, data: AccountBankDetailsFormData): Promise<AccountBankDetails> => {
    const csrf = await getCsrfTokenForEdit('accountBankDetails', id);
    const transformed = { id, ...transformBankDetailsData(data) };
    // Fix: Include /{id} in update URL (standard Grails CRUD pattern)
    const response = await apiClient.put<AccountBankDetails>(
      `/accountBankDetails/update/${id}.json?${csrfQueryString(csrf)}`,
      transformed
    );
    return response.data;
  },

  /**
   * Delete bank account
   * Changed: Added CSRF token for Grails withForm protection
   */
  delete: async (id: string): Promise<void> => {
    const csrf = await getCsrfTokenForEdit('accountBankDetails', id);
    await apiClient.delete(`/accountBankDetails/delete/${id}.json?${csrfQueryString(csrf)}`);
  },
};

// ============================================================================
// Account Person API
// ============================================================================

/**
 * Transform AccountPersonFormData to backend JSON format
 */
function transformAccountPersonData(data: AccountPersonFormData): Record<string, unknown> {
  return {
    firstName: data.firstName,
    surname: data.surname,
    otherNames: data.otherNames,
    dateOfBirth: data.dateOfBirth,
    gender: data.gender,
    jobTitle: data.jobTitle,
    keyContact: data.keyContact,
    director: data.director,
    signatory: data.signatory,
    contractNoteSignatory: data.contractNoteSignatory,
    tradingReportsSignatory: data.tradingReportsSignatory,
    financeReportsSignatory: data.financeReportsSignatory,
    complianceReportsSignatory: data.complianceReportsSignatory,
  };
}

export const accountPersonApi = {
  /**
   * List active account persons
   */
  list: async (params?: ListParams): Promise<AccountPerson[]> => {
    const queryString = params ? `?${toQueryString(params)}` : '';
    const response = await apiClient.get<AccountPerson[]>(
      `/accountPerson/index.json${queryString}`
    );
    return response.data;
  },

  /**
   * Get single account person by ID
   */
  get: async (id: string): Promise<AccountPerson> => {
    const response = await apiClient.get<AccountPerson>(`/accountPerson/show/${id}.json`);
    return response.data;
  },

  /**
   * Create new account person
   * Changed: Added CSRF token for Grails withForm protection
   */
  create: async (data: AccountPersonFormData): Promise<AccountPerson> => {
    const csrf = await getCsrfToken('accountPerson');
    const transformed = transformAccountPersonData(data);
    const response = await apiClient.post<AccountPerson>(
      `/accountPerson/save.json?${csrfQueryString(csrf)}`,
      transformed
    );
    return response.data;
  },

  /**
   * Update existing account person
   * Changed: Added CSRF token for Grails withForm protection
   */
  update: async (id: string, data: AccountPersonFormData): Promise<AccountPerson> => {
    const csrf = await getCsrfTokenForEdit('accountPerson', id);
    const transformed = { id, ...transformAccountPersonData(data) };
    // Fix: Include /{id} in update URL (standard Grails CRUD pattern)
    const response = await apiClient.put<AccountPerson>(
      `/accountPerson/update/${id}.json?${csrfQueryString(csrf)}`,
      transformed
    );
    return response.data;
  },

  /**
   * Delete account person
   * Changed: Added CSRF token for Grails withForm protection
   */
  delete: async (id: string): Promise<void> => {
    const csrf = await getCsrfTokenForEdit('accountPerson', id);
    await apiClient.delete(`/accountPerson/delete/${id}.json?${csrfQueryString(csrf)}`);
  },
};

// ============================================================================
// Roles API
// ============================================================================

export const rolesApi = {
  /**
   * List available roles
   */
  list: async (): Promise<SbRole[]> => {
    const response = await apiClient.get<SbRole[]>('/sbRole/index.json?max=1000');
    return response.data;
  },
};

// ============================================================================
// Banks API
// ============================================================================

/**
 * Fix (SOUPFIN-33 #3): Collapse the bank list to one entry per distinct bank name.
 *
 * `GET /rest/bank/index.json` emits a row per associated record rather than per bank,
 * so the Edit Bank Account dropdown listed each bank ~15 times. Dedupe on a normalised
 * name (case-folded, whitespace-collapsed, trimmed) — NOT on `id`, because the
 * duplicates carry distinct ids, which is exactly why they all rendered.
 *
 * Deliberately conservative: entries are only merged when their names match after
 * normalisation. Near-misses that are genuinely separate backend rows ("Access" vs
 * "Access Bank (Ghana) Plc", "GCB Bank Limited" vs "Ghana Commercial Bank (GCB)") are
 * preserved rather than guessed at, and no name-shape heuristic is applied — filtering
 * out "non-bank-looking" names would silently drop legitimate banks. The remaining
 * seed-data defects (a personal name in the bank table, the "High BAnk" typo) are a
 * backend data-quality fix tracked separately.
 *
 * The first occurrence wins, so the backend's `sort=name` ordering is preserved.
 * Rows with a blank/whitespace-only name are dropped — they render as an empty,
 * unselectable option.
 *
 * Exported for unit testing.
 */
export function dedupeBanksByName(banks: Bank[]): Bank[] {
  const seen = new Set<string>();
  const result: Bank[] = [];
  for (const bank of banks) {
    const key = String(bank?.name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(bank);
  }
  return result;
}

export const banksApi = {
  /**
   * List available banks
   *
   * Fix (SOUPFIN-30 #10): The bank dropdown showed only "Select a bank" / "Other".
   * Harden the parsing so a wrapped response ({ bankList } / { banks }) or a
   * paginated envelope ({ resultList }) still yields the bank array, and sort by
   * name so the (large) list is browsable. Returns [] on an unexpected shape so
   * the caller can fall back to the "Other (specify)" free-text path.
   *
   * Fix (SOUPFIN-33 #3): The backend returns one `bank` row per associated record,
   * so every bank arrived ~15 times ("Absa Bank Ghana Limited" x15, "GCB Bank
   * Limited" x15, ...) making the dropdown unusable. Collapse to one option per
   * distinct bank name — see dedupeBanksByName.
   */
  list: async (): Promise<Bank[]> => {
    const response = await apiClient.get('/bank/index.json?max=1000&sort=name&order=asc');
    const data = response.data as unknown;
    let banks: Bank[] = [];
    if (Array.isArray(data)) {
      banks = data as Bank[];
    } else if (data && typeof data === 'object') {
      const wrapped = data as Record<string, unknown>;
      const candidate = wrapped.bankList ?? wrapped.banks ?? wrapped.resultList;
      if (Array.isArray(candidate)) banks = candidate as Bank[];
    }
    return dedupeBanksByName(banks.filter((b) => b && b.id));
  },
};

// ============================================================================
// Account Settings API
// ============================================================================

/**
 * Fix (SOUPFIN-23): Type guard that confirms a GET /account/show response is a real
 * Account payload and not a followed 302→login redirect. A genuine Account always has
 * a non-empty string `id` (= tenant id). The login page returns HTML (a string) or an
 * object without an `id`, both of which must be treated as a load failure so the UI can
 * lock the form instead of rendering an editable blank one. Exported for unit tests.
 */
export function isValidAccountSettings(data: unknown): data is AccountSettings {
  return (
    typeof data === 'object' &&
    data !== null &&
    !Array.isArray(data) &&
    typeof (data as AccountSettings).id === 'string' &&
    (data as AccountSettings).id.length > 0
  );
}

export const accountSettingsApi = {
  /**
   * Get current account settings
   * Uses tenantId from auth store (populated by /rest/user/current.json during token validation).
   * Flow: authStore.validateToken() → /rest/user/current.json → tenantId stored on user
   *       → accountSettingsApi.get() reads tenantId → GET /account/show/{tenantId}.json
   *
   * Fix (SOUPFIN-10): If tenantId is missing (race condition: settings fetch fires
   * before validateToken has completed), fall back to fetching /rest/user/current.json
   * directly and enrich the auth store. Prevents "No tenant ID found" race-condition
   * failures when the settings page loads before initialize() resolves.
   */
  get: async (): Promise<AccountSettings> => {
    let tenantId = useAuthStore.getState().user?.tenantId;

    // Fix (SOUPFIN-10): Resolve tenantId on-demand if missing — handles race where
    // settings load fires before validateToken() enriches the user with tenantId.
    if (!tenantId) {
      const current = await apiClient.get<{ tenantId?: string }>('/user/current.json');
      tenantId = current.data?.tenantId;
      if (tenantId) {
        // Enrich the auth store so subsequent callers see the tenantId immediately.
        const currentUser = useAuthStore.getState().user;
        if (currentUser) {
          useAuthStore.setState({ user: { ...currentUser, tenantId } });
        }
      }
    }

    if (!tenantId) {
      throw new Error('No tenant ID found. User session may not be fully initialized.');
    }
    // Fetch account settings using the tenant ID (= account ID)
    const response = await accountClient.get<AccountSettings>(`/account/show/${tenantId}.json`);

    // Fix (SOUPFIN-23): When the backend session has expired, /account/show returns a
    // 302 redirect to the TAS login page. The browser follows that redirect and the
    // request resolves 200 with the login HTML (a string) or an object that is NOT an
    // Account (no `id`). Because no error is thrown, the caller previously treated this
    // as a successful-but-empty load: it rendered a blank, editable form and let the
    // user unknowingly Save over their real settings — and the SOUPFIN-21 lock never
    // engaged because it keys off a thrown error. Detect the non-account payload here
    // and throw so the page surfaces the load-error banner and locks the form.
    if (!isValidAccountSettings(response.data)) {
      throw new Error(
        'Account settings could not be loaded — your session may have expired. Please retry or sign in again.'
      );
    }
    return response.data;
  },

  /**
   * Update account settings
   * Fix: Uses /account/edit/{id}.json for CSRF and /account/update/{id}.json for save.
   * The AccountController uses standard Grails CRUD with ID in the path.
   */
  update: async (data: Partial<AccountSettings>): Promise<AccountSettings> => {
    if (!data.id) {
      throw new Error('Account ID is required for update');
    }
    // Fix: Get CSRF token from /account/edit/{id}.json
    const editResponse = await accountClient.get<Record<string, unknown>>(
      `/account/edit/${data.id}.json`
    );
    const editData = editResponse.data;
    const token = (editData.SYNCHRONIZER_TOKEN || (editData.account as Record<string, unknown>)?.SYNCHRONIZER_TOKEN) as string || '';
    const uri = (editData.SYNCHRONIZER_URI || (editData.account as Record<string, unknown>)?.SYNCHRONIZER_URI) as string || '';
    const csrfParams = new URLSearchParams({ SYNCHRONIZER_TOKEN: token, SYNCHRONIZER_URI: uri });

    // Fix: Use /account/update/{id}.json (standard Grails CRUD pattern)
    const response = await accountClient.put<AccountSettings>(
      `/account/update/${data.id}.json?${csrfParams.toString()}`,
      data
    );
    return response.data;
  },
};
