/**
 * Client API endpoints for SoupFinance
 *
 * ARCHITECTURE:
 * In SoupFinance, "clients" are KYC Client entities from the Grails backend
 * (soupbroker.kyc.Client). Each Client can own one or more AccountServices.
 *
 * Invoices reference accountServices.id as the FK, but client metadata
 * (name, email, phone, address) comes from the Client entity.
 *
 * Endpoints:
 *   - /rest/client/index.json         → List KYC clients
 *   - /rest/client/show/:id.json      → Get single KYC client
 *   - /rest/accountServices/show/:id.json → Get single account services
 */
import apiClient, { toQueryString } from '../client';
import type { ListParams, AccountServices, Client } from '../../types';

// =============================================================================
// AccountServices (the invoice FK reference)
// =============================================================================

/**
 * Get single account services by ID
 * GET /rest/accountServices/show/:id.json
 */
export async function getAccountServices(id: string): Promise<AccountServices> {
  const response = await apiClient.get<AccountServices>(`/accountServices/show/${id}.json`);
  return response.data;
}

// =============================================================================
// Client CRUD (KYC Client - the billing recipient with metadata)
// =============================================================================

/**
 * List clients
 * GET /rest/client/index.json
 *
 * Returns Client entities with name, email, phone, address, clientType.
 * Each Client is linked to AccountServices for invoice FK reference.
 */
export async function listClients(params?: ListParams & { search?: string; clientType?: string }): Promise<Client[]> {
  const query = params ? `?${toQueryString(params)}` : '';
  const response = await apiClient.get<Client[]>(`/client/index.json${query}`);
  return response.data;
}

/**
 * Get single client by ID
 * GET /rest/client/show/:id.json
 */
export async function getClient(id: string): Promise<Client> {
  const response = await apiClient.get<Client>(`/client/show/${id}.json`);
  return response.data;
}

/**
 * Extract display name from an AccountServices serialised string.
 * e.g. "Direct Account : Corporate(Acme Corp) | Growth Portfolio" → uses as-is
 */
export function getAccountServicesDisplayName(serialised?: string): string {
  if (!serialised) return 'N/A';
  return serialised;
}

// =============================================================================
// Re-exports from types (for backward compatibility imports)
// =============================================================================

// Changed: Renamed from InvoiceClient/InvoiceClientType to Client/ClientType
export type { Client, ClientType } from '../../types';
export type ClientInput = Record<string, unknown>;

// Stub CRUD methods - client creation/update managed through KYC backend
export async function createClient(_data: unknown): Promise<Client> {
  throw new Error('Client creation is managed through the KYC module, not directly via API.');
}

export async function updateClient(_id: string, _data: unknown): Promise<Client> {
  throw new Error('Client updates are managed through the KYC module, not directly via API.');
}

export async function deleteClient(_id: string): Promise<void> {
  throw new Error('Client deletion is managed through the KYC module, not directly via API.');
}

export async function getClientInvoiceSummary(_clientId: string): Promise<unknown> {
  throw new Error('Invoice summary endpoint not available.');
}
