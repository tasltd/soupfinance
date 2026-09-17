/**
 * Mock backend for the user-guide screenshot capture run (SOUPFIN-52).
 *
 * The guide's screenshots must be stable: the same numbers every time, so the
 * figures in the prose keep matching the images. That rules out the LXC seed
 * data (which drifts) and rules out empty states (which teach nothing). This
 * module serves one curated, self-consistent data set to every endpoint the
 * documented pages call.
 *
 * The numbers here are deliberately tidy and internally consistent:
 *   - three invoices, one per status (PAID / SENT / OVERDUE)
 *   - two bills against two vendors
 *   - a trial balance that actually balances (debits == credits)
 * so a reader comparing the screenshot with the prose is never confused by a
 * total that does not add up.
 */
import type { Page, Route } from '@playwright/test';

export const TENANT_ID = 'tenant-soupfin-demo';

export const guideUser = {
  username: 'ama.mensah',
  email: 'ama.mensah@brightpathconsult.com',
  roles: ['ROLE_ADMIN', 'ROLE_USER'],
  tenantId: TENANT_ID,
  agentId: 'agent-001',
};

export const accountSettings = {
  id: TENANT_ID,
  name: 'BrightPath Consulting Ltd',
  currency: 'GHS',
  country: 'Ghana',
  startOfFiscalYear: '2026-01-01',
  businessLicenceCategory: 'TRADING',
  email: 'accounts@brightpathconsult.com',
  phone: '+233 30 123 4567',
  address: '18 Independence Avenue, Accra',
};

export const clients = [
  {
    id: 'client-001',
    name: 'Zenith Retail Ltd',
    companyName: 'Zenith Retail Ltd',
    email: 'accounts@zenithretail.com',
    phone: '+233 24 555 0110',
    address: '12 Oxford Street, Osu, Accra',
    clientType: 'CORPORATE',
    registrationNumber: 'CS-2019-4471',
    taxNumber: 'C0012345678',
    archived: false,
    dateCreated: '2026-01-08T09:00:00Z',
    portfolioList: [{ id: 'port-001', accountServices: { id: 'as-001', serialised: 'Zenith Retail Ltd' } }],
  },
  {
    id: 'client-002',
    name: 'Kofi Asante',
    firstName: 'Kofi',
    lastName: 'Asante',
    email: 'kofi.asante@example.com',
    phone: '+233 20 555 0142',
    address: '5 Ring Road East, Accra',
    clientType: 'INDIVIDUAL',
    archived: false,
    dateCreated: '2026-01-14T11:20:00Z',
    portfolioList: [{ id: 'port-002', accountServices: { id: 'as-002', serialised: 'Kofi Asante' } }],
  },
  {
    id: 'client-003',
    name: 'Harbour Logistics Ltd',
    companyName: 'Harbour Logistics Ltd',
    email: 'finance@harbourlogistics.com',
    phone: '+233 24 555 0187',
    address: 'Tema Industrial Area, Tema',
    clientType: 'CORPORATE',
    registrationNumber: 'CS-2021-8890',
    archived: false,
    dateCreated: '2026-02-02T08:45:00Z',
    portfolioList: [{ id: 'port-003', accountServices: { id: 'as-003', serialised: 'Harbour Logistics Ltd' } }],
  },
];

/**
 * Build an invoice line item in the shape `computeInvoiceTotals()` actually reads.
 *
 * It needs `quantity` * `unitPrice` for the net, and the per-row tax from the
 * `taxEntryInvoiceItemList` JOIN rows — NOT a flat `taxAmount` field, which the
 * backend Invoice domain does not have. Get this wrong and every total renders
 * as 0.00, which is exactly the "empty app" screenshot a guide must never show.
 */
const invoiceItem = (
  id: string,
  description: string,
  quantity: number,
  unitPrice: number,
  taxAmount = 0
) => ({
  id,
  description,
  quantity,
  unitPrice,
  amount: quantity * unitPrice,
  taxEntryInvoiceItemList: taxAmount
    ? [{ id: `${id}-vat`, taxAmount, serialised: `VAT-15%`, taxEntry: { isWithholdingTax: false } }]
    : [],
});

