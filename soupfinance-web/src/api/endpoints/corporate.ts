/**
 * Corporate API endpoints
 * Maps to soupmarkets-web /rest/corporate/* endpoints
 * Handles corporate KYC onboarding flow
 */
import apiClient, { toQueryString } from '../client';
import { logger } from '../../utils/logger';
import type { Corporate, CorporateAccountPerson, CorporateDocuments, ListParams } from '../../types';

const CORPORATE_URL = '/corporate';
const PERSON_URL = '/corporateAccountPerson';
const DOCUMENTS_URL = '/corporateDocuments';

// =============================================================================
// Corporate CRUD
// =============================================================================

/**
 * Create new corporate registration
 * POST /rest/corporate/save.json
 */
export async function createCorporate(data: Partial<Corporate>): Promise<Corporate> {
  const response = await apiClient.post<Corporate>(`${CORPORATE_URL}/save.json`, data);
  return response.data;
}

/**
 * Get single corporate by ID
 * GET /rest/corporate/show/:id.json
 */
export async function getCorporate(id: string): Promise<Corporate> {
  const response = await apiClient.get<Corporate>(`${CORPORATE_URL}/show/${id}.json`);
  return response.data;
}

/**
 * Update existing corporate
 * PUT /rest/corporate/update/:id.json
 */
export async function updateCorporate(id: string, data: Partial<Corporate>): Promise<Corporate> {
  const response = await apiClient.put<Corporate>(`${CORPORATE_URL}/update/${id}.json`, { ...data, id });
  return response.data;
}

/**
 * Read the HTTP status off an Axios-shaped rejection, if it has one.
 * Added (SOUPFIN-62): needed to tell "endpoint absent / no corporate" (404)
 * apart from a genuine backend failure.
 */
function statusOf(error: unknown): number | undefined {
  return (error as { response?: { status?: number } } | undefined)?.response?.status;
}

/**
 * Get current user's corporate (for onboarding flow)
 * GET /rest/corporate/current.json
 *
 * NOTE (SOUPFIN-55): the backend CorporateController has no `current` action
 * today, so this 404s and resolves to null in practice. It is kept (and tried
 * first by `resolveOnboardingCorporate`) so the app upgrades automatically if
 * the action is added later — see `plans/soupfin-62-corporate-current-endpoint.md`.
 *
 * Changed (SOUPFIN-62): only a 404 resolves to null. A 404 means either "the
 * action does not exist yet" or, once it does, "this user has no corporate" —
 * both are legitimately "nothing to resume". Every other status (403, 500,
 * network) is a real failure and now propagates, because the previous bare
 * `catch { return null }` made a broken backend indistinguishable from an
 * empty one. CLAUDE.md bans that pattern for exactly this reason.
 */
export async function getCurrentCorporate(): Promise<Corporate | null> {
  try {
    const response = await apiClient.get<Corporate>(`${CORPORATE_URL}/current.json`);
    return response.data ?? null;
  } catch (error) {
    if (statusOf(error) === 404) return null;
    throw error;
  }
}

/**
 * List corporates for the current tenant
 * GET /rest/corporate/index.json
 */
export async function listCorporates(params?: ListParams): Promise<Corporate[]> {
  const query = params ? `?${toQueryString(params)}` : '';
  const response = await apiClient.get<Corporate[]>(`${CORPORATE_URL}/index.json${query}`);
  // Added (SOUPFIN-55): Grails returns a bare object when a single row matches
  return Array.isArray(response.data) ? response.data : response.data ? [response.data] : [];
}

/**
 * Added (SOUPFIN-55): Resolve the corporate whose KYC onboarding the signed-in
 * user should continue.
 *
 * Tries `current.json` first — that is the endpoint the flow is meant to use.
 * It does not exist on the backend yet, so we fall back to the tenant-scoped
 * corporate list, which does. Returns null when the tenant has no corporate at
 * all, in which case there is no half-finished application to resume.
 */
