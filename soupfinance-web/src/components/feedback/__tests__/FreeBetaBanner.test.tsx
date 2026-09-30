/**
 * Unit tests for FreeBetaBanner (SOUPFIN-89).
 *
 * The banner tells every user that SoupFinance is free for one year of beta,
 * until November 2027. It must read correctly in all four app languages, and
 * it must disappear once the offer has ended rather than keep promising it.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { act } from 'react';
import i18n from '../../../i18n';
import en from '../../../i18n/locales/en/common.json';
import de from '../../../i18n/locales/de/common.json';
import fr from '../../../i18n/locales/fr/common.json';
import nl from '../../../i18n/locales/nl/common.json';
import { FreeBetaBanner } from '../FreeBetaBanner';
import { isFreeBetaActive, FREE_BETA_LAST_DAY } from '../freeBeta';

// Inside the offer: the day this ticket was worked.
const DURING_BETA = new Date(2026, 8, 30, 12, 0, 0);

describe('FreeBetaBanner (SOUPFIN-89)', () => {
  afterEach(async () => {
    await act(() => i18n.changeLanguage('en'));
  });

  it('states the free beta offer in English', async () => {
    await act(() => i18n.changeLanguage('en'));
    render(<FreeBetaBanner now={DURING_BETA} />);

    const banner = screen.getByTestId('free-beta-banner');
    expect(banner).toHaveAttribute('role', 'status');
    expect(screen.getByTestId('free-beta-banner-title')).toHaveTextContent('Free beta until November 2027');
    expect(screen.getByTestId('free-beta-banner-message')).toHaveTextContent(
      'All users get one free year of beta access until November 2027.'
    );
  });

  it.each([
    ['de', de.freeBeta.title, 'November 2027'],
    ['fr', fr.freeBeta.title, 'novembre 2027'],
    ['nl', nl.freeBeta.title, 'november 2027'],
  ])('switches to %s with the language switcher', async (lang, title, month) => {
    await act(() => i18n.changeLanguage(lang));
    render(<FreeBetaBanner now={DURING_BETA} />);

    expect(screen.getByTestId('free-beta-banner-title')).toHaveTextContent(title);
    expect(screen.getByTestId('free-beta-banner-title')).not.toHaveTextContent('Free beta');
    expect(screen.getByTestId('free-beta-banner-message')).toHaveTextContent(month);
  });

  it('carries a title and message naming November 2027 in every locale file', () => {
    for (const [lang, file, month] of [
      ['en', en, 'November 2027'],
      ['de', de, 'November 2027'],
      ['fr', fr, 'novembre 2027'],
      ['nl', nl, 'november 2027'],
    ] as const) {
      expect(file.freeBeta.title, lang).toContain(month);
      expect(file.freeBeta.message, lang).toContain(month);
      // The message is one sentence, not a paragraph.
      expect(file.freeBeta.message.length, lang).toBeLessThan(120);
    }
  });

  it('uses a caller-supplied test id and class', () => {
    render(<FreeBetaBanner now={DURING_BETA} testId="register-free-beta" className="mb-4" />);

    expect(screen.getByTestId('register-free-beta')).toHaveClass('mb-4');
    expect(screen.getByTestId('register-free-beta-title')).toBeInTheDocument();
  });

  it('shows on the last day of November 2027', () => {
    render(<FreeBetaBanner now={new Date(2027, 10, 30, 23, 59, 0)} />);
    expect(screen.getByTestId('free-beta-banner')).toBeInTheDocument();
  });

  it('renders nothing once the offer has ended', () => {
    const { container } = render(<FreeBetaBanner now={new Date(2027, 11, 1, 0, 0, 0)} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('free-beta-banner')).toBeNull();
  });
});

describe('isFreeBetaActive (SOUPFIN-89)', () => {
  it('ends on the last millisecond of 30 November 2027, local time', () => {
    expect(FREE_BETA_LAST_DAY.getFullYear()).toBe(2027);
    expect(FREE_BETA_LAST_DAY.getMonth()).toBe(10); // November
    expect(FREE_BETA_LAST_DAY.getDate()).toBe(30);

    expect(isFreeBetaActive(FREE_BETA_LAST_DAY)).toBe(true);
    expect(isFreeBetaActive(new Date(FREE_BETA_LAST_DAY.getTime() + 1))).toBe(false);
  });

  it('is active from the start of time up to the end date (zero edge)', () => {
    expect(isFreeBetaActive(new Date(0))).toBe(true);
    expect(isFreeBetaActive(DURING_BETA)).toBe(true);
  });

  it('stays off for any date after the offer (overflow edge)', () => {
    expect(isFreeBetaActive(new Date(2027, 11, 1))).toBe(false);
    expect(isFreeBetaActive(new Date(2099, 0, 1))).toBe(false);
    expect(isFreeBetaActive(new Date(8.64e15))).toBe(false); // max representable date
  });

  it('defaults to the current clock', () => {
    // Today is inside the beta; this fails loudly once the offer has lapsed,
    // which is when the banner itself should be removed.
    expect(isFreeBetaActive()).toBe(Date.now() <= FREE_BETA_LAST_DAY.getTime());
  });
});
