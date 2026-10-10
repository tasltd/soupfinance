/**
 * SOUPFIN-81: "? Need Help?" links and the user guide's logo.
 *
 * Covers the link itself, that every section it can point at really exists in
 * the guide, the route-to-section maps used by the shared Settings and sign-in
 * layouts, that every page header carries a link, and that the guide masthead
 * shows the same logo as the app.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { HelpLink } from '../HelpLink';
import {
  HELP_SECTIONS,
  USER_GUIDE_URL,
  authHelpSection,
  helpUrl,
  settingsHelpSection,
} from '../helpSections';
import { ApiErrorState } from '../../feedback/ApiErrorState';
import { ModuleDisabledBanner } from '../../feedback/ModuleDisabledBanner';
import SettingsLayout from '../../../features/settings/SettingsLayout';

// The GSAP background animation is irrelevant here and needs a real layout engine.
vi.mock('../../../hooks/useGsapAnimations', () => ({ useLoginBackground: () => ({ current: null }) }));
import { AuthLayout } from '../../layout/AuthLayout';
import { jpegSize, sizeGuideImages } from '../../../../scripts/size-user-guide-images.mjs';

const ROOT = resolve(__dirname, '../../../..');
const GUIDE_HTML = readFileSync(resolve(ROOT, 'public/user-guide/index.html'), 'utf8');
const GUIDE_CSS = readFileSync(resolve(ROOT, 'public/user-guide/styles.css'), 'utf8');

function md5(path: string) {
  return createHash('md5').update(readFileSync(path)).digest('hex');
}

// Duck-typed axios error, as in src/api/__tests__/errors.test.ts (axios is mocked globally).
function axiosError(status: number, url: string) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    config: { url },
    response: { status, data: {} },
  });
}

describe('HelpLink', () => {
  it('reads "Need Help?" behind a question-mark icon the screen reader skips', () => {
    render(<HelpLink section="invoices" />);
    const link = screen.getByTestId('help-link-invoices');

    expect(link).toHaveTextContent(/^help\s*Need Help\?/);
    const icon = link.querySelector('.material-symbols-outlined');
    expect(icon).toHaveTextContent('help');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    // The icon ligature must not leak into the accessible name (SOUPFIN-63).
    expect(screen.getByRole('link', { name: /^Need Help\? *\(opens the user guide in a new tab\)$/ })).toBe(link);
  });

  it('opens that section of the guide in a new tab, without an opener', () => {
    render(<HelpLink section="trial-balance" />);
    const link = screen.getByTestId('help-link-trial-balance');

    expect(link).toHaveAttribute('href', '/user-guide/index.html#trial-balance');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAttribute('data-help-section', 'trial-balance');
  });

  it('keeps its own classes when given more, and takes a custom test id', () => {
    render(<HelpLink section="users" className="mt-1" testId="custom-help" />);
    const link = screen.getByTestId('custom-help');

    expect(link.className).toContain('mt-1');
    expect(link.className).toContain('text-primary');
  });

  it('builds every section URL against index.html, never the bare directory', () => {
    expect(USER_GUIDE_URL).toBe('/user-guide/index.html');
    for (const section of HELP_SECTIONS) {
      expect(helpUrl(section)).toBe(`/user-guide/index.html#${section}`);
    }
  });
});

describe('Guide sections a link can point at', () => {
  it.each(HELP_SECTIONS.map((s) => [s]))('#%s exists exactly once in the guide', (section) => {
    const matches = GUIDE_HTML.match(new RegExp(`id="${section}"`, 'g')) ?? [];
    expect(matches).toHaveLength(1);
  });

  it('lists no section twice', () => {
    expect(new Set(HELP_SECTIONS).size).toBe(HELP_SECTIONS.length);
  });
});

describe('authHelpSection', () => {
  it.each([
    ['/login', 'sign-in'],
    ['/verify', 'sign-in'],
    ['/register', 'register'],
    ['/confirm-email', 'register'],
    ['/resend-confirmation', 'register'],
    ['/forgot-password', 'password'],
    ['/reset-password', 'password'],
  ])('%s opens #%s', (path, section) => {
    expect(authHelpSection(path)).toBe(section);
  });

  it('falls back to sign-in for an empty, root or unknown path', () => {
    expect(authHelpSection('')).toBe('sign-in');
    expect(authHelpSection('/')).toBe('sign-in');
    expect(authHelpSection('/no-such-page')).toBe('sign-in');
  });

  it('copes with a very long path', () => {
    expect(authHelpSection(`/reset-password/${'x'.repeat(10000)}`)).toBe('password');
    expect(authHelpSection(`/${'register'.repeat(1000)}`)).toBe('register');
  });
});

describe('settingsHelpSection', () => {
  it.each([
    ['/settings', 'settings'],
    ['/settings/', 'settings'],
    ['/settings/users', 'users'],
    ['/settings/users/new', 'users'],
    ['/settings/users/abc-123', 'users'],
    ['/settings/bank-accounts', 'bank-accounts'],
    ['/settings/bank-accounts/new', 'bank-accounts'],
    ['/settings/account', 'account-settings'],
  ])('%s opens #%s', (path, section) => {
    expect(settingsHelpSection(path)).toBe(section);
  });

  it('falls back to the Settings overview for an empty or unknown path', () => {
    expect(settingsHelpSection('')).toBe('settings');
    expect(settingsHelpSection('/settings/nothing-here')).toBe('settings');
    expect(settingsHelpSection(`/settings/${'y'.repeat(10000)}`)).toBe('settings');
  });
});

describe('Layouts pick the section from the route', () => {
  it.each([
    ['/settings', 'settings'],
    ['/settings/users', 'users'],
    ['/settings/bank-accounts/new', 'bank-accounts'],
    ['/settings/account', 'account-settings'],
  ])('Settings header at %s links to #%s', (path, section) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/settings/*" element={<SettingsLayout />} />
        </Routes>
      </MemoryRouter>,
    );
    const link = screen.getByTestId('help-link-settings-page');
    expect(link).toHaveAttribute('href', `/user-guide/index.html#${section}`);
  });

  it.each([
    ['/login', 'sign-in'],
    ['/register', 'register'],
    ['/forgot-password', 'password'],
  ])('sign-in layout at %s links to #%s', (path, section) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<AuthLayout />}>
            <Route path={path} element={<p>form</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('help-link-auth-page')).toHaveAttribute('href', `/user-guide/index.html#${section}`);
  });
});

describe('Module-not-enabled errors link to the guide answer', () => {
  it('ApiErrorState shows the link for a module-gated 403', () => {
    render(<ApiErrorState error={axiosError(403, '/ledgerAccount/index.json')} onRetry={() => {}} />);
    const card = screen.getByTestId('api-error-state');
    expect(within(card).getByTestId('help-link-module-not-enabled')).toHaveAttribute(
      'href',
      '/user-guide/index.html#module-not-enabled',
    );
  });

  it.each([
    [500, '/invoice/index.json'],
    [404, '/invoice/show/x.json'],
    [403, '/invoice/index.json'],
  ])('ApiErrorState shows no such link for %s on %s', (status, url) => {
    render(<ApiErrorState error={axiosError(status, url)} onRetry={() => {}} />);
    expect(screen.queryByTestId('help-link-module-not-enabled')).not.toBeInTheDocument();
  });

  it('ApiErrorState shows no link for an empty error', () => {
    render(<ApiErrorState error={null} />);
    expect(screen.queryByTestId('help-link-module-not-enabled')).not.toBeInTheDocument();
  });

  it('ModuleDisabledBanner carries the link', () => {
    render(<ModuleDisabledBanner error={axiosError(403, '/voucher/index.json')} />);
    expect(within(screen.getByTestId('module-disabled-banner')).getByTestId('help-link-module-not-enabled')).toBeVisible();
  });
});

describe('Every page header carries a "Need Help?" link', () => {
  // Page file → the guide sections it must link to. The first is the header link.
  const PAGES: Record<string, string[]> = {
    'dashboard/DashboardPage.tsx': ['dashboard', 'recent-invoices'],
    'clients/ClientListPage.tsx': ['clients'],
    'clients/ClientFormPage.tsx': ['add-client'],
    'clients/ClientDetailPage.tsx': ['clients'],
    'invoices/InvoiceListPage.tsx': ['invoices'],
    'invoices/InvoiceFormPage.tsx': ['create-invoice'],
    'invoices/InvoiceDetailPage.tsx': ['view-invoice', 'record-payment'],
    'vendors/VendorListPage.tsx': ['vendors'],
    'vendors/VendorFormPage.tsx': ['vendors'],
    'vendors/VendorDetailPage.tsx': ['vendors'],
    'bills/BillListPage.tsx': ['bills'],
    'bills/BillFormPage.tsx': ['record-bill'],
    'bills/BillDetailPage.tsx': ['bills', 'record-payment'],
    'payments/PaymentListPage.tsx': ['payments'],
    'payments/PaymentFormPage.tsx': ['record-payment'],
    'ledger/ChartOfAccountsPage.tsx': ['chart-of-accounts'],
    'ledger/LedgerTransactionsPage.tsx': ['ledger-transactions'],
    'accounting/TransactionRegisterPage.tsx': ['transaction-register'],
    'accounting/JournalEntryPage.tsx': ['journal-entry'],
    'accounting/VoucherFormPage.tsx': ['vouchers'],
    'reports/ReportsPage.tsx': ['reports'],
    // Changed (SOUPFIN-103): the report pages render their header through
    // <ReportShell>, so their link is checked in the block below instead.
    'reports/ScheduledReportsPage.tsx': ['scheduled-reports'],
    // Added (SOUPFIN-84): the four company verification (KYC) wizard steps
    'corporate/CompanyInfoPage.tsx': ['kyc-company-details'],
    'corporate/DirectorsPage.tsx': ['kyc-directors'],
    'corporate/DocumentsPage.tsx': ['kyc-documents'],
    'corporate/KycStatusPage.tsx': ['kyc-status'],
  };

  it.each(Object.entries(PAGES))('%s links to %j', (file, sections) => {
    const source = readFileSync(resolve(ROOT, 'src/features', file), 'utf8');
    for (const section of sections) {
      expect(source).toContain(`<HelpLink section="${section}"`);
    }
    // The header link sits directly under the page subtitle, after the <h1>.
    const h1 = source.indexOf('<h1');
    expect(h1).toBeGreaterThan(-1);
    expect(source.indexOf(`<HelpLink section="${sections[0]}"`, h1)).toBeGreaterThan(h1);
  });
});

// Added (SOUPFIN-103): report pages get their header from <ReportShell>, which
// renders the registry entry's helpSection. Pin the shell, the registry and the
// pages, so a report can neither lose its link nor point at the wrong section.
describe('Report pages carry their "Need Help?" link through the shell (SOUPFIN-103)', () => {
  const SHELL = readFileSync(resolve(ROOT, 'src/features/reports/ReportShell.tsx'), 'utf8');

  it('the shell renders the page help link directly under its <h1>', () => {
    const h1 = SHELL.indexOf('<h1');
    expect(h1).toBeGreaterThan(-1);
    expect(SHELL.indexOf('<HelpLink section={page.helpSection}', h1)).toBeGreaterThan(h1);
  });

  // Page file → the registry entry it renders → the section that entry must name.
  const REPORT_PAGES: [string, string, string][] = [
    ['reports/ProfitLossPage.tsx', 'profit-loss', 'profit-loss'],
    ['reports/BalanceSheetPage.tsx', 'balance-sheet', 'balance-sheet'],
    ['reports/CashFlowPage.tsx', 'cash-flow', 'cash-flow'],
    ['reports/AgingReportsPage.tsx', 'ar-aging', 'aging'],
    ['reports/TrialBalancePage.tsx', 'trial-balance', 'trial-balance'],
  ];

  it.each(REPORT_PAGES)('%s renders registry entry %s, whose section is %s', async (file, reportId, section) => {
    const { getReportDefinition } = await import('../../../features/reports/reportRegistry');
    const source = readFileSync(resolve(ROOT, 'src/features', file), 'utf8');
    expect(source).toContain('<ReportShell');
    expect(source).toContain(`getReportDefinition('${reportId}')`);
    expect(getReportDefinition(reportId).page.helpSection).toBe(section);
  });

  it('every registered report points at a section that exists in the guide', async () => {
    const { REPORTS } = await import('../../../features/reports/reportRegistry');
    for (const report of REPORTS) {
      expect(report.page.helpSection, report.id).toBeDefined();
      expect(HELP_SECTIONS).toContain(report.page.helpSection);
      expect(GUIDE_HTML).toContain(`id="${report.page.helpSection}"`);
    }
  });

  it('Trial Balance still links the "does not balance" answer beside its status', () => {
    const source = readFileSync(resolve(ROOT, 'src/features/reports/TrialBalancePage.tsx'), 'utf8');
    expect(source).toContain('<HelpLink section="trial-balance-unbalanced"');
  });
});

describe('User guide logo matches the app (SOUPFIN-81)', () => {
  const masthead = GUIDE_HTML.slice(GUIDE_HTML.indexOf('<header class="masthead">'), GUIDE_HTML.indexOf('</header>'));

  it('shows the app logo image, not the old orange "S" placeholder', () => {
    expect(masthead).toContain('<img class="masthead__mark" src="../logo.png"');
    expect(masthead).not.toMatch(/<span class="masthead__mark">S<\/span>/);
  });

  it('points at the same file the app bundles for its logo', () => {
    // ../logo.png from /user-guide/index.html resolves to public/logo.png.
    const guideLogo = resolve(ROOT, 'public/user-guide', '../logo.png');
    expect(existsSync(guideLogo)).toBe(true);
    expect(md5(guideLogo)).toBe(md5(resolve(ROOT, 'src/assets/logo.png')));
  });

  it('marks the image decorative, since the wordmark beside it names the product', () => {
    expect(masthead).toMatch(/<img class="masthead__mark"[^>]*alt=""/);
    expect(masthead).toContain('<span class="masthead__soup">Soup</span><span class="masthead__finance">Finance</span>');
  });

  it('colours the wordmark as the app sidebar does: "Soup" in text colour, "Finance" in primary', () => {
    const sideNav = readFileSync(resolve(ROOT, 'src/components/layout/SideNav.tsx'), 'utf8');
    expect(sideNav).toMatch(/<Logo variant="mark"[\s\S]*<span>Soup<\/span>\s*<span className="text-primary">Finance<\/span>/);
    expect(GUIDE_CSS).toMatch(/--primary:\s*#f24a0d;/);
    expect(GUIDE_CSS).toMatch(/--text:\s*#181311;/);
    expect(GUIDE_CSS).toMatch(/\.masthead__soup\s*{\s*color:\s*var\(--text\);/);
    expect(GUIDE_CSS).toMatch(/\.masthead__finance\s*{\s*color:\s*var\(--primary\);/);
  });
});

describe('Guide screenshots reserve their space before loading (SOUPFIN-81)', () => {
  // Without width/height, images above a #section load after the jump and push
  // the section out of view: a "Need Help?" link lands on the wrong content.
  const images = [...GUIDE_HTML.matchAll(/<img src="(images\/[^"]+)"[^>]*>/g)];

  it('finds the guide screenshots', () => {
    expect(images.length).toBeGreaterThanOrEqual(30);
  });

  it.each(images.map((m) => [m[1], m[0]]))('%s carries its real pixel size', (src, tag) => {
    const { width, height } = jpegSize(readFileSync(resolve(ROOT, 'public/user-guide', src)));
    expect(tag, 'run: node scripts/size-user-guide-images.mjs').toContain(`width="${width}" height="${height}"`);
  });

  it('is already what the sizing script would write', () => {
    expect(sizeGuideImages(GUIDE_HTML)).toBe(GUIDE_HTML);
  });

  it('rejects an empty or non-JPEG file rather than guessing a size', () => {
    expect(() => jpegSize(Buffer.alloc(0))).toThrow();
    expect(() => jpegSize(readFileSync(resolve(ROOT, 'public/logo.png')))).toThrow('Not a JPEG');
  });

  it('replaces stale sizes instead of adding a second pair', () => {
    const stale = '<img src="images/login.jpg" alt="x" width="1" height="2">';
    const fixed = sizeGuideImages(stale);
    expect(fixed.match(/width=/g)).toHaveLength(1);
    expect(fixed).toMatch(/width="\d{3,}" height="\d{3,}">$/);
  });
});
