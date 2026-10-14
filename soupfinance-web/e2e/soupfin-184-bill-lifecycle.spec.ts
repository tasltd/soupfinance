/**
 * SOUPFIN-184: bill lifecycle — Save draft vs Submit, Void, and closed bills.
 *
 * PRD lifecycle: DRAFT -> PENDING -> PARTIAL/PAID -> OVERDUE, PENDING -> CANCELLED.
 *
 * Mock-only. `Bill.status` on the real backend is a derived PaymentStatus, and
 * the draft / submit / void actions are PLANNED backend work
 * (`plans/soupfin-184-bill-lifecycle.html`). On the LXC backend they answer
 * with a Tomcat HTML 404 page (checked 2026-10-14). This spec drives both the
 * planned contract and that 404, so the UI is proven for today's server and
 * for the one the plan describes.
 *
 * The mocks keep an in-memory bill store, so every action is checked twice:
 * the request the page sent, and what the page shows when it reads the bill back.
 *
 * Navigation is by sidebar and page clicks. The one `page.goto` on an internal
 * route opens a paid bill's edit URL, which no button leads to by design: it is
 * the stale-bookmark case the locked form exists for.
 */
import { test, expect, type Page, type Request } from '@playwright/test';
import { installGuideMocks, seedAuthenticatedSession } from './user-guide/guide-mocks';
import { installUnmockedApiGuard, isLxcMode, type UnmockedApiGuard } from './fixtures';

const SHOT_DIR = 'e2e/playwright/screenshots/soupfin-184';

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(120_000);

/** Screenshots go to a git-tracked directory, not the wiped test-results/. */
async function shot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: true });
}

const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });

/** What Grails sends for an action the controller does not have. */
const TOMCAT_404 = {
  status: 404,
  contentType: 'text/html;charset=UTF-8',
  body: '<!doctype html><html lang="en"><head><title>HTTP Status 404 – Not Found</title></head><body><h1>HTTP Status 404 – Not Found</h1></body></html>',
};

type RawBill = Record<string, unknown> & { id: string };

function backendBill(id: string, number: number, overrides: Record<string, unknown> = {}): RawBill {
  return {
    id,
    number,
    numberPrefix: 'BILL-',
    billNumber: `BILL-${number}`,
    vendor: { id: 'vendor-001', serialised: 'Accra Office Supplies Ltd' },
    billDate: '2026-10-01',
    paymentDate: '2099-12-31',
    status: 'PENDING',
    currency: 'GHS',
    subTotal: 1000,
    totalTaxAmount: 0,
    total: 1000,
    paidAmount: 0,
    amountDue: 1000,
    notes: '',
    billItemList: [{ id: `${id}-item`, description: 'Printer paper', quantity: 10, unitPrice: 100 }],
    ...overrides,
  };
}

/** One bill per lifecycle state the list can show. */
function seedBills(): RawBill[] {
  return [
    backendBill('b-pending', 101),
    backendBill('b-overdue', 102, { paymentDate: '2026-01-31' }),
    backendBill('b-partial', 103, { status: 'PARTIAL', paidAmount: 400, amountDue: 600 }),
    backendBill('b-paid', 104, { status: 'PAID', paidAmount: 1000, amountDue: 0 }),
    backendBill('b-draft', 105, { status: null, postingStatus: 'DRAFT' }),
    backendBill('b-void', 106, { postingStatus: 'CANCELLED', cancelledDate: '2026-10-02', cancelReason: 'Entered twice' }),
  ];
}

interface Mocks {
  store: RawBill[];
  requests: { method: string; path: string; body: unknown }[];
  /** When set, these actions answer like today's backend: an HTML 404. */
  missing: Set<'saveDraft' | 'submit' | 'cancel'>;
}

function record(mocks: Mocks, request: Request) {
  const { pathname } = new URL(request.url());
  let body: unknown = null;
  try {
    body = request.postDataJSON();
  } catch {
    body = request.postData();
  }
  mocks.requests.push({ method: request.method(), path: pathname, body });
}

/** Turn the form's flattened `billItemList[0].x` keys into a stored bill. */
function billFromForm(id: string, number: number, body: Record<string, unknown>, extra: Record<string, unknown>): RawBill {
  const qty = Number(body['billItemList[0].quantity'] ?? 0);
  const price = Number(body['billItemList[0].unitPrice'] ?? 0);
  const total = qty * price;
  return backendBill(id, number, {
    vendor: { id: (body.vendor as { id: string })?.id, serialised: 'Accra Office Supplies Ltd' },
    paymentDate: body.paymentDate,
    billDate: body.billDate,
    subTotal: total,
    total,
    amountDue: total,
    billItemList: [{ id: `${id}-item`, description: body['billItemList[0].description'], quantity: qty, unitPrice: price }],
    ...extra,
  });
}

