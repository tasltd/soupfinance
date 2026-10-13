/**
 * What a soupmarkets-web JSON DELETE actually did.
 *
 * Added (SOUPFIN-177): every `delete` action goes through the backend's
 * DeleteInterceptor → UtilityController.deleteChecker. It can answer 200 and
 * delete nothing in two ways:
 *  - `{ relatedList: [...] }` — other records still point at the target (admin)
 *  - `{ message, deleteRequestId }` — a non-admin's delete became an approval request
 * Only a 204 (empty body) means the record is gone. Treating either 200 as
 * success tells the user a record was removed while it stays put (SOUPFIN-169).
 */

/** The backend refused because other records still reference the target. */
export class DeleteBlockedError extends Error {
  readonly relatedModules: string[];

  constructor(relatedModules: string[], message = 'This record was not deleted because other records still use it.') {
    super(message);
    this.name = 'DeleteBlockedError';
    this.relatedModules = relatedModules;
  }
}

/** The backend filed a deletion request for an administrator to approve. */
export class DeletePendingApprovalError extends Error {
  readonly deleteRequestId: string;

  constructor(deleteRequestId: string, message = 'Deletion was sent to an administrator for approval.') {
    super(message);
    this.name = 'DeletePendingApprovalError';
    this.deleteRequestId = deleteRequestId;
  }
}

interface DeleteResponseBody {
  relatedList?: Array<{ relatedModule?: string }>;
  deleteRequestId?: string;
  message?: string;
}

/**
 * Throw when a DELETE response body shows nothing was deleted.
 * Resolves silently for a 204 / empty body.
 */
export function assertDeleteApplied(body: unknown): void {
  if (!body || typeof body !== 'object') return;
  const data = body as DeleteResponseBody;

  if (Array.isArray(data.relatedList) && data.relatedList.length > 0) {
    const modules = [
      ...new Set(data.relatedList.map((r) => r?.relatedModule).filter((m): m is string => !!m)),
    ];
    throw new DeleteBlockedError(modules);
  }

  if (data.deleteRequestId) {
    throw new DeletePendingApprovalError(String(data.deleteRequestId), data.message || undefined);
  }
}