export async function resolveOnboardingCorporate(): Promise<Corporate | null> {
  let current: Corporate | null = null;
  try {
    current = await getCurrentCorporate();
  } catch (error) {
    // Changed (SOUPFIN-62): current.json failing for a reason other than 404
    // must not be silent, but it must not kill the nudge either — the list
    // below answers the same question. Log it, then fall through. A systemic
    // outage still surfaces, because the list call will fail too and that
    // error is propagated.
    logger.warn('corporate/current.json failed; falling back to the corporate list', {
      status: statusOf(error),
    });
  }
  if (current?.id) return current;

  const corporates = await listCorporates({ max: 1 });
  return corporates[0] ?? null;
}

// =============================================================================
// Corporate Account Persons (Directors/Signatories)
// =============================================================================

/**
 * List directors/signatories for a corporate
 * GET /rest/corporateAccountPerson/index.json?corporate.id=:id
 */
export async function listDirectors(corporateId: string, params?: ListParams): Promise<CorporateAccountPerson[]> {
  const baseParams = { 'corporate.id': corporateId, ...params };
  const query = `?${toQueryString(baseParams)}`;
  const response = await apiClient.get<CorporateAccountPerson[]>(`${PERSON_URL}/index.json${query}`);
  return response.data;
}

/**
 * Get single director by ID
 * GET /rest/corporateAccountPerson/show/:id.json
 */
export async function getDirector(id: string): Promise<CorporateAccountPerson> {
  const response = await apiClient.get<CorporateAccountPerson>(`${PERSON_URL}/show/${id}.json`);
  return response.data;
}

/**
 * Add new director/signatory
 * POST /rest/corporateAccountPerson/save.json
 */
export async function addDirector(data: Partial<CorporateAccountPerson>): Promise<CorporateAccountPerson> {
  const response = await apiClient.post<CorporateAccountPerson>(`${PERSON_URL}/save.json`, data);
  return response.data;
}

/**
 * Update existing director/signatory
 * PUT /rest/corporateAccountPerson/update/:id.json
 */
export async function updateDirector(id: string, data: Partial<CorporateAccountPerson>): Promise<CorporateAccountPerson> {
  const response = await apiClient.put<CorporateAccountPerson>(`${PERSON_URL}/update/${id}.json`, { ...data, id });
  return response.data;
}

/**
 * Remove director/signatory (soft delete)
 * DELETE /rest/corporateAccountPerson/delete/:id.json
 */
export async function deleteDirector(id: string): Promise<void> {
  await apiClient.delete(`${PERSON_URL}/delete/${id}.json`);
}

// =============================================================================
// Corporate Documents
// =============================================================================

/**
 * List documents for a corporate
 * GET /rest/corporateDocuments/index.json?corporate.id=:id
 */
export async function listDocuments(corporateId: string): Promise<CorporateDocuments[]> {
  const response = await apiClient.get<CorporateDocuments[]>(
    `${DOCUMENTS_URL}/index.json?corporate.id=${corporateId}`
  );
  return response.data;
}

/**
 * Upload document for corporate
 * POST /rest/corporateDocuments/save.json
 * NOTE: Uses multipart/form-data for file upload
 */
export async function uploadDocument(
  corporateId: string,
  file: File,
  documentType: CorporateDocuments['documentType']
): Promise<CorporateDocuments> {
  const formData = new FormData();
  formData.append('corporate.id', corporateId);
  formData.append('documentType', documentType);
  formData.append('file', file);
  formData.append('fileName', file.name);

  const response = await apiClient.post<CorporateDocuments>(`${DOCUMENTS_URL}/save.json`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
}

/**
 * Delete document (soft delete)
 * DELETE /rest/corporateDocuments/delete/:id.json
 */
export async function deleteDocument(id: string): Promise<void> {
  await apiClient.delete(`${DOCUMENTS_URL}/delete/${id}.json`);
}

// =============================================================================
// KYC Status & Actions
// =============================================================================

/**
 * Submit corporate KYC for review
 * POST /rest/corporate/submitKyc/:id.json
 */
export async function submitKyc(corporateId: string): Promise<Corporate> {
  const response = await apiClient.post<Corporate>(`${CORPORATE_URL}/submitKyc/${corporateId}.json`);
  return response.data;
}