export const invoices = [
  {
    id: 'inv-001',
    number: 1041,
    accountServices: { id: 'as-001', serialised: 'Zenith Retail Ltd' },
    invoiceDate: '2026-02-02',
    paymentDate: '2026-03-04',
    status: 'PAID',
    currency: 'GHS',
    subTotal: 18000,
    totalTaxAmount: 2700,
    total: 20700,
    paidAmount: 20700,
    amountDue: 0,
    notes: 'Q1 advisory retainer.',
    invoicePaymentList: [
      {
        id: 'pay-001',
        amount: 20700,
        paymentDate: '2026-02-12',
        reference: 'TRF-88213',
        paymentMethod: { id: 'pm-001', name: 'Bank Transfer' },
      },
    ],
    invoiceItemList: [
      invoiceItem('item-001', 'Financial advisory retainer — February', 1, 12000, 1800),
      invoiceItem('item-002', 'Management reporting pack', 2, 3000, 900),
    ],
  },
  {
    id: 'inv-002',
    number: 1042,
    accountServices: { id: 'as-002', serialised: 'Kofi Asante' },
    invoiceDate: '2026-02-11',
    paymentDate: '2026-03-13',
    status: 'SENT',
    currency: 'GHS',
    subTotal: 6500,
    totalTaxAmount: 975,
    total: 7475,
    paidAmount: 0,
    amountDue: 7475,
    notes: 'Tax filing support for the 2025 year of assessment.',
    invoicePaymentList: [],
    invoiceItemList: [invoiceItem('item-003', 'Personal tax filing support', 1, 6500, 975)],
  },
  {
    id: 'inv-003',
    number: 1043,
    accountServices: { id: 'as-003', serialised: 'Harbour Logistics Ltd' },
    invoiceDate: '2026-01-05',
    paymentDate: '2026-02-04',
    status: 'OVERDUE',
    currency: 'GHS',
    subTotal: 24000,
    totalTaxAmount: 3600,
    total: 27600,
    paidAmount: 10000,
    amountDue: 17600,
    notes: 'Warehouse process review — phase one.',
    invoicePaymentList: [
      {
        id: 'pay-002',
        amount: 10000,
        paymentDate: '2026-02-18',
        reference: 'MOMO-40117',
        paymentMethod: { id: 'pm-003', name: 'Mobile Money' },
      },
    ],
    invoiceItemList: [
      invoiceItem('item-004', 'Process review — phase one', 1, 18000, 2700),
      invoiceItem('item-005', 'On-site workshops', 4, 1500, 900),
    ],
  },
];

export const vendors = [
  {
    id: 'vendor-001',
    name: 'Accra Office Supplies Ltd',
    email: 'billing@accraoffice.com',
    phone: '+233 30 222 0101',
    address: '44 Spintex Road, Accra',
    archived: false,
  },
  {
    id: 'vendor-002',
    name: 'Volta Power Services',
    email: 'accounts@voltapower.com',
    phone: '+233 30 222 0188',
    address: '2 Liberation Road, Accra',
    archived: false,
  },
  {
    id: 'vendor-003',
    name: 'Kwame IT Consulting',
    email: 'invoices@kwameit.com',
    phone: '+233 24 777 0122',
    address: '9 Airport Residential, Accra',
    archived: false,
  },
];

/** Same story on the payables side — see the note on `invoiceItem` above. */
const billItem = (id: string, description: string, quantity: number, unitPrice: number, taxAmount = 0) => ({
  id,
  description,
  quantity,
  unitPrice,
  amount: quantity * unitPrice,
  taxEntryBillItemList: taxAmount
    ? [{ id: `${id}-vat`, taxAmount, serialised: `VAT-15%` }]
    : [],
});

export const bills = [
  {
    id: 'bill-001',
    number: 'BILL-2026-014',
    vendor: { id: 'vendor-001', serialised: 'Accra Office Supplies Ltd' },
    billDate: '2026-02-06',
    paymentDate: '2026-03-08',
    status: 'APPROVED',
    currency: 'GHS',
    subTotal: 4200,
    totalTaxAmount: 630,
    total: 4830,
    paidAmount: 0,
    amountDue: 4830,
    notes: 'Stationery and printer consumables.',
    billItemList: [billItem('bitem-001', 'A4 paper (20 reams)', 20, 120, 360), billItem('bitem-002', 'Toner cartridges', 3, 600, 270)],
  },
  {
    id: 'bill-002',
    number: 'BILL-2026-015',
    vendor: { id: 'vendor-002', serialised: 'Volta Power Services' },
    billDate: '2026-02-09',
    paymentDate: '2026-02-24',
    status: 'PAID',
    currency: 'GHS',
    subTotal: 3100,
    totalTaxAmount: 465,
    total: 3565,
    paidAmount: 3565,
    amountDue: 0,
    notes: 'Standby generator servicing.',
    billItemList: [billItem('bitem-003', 'Generator service contract — February', 1, 3100, 465)],
  },
];

