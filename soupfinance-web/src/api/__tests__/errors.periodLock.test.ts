/**
 * Added (SOUPFIN-158): the backend's locked-period rejection.
 *
 * The code field decides, never the status — a 403 PERIOD_LOCKED on a ledger
 * URL must not be read as "module disabled" (SOUPFIN-150).
 */
import { describe, it, expect } from 'vitest';
import { getPeriodLockError, parseApiError } from '../errors';

function makeAxiosError(status: number | undefined, url: string, data?: unknown): unknown {
  const err = new Error(`Request failed with status code ${status ?? 'NA'}`) as Error & Record<string, unknown>;
  err.isAxiosError = true;
  err.config = { url };
  err.response = status === undefined ? undefined : { status, data };
  return err;
}

describe('getPeriodLockError', () => {
  it('reads a 422 PERIOD_LOCKED body, keeping the backend message', () => {
    const error = makeAxiosError(422, '/ledgerTransaction/saveMultiple.json', {
      code: 'PERIOD_LOCKED',
      error: 'The books are closed up to 31 Dec 2025.',
      lockDate: '2025-12-31',
      field: 'groupDate',
    });
    expect(getPeriodLockError(error)).toEqual({
      message: 'The books are closed up to 31 Dec 2025.',
      lockDate: '2025-12-31',
      field: 'groupDate',
    });
  });

  it('builds a message from the lock date when the backend sends none', () => {
    const error = makeAxiosError(422, '/voucher/save.json', { code: 'period_locked', lockDate: '2025-12-31T00:00:00Z' });
    const lock = getPeriodLockError(error);
    expect(lock?.lockDate).toBe('2025-12-31');
    expect(lock?.message).toBe('The books are closed up to December 31, 2025. Choose a date after that day.');
  });

  it('falls back to a dateless sentence when there is no lock date at all', () => {
    const error = makeAxiosError(422, '/bill/save.json', { code: 'PERIOD_LOCKED' });
    expect(getPeriodLockError(error)?.message).toBe('This date is in a closed period. Choose a later date.');
  });

  it.each([
    ['no code', makeAxiosError(422, '/invoice/save.json', { error: 'Invalid date' })],
    ['another code', makeAxiosError(422, '/invoice/save.json', { code: 'VALIDATION_ERROR' })],
    ['empty body', makeAxiosError(422, '/invoice/save.json', undefined)],
    ['string body', makeAxiosError(422, '/invoice/save.json', 'PERIOD_LOCKED')],
    ['network failure', makeAxiosError(undefined, '/invoice/save.json')],
    ['plain Error', new Error('PERIOD_LOCKED')],
    ['null', null],
  ])('returns null for %s', (_label, error) => {
    expect(getPeriodLockError(error)).toBeNull();
  });
});

describe('parseApiError with a locked period', () => {
  it('reports period_locked on 422', () => {
    const parsed = parseApiError(
      makeAxiosError(422, '/invoice/save.json', { code: 'PERIOD_LOCKED', lockDate: '2025-12-31' })
    );
    expect(parsed.kind).toBe('period_locked');
    expect(parsed.title).toBe('This period is closed');
    expect(parsed.status).toBe(422);
  });

  it('a 403 PERIOD_LOCKED on a ledger URL is a locked period, not a disabled module', () => {
    const parsed = parseApiError(
      makeAxiosError(403, '/ledgerTransaction/saveMultiple.json', { code: 'PERIOD_LOCKED', lockDate: '2025-12-31' })
    );
    expect(parsed.kind).toBe('period_locked');
    expect(parsed.message).toContain('December 31, 2025');
  });

  it('a plain 403 on a ledger URL is still module_disabled', () => {
    expect(parseApiError(makeAxiosError(403, '/ledgerTransaction/index.json', {})).kind).toBe('module_disabled');
  });
});
