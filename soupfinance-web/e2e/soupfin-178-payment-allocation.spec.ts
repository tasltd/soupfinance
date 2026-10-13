/**
 * SOUPFIN-178: receive one payment against several invoices / pay several bills.
 *
 * Mock mode. Navigation is by sidebar and page clicks only. The save mock does
 * what PaymentAllocationService.createAllocation does on the backend (one
 * InvoicePayment / BillPayment per line), so the spec can check that each
 * invoice's balance and status moved after the save, not just that a request
 * went out. The real round trip is
 * e2e/integration/soupfin-178-payment-allocation.integration.spec.ts.
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import { installGuideMocks, seedAuthenticatedSession, bills as guideBills } from './user-guide/guide-mocks';
import { installUnmockedApiGuard, isLxcMode, type UnmockedApiGuard } from './fixtures';

const SHOT_DIR = 'e2e/playwright/screenshots/soupfin-178';

test.use({ viewport: { width: 1600, height: 1000 } });
test.setTimeout(120_000);

async function shot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: true });
}

const json = (body: unknown, status = 200) => (route: Route) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

// Zenith Retail Ltd (guide client-001, AccountServices as-001) owes three invoices.
// Totals come from the line items, balances from invoicePaymentList, as transformInvoice reads them.
type Payment = { id: string; amount: number; paymentDate: string };
function zenithInvoice(id: string, number: number, dueDate: string, total: number, payments: Payment[]) {
  return {
    id,
    number,
    accountServices: { id: 'as-001', serialised: 'Zenith Retail Ltd' },
    invoiceDate: '2026-01-02',
    paymentDate: dueDate,
    currency: 'GHS',
    invoiceItemList: [{ id: `${id}-item`, description: 'Advisory retainer', quantity: 1, unitPrice: total, amount: total, taxEntryInvoiceItemList: [] }],
    invoicePaymentList: payments,
  };
}

function seedInvoices() {
  return [
    zenithInvoice('inv-z3', 2003, '2099-03-01', 1000, []),
    zenithInvoice('inv-z1', 2001, '2026-01-15', 3000, []),
    zenithInvoice('inv-z2', 2002, '2026-01-31', 2500, [{ id: 'pay-old', amount: 500, paymentDate: '2026-01-20' }]),
    // Another client's invoice: the backend list ignores the account filter, the page must not.
    zenithInvoice('inv-other', 2004, '2025-12-01', 900, []),
  ].map((inv, i) => (i === 3 ? { ...inv, accountServices: { id: 'as-002', serialised: 'Kofi Asante' } } : inv));
}

interface Backend {
  saved: unknown[];
}

/**
 * Sign in on the dashboard with the guide data plus Zenith's open invoices, a
 * second open bill for vendor-001, and a paymentAllocationGroup endpoint that
 * records payments the way the backend does.
 */
async function openApp(page: Page): Promise<Backend> {
  const backend: Backend = { saved: [] };
  const invoices = seedInvoices();
  const bills = [
    ...guideBills,
    {
      ...guideBills[0],
      id: 'bill-003',
      number: 'BILL-2026-020',
      paymentDate: '2026-02-20',
      subTotal: 1000,
      totalTaxAmount: 0,
      total: 1000,
      paidAmount: 0,
      amountDue: 1000,
      status: 'APPROVED',
      billItemList: [],
    },
  ];

  await installGuideMocks(page);
  await page.route('**/rest/invoice/index.json*', (route) => json(invoices)(route));
  await page.route('**/rest/bill/index.json*', (route) => json(bills)(route));
  await page.route('**/rest/paymentAllocationGroup/create.json*', json({ id: null, status: 'DRAFT' }));
  await page.route('**/rest/paymentAllocationGroup/save.json*', async (route) => {
    const body = route.request().postDataJSON() as {
      direction: string;
      paymentDate: string;
      allocations: Array<{ invoiceId?: string; billId?: string; amount: number }>;
    };
    backend.saved.push(body);
    for (const [i, line] of body.allocations.entries()) {
      if (line.invoiceId) {
        const inv = invoices.find((x) => x.id === line.invoiceId)!;
        inv.invoicePaymentList = [...inv.invoicePaymentList, { id: `alloc-pay-${i}`, amount: line.amount, paymentDate: body.paymentDate }];
      } else if (line.billId) {
        const bill = bills.find((x) => x.id === line.billId)!;
        bill.paidAmount += line.amount;
        bill.amountDue -= line.amount;
        bill.status = bill.amountDue <= 0 ? 'PAID' : 'PARTIAL';
      }
    }
    await json({ id: `grp-${backend.saved.length}`, status: 'POSTED', ...body }, 201)(route);
  });
  await seedAuthenticatedSession(page);
  await page.goto('/dashboard');
  await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 20_000 });
  return backend;
}