export const ledgerAccounts = [
  { id: 'acc-1000', code: '1000', name: 'Cash at Bank', ledgerGroup: 'ASSET', balance: 86425, archived: false },
  { id: 'acc-1100', code: '1100', name: 'Accounts Receivable', ledgerGroup: 'ASSET', balance: 25075, archived: false },
  { id: 'acc-1200', code: '1200', name: 'Office Equipment', ledgerGroup: 'ASSET', balance: 42000, archived: false },
  { id: 'acc-2000', code: '2000', name: 'Accounts Payable', ledgerGroup: 'LIABILITY', balance: 4830, archived: false },
  { id: 'acc-2100', code: '2100', name: 'VAT Payable', ledgerGroup: 'LIABILITY', balance: 7470, archived: false },
  { id: 'acc-3000', code: '3000', name: 'Share Capital', ledgerGroup: 'EQUITY', balance: 100000, archived: false },
  { id: 'acc-4000', code: '4000', name: 'Consulting Revenue', ledgerGroup: 'REVENUE', balance: 48500, archived: false },
  { id: 'acc-5000', code: '5000', name: 'Office Expenses', ledgerGroup: 'EXPENSE', balance: 4200, archived: false },
  { id: 'acc-5100', code: '5100', name: 'Utilities', ledgerGroup: 'EXPENSE', balance: 3100, archived: false },
];

export const ledgerTransactions = [
  {
    id: 'txn-001',
    transactionDate: '2026-02-02',
    groupDate: '2026-02-02',
    description: 'Invoice 1041 — Zenith Retail Ltd',
    reference: 'INV-1041',
    ledgerAccount: { id: 'acc-1100', name: 'Accounts Receivable', code: '1100' },
    amount: 20700,
    transactionState: 'DEBIT',
    status: 'POSTED',
    posted: true,
  },
  {
    id: 'txn-002',
    transactionDate: '2026-02-02',
    groupDate: '2026-02-02',
    description: 'Invoice 1041 — Zenith Retail Ltd',
    reference: 'INV-1041',
    ledgerAccount: { id: 'acc-4000', name: 'Consulting Revenue', code: '4000' },
    amount: 20700,
    transactionState: 'CREDIT',
    status: 'POSTED',
    posted: true,
  },
  {
    id: 'txn-003',
    transactionDate: '2026-02-06',
    groupDate: '2026-02-06',
    description: 'Bill BILL-2026-014 — Accra Office Supplies Ltd',
    reference: 'BILL-2026-014',
    ledgerAccount: { id: 'acc-5000', name: 'Office Expenses', code: '5000' },
    amount: 4830,
    transactionState: 'DEBIT',
    status: 'POSTED',
    posted: true,
  },
  {
    id: 'txn-004',
    transactionDate: '2026-02-06',
    groupDate: '2026-02-06',
    description: 'Bill BILL-2026-014 — Accra Office Supplies Ltd',
    reference: 'BILL-2026-014',
    ledgerAccount: { id: 'acc-2000', name: 'Accounts Payable', code: '2000' },
    amount: 4830,
    transactionState: 'CREDIT',
    status: 'POSTED',
    posted: true,
  },
];

export const ledgerTransactionGroups = [
  {
    id: 'group-001',
    groupDate: '2026-02-02',
    transactionDate: '2026-02-02',
    description: 'Invoice 1041 — Zenith Retail Ltd',
    reference: 'INV-1041',
    status: 'POSTED',
    posted: true,
    totalAmount: 20700,
    ledgerTransactionList: [ledgerTransactions[0], ledgerTransactions[1]],
  },
  {
    id: 'group-002',
    groupDate: '2026-02-06',
    transactionDate: '2026-02-06',
    description: 'Bill BILL-2026-014 — Accra Office Supplies Ltd',
    reference: 'BILL-2026-014',
    status: 'DRAFT',
    posted: false,
    totalAmount: 4830,
    ledgerTransactionList: [ledgerTransactions[2], ledgerTransactions[3]],
  },
];

