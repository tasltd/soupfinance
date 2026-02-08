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
import axios from 'axios';
import apiClient, { toQueryString, getCsrfToken, getCsrfTokenForEdit, csrfQueryString } from '../client';
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

// Fix: Separate axios client for /account/* endpoints (NOT under /rest/)
// The account controller lives at /account/*, not /rest/account/*.
// Using apiClient (baseURL: '/rest') would produce /rest/account/... which returns 403 on production.
// This client uses empty baseURL so requests go directly to /account/*.
const accountClient = axios.create({
  baseURL: '',
  headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
  timeout: 30000,
});

// Fix: Helper to get auth token for account client requests
function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
  return token ? { 'X-Auth-Token': token } : {};
}

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
    const response = await apiClient.put<Agent>(
      `/agent/update.json?${csrfQueryString(csrf)}`,
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
    const response = await apiClient.put<AccountBankDetails>(
      `/accountBankDetails/update.json?${csrfQueryString(csrf)}`,
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
    const response = await apiClient.put<AccountPerson>(
      `/accountPerson/update.json?${csrfQueryString(csrf)}`,
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

export const banksApi = {
  /**
   * List available banks
   */
  list: async (): Promise<Bank[]> => {
    const response = await apiClient.get<Bank[]>('/bank/index.json?max=1000');
    return response.data;
  },
};

// ============================================================================
// Account Settings API
// ============================================================================

export const accountSettingsApi = {
  /**
   * Get current account settings
   * Fix: Uses /account/index.json (NOT /account/current.json which returns 404).
   * The AccountController uses JSESSIONID cookie auth (set during login), not X-Auth-Token.
   * The browser automatically forwards the JSESSIONID through the Vite/Apache proxy.
   * Response is an array — take the first element (single-tenant user has one account).
   */
  get: async (): Promise<AccountSettings> => {
    const response = await accountClient.get<AccountSettings[]>('/account/index.json', {
      headers: getAuthHeaders(),
    });
    // Changed: Backend returns array of accounts; take first element
    const accounts = response.data;
    if (!Array.isArray(accounts) || accounts.length === 0) {
      throw new Error('No account settings found');
    }
    return accounts[0];
  },

  /**
   * Update account settings
   * Fix: Uses /account/edit/{id}.json for CSRF and /account/update/{id}.json for save.
   * The AccountController uses standard Grails CRUD with ID in the path.
   * Changed: Added CSRF token for Grails withForm protection
   */
  update: async (data: Partial<AccountSettings>): Promise<AccountSettings> => {
    if (!data.id) {
      throw new Error('Account ID is required for update');
    }
    // Fix: Get CSRF token from /account/edit/{id}.json (not /account/edit/current.json which 404s)
    const editResponse = await accountClient.get<Record<string, unknown>>(
      `/account/edit/${data.id}.json`,
      { headers: getAuthHeaders() }
    );
    const editData = editResponse.data;
    const token = (editData.SYNCHRONIZER_TOKEN || (editData.account as Record<string, unknown>)?.SYNCHRONIZER_TOKEN) as string || '';
    const uri = (editData.SYNCHRONIZER_URI || (editData.account as Record<string, unknown>)?.SYNCHRONIZER_URI) as string || '';
    const csrfParams = new URLSearchParams({ SYNCHRONIZER_TOKEN: token, SYNCHRONIZER_URI: uri });

    // Fix: Use /account/update/{id}.json (standard Grails CRUD pattern)
    const response = await accountClient.put<AccountSettings>(
      `/account/update/${data.id}.json?${csrfParams.toString()}`,
      data,
      { headers: getAuthHeaders() }
    );
    return response.data;
  },
};
