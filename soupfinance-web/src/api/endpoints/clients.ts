/**
 * Invoice Client API endpoints for SoupFinance
 * Maps to soupmarkets-web /rest/invoiceClient/* endpoints
 *
 * ARCHITECTURE (2026-01-30):
 * Invoice clients are the tenant's own customers/contacts for billing purposes.
 * They have basic info (name, email, phone) - no full KYC required.
 * Different from the broker /client/* endpoints which are for trading clients.
 *
 * Client types:
 * - INDIVIDUAL: Person with firstName, lastName
 * - CORPORATE: Company with companyName, contactPerson
 */
import apiClient, { toFormData, toQueryString } from '../client';
import type { ListParams } from '../../types';

const BASE_URL = '/invoiceClient';

// =============================================================================
// Types
// =============================================================================

/**
 * Client type discriminator
 */
export type InvoiceClientType = 'INDIVIDUAL' | 'CORPORATE';

/**
 * Invoice client for billing purposes
 * Simplified client model - no full KYC required
 */
export interface InvoiceClient {
  id: string;
  clientType: InvoiceClientType;
  /** Display name (computed: firstName+lastName for individual, companyName for corporate) */
  name: string;
  /** Required for invoicing */
  email: string;
  /** Optional phone contact */
  phone?: string;
  /** Billing/mailing address */
  address?: string;

  // Individual-specific fields
  firstName?: string;
  lastName?: string;

  // Corporate-specific fields
  companyName?: string;
  contactPerson?: string;
  registrationNumber?: string;
  taxNumber?: string;

  // Metadata
  dateCreated?: string;
  lastUpdated?: string;
}

/**
 * Create/update client payload
 */
export interface InvoiceClientInput {
  clientType: InvoiceClientType;
  email: string;
  phone?: string;
  address?: string;

  // Individual-specific
  firstName?: string;
  lastName?: string;

  // Corporate-specific
  companyName?: string;
  contactPerson?: string;
  registrationNumber?: string;
  taxNumber?: string;

  // Index signature for toFormData compatibility
  [key: string]: unknown;
}

// =============================================================================
// Client CRUD
// =============================================================================

/**
 * List invoice clients with pagination
 * GET /rest/invoiceClient/index.json
 */
export async function listClients(params?: ListParams & { search?: string; clientType?: InvoiceClientType }): Promise<InvoiceClient[]> {
  const query = params ? `?${toQueryString(params)}` : '';
  const response = await apiClient.get<InvoiceClient[]>(`${BASE_URL}/index.json${query}`);
  return response.data;
}

/**
 * Get single client by ID
 * GET /rest/invoiceClient/show/:id.json
 */
export async function getClient(id: string): Promise<InvoiceClient> {
  const response = await apiClient.get<InvoiceClient>(`${BASE_URL}/show/${id}.json`);
  return response.data;
}

/**
 * Create new invoice client
 * POST /rest/invoiceClient/save.json
 */
export async function createClient(data: InvoiceClientInput): Promise<InvoiceClient> {
  const formData = toFormData(data);
  const response = await apiClient.post<InvoiceClient>(`${BASE_URL}/save.json`, formData);
  return response.data;
}

/**
 * Update existing client
 * PUT /rest/invoiceClient/update/:id.json
 */
export async function updateClient(id: string, data: Partial<InvoiceClientInput>): Promise<InvoiceClient> {
  const formData = toFormData({ ...data, id });
  const response = await apiClient.put<InvoiceClient>(`${BASE_URL}/update/${id}.json`, formData);
  return response.data;
}

/**
 * Delete client (soft delete)
 * DELETE /rest/invoiceClient/delete/:id.json
 */
export async function deleteClient(id: string): Promise<void> {
  await apiClient.delete(`${BASE_URL}/delete/${id}.json`);
}

// =============================================================================
// Client Reports
// =============================================================================

/**
 * Get client invoice summary
 * GET /rest/invoiceClient/invoiceSummary/:id.json
 */
export async function getClientInvoiceSummary(clientId: string): Promise<{
  client: InvoiceClient;
  totalInvoiced: number;
  totalPaid: number;
  totalOutstanding: number;
  invoices: Array<{ id: string; invoiceNumber: string; amount: number; status: string }>;
}> {
  const response = await apiClient.get(`${BASE_URL}/invoiceSummary/${clientId}.json`);
  return response.data;
}

// =============================================================================
// Legacy Types (Deprecated)
// =============================================================================

/**
 * @deprecated Use InvoiceClient instead
 * Old Client type - kept for backwards compatibility
 */
export interface Client {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  taxNumber?: string;
  notes?: string;
}