export const vouchers = [
  {
    id: 'voucher-001',
    number: 'PV-2026-008',
    voucherType: 'PAYMENT',
    voucherDate: '2026-02-09',
    amount: 3565,
    currency: 'GHS',
    beneficiaryName: 'Volta Power Services',
    description: 'Generator service contract — February',
    status: 'POSTED',
  },
  {
    id: 'voucher-002',
    number: 'RV-2026-003',
    voucherType: 'RECEIPT',
    voucherDate: '2026-02-12',
    amount: 20700,
    currency: 'GHS',
    beneficiaryName: 'Zenith Retail Ltd',
    description: 'Settlement of invoice 1041',
    status: 'POSTED',
  },
];

export const paymentMethods = [
  { id: 'pm-001', name: 'Bank Transfer' },
  { id: 'pm-002', name: 'Cash' },
  { id: 'pm-003', name: 'Mobile Money' },
  { id: 'pm-004', name: 'Cheque' },
];

export const bankAccounts = [
  {
    id: 'bank-001',
    accountName: 'BrightPath Consulting — Current',
    accountNumber: '1441002233001',
    bank: { id: 'b-001', serialised: 'Ecobank Ghana' },
    branch: 'Ridge Towers',
    swiftCode: 'ECOCGHAC',
    currency: 'GHS',
  },
  {
    id: 'bank-002',
    accountName: 'BrightPath Consulting — USD',
    accountNumber: '1441002233002',
    bank: { id: 'b-002', serialised: 'Stanbic Bank Ghana' },
    branch: 'Airport City',
    swiftCode: 'SBICGHAC',
    currency: 'USD',
  },
];

export const agents = [
  {
    id: 'agent-001',
    firstName: 'Ama',
    lastName: 'Mensah',
    designation: 'Finance Director',
    simpleID: 'Ama Mensah, Access:ama.mensah',
    userAccess: { id: 'user-001', serialised: 'ama.mensah' },
    authorities: [{ id: 'role-1', authority: 'ROLE_ADMIN' }],
    emailContacts: [{ id: 'ec-1', email: 'ama.mensah@brightpathconsult.com' }],
    phoneContacts: [{ id: 'pc-1', phone: '+233 24 555 0100' }],
    archived: false,
  },
  {
    id: 'agent-002',
    firstName: 'Yaw',
    lastName: 'Boateng',
    designation: 'Accounts Officer',
    simpleID: 'Yaw Boateng, Access:yaw.boateng',
    userAccess: { id: 'user-002', serialised: 'yaw.boateng' },
    authorities: [{ id: 'role-2', authority: 'ROLE_USER' }],
    emailContacts: [{ id: 'ec-2', email: 'yaw.boateng@brightpathconsult.com' }],
    phoneContacts: [{ id: 'pc-2', phone: '+233 24 555 0101' }],
    archived: false,
  },
];

export const reportSchedules = [
  {
    id: 'sched-001',
    name: 'Monthly Profit & Loss',
    reportType: 'incomeStatement',
    frequency: 'MONTHLY',
    format: 'PDF',
    recipients: ['ama.mensah@brightpathconsult.com'],
    active: true,
    enabled: true,
    nextRunDate: '2026-03-01',
    lastRunDate: '2026-02-01',
  },
  {
    id: 'sched-002',
    name: 'Weekly Aged Receivables',
    reportType: 'agedReceivables',
    frequency: 'WEEKLY',
    format: 'EXCEL',
    recipients: ['ama.mensah@brightpathconsult.com', 'yaw.boateng@brightpathconsult.com'],
    active: false,
    enabled: false,
    nextRunDate: '2026-02-24',
    lastRunDate: '2026-02-17',
  },
];

