/**
 * Added (SOUPFIN-184): bill lifecycle endpoints — Save draft, Submit, Void.
 *
 * The backend actions are planned (`plans/soupfin-184-bill-lifecycle.html`).
 * Today Grails answers them with a Tomcat HTML 404 page (checked on the LXC
 * backend 2026-10-14), so these tests pin both halves: the request each call
 * makes, and the readable error a missing action turns into.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';

let mockGet: ReturnType<typeof vi.fn>;
let mockPost: ReturnType<typeof vi.fn>;

function installAxiosMock() {
  mockGet = vi.fn().mockResolvedValue({
    data: { SYNCHRONIZER_TOKEN: 'tok-1', SYNCHRONIZER_URI: '/bill/create' },
  });
  mockPost = vi.fn();
  (axios.create as ReturnType<typeof vi.fn>).mockReturnValue({
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
    get: mockGet,
    post: mockPost,
    put: vi.fn(),
    delete: vi.fn(),
  });
}

async function loadBills() {
  vi.resetModules();
  installAxiosMock();
  return import('../bills');
}

function httpError(status: number, data: unknown, contentType: string) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status, data, headers: { 'content-type': contentType } },
  });
}

const tomcat404 = () =>
  httpError(404, '<!doctype html><html><body><h1>HTTP Status 404 – Not Found</h1></body></html>', 'text/html;charset=UTF-8');

describe('bill lifecycle endpoints (SOUPFIN-184)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('saveBillDraft', () => {
    it('posts the bill body to saveDraft.json with the save.json CSRF token', async () => {
      const { saveBillDraft } = await loadBills();
      mockPost.mockResolvedValue({ data: { id: 'b-1', postingStatus: 'DRAFT' } });

      const saved = await saveBillDraft({ vendor: { id: 'v-1' }, notes: 'n' });

      expect(mockGet).toHaveBeenCalledWith('/bill/create.json');
      const [url, body] = mockPost.mock.calls[0];
      expect(url).toMatch(/^\/bill\/saveDraft\.json\?/);
      expect(url).toContain('SYNCHRONIZER_TOKEN=tok-1');
      expect(body).toEqual({ vendor: { id: 'v-1' }, notes: 'n' });
      expect(saved).toEqual({ id: 'b-1', postingStatus: 'DRAFT' });
    });

    it('turns a missing backend action into a message that says nothing was saved', async () => {
      const { saveBillDraft, BillActionUnavailableError } = await loadBills();
      mockPost.mockRejectedValue(tomcat404());

      const failure = saveBillDraft({}).catch((e) => e);
      const error = await failure;
      expect(error).toBeInstanceOf(BillActionUnavailableError);
      expect(error.action).toBe('saveDraft');
      expect(error.message).toMatch(/nothing was saved/i);
      expect(error.message).not.toMatch(/status code/i);
    });
  });

  describe('submitBill', () => {
    it('posts to submit/:id.json with no CSRF round trip', async () => {
      const { submitBill } = await loadBills();
      mockPost.mockResolvedValue({ data: { id: 'b-2', status: 'PENDING', postingStatus: 'POSTED' } });

      const result = await submitBill('b-2');

      expect(mockGet).not.toHaveBeenCalled();
      expect(mockPost).toHaveBeenCalledWith('/bill/submit/b-2.json', {});
      expect(result.postingStatus).toBe('POSTED');
    });

    it('maps the LXC 400 HTML page for an unmapped action too', async () => {
      const { submitBill, BillActionUnavailableError } = await loadBills();
      mockPost.mockRejectedValue(httpError(400, '<html>Bad Request</html>', 'text/html'));

      await expect(submitBill('b-2')).rejects.toBeInstanceOf(BillActionUnavailableError);
    });
  });

  describe('cancelBill', () => {
    it('posts the reason when one is given', async () => {
      const { cancelBill } = await loadBills();
      mockPost.mockResolvedValue({ data: { id: 'b-3', postingStatus: 'CANCELLED' } });

      await cancelBill('b-3', 'Entered twice');

      expect(mockPost).toHaveBeenCalledWith('/bill/cancel/b-3.json', { cancelReason: 'Entered twice' });
    });

    it('sends an empty body when there is no reason', async () => {
      const { cancelBill } = await loadBills();
      mockPost.mockResolvedValue({ data: { id: 'b-3' } });

      await cancelBill('b-3');

      expect(mockPost).toHaveBeenCalledWith('/bill/cancel/b-3.json', {});
    });

    it('says the bill is unchanged when the server cannot void bills yet', async () => {
      const { cancelBill } = await loadBills();
      mockPost.mockRejectedValue(tomcat404());

      await expect(cancelBill('b-3')).rejects.toThrow(/bill is unchanged/i);
    });

    it('passes a real JSON refusal through untouched so its message reaches the user', async () => {
      const { cancelBill, BillActionUnavailableError } = await loadBills();
      const refusal = httpError(422, { message: 'Void the payments on this bill first.' }, 'application/json');
      mockPost.mockRejectedValue(refusal);

      const error = await cancelBill('b-3').catch((e) => e);
      expect(error).toBe(refusal);
      expect(error).not.toBeInstanceOf(BillActionUnavailableError);
    });

    it('does not mistake a JSON 404 (bill not found) for a missing action', async () => {
      const { cancelBill, BillActionUnavailableError } = await loadBills();
      mockPost.mockRejectedValue(httpError(404, { message: 'Not found' }, 'application/json'));

      await expect(cancelBill('gone')).rejects.not.toBeInstanceOf(BillActionUnavailableError);
    });
  });

  describe('isMissingActionResponse', () => {
    it.each([
      ['HTML 404', httpError(404, '<html/>', 'text/html'), true],
      ['HTML 405', httpError(405, '<html/>', 'text/html'), true],
      ['string body starting with <, no content type', httpError(404, '  <!doctype html>', ''), true],
      ['JSON 404', httpError(404, { message: 'x' }, 'application/json'), false],
      ['HTML 500', httpError(500, '<html/>', 'text/html'), false],
      ['no response (network)', new Error('Network Error'), false],
      ['null', null, false],
    ])('%s -> %s', async (_label, error, expected) => {
      const { isMissingActionResponse } = await loadBills();
      expect(isMissingActionResponse(error)).toBe(expected);
    });
  });
});