async function clickSidebar(page: Page, path: '/clients' | '/payments' | '/vendors') {
  await page.locator('aside').locator(`a[href="${path}"]`).first().click();
  await expect(page).toHaveURL(new RegExp(`${path}$`));
}

const line = (page: Page, id: string) => page.getByTestId(`allocation-input-${id}`);

let apiGuard: UnmockedApiGuard;

test.describe('SOUPFIN-178: one payment across many invoices or bills', () => {
  test.skip(isLxcMode(), 'Mock spec: the LXC round trip lives in e2e/integration/');

  test.beforeEach(async ({ page }) => {
    apiGuard = await installUnmockedApiGuard(page); // FIRST, so every explicit mock wins
  });

  test.afterEach(() => {
    apiGuard?.assertNone();
  });

  test('receive a payment from the client page: FIFO, manual override, over-allocation, save', async ({ page }) => {
    const backend = await openApp(page);

    await clickSidebar(page, '/clients');
    await page.getByTestId('client-link-client-001').click();
    await expect(page).toHaveURL(/\/clients\/client-001$/);
    await page.getByTestId('client-receive-payment').click();
    await expect(page).toHaveURL(/\/payments\/receive\?clientId=client-001$/);

    await expect(page.getByTestId('payment-allocation-heading')).toHaveText('Receive payment from Zenith Retail Ltd');
    const rows = page.getByTestId('allocation-table').locator('tbody tr');
    await expect(rows).toHaveCount(3); // Kofi Asante's invoice is not listed
    await expect(rows.nth(0)).toHaveAttribute('data-testid', 'allocation-row-inv-z1');
    await expect(rows.nth(1)).toHaveAttribute('data-testid', 'allocation-row-inv-z2');
    await expect(page.getByTestId('allocation-balance-inv-z2')).toContainText('2,000.00');
    await shot(page, '01-receive-open-invoices');

    // FIFO: 4,000 pays the oldest invoice in full and 1,000 of the next
    await page.getByTestId('allocation-amount-input').fill('4000');
    await expect(line(page, 'inv-z1')).toHaveValue('3000.00');
    await expect(line(page, 'inv-z2')).toHaveValue('1000.00');
    await expect(line(page, 'inv-z3')).toHaveValue('');
    await expect(page.getByTestId('allocation-summary-unapplied')).toContainText('0.00');
    await expect(page.getByTestId('allocation-summary-remaining')).toContainText('2,000.00');
    await shot(page, '02-receive-fifo-filled');

    // Manual override leaves money unapplied, and says so
    await line(page, 'inv-z2').fill('600');
    await expect(page.getByTestId('allocation-strategy')).toHaveText('Amounts set by hand');
    await line(page, 'inv-z2').blur();
    await expect(line(page, 'inv-z2')).toHaveValue('600.00');
    await expect(page.getByTestId('allocation-summary-unapplied')).toContainText('400.00');
    await expect(page.getByTestId('allocation-unapplied-note')).toBeVisible();
    await shot(page, '03-receive-manual-unapplied');

    // Over-allocation is blocked
    await page.getByTestId('allocation-check-inv-z3').click(); // takes the 400 left
    await expect(line(page, 'inv-z3')).toHaveValue('400.00');
    await line(page, 'inv-z3').fill('900');
    await expect(page.getByTestId('allocation-over-error')).toContainText('500.00 more than the amount received');
    await expect(page.getByTestId('allocation-submit')).toBeDisabled();
    await shot(page, '04-receive-over-allocated');

    // A line above its balance is refused
    await page.getByTestId('allocation-amount-input').fill('9000');
    await line(page, 'inv-z3').fill('1200');
    await expect(page.getByTestId('allocation-line-error-inv-z3')).toHaveText('More than the balance due');
    await page.getByTestId('allocation-bank-select').selectOption('acc-1000');
    await page.getByTestId('allocation-submit').click();
    await expect(page.getByTestId('allocation-form-error')).toHaveText('Fix the highlighted lines first.');
    await shot(page, '05-receive-line-above-balance');
    expect(backend.saved).toHaveLength(0);

    // Back to automatic, then save
    await page.getByTestId('allocation-amount-input').fill('4000');
    await page.getByTestId('allocation-auto-button').click();
    await expect(page.getByTestId('allocation-strategy')).toContainText('oldest due date first');
    await page.getByTestId('allocation-method-select').selectOption({ label: 'Bank Transfer' });
    await page.getByTestId('allocation-reference-input').fill('TRF-178');
    await page.getByTestId('allocation-date-input').fill('2026-10-13');
    await shot(page, '06-receive-ready-to-save');
    await page.getByTestId('allocation-submit').click();

    await expect(page).toHaveURL(/\/payments$/);
    expect(backend.saved).toEqual([
      {
        direction: 'RECEIPT',
        strategy: 'FIFO',
        totalAmount: 4000,
        paymentDate: '2026-10-13',
        paymentMethod: { id: 'pm-001' },
        reference: 'TRF-178',
        accountServicesId: 'as-001',
        cashAccountId: 'acc-1000',
        allocations: [
          { invoiceId: 'inv-z1', amount: 3000 },
          { invoiceId: 'inv-z2', amount: 1000 },
        ],
      },
    ]);
    await expect(page.getByText('Payment of')).toContainText('applied to 2 invoices');
    await expect(page.getByTestId('payment-list-loading')).toHaveCount(0, { timeout: 15_000 });
    await shot(page, '07-receive-saved');

    // Backend state after the save: the paid invoice is gone, the part-paid one shows its new balance
    await page.getByTestId('receive-payment-button').click();
    await page.getByTestId('allocation-party-select').selectOption('client-001');
    await expect(page.getByTestId('allocation-table').locator('tbody tr')).toHaveCount(2);
    await expect(page.getByTestId('allocation-row-inv-z1')).toHaveCount(0);
    await expect(page.getByTestId('allocation-balance-inv-z2')).toContainText('1,000.00');
    await shot(page, '08-receive-balances-after-save');

    await clickSidebar(page, '/clients');
    await page.getByTestId('client-link-client-001').click();
    await expect(page.getByTestId('client-receive-payment')).toBeVisible();
  });

  test("pay a vendor's bills from the Payments page", async ({ page }) => {
    const backend = await openApp(page);

    await clickSidebar(page, '/payments');
    await page.getByTestId('pay-bills-button').click();
    await expect(page).toHaveURL(/\/payments\/make$/);
    await expect(page.getByTestId('allocation-no-party')).toHaveText('Choose a vendor to see their open bills.');
    await shot(page, '09-pay-bills-choose-vendor');

    await page.getByTestId('allocation-party-select').selectOption({ label: 'Accra Office Supplies Ltd' });
    const rows = page.getByTestId('allocation-table').locator('tbody tr');
    await expect(rows).toHaveCount(2); // the paid Volta Power bill is not listed
    await expect(rows.nth(0)).toHaveAttribute('data-testid', 'allocation-row-bill-003'); // due 20 Feb, before 8 Mar

    await page.getByTestId('allocation-amount-input').fill('2000');
    await expect(line(page, 'bill-003')).toHaveValue('1000.00');
    await expect(line(page, 'bill-001')).toHaveValue('1000.00');
    await page.getByTestId('allocation-bank-select').selectOption('acc-1000');
    await page.getByTestId('allocation-date-input').fill('2026-10-13');
    await shot(page, '10-pay-bills-filled');
    await page.getByTestId('allocation-submit').click();

    await expect(page).toHaveURL(/\/payments\?tab=outgoing$/);
    await expect(page.getByTestId('payment-list-loading')).toHaveCount(0, { timeout: 15_000 });
    expect(backend.saved).toEqual([
      expect.objectContaining({
        direction: 'PAYMENT',
        vendorId: 'vendor-001',
        totalAmount: 2000,
        allocations: [
          { billId: 'bill-003', amount: 1000 },
          { billId: 'bill-001', amount: 1000 },
        ],
      }),
    ]);
    await shot(page, '11-pay-bills-saved');

    // After the save: bill-003 is paid off, bill-001 has 3,830 left
    await page.getByTestId('pay-bills-button').click();
    await page.getByTestId('allocation-party-select').selectOption({ label: 'Accra Office Supplies Ltd' });
    await expect(page.getByTestId('allocation-table').locator('tbody tr')).toHaveCount(1);
    await expect(page.getByTestId('allocation-balance-bill-001')).toContainText('3,830.00');
    await shot(page, '12-pay-bills-balance-after-save');
  });

  test('vendor page leads to Pay bills with the vendor chosen', async ({ page }) => {
    await openApp(page);
    await clickSidebar(page, '/vendors');
    await page.locator('a[href="/vendors/vendor-001"]').first().click();
    await page.getByTestId('vendor-pay-bills').click();
    await expect(page).toHaveURL(/\/payments\/make\?vendorId=vendor-001$/);
    await expect(page.getByTestId('allocation-party-select')).toHaveValue('vendor-001');
    await expect(page.getByTestId('allocation-table')).toBeVisible();
  });

  test('a client who owes nothing gets a plain message', async ({ page }) => {
    await openApp(page);
    await clickSidebar(page, '/clients');
    await page.getByTestId('client-link-client-003').click(); // Harbour Logistics: no invoices in this data
    await page.getByTestId('client-receive-payment').click();
    await expect(page.getByTestId('allocation-empty')).toHaveText('This client has no unpaid invoices.');
    await shot(page, '13-receive-nothing-owed');
  });

  test('the backend refusing the save keeps the user on the form with its reason', async ({ page }) => {
    const backend = await openApp(page);
    await page.route('**/rest/paymentAllocationGroup/save.json*', json({ message: 'Allocation 3000 exceeds amount due 2500 for invoice #2001.' }, 422));

    await clickSidebar(page, '/payments');
    await page.getByTestId('receive-payment-button').click();
    await page.getByTestId('allocation-party-select').selectOption('client-001');
    await page.getByTestId('allocation-amount-input').fill('100');
    await page.getByTestId('allocation-bank-select').selectOption('acc-1000');
    await page.getByTestId('allocation-submit').click();

    await expect(page.getByTestId('allocation-form-error')).toContainText('exceeds amount due 2500');
    await expect(page).toHaveURL(/\/payments\/receive$/);
    expect(backend.saved).toHaveLength(0);
    await shot(page, '14-receive-backend-refused');
  });
});