// Debits and credits both total 160,800 — a trial balance that actually
// balances, so the screenshot never teaches the reader a broken example.
// The set is reconciled end to end: Accounts Receivable (25,075) equals the two
// unpaid invoices, Accounts Payable (4,830) equals the one unpaid bill, and
// Assets (153,500) equals Liabilities (12,300) + Equity (100,000) + retained
// earnings (41,200 = revenue 48,500 - expenses 7,300).
export const trialBalance = {
  resultList: {
    ASSET: {
      accountList: [
        { id: 'acc-1000', code: '1000', name: 'Cash at Bank', endingDebit: 86425, endingCredit: 0 },
        { id: 'acc-1100', code: '1100', name: 'Accounts Receivable', endingDebit: 25075, endingCredit: 0 },
        { id: 'acc-1200', code: '1200', name: 'Office Equipment', endingDebit: 42000, endingCredit: 0 },
      ],
    },
    LIABILITY: {
      accountList: [
        { id: 'acc-2000', code: '2000', name: 'Accounts Payable', endingDebit: 0, endingCredit: 4830 },
        { id: 'acc-2100', code: '2100', name: 'VAT Payable', endingDebit: 0, endingCredit: 7470 },
      ],
    },
    EQUITY: {
      accountList: [{ id: 'acc-3000', code: '3000', name: 'Share Capital', endingDebit: 0, endingCredit: 100000 }],
    },
    REVENUE: {
      accountList: [{ id: 'acc-4000', code: '4000', name: 'Consulting Revenue', endingDebit: 0, endingCredit: 48500 }],
    },
    EXPENSE: {
      accountList: [
        { id: 'acc-5000', code: '5000', name: 'Office Expenses', endingDebit: 4200, endingCredit: 0 },
        { id: 'acc-5100', code: '5100', name: 'Utilities', endingDebit: 3100, endingCredit: 0 },
      ],
    },
  },
  totalDebit: 160800,
  totalCredit: 160800,
};

export const incomeStatement = {
  ledgerAccountList: [
    { id: 'acc-4000', code: '4000', name: 'Consulting Revenue', calculatedBalance: -48500, ledgerGroup: 'REVENUE' },
    { id: 'acc-5000', code: '5000', name: 'Office Expenses', calculatedBalance: 4200, ledgerGroup: 'EXPENSE' },
    { id: 'acc-5100', code: '5100', name: 'Utilities', calculatedBalance: 3100, ledgerGroup: 'EXPENSE' },
  ],
};

export const balanceSheet = {
  ledgerAccountList: [
    { id: 'acc-1000', code: '1000', name: 'Cash at Bank', calculatedBalance: 86425, ledgerGroup: 'ASSET' },
    { id: 'acc-1100', code: '1100', name: 'Accounts Receivable', calculatedBalance: 25075, ledgerGroup: 'ASSET' },
    { id: 'acc-1200', code: '1200', name: 'Office Equipment', calculatedBalance: 42000, ledgerGroup: 'ASSET' },
    { id: 'acc-2000', code: '2000', name: 'Accounts Payable', calculatedBalance: -4830, ledgerGroup: 'LIABILITY' },
    { id: 'acc-2100', code: '2100', name: 'VAT Payable', calculatedBalance: -7470, ledgerGroup: 'LIABILITY' },
    { id: 'acc-3000', code: '3000', name: 'Share Capital', calculatedBalance: 100000, ledgerGroup: 'EQUITY' },
  ],
};

export const accountTransactions = [
  { id: 'cf-1', transactionDate: '2026-02-02', description: 'Receipt — Zenith Retail Ltd', debitAmount: 20700, creditAmount: 0, amount: 20700, transactionState: 'DEBIT' },
  { id: 'cf-2', transactionDate: '2026-02-09', description: 'Payment — Volta Power Services', debitAmount: 0, creditAmount: 3565, amount: 3565, transactionState: 'CREDIT' },
  { id: 'cf-3', transactionDate: '2026-02-12', description: 'Receipt — Harbour Logistics Ltd', debitAmount: 10000, creditAmount: 0, amount: 10000, transactionState: 'DEBIT' },
];

export const agedReceivables = {
  agedReceivablesList: [
    { id: 'ar-1', name: 'Kofi Asante', notYetOverdue: 7475, thirtyOrLess: 0, thirtyOneToSixty: 0, sixtyOneToNinety: 0, ninetyPlus: 0, totalUnpaid: 7475 },
    { id: 'ar-2', name: 'Harbour Logistics Ltd', notYetOverdue: 0, thirtyOrLess: 17600, thirtyOneToSixty: 0, sixtyOneToNinety: 0, ninetyPlus: 0, totalUnpaid: 17600 },
  ],
};