async function installBillMocks(page: Page, mocks: Mocks) {
  const find = (id: string) => mocks.store.find((b) => b.id === id);

  await page.route('**/rest/bill/index.json*', (route) => route.fulfill(json(mocks.store)));
  await page.route('**/rest/bill/show/*.json*', (route) => {
    const id = route.request().url().match(/bill\/show\/([^.]+)\.json/)?.[1] ?? '';
    const bill = find(id);
    return route.fulfill(bill ? json(bill) : json({ message: 'Not found' }, 404));
  });
  await page.route('**/rest/billItem/index.json*', (route) => {
    const id = new URL(route.request().url()).searchParams.get('bill.id') ?? '';
    return route.fulfill(json(find(id)?.billItemList ?? []));
  });

  // Submit on a new bill: today's save.json, which posts the bill.
  await page.route('**/rest/bill/save.json*', (route) => {
    record(mocks, route.request());
    const created = billFromForm('b-new-posted', 201, route.request().postDataJSON(), { status: 'PENDING' });
    mocks.store.unshift(created);
    return route.fulfill(json(created, 201));
  });

  // PLANNED: Save draft on a new bill.
  await page.route('**/rest/bill/saveDraft.json*', (route) => {
    record(mocks, route.request());
    if (mocks.missing.has('saveDraft')) return route.fulfill(TOMCAT_404);
    const created = billFromForm('b-new-draft', 202, route.request().postDataJSON(), { status: null, postingStatus: 'DRAFT' });
    mocks.store.unshift(created);
    return route.fulfill(json(created, 201));
  });

  await page.route('**/rest/bill/update/*.json*', (route) => {
    record(mocks, route.request());
    const id = route.request().url().match(/bill\/update\/([^.]+)\.json/)?.[1] ?? '';
    const bill = find(id)!;
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if (body.notes !== undefined) bill.notes = body.notes;
    return route.fulfill(json(bill));
  });

  // PLANNED: Submit a draft.
  await page.route('**/rest/bill/submit/*.json*', (route) => {
    record(mocks, route.request());
    if (mocks.missing.has('submit')) return route.fulfill(TOMCAT_404);
    const id = route.request().url().match(/bill\/submit\/([^.]+)\.json/)?.[1] ?? '';
    const bill = find(id)!;
    Object.assign(bill, { postingStatus: 'POSTED', status: 'PENDING' });
    return route.fulfill(json(bill));
  });

  // PLANNED: Void a posted bill.
  await page.route('**/rest/bill/cancel/*.json*', (route) => {
    record(mocks, route.request());
    if (mocks.missing.has('cancel')) return route.fulfill(TOMCAT_404);
    const id = route.request().url().match(/bill\/cancel\/([^.]+)\.json/)?.[1] ?? '';
    const bill = find(id)!;
    const body = (route.request().postDataJSON() ?? {}) as { cancelReason?: string };
    Object.assign(bill, { postingStatus: 'CANCELLED', cancelledDate: '2026-10-14T09:00:00Z', cancelReason: body.cancelReason ?? null });
    return route.fulfill(json(bill));
  });
}

async function openBills(page: Page, mocks: Mocks) {
  await installGuideMocks(page);
  await installBillMocks(page, mocks);
  await seedAuthenticatedSession(page);
  await page.goto('/dashboard');
  await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 20_000 });
  await page.locator('aside').locator('a[href="/bills"]').first().click();
  await expect(page).toHaveURL(/\/bills$/);
  await expect(page.getByTestId('bill-list-table')).toBeVisible({ timeout: 15_000 });
}

async function openBill(page: Page, id: string) {
  await page.getByTestId(`bill-link-${id}`).click();
  await expect(page).toHaveURL(new RegExp(`/bills/${id}$`));
  await expect(page.getByTestId('bill-detail-status')).toBeVisible({ timeout: 15_000 });
}

async function fillNewBill(page: Page) {
  await page.getByTestId('bill-new-button').click();
  await expect(page).toHaveURL(/\/bills\/new$/);
  await page.getByTestId('bill-vendor-select').selectOption('vendor-001');
  await page.getByTestId('bill-due-date-input').fill('2099-11-30');
  await page.getByTestId('bill-item-description-0').fill('Toner cartridges');
  await page.getByTestId('bill-item-quantity-0').fill('3');
  await page.getByTestId('bill-item-unitPrice-0').fill('250');
}

let apiGuard: UnmockedApiGuard;
let mocks: Mocks;

