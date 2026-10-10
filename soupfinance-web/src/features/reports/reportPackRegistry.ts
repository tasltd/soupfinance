/**
 * Added (SOUPFIN-104): the core report pack.
 *
 * Every entry here is registry-only: <RegistryReportPage> renders it at
 * /reports/view/:id from its loader and columns, inside the same <ReportShell>
 * as every other report, and exports it as PDF, Excel and CSV built from the
 * rows on screen. No report here is gated by tenant or plan.
 */
import type { ReportDefinition, ReportCategoryId, ReportPageConfig } from './reportRegistry';
import type { ReportColumn } from './reportTable';
import * as load from './reportPackLoaders';

interface PackSpec {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: ReportCategoryId;
  keywords: string[];
  load: load.ReportLoader;
  columns: ReportColumn[];
  /** Defaults to a date range starting on the first of this month. */
  dateMode?: ReportPageConfig['dateMode'];
  groupBy?: string;
  showTotals?: boolean;
}

function pack(spec: PackSpec): ReportDefinition {
  return {
    id: spec.id,
    title: spec.title,
    description: spec.description,
    icon: spec.icon,
    category: spec.category,
    path: `/reports/view/${spec.id}`,
    keywords: spec.keywords,
    page: {
      title: spec.title,
      testIdPrefix: spec.id,
      helpSection: 'report-basics',
      dateMode: spec.dateMode ?? 'range',
      defaultRange: 'month',
      comparison: false,
      classLocation: true,
    },
    export: { fileStem: spec.id },
    load: spec.load,
    columns: spec.columns,
    groupBy: spec.groupBy,
    showTotals: spec.showTotals,
  };
}

// -----------------------------------------------------------------------------
// Column shorthands
// -----------------------------------------------------------------------------

const text = (key: string, header: string): ReportColumn => ({ key, header, type: 'text' });
const date = (key: string, header: string): ReportColumn => ({ key, header, type: 'date' });
const money = (key: string, header: string, total = true): ReportColumn => ({ key, header, type: 'currency', total });
const count = (key: string, header: string, total = true): ReportColumn => ({ key, header, type: 'number', total });
const percent = (key: string, header: string, total = false): ReportColumn => ({ key, header, type: 'percent', total });

