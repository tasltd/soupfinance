/**
 * SOUPFIN-75 — the user guide written for SOUPFIN-52 had no route in the app,
 * and the sidebar Help button had no click handler. These tests pin:
 *
 *  1. /help renders the guide, embedded from the static file in public/.
 *  2. A hash on /help is passed through so a screen can deep-link a section.
 *  3. Clicking Help in the sidebar actually lands on /help.
 *  4. The file the iframe points at exists, and the sections we deep-link to
 *     are real anchors in it — an iframe on a missing file renders the SPA
 *     fallback silently, which no DOM assertion above would notice.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { HelpPage, USER_GUIDE_URL } from '../HelpPage';
import { SideNav } from '../../../components/layout/SideNav';
import { useUIStore } from '../../../stores';

const GUIDE_FILE = resolve(__dirname, '../../../../public', USER_GUIDE_URL.replace(/^\//, ''));

function renderHelpAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/help" element={<HelpPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('HelpPage (SOUPFIN-75)', () => {
  it('embeds the static user guide', () => {
    renderHelpAt('/help');
    expect(screen.getByRole('heading', { level: 1, name: 'Help' })).toBeInTheDocument();
    const frame = screen.getByTitle('SoupFinance user guide');
    expect(frame.tagName).toBe('IFRAME');
    expect(frame).toHaveAttribute('src', '/user-guide/index.html');
  });

  it('points at index.html, never the bare directory the SPA fallback would catch', () => {
    expect(USER_GUIDE_URL).toBe('/user-guide/index.html');
  });

  it('offers the guide in a new tab, safely', () => {
    renderHelpAt('/help');
    const link = screen.getByRole('link', { name: 'Open in new tab' });
    expect(link).toHaveAttribute('href', '/user-guide/index.html');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('passes a section hash through to the frame and the new-tab link', () => {
    renderHelpAt('/help#invoices');
    expect(screen.getByTitle('SoupFinance user guide')).toHaveAttribute(
      'src',
      '/user-guide/index.html#invoices'
    );
    expect(screen.getByRole('link', { name: 'Open in new tab' })).toHaveAttribute(
      'href',
      '/user-guide/index.html#invoices'
    );
  });

  it('passes an unknown or very long hash through verbatim without breaking the page', () => {
    const longHash = `#${'x'.repeat(2000)}`;
    renderHelpAt(`/help${longHash}`);
    expect(screen.getByTitle('SoupFinance user guide')).toHaveAttribute(
      'src',
      `/user-guide/index.html${longHash}`
    );
    expect(screen.getByTestId('help-page')).toBeInTheDocument();
  });
});

describe('Sidebar Help link reaches the guide (SOUPFIN-75)', () => {
  beforeEach(() => {
    useUIStore.setState({ sidebarCollapsed: false, mobileSidebarOpen: false });
  });

  it('navigates to /help when clicked, and marks itself active there', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <SideNav />
        <Routes>
          <Route path="/dashboard" element={<p>dashboard body</p>} />
          <Route path="/help" element={<HelpPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.queryByTestId('help-page')).not.toBeInTheDocument();
    const help = screen.getByRole('link', { name: 'Help' });
    expect(help.className).not.toContain('bg-primary/10');

    await user.click(help);

    expect(screen.getByTestId('help-page')).toBeInTheDocument();
    expect(screen.queryByText('dashboard body')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Help' }).className).toContain('bg-primary/10');
  });
});

describe('The embedded guide file (SOUPFIN-75)', () => {
  it('exists where the iframe points', () => {
    expect(existsSync(GUIDE_FILE)).toBe(true);
  });

  it('carries the section anchors a deep link would target', () => {
    const html = readFileSync(GUIDE_FILE, 'utf8');
    expect(html).toContain('<title>SoupFinance | User Guide</title>');
    for (const id of ['introduction', 'invoices', 'bills', 'reports', 'settings', 'support']) {
      expect(html).toMatch(new RegExp(`id="${id}"`));
    }
  });
});