test.describe('SOUPFIN-178: allocation screen fits narrower screens', () => {
  test.skip(isLxcMode(), 'Mock spec');

  for (const { name, width, height } of [
    { name: 'laptop', width: 1280, height: 900 },
    { name: 'phone', width: 390, height: 844 },
  ]) {
    test(`${name} (${width}px): no page-wide horizontal scroll, invoice numbers visible`, async ({ page }) => {
      const guard = await installUnmockedApiGuard(page);
      await page.setViewportSize({ width, height });
      await openApp(page);
      // The sidebar collapses into a drawer on a phone, so reach Payments through the dashboard link there.
      if (width < 768) {
        await page.getByRole('button', { name: /menu/i }).first().click();
      }
      await page.locator('a[href="/payments"]:visible').first().click();
      await page.getByTestId('receive-payment-button').click();
      await page.getByTestId('allocation-party-select').selectOption('client-001');
      await page.getByTestId('allocation-amount-input').fill('4000');
      await expect(line(page, 'inv-z1')).toHaveValue('3000.00');

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, 'page scrolls sideways').toBeLessThanOrEqual(0);
      // The number cell sits inside the visible part of its card
      const card = await page.getByTestId('allocation-table').locator('xpath=ancestor::section[1]').boundingBox();
      const cell = await page.getByTestId('allocation-row-inv-z1').locator('td').nth(1).boundingBox();
      expect(cell!.x).toBeGreaterThanOrEqual(card!.x);
      // ...and so does the amount the user types into
      const input = await line(page, 'inv-z1').boundingBox();
      expect(input!.x + input!.width, 'amount input inside the card').toBeLessThanOrEqual(card!.x + card!.width);
      await shot(page, `15-receive-${name}-${width}px`);
      guard.assertNone();
    });
  }
});