export const agedPayables = {
  agedPayablesList: [
    { id: 'ap-1', name: 'Accra Office Supplies Ltd', notYetOverdue: 4830, thirtyOrLess: 0, thirtyOneToSixty: 0, sixtyOneToNinety: 0, ninetyPlus: 0, totalUnpaid: 4830 },
  ],
};

const json = (body: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

/**
 * Route every endpoint the documented pages touch.
 *
 * Ordering matters: Playwright matches handlers in REVERSE registration order,
 * so the more specific patterns are registered last.
 */
export async function installGuideMocks(page: Page) {
  const fulfil = (body: unknown) => (route: Route) => route.fulfill(json(body));

  // --- catch-all for proxied API prefixes -----------------------------------
  // Anything not claimed below answers 200 [] rather than falling through to the
  // Vite proxy, where a real backend would 401 and bounce the page to /login
  // mid-capture.
  //
  // Anchored at the FIRST path segment on purpose. A loose glob like
  // `**/client/**` also matches Vite's own `/node_modules/vite/dist/client/env.mjs`,
  // and stubbing that out breaks the dev client on every page — the app never
  // mounts and every capture times out waiting for its testid.
  const PROXIED_API_PREFIXES = [
    /^https?:\/\/[^/]+\/rest\//,
    /^https?:\/\/[^/]+\/account\//,
    /^https?:\/\/[^/]+\/client\//,
  ];
  for (const prefix of PROXIED_API_PREFIXES) {
    await page.route(prefix, (route) => route.fulfill(json([])));
  }

  // --- auth / identity ------------------------------------------------------
  await page.route('**/rest/api/login', (route) =>
    route.fulfill(json({ access_token: 'guide-token', username: guideUser.username, roles: guideUser.roles }))
  );
  await page.route('**/rest/user/current.json*', fulfil(guideUser));
  await page.route('**/account/show/*.json*', fulfil(accountSettings));

  // --- reference data -------------------------------------------------------
  await page.route('**/rest/paymentMethod/index.json*', fulfil(paymentMethods));
  await page.route('**/rest/paymentTerm/index.json*', fulfil([]));
  await page.route('**/rest/serviceDescription/index.json*', fulfil([]));
  await page.route('**/rest/taxEntry/index.json*', fulfil([]));
  await page.route('**/rest/bank/index.json*', fulfil([
    { id: 'b-001', name: 'Ecobank Ghana' },
    { id: 'b-002', name: 'Stanbic Bank Ghana' },
  ]));
  await page.route('**/rest/sbRole/index.json*', fulfil([
    { id: 'role-1', authority: 'ROLE_ADMIN' },
    { id: 'role-2', authority: 'ROLE_USER' },
  ]));
  await page.route('**/rest/frontendLog/batch.json*', fulfil({ received: 0 }));

  // --- receivables ----------------------------------------------------------
  await page.route('**/rest/client/index.json*', fulfil(clients));
  await page.route('**/rest/client/show/*.json*', (route) => {
    const id = route.request().url().match(/client\/show\/([^.]+)\.json/)?.[1];
    route.fulfill(json(clients.find((c) => c.id === id) ?? clients[0]));
  });
  await page.route('**/rest/client/create.json*', fulfil({ SYNCHRONIZER_TOKEN: 'tok', SYNCHRONIZER_URI: '/client/save' }));
  await page.route('**/rest/invoice/index.json*', fulfil(invoices));
  await page.route('**/rest/invoice/show/*.json*', (route) => {
    const id = route.request().url().match(/invoice\/show\/([^.]+)\.json/)?.[1];
    route.fulfill(json(invoices.find((i) => i.id === id) ?? invoices[0]));
  });
  await page.route('**/rest/invoice/create.json*', fulfil({ SYNCHRONIZER_TOKEN: 'tok', SYNCHRONIZER_URI: '/invoice/save' }));
  await page.route('**/rest/invoiceItem/index.json*', (route) => {
    const invoiceId = new URL(route.request().url()).searchParams.get('invoice.id');
    route.fulfill(json(invoices.find((i) => i.id === invoiceId)?.invoiceItemList ?? []));
  });
  // Scope payments to the invoice being viewed, so the detail page's Payment
  // History agrees with its own Amount Paid figure. Returning a blank list here
  // produced a screenshot reading "Amount Paid GH₵20,700.00" above "No payments
  // recorded yet" — a contradiction a reader would rightly not trust.
  await page.route('**/rest/invoicePayment/index.json*', (route) => {
    const invoiceId = new URL(route.request().url()).searchParams.get('invoice.id');
    const scoped = invoices.find((i) => i.id === invoiceId)?.invoicePaymentList ?? [];
    route.fulfill(json(invoiceId ? scoped : invoices.flatMap((i) => i.invoicePaymentList ?? [])));
  });

  // --- payables -------------------------------------------------------------
  // Vendors sit behind the `trading` module prefix (/rest/trading/vendor/...),
  // so the pattern must NOT hard-code /rest/vendor.
  await page.route('**/vendor/index.json*', fulfil(vendors));
  await page.route('**/vendor/show/*.json*', (route) => {
    const id = route.request().url().match(/vendor\/show\/([^.]+)\.json/)?.[1];
    route.fulfill(json(vendors.find((v) => v.id === id) ?? vendors[0]));
  });
  await page.route('**/vendor/create.json*', fulfil({ SYNCHRONIZER_TOKEN: 'tok', SYNCHRONIZER_URI: '/vendor/save' }));
  await page.route('**/rest/bill/index.json*', fulfil(bills));
  await page.route('**/rest/bill/show/*.json*', (route) => {
    const id = route.request().url().match(/bill\/show\/([^.]+)\.json/)?.[1];
    route.fulfill(json(bills.find((b) => b.id === id) ?? bills[0]));
  });
  await page.route('**/rest/bill/create.json*', fulfil({ SYNCHRONIZER_TOKEN: 'tok', SYNCHRONIZER_URI: '/bill/save' }));
  await page.route('**/rest/billItem/index.json*', (route) => {
    const billId = new URL(route.request().url()).searchParams.get('bill.id');
    route.fulfill(json(bills.find((b) => b.id === billId)?.billItemList ?? []));
  });
  await page.route('**/rest/billPayment/index.json*', fulfil([]));

  // --- ledger and accounting ------------------------------------------------
  await page.route('**/rest/ledgerAccount/index.json*', fulfil(ledgerAccounts));
  await page.route('**/rest/ledgerAccount/trialBalance.json*', fulfil(trialBalance));
  await page.route('**/rest/ledgerTransaction/index.json*', fulfil(ledgerTransactions));
  await page.route('**/rest/ledgerTransactionGroup/index.json*', fulfil(ledgerTransactionGroups));
  await page.route('**/rest/voucher/index.json*', fulfil(vouchers));

  // --- reports --------------------------------------------------------------
  await page.route('**/rest/financeReports/trialBalance*', fulfil(trialBalance));
  await page.route('**/rest/financeReports/incomeStatement*', fulfil(incomeStatement));
  await page.route('**/rest/financeReports/balanceSheet*', fulfil(balanceSheet));
  await page.route('**/rest/financeReports/accountTransactions*', fulfil(accountTransactions));
  await page.route('**/rest/financeReports/accountBalances*', fulfil({ ledgerAccountList: ledgerAccounts }));
  await page.route('**/rest/financeReports/agedReceivables*', fulfil(agedReceivables));
  await page.route('**/rest/financeReports/agedPayables*', fulfil(agedPayables));
  await page.route('**/rest/reportSchedule/index.json*', fulfil(reportSchedules));

  // --- settings -------------------------------------------------------------
  await page.route('**/rest/agent/index.json*', fulfil(agents));
  await page.route('**/rest/agent/show/*.json*', fulfil(agents[0]));
  await page.route('**/rest/accountBankDetails/index.json*', fulfil(bankAccounts));
  await page.route('**/rest/accountBankDetails/show/*.json*', fulfil(bankAccounts[0]));
}

/** Seed an authenticated session so the SPA skips the login redirect. */
export async function seedAuthenticatedSession(page: Page) {
  await page.addInitScript((user) => {
    localStorage.setItem('access_token', 'guide-token');
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem(
      'auth-storage',
      JSON.stringify({ state: { user, isAuthenticated: true, isInitialized: true }, version: 0 })
    );
  }, guideUser);
}
