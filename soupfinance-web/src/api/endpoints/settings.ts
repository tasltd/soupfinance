/**
 * Settings API Endpoints
 *
 * Endpoints for:
 * - Agent/Staff management
 * - Account Bank Details
 * - Account Persons (directors, signatories)
 * - Account configuration
 */
import apiClient, { toQueryString } from '../client';
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
   */
  get: async (id: string): Promise<Agent> => {
    const response = await apiClient.get<Agent>(`/agent/show/${id}.json`);
    return response.data;
  },

  /**
   * Create new agent/staff member
   */
  create: async (data: AgentFormData): Promise<Agent> => {
    const transformed = transformAgentData(data);
    const response = await apiClient.post<Agent>('/agent/save.json', transformed);
    return response.data;
  },

  /**
   * Update existing agent
   */
  update: async (id: string, data: AgentFormData): Promise<Agent> => {
    const transformed = { id, ...transformAgentData(data) };
    const response = await apiClient.put<Agent>('/agent/update.json', transformed);
    return response.data;
  },

  /**
   * Delete agent (soft delete - archives)
   */
  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/agent/delete/${id}.json`);
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
   */
  create: async (data: AccountBankDetailsFormData): Promise<AccountBankDetails> => {
    const transformed = transformBankDetailsData(data);
    const response = await apiClient.post<AccountBankDetails>(
      '/accountBankDetails/save.json',
      transformed
    );
    return response.data;
  },

  /**
   * Update existing bank account
   */
  update: async (id: string, data: AccountBankDetailsFormData): Promise<AccountBankDetails> => {
    const transformed = { id, ...transformBankDetailsData(data) };
    const response = await apiClient.put<AccountBankDetails>(
      '/accountBankDetails/update.json',
      transformed
    );
    return response.data;
  },

  /**
   * Delete bank account
   */
  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/accountBankDetails/delete/${id}.json`);
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
   */
  create: async (data: AccountPersonFormData): Promise<AccountPerson> => {
    const transformed = transformAccountPersonData(data);
    const response = await apiClient.post<AccountPerson>(
      '/accountPerson/save.json',
      transformed
    );
    return response.data;
  },

  /**
   * Update existing account person
   */
  update: async (id: string, data: AccountPersonFormData): Promise<AccountPerson> => {
    const transformed = { id, ...transformAccountPersonData(data) };
    const response = await apiClient.put<AccountPerson>(
      '/accountPerson/update.json',
      transformed
    );
    return response.data;
  },

  /**
   * Delete account person
   */
  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/accountPerson/delete/${id}.json`);
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
   */
  get: async (): Promise<AccountSettings> => {
    const response = await apiClient.get<AccountSettings>('/account/current.json');
    return response.data;
  },

  /**
   * Update account settings
   */
  update: async (data: Partial<AccountSettings>): Promise<AccountSettings> => {
    const response = await apiClient.put<AccountSettings>('/account/update.json', data);
    return response.data;
  },
};