test.describe('SOUPFIN-184: bill lifecycle', () => {
  test.skip(isLxcMode(), 'Mock-only spec: drives the planned lifecycle actions');

  test.beforeEach(async ({ page }) => {
    // FIRST, so every explicit mock takes precedence over it.
    apiGuard = await installUnmockedApiGuard(page);
    mocks = { store: seedBills(), requests: [], missing: new Set() };
  });

  test.afterEach(() => {
    apiGuard?.assertNone();
  });

  test('the list shows each lifecycle status, and closed bills offer View, not Edit', async ({ page }) => {
    await openBills(page, mocks);

    const expected: Record<string, string> = {
      'b-pending': 'PENDING',
      'b-overdue': 'OVERDUE',
      'b-partial': 'PARTIAL',
      'b-paid': 'PAID',
      'b-draft': 'DRAFT',
      'b-void': 'CANCELLED',
    };
    for (const [id, status] of Object.entries(expected)) {
      await expect(page.getByTestId(`bill-status-${id}`)).toHaveText(status);
    }
    for (const id of ['b-paid', 'b-void']) {
      await expect(page.getByTestId(`bill-view-${id}`)).toBeVisible();
      await expect(page.getByTestId(`bill-edit-${id}`)).toHaveCount(0);
    }
    await expect(page.getByTestId('bill-edit-b-draft')).toBeVisible();
    await shot(page, '01-list-lifecycle-statuses');
  });

  test('Save Draft stores a new bill without posting it', async ({ page }) => {
    await openBills(page, mocks);
    await fillNewBill(page);
    await expect(page.getByTestId('bill-form-save-draft-button')).toHaveText('Save Draft');
    await expect(page.getByTestId('bill-form-save-button')).toHaveText('Submit Bill');
    await shot(page, '02-new-bill-filled');

    await page.getByTestId('bill-form-save-draft-button').click();
    await expect(page).toHaveURL(/\/bills$/);

    // The request: the draft action, with the line and no client-sent status or totals
    const sent = mocks.requests.filter((r) => r.method === 'POST');
    expect(sent.map((r) => r.path)).toEqual(['/rest/bill/saveDraft.json']);
    const body = sent[0].body as Record<string, unknown>;
    expect(body).toMatchObject({ vendor: { id: 'vendor-001' }, 'billItemList[0].description': 'Toner cartridges' });
    for (const key of ['status', 'subtotal', 'taxAmount', 'totalAmount']) expect(body).not.toHaveProperty(key);

    // The state: the list reads the new bill back as a DRAFT
    await expect(page.getByTestId('bill-status-b-new-draft')).toHaveText('DRAFT');
    await shot(page, '03-list-after-save-draft');
  });

  test('Save Draft on a server without drafts says nothing was saved and keeps the form', async ({ page }) => {
    mocks.missing.add('saveDraft');
    await openBills(page, mocks);
    await fillNewBill(page);

    await page.getByTestId('bill-form-save-draft-button').click();

    const error = page.getByTestId('bill-form-error-message');
    await expect(error).toContainText('nothing was saved');
    await expect(page.getByText(/status code/i)).toHaveCount(0);
    await expect(page).toHaveURL(/\/bills\/new$/);
    await expect(page.getByTestId('bill-item-description-0')).toHaveValue('Toner cartridges');
    expect(mocks.store.some((b) => b.id === 'b-new-draft')).toBe(false);
    await shot(page, '04-save-draft-unavailable');
  });

  test('Submit posts a new bill through save.json; it then awaits payment', async ({ page }) => {
    await openBills(page, mocks);
    await fillNewBill(page);

    await page.getByTestId('bill-form-save-button').click();
    await expect(page).toHaveURL(/\/bills$/);

    const posts = mocks.requests.filter((r) => r.method === 'POST');
    expect(posts.map((r) => r.path)).toEqual(['/rest/bill/save.json']);
    expect(posts[0].body).not.toHaveProperty('status');
    await expect(page.getByTestId('bill-status-b-new-posted')).toHaveText('PENDING');
    await shot(page, '05-list-after-submit');
  });

  test('Submit on a draft saves the edits, then submits it', async ({ page }) => {
    await openBills(page, mocks);
    await page.getByTestId('bill-edit-b-draft').click();
    await expect(page).toHaveURL(/\/bills\/b-draft\/edit$/);
    await expect(page.getByTestId('bill-form-save-button')).toHaveText('Submit Bill');
    await expect(page.getByTestId('bill-form-save-draft-button')).toBeVisible();
    await page.getByTestId('bill-notes-textarea').fill('Approved by finance');
    await shot(page, '06-edit-draft');

    await page.getByTestId('bill-form-save-button').click();
    await expect(page).toHaveURL(/\/bills\/b-draft$/);

    expect(mocks.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      'PUT /rest/bill/update/b-draft.json',
      'POST /rest/bill/submit/b-draft.json',
    ]);
    await expect(page.getByTestId('bill-detail-status')).toHaveText('PENDING');
    await expect(page.getByTestId('bill-void-button')).toBeEnabled();
    await shot(page, '07-draft-submitted');
  });

  test('Void asks for confirmation, then the bill reads as voided and closed', async ({ page }) => {
    await openBills(page, mocks);
    await openBill(page, 'b-pending');
    await expect(page.getByTestId('bill-detail-status')).toHaveText('PENDING');
    await shot(page, '08-detail-before-void');

    await page.getByTestId('bill-void-button').click();
    const dialog = page.getByTestId('bill-void-dialog');
    await expect(dialog.getByRole('dialog')).toBeVisible();
    await expect(dialog).toContainText('Accra Office Supplies Ltd');
    await expect(page.getByTestId('bill-void-cancel')).toBeFocused();
    await page.getByTestId('bill-void-reason').fill('Duplicate of BILL-101');
    await shot(page, '09-void-confirmation');

    await page.getByTestId('bill-void-confirm').click();
    await expect(dialog).toHaveCount(0);

    expect(mocks.requests).toEqual([
      { method: 'POST', path: '/rest/bill/cancel/b-pending.json', body: { cancelReason: 'Duplicate of BILL-101' } },
    ]);
    await expect(page.getByTestId('bill-detail-status')).toHaveText('CANCELLED');
    await expect(page.getByTestId('bill-voided-notice')).toContainText('Reason: Duplicate of BILL-101');
    await expect(page.getByTestId('bill-edit-button')).toHaveCount(0);
    await expect(page.getByTestId('bill-void-button')).toHaveCount(0);
    await expect(page.getByTestId('record-payment-button')).toHaveCount(0);
    await shot(page, '10-detail-after-void');

    // Back on the list, the row is closed too
    await page.getByRole('link', { name: 'Back', exact: true }).click();
    await expect(page.getByTestId('bill-status-b-pending')).toHaveText('CANCELLED');
    await expect(page.getByTestId('bill-view-b-pending')).toBeVisible();
  });

  test('Void on a server that cannot void yet leaves the bill unchanged and says so', async ({ page }) => {
    mocks.missing.add('cancel');
    await openBills(page, mocks);
    await openBill(page, 'b-overdue');

    await page.getByTestId('bill-void-button').click();
    await page.getByTestId('bill-void-confirm').click();

    await expect(page.getByTestId('bill-void-error')).toContainText('the bill is unchanged');
    await expect(page.getByText(/status code/i)).toHaveCount(0);
    await expect(page.getByTestId('bill-detail-status')).toHaveText('OVERDUE');
    await shot(page, '11-void-unavailable');

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('bill-void-dialog')).toHaveCount(0);
  });

  test('a bill with payments cannot be voided, and says why', async ({ page }) => {
    await openBills(page, mocks);
    await openBill(page, 'b-partial');

    await expect(page.getByTestId('bill-void-button')).toBeDisabled();
    await expect(page.getByTestId('bill-void-blocked')).toContainText('Void its payments first');
    await shot(page, '12-void-blocked-by-payments');
  });

  test('a paid bill offers neither Edit nor Void, and its edit URL opens locked', async ({ page }) => {
    await openBills(page, mocks);
    await page.getByTestId('bill-view-b-paid').click();
    await expect(page.getByTestId('bill-detail-status')).toHaveText('PAID');
    await expect(page.getByTestId('bill-edit-button')).toHaveCount(0);
    await expect(page.getByTestId('bill-void-button')).toHaveCount(0);
    await shot(page, '13-paid-bill-detail');

    // No button leads here: this is the stale-bookmark case.
    await page.goto('/bills/b-paid/edit');
    await expect(page.getByTestId('bill-form-locked')).toContainText('This bill is paid');
    // Playwright's toBeDisabled ignores <fieldset>; check the attribute and a field inside it
    await expect(page.getByTestId('bill-form-fields')).toHaveAttribute('disabled', '');
    await expect(page.getByTestId('bill-vendor-select')).toBeDisabled();
    await expect(page.getByTestId('bill-item-description-0')).toBeDisabled();
    await expect(page.getByTestId('bill-form-save-button')).toBeDisabled();
    await expect(page.getByTestId('bill-form-save-draft-button')).toHaveCount(0);
    await shot(page, '14-paid-bill-edit-locked');

    await page.getByTestId('bill-form-locked-back').click();
    await expect(page).toHaveURL(/\/bills\/b-paid$/);
    expect(mocks.requests).toEqual([]);
  });
});