export const REPORT_PACK: ReportDefinition[] = [
  // ===========================================================================
  // Business overview
  // ===========================================================================
  pack({
    id: 'profit-loss-by-month',
    title: 'Profit & Loss by Month',
    description: 'Income and expenses for each month, side by side',
    icon: 'calendar_view_month',
    category: 'business-overview',
    keywords: ['p&l', 'pnl', 'income statement', 'monthly', 'trend'],
    load: load.loadProfitLossByMonth,
    // The loader adds one column per month in the range.
    columns: [text('account', 'Account'), money('total', 'Total')],
    groupBy: 'section',
  }),
  pack({
    id: 'profit-loss-comparative',
    title: 'Profit & Loss Comparison',
    description: 'This period against the same period last year',
    icon: 'compare_arrows',
    category: 'business-overview',
    keywords: ['p&l', 'pnl', 'comparative', 'previous year', 'year on year', 'variance'],
    load: load.loadProfitLossComparative,
    columns: [
      text('account', 'Account'),
      money('current', 'This period'),
      money('prior', 'Same period last year'),
      money('change', 'Change'),
      percent('changePercent', 'Change %'),
    ],
    groupBy: 'section',
  }),
  pack({
    id: 'profit-loss-percent-of-income',
    title: 'Profit & Loss as % of Income',
    description: 'Each income and expense line as a share of total income',
    icon: 'percent',
    category: 'business-overview',
    keywords: ['p&l', 'pnl', 'percentage', 'margin', 'common size'],
    load: load.loadProfitLossPercentOfIncome,
    columns: [text('account', 'Account'), money('amount', 'Amount'), percent('percent', '% of income', true)],
    groupBy: 'section',
  }),
  pack({
    id: 'income-by-account',
    title: 'Income by Account',
    description: 'Revenue per income account and its share of the total',
    icon: 'savings',
    category: 'business-overview',
    keywords: ['revenue', 'sales', 'income accounts', 'breakdown'],
    load: load.loadIncomeByAccount,
    columns: [text('account', 'Account'), money('amount', 'Amount'), percent('percent', '% of income', true)],
  }),
  pack({
    id: 'expenses-by-category',
    title: 'Expenses by Category',
    description: 'Spending per expense account and its share of the total',
    icon: 'donut_large',
    category: 'business-overview',
    keywords: ['expense breakdown', 'spending', 'costs', 'overheads'],
    load: load.loadExpensesByCategory,
    columns: [text('account', 'Account'), money('amount', 'Amount'), percent('percent', '% of expenses', true)],
  }),
  pack({
    id: 'balance-sheet-comparative',
    title: 'Balance Sheet Comparison',
    description: 'Balances on a date against the same date last year',
    icon: 'compare',
    category: 'business-overview',
    keywords: ['assets', 'liabilities', 'equity', 'comparative', 'previous year'],
    dateMode: 'asOf',
    load: load.loadBalanceSheetComparative,
    columns: [
      text('account', 'Account'),
      money('current', 'This date'),
      money('prior', 'A year earlier'),
      money('change', 'Change'),
    ],
    groupBy: 'section',
  }),
  pack({
    id: 'balance-sheet-summary',
    title: 'Balance Sheet Summary',
    description: 'Total assets, liabilities and equity on one page',
    icon: 'summarize',
    category: 'business-overview',
    keywords: ['assets', 'liabilities', 'equity', 'summary', 'net worth'],
    dateMode: 'asOf',
    load: load.loadBalanceSheetSummary,
    columns: [text('section', 'Section'), count('accounts', 'Accounts', false), money('balance', 'Balance', false)],
  }),
  pack({
    id: 'balance-sheet-detail',
    title: 'Balance Sheet Detail',
    description: 'Opening balance, movement and closing balance per balance sheet account',
    icon: 'account_balance',
    category: 'business-overview',
    keywords: ['assets', 'liabilities', 'equity', 'detail', 'movement'],
    load: load.loadBalanceSheetDetail,
    columns: [
      text('name', 'Account'),
      money('startingBalance', 'Opening'),
      money('calculatedDebitBalance', 'Debits'),
      money('calculatedCreditBalance', 'Credits'),
      money('endingBalance', 'Closing'),
    ],
    groupBy: 'ledgerGroup',
    showTotals: false,
  }),
  pack({
    id: 'changes-in-equity',
    title: 'Statement of Changes in Equity',
    description: "How the owners' equity moved during the period",
    icon: 'stacked_line_chart',
    category: 'business-overview',
    keywords: ['equity', 'retained earnings', 'capital', 'drawings', 'owners'],
    load: load.loadChangesInEquity,
    columns: [
      text('name', 'Account'),
      money('startingBalance', 'Opening'),
      money('calculatedCreditBalance', 'Increases'),
      money('calculatedDebitBalance', 'Decreases'),
      money('endingBalance', 'Closing'),
    ],
  }),

  // ===========================================================================
  // Sales and customers
  // ===========================================================================
  pack({
    id: 'sales-by-customer-summary',
    title: 'Sales by Customer Summary',
    description: 'Invoiced sales per customer',
    icon: 'groups',
    category: 'who-owes-you',
    keywords: ['customers', 'clients', 'revenue', 'invoices', 'top customers'],
    load: load.loadSalesByCustomerSummary,
    columns: [
      text('customer', 'Customer'),
      count('invoices', 'Invoices'),
      money('subtotal', 'Sales'),
      money('tax', 'Tax'),
      money('total', 'Total'),
    ],
  }),
  pack({
    id: 'sales-by-customer-detail',
    title: 'Sales by Customer Detail',
    description: 'Every invoice in the period, grouped by customer',
    icon: 'person_search',
    category: 'who-owes-you',
    keywords: ['customers', 'clients', 'revenue', 'invoices', 'detail'],
    load: load.loadSalesByCustomerDetail,
    columns: [
      date('date', 'Date'),
      text('number', 'Invoice'),
      date('dueDate', 'Due'),
      text('status', 'Status'),
      money('subtotal', 'Sales'),
      money('tax', 'Tax'),
      money('total', 'Total'),
    ],
    groupBy: 'customer',
  }),
  pack({
    id: 'sales-by-product-summary',
    title: 'Sales by Product/Service Summary',
    description: 'Quantity and value sold per product or service',
    icon: 'inventory_2',
    category: 'who-owes-you',
    keywords: ['products', 'services', 'items', 'quantity', 'best sellers'],
    load: load.loadSalesByProductSummary,
    columns: [
      text('product', 'Product/Service'),
      count('quantity', 'Quantity'),
      money('amount', 'Amount'),
      money('averagePrice', 'Average price', false),
    ],
  }),
  pack({
    id: 'sales-by-product-detail',
    title: 'Sales by Product/Service Detail',
    description: 'Every invoice line in the period, grouped by product or service',
    icon: 'list_alt',
    category: 'who-owes-you',
    keywords: ['products', 'services', 'items', 'invoice lines', 'detail'],
    load: load.loadSalesByProductDetail,
    columns: [
      date('date', 'Date'),
      text('number', 'Invoice'),
      text('customer', 'Customer'),
      text('description', 'Description'),
      count('quantity', 'Qty'),
      money('unitPrice', 'Price', false),
      money('amount', 'Amount'),
    ],
    groupBy: 'product',
  }),
  pack({
    id: 'invoice-list',
    title: 'Invoice List',
    description: 'All invoices dated in the period, with what has been paid',
    icon: 'receipt',
    category: 'who-owes-you',
    keywords: ['invoices', 'billing', 'sales', 'list'],
    load: load.loadInvoiceList,
    columns: [
      date('date', 'Date'),
      text('number', 'Invoice'),
      text('customer', 'Customer'),
      date('dueDate', 'Due'),
      text('status', 'Status'),
      money('total', 'Total'),
      money('paid', 'Paid'),
      money('balance', 'Balance'),
    ],
  }),
  pack({
    id: 'customer-balance-summary',
    title: 'Customer Balance Summary',
    description: 'What each customer owed on a date',
    icon: 'account_circle',
    category: 'who-owes-you',
    keywords: ['receivables', 'outstanding', 'owed', 'debtors', 'customers'],
    dateMode: 'asOf',
    load: load.loadCustomerBalanceSummary,
    columns: [text('customer', 'Customer'), count('invoices', 'Open invoices'), money('balance', 'Balance')],
  }),
  pack({
    id: 'customer-balance-detail',
    title: 'Customer Balance Detail',
    description: 'Each unpaid invoice on a date, grouped by customer',
    icon: 'manage_accounts',
    category: 'who-owes-you',
    keywords: ['receivables', 'outstanding', 'owed', 'debtors', 'unpaid invoices'],
    dateMode: 'asOf',
    load: load.loadCustomerBalanceDetail,
    columns: [
      date('date', 'Date'),
      text('number', 'Invoice'),
      date('dueDate', 'Due'),
      money('total', 'Total'),
      money('paid', 'Paid'),
      money('balance', 'Balance'),
    ],
    groupBy: 'customer',
  }),
  pack({
    id: 'income-by-customer',
    title: 'Income by Customer',
    description: 'Income earned and received per customer account',
    icon: 'paid',
    category: 'who-owes-you',
    keywords: ['client income', 'customers', 'received', 'collected'],
    load: load.loadIncomeByCustomer,
    columns: [
      text('customer', 'Customer'),
      money('income', 'Income'),
      money('paid', 'Received'),
      money('unpaid', 'Not yet received'),
    ],
  }),

  // ===========================================================================
  // Expenses and vendors
  // ===========================================================================
  pack({
    id: 'expenses-by-vendor-summary',
    title: 'Expenses by Vendor Summary',
    description: 'Billed expenses per vendor',
    icon: 'storefront',
    category: 'what-you-owe',
    keywords: ['vendors', 'suppliers', 'bills', 'spending', 'purchases'],
    load: load.loadExpensesByVendorSummary,
    columns: [
      text('vendor', 'Vendor'),
      count('bills', 'Bills'),
      money('subtotal', 'Amount'),
      money('tax', 'Tax'),
      money('total', 'Total'),
    ],
  }),
  pack({
    id: 'expenses-by-vendor-detail',
    title: 'Expenses by Vendor Detail',
    description: 'Every bill in the period, grouped by vendor',
    icon: 'local_shipping',
    category: 'what-you-owe',
    keywords: ['vendors', 'suppliers', 'bills', 'spending', 'detail'],
    load: load.loadExpensesByVendorDetail,
    columns: [
      date('date', 'Date'),
      text('number', 'Bill'),
      date('dueDate', 'Due'),
      text('status', 'Status'),
      money('subtotal', 'Amount'),
      money('tax', 'Tax'),
      money('total', 'Total'),
    ],
    groupBy: 'vendor',
  }),
  pack({
    id: 'vendor-purchases',
    title: 'Purchases by Vendor',
    description: 'Purchases recorded in the ledger per vendor, and how much is paid',
    icon: 'shopping_cart',
    category: 'what-you-owe',
    keywords: ['vendors', 'suppliers', 'purchases', 'paid', 'ledger'],
    load: load.loadVendorPurchases,
    columns: [
      text('vendor', 'Vendor'),
      money('purchases', 'Purchases'),
      money('paid', 'Paid'),
      money('unpaid', 'Not yet paid'),
    ],
  }),
  pack({
    id: 'bill-list',
    title: 'Bill List',
    description: 'All bills dated in the period, with what has been paid',
    icon: 'request_quote',
    category: 'what-you-owe',
    keywords: ['bills', 'expenses', 'payables', 'list'],
    load: load.loadBillList,
    columns: [
      date('date', 'Date'),
      text('number', 'Bill'),
      text('vendor', 'Vendor'),
      date('dueDate', 'Due'),
      text('status', 'Status'),
      money('total', 'Total'),
      money('paid', 'Paid'),
      money('balance', 'Balance'),
    ],
  }),
  pack({
    id: 'vendor-balance-summary',
    title: 'Vendor Balance Summary',
    description: 'What you owed each vendor on a date',
    icon: 'store',
    category: 'what-you-owe',
    keywords: ['payables', 'outstanding', 'owed', 'creditors', 'vendors'],
    dateMode: 'asOf',
    load: load.loadVendorBalanceSummary,
    columns: [text('vendor', 'Vendor'), count('bills', 'Open bills'), money('balance', 'Balance')],
  }),
  pack({
    id: 'vendor-balance-detail',
    title: 'Vendor Balance Detail',
    description: 'Each unpaid bill on a date, grouped by vendor',
    icon: 'pending_actions',
    category: 'what-you-owe',
    keywords: ['payables', 'outstanding', 'owed', 'creditors', 'unpaid bills'],
    dateMode: 'asOf',
    load: load.loadVendorBalanceDetail,
    columns: [
      date('date', 'Date'),
      text('number', 'Bill'),
      date('dueDate', 'Due'),
      money('total', 'Total'),
      money('paid', 'Paid'),
      money('balance', 'Balance'),
    ],
    groupBy: 'vendor',
  }),
  pack({
    id: 'transaction-list-by-vendor',
    title: 'Transaction List by Vendor',
    description: 'Bills and bill payments in the period, grouped by vendor',
    icon: 'swap_vert',
    category: 'what-you-owe',
    keywords: ['vendors', 'suppliers', 'bills', 'payments', 'activity', 'transactions'],
    load: load.loadTransactionListByVendor,
    columns: [
      date('date', 'Date'),
      text('type', 'Type'),
      text('number', 'Bill'),
      text('reference', 'Reference'),
      money('billed', 'Billed'),
      money('paid', 'Paid'),
    ],
    groupBy: 'vendor',
  }),
  pack({
    id: 'purchases-by-product',
    title: 'Purchases by Product/Service',
    description: 'Quantity and value bought per product or service',
    icon: 'shopping_bag',
    category: 'what-you-owe',
    keywords: ['purchases', 'bill lines', 'items', 'products', 'services'],
    load: load.loadPurchasesByProduct,
    columns: [
      text('product', 'Product/Service'),
      count('quantity', 'Quantity'),
      money('amount', 'Amount'),
      money('averagePrice', 'Average price', false),
    ],
  }),

  // ===========================================================================
  // Taxes
  // ===========================================================================
  pack({
    id: 'tax-liability',
    title: 'Tax Liability',
    description: 'Tax collected on sales less tax paid on purchases',
    icon: 'gavel',
    category: 'taxes',
    keywords: ['vat', 'sales tax', 'gst', 'nhil', 'tax owed', 'tax return'],
    load: load.loadTaxLiability,
    columns: [text('item', 'Item'), money('taxable', 'Taxable amount'), money('tax', 'Tax')],
  }),
  pack({
    id: 'tax-detail',
    title: 'Sales Tax Detail',
    description: 'Tax on every invoice dated in the period',
    icon: 'receipt_long',
    category: 'taxes',
    keywords: ['vat', 'sales tax', 'gst', 'invoices', 'detail'],
    load: load.loadTaxDetail,
    columns: [
      date('date', 'Date'),
      text('number', 'Invoice'),
      text('customer', 'Customer'),
      money('sales', 'Sales'),
      money('tax', 'Tax'),
      money('total', 'Total'),
    ],
  }),
  pack({
    id: 'tax-summary-by-rate',
    title: 'Sales Tax by Rate',
    description: 'Tax collected per tax and rate',
    icon: 'pie_chart',
    category: 'taxes',
    keywords: ['vat', 'sales tax', 'rates', 'tax codes', 'summary'],
    load: load.loadTaxSummaryByRate,
    columns: [
      text('tax', 'Tax'),
      percent('rate', 'Rate'),
      count('invoices', 'Invoices'),
      money('collected', 'Tax collected'),
    ],
  }),
  pack({
    id: 'tax-on-purchases',
    title: 'Purchase Tax Detail',
    description: 'Tax on every bill dated in the period',
    icon: 'request_page',
    category: 'taxes',
    keywords: ['vat', 'input tax', 'reclaimable', 'bills', 'purchases'],
    load: load.loadTaxOnPurchases,
    columns: [
      date('date', 'Date'),
      text('number', 'Bill'),
      text('vendor', 'Vendor'),
      money('subtotal', 'Amount'),
      money('tax', 'Tax'),
      money('total', 'Total'),
    ],
  }),

  // ===========================================================================
  // Banking
  // ===========================================================================
  pack({
    id: 'deposit-detail',
    title: 'Deposit Detail',
    description: 'Every customer payment received in the period',
    icon: 'move_to_inbox',
    category: 'banking',
    keywords: ['deposits', 'receipts', 'payments received', 'bank'],
    load: load.loadDepositDetail,
    columns: [
      date('date', 'Date'),
      text('customer', 'Customer'),
      text('number', 'Invoice'),
      text('method', 'Method'),
      text('account', 'Deposited to'),
      text('reference', 'Reference'),
      money('amount', 'Amount'),
    ],
  }),
  pack({
    id: 'deposits-by-method',
    title: 'Deposits by Payment Method',
    description: 'Customer payments received per payment method',
    icon: 'credit_card',
    category: 'banking',
    keywords: ['deposits', 'receipts', 'mobile money', 'cash', 'bank transfer', 'method'],
    load: load.loadDepositsByMethod,
    columns: [text('method', 'Payment method'), count('payments', 'Payments'), money('amount', 'Amount')],
  }),
  pack({
    id: 'cheque-detail',
    title: 'Cheque Detail',
    description: 'Bill payments made by cheque in the period',
    icon: 'edit_note',
    category: 'banking',
    keywords: ['cheques', 'checks', 'payments made', 'bank'],
    load: load.loadChequeDetail,
    columns: [
      date('date', 'Date'),
      text('vendor', 'Payee'),
      text('number', 'Bill'),
      text('reference', 'Cheque no.'),
      text('account', 'Paid from'),
      money('amount', 'Amount'),
    ],
  }),
  pack({
    id: 'payments-made',
    title: 'Payments Made',
    description: 'Every bill payment made in the period, by any method',
    icon: 'outbox',
    category: 'banking',
    keywords: ['payments', 'bill payments', 'paid out', 'bank'],
    load: load.loadPaymentsMade,
    columns: [
      date('date', 'Date'),
      text('vendor', 'Vendor'),
      text('number', 'Bill'),
      text('method', 'Method'),
      text('reference', 'Reference'),
      text('account', 'Paid from'),
      money('amount', 'Amount'),
    ],
  }),

  // ===========================================================================
  // For my accountant
  // ===========================================================================
  pack({
    id: 'general-ledger',
    title: 'General Ledger',
    description: 'Every transaction per account, with a running balance',
    icon: 'menu_book',
    category: 'for-my-accountant',
    keywords: ['ledger', 'gl', 'account transactions', 'running balance'],
    load: load.loadGeneralLedger,
    columns: [
      date('date', 'Date'),
      text('description', 'Description'),
      money('debit', 'Debit'),
      money('credit', 'Credit'),
      money('balance', 'Balance', false),
    ],
    groupBy: 'account',
    showTotals: false,
  }),
  pack({
    id: 'journal',
    title: 'Journal',
    description: 'Every journal entry in the period with its debit and credit lines',
    icon: 'book',
    category: 'for-my-accountant',
    keywords: ['journal entries', 'double entry', 'debits', 'credits', 'postings'],
    load: load.loadJournal,
    columns: [
      text('account', 'Account'),
      text('description', 'Description'),
      money('debit', 'Debit'),
      money('credit', 'Credit'),
    ],
    groupBy: 'entry',
  }),
  pack({
    id: 'transaction-list-by-date',
    title: 'Transaction List by Date',
    description: 'Every ledger line in the period, in date order',
    icon: 'event_note',
    category: 'for-my-accountant',
    keywords: ['transactions', 'ledger', 'activity', 'date order'],
    load: load.loadTransactionListByDate,
    columns: [
      date('date', 'Date'),
      text('account', 'Account'),
      text('description', 'Description'),
      money('debit', 'Debit'),
      money('credit', 'Credit'),
    ],
  }),
  pack({
    id: 'account-list',
    title: 'Account List',
    description: 'The chart of accounts with each balance on a date',
    icon: 'format_list_numbered',
    category: 'for-my-accountant',
    keywords: ['chart of accounts', 'coa', 'accounts', 'codes', 'balances'],
    dateMode: 'asOf',
    load: load.loadAccountList,
    columns: [
      text('code', 'Code'),
      text('account', 'Account'),
      text('category', 'Category'),
      money('balance', 'Balance'),
    ],
    groupBy: 'type',
    showTotals: false,
  }),
];
