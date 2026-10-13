/**
 * translateApiError (SOUPFIN-164): parseApiError's copy in the user's language.
 *
 * English must be byte-for-byte what parseApiError already said, for every kind of
 * error, so translating cannot change the English UI. Other languages get the
 * translated copy, and a message the server sent is shown as sent.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import i18n from '../index';
import { parseApiError } from '../../api/errors';
import { translateApiError, getTranslatedApiErrorMessage } from '../translateApiError';
import { axiosError, moduleDisabled403, roleDenied403, serverError500 } from '../../test/apiErrorFixtures';

const networkError = Object.assign(new Error('Network Error'), { isAxiosError: true, config: { url: '/rest/x' } });

const CASES: Array<[string, unknown]> = [
  ['network', networkError],
  ['period lock with date', axiosError(422, { code: 'PERIOD_LOCKED', lockDate: '2025-12-31' }, '/rest/voucher/save.json')],
  ['period lock without date', axiosError(422, { code: 'PERIOD_LOCKED' }, '/rest/voucher/save.json')],
  ['unauthorized', axiosError(401, {}, '/rest/user/current.json')],
  ['module disabled, named by URL', moduleDisabled403('Finance', '/rest/ledgerAccount/index.json')],
  ['module disabled, named by the backend', moduleDisabled403('Finance', '/rest/bill/index.json')],
  ['module disabled, no name', axiosError(403, { code: 'MODULE_DISABLED' }, '/rest/other/index.json')],
  ['role denied on a module URL', roleDenied403('/rest/voucher/index.json')],
  ['role denied elsewhere', roleDenied403('/rest/sbUser/index.json')],
  ['forbidden with no body', axiosError(403, {}, '/rest/sbUser/index.json')],
  ['not found', axiosError(404, {}, '/rest/voucher/show/1.json')],
  ['server error', serverError500('/rest/ledgerTransaction/index.json')],
  ['other 4xx', axiosError(409, {}, '/rest/voucher/save.json')],
  ['native Error with no message', new Error('')],
  ['a thrown string', 'boom'],
];

describe('translateApiError', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it.each(CASES)('English is unchanged: %s', (_name, error) => {
    const parsed = parseApiError(error);
    expect(parsed.i18n).toBeDefined();
    const translated = translateApiError(parsed);
    expect(translated.title).toBe(parsed.title);
    expect(translated.message).toBe(parsed.message);
    expect(translated.actionHint).toBe(parsed.actionHint);
    expect(translated.kind).toBe(parsed.kind);
  });

  it.each(CASES)('every German title differs from the English one: %s', async (_name, error) => {
    const parsed = parseApiError(error);
    await i18n.changeLanguage('de');
    expect(translateApiError(parsed).title).not.toBe(parsed.title);
  });

  it('names the module in the target language', async () => {
    await i18n.changeLanguage('nl');
    const parsed = translateApiError(parseApiError(moduleDisabled403('Finance', '/rest/voucher/index.json')));
    expect(parsed.title).toBe('De module Boekhouding is niet beschikbaar');
    expect(parsed.message).toContain('de module Boekhouding');
  });

  it('keeps a module the app has no name for as the backend sent it', async () => {
    await i18n.changeLanguage('de');
    const parsed = translateApiError(parseApiError(moduleDisabled403('CIS/Funds', '/rest/fund/index.json')));
    expect(parsed.title).toBe('Das Modul CIS/Funds ist nicht verfügbar');
  });

  it('formats the lock date into the translated sentence', async () => {
    await i18n.changeLanguage('fr');
    const english = parseApiError(axiosError(422, { code: 'PERIOD_LOCKED', lockDate: '2025-12-31' }, '/rest/voucher/save.json'));
    const date = english.message.match(/closed up to (.+)\. Choose/)?.[1];
    expect(date).toBeTruthy();
    expect(translateApiError(english).message).toBe(
      `Les comptes sont clôturés jusqu'au ${date}. Choisissez une date postérieure à ce jour.`
    );
  });

  it('shows a server message as sent, even a long one', async () => {
    await i18n.changeLanguage('de');
    const serverText = 'Voucher could not be saved because the period is under review. '.repeat(4).trim();
    const parsed = translateApiError(parseApiError(axiosError(500, { error: serverText }, '/rest/voucher/save.json')));
    expect(parsed.title).toBe('Serverfehler');
    expect(parsed.message).toBe(serverText);
  });

  it('getTranslatedApiErrorMessage returns the translated message', async () => {
    await i18n.changeLanguage('de');
    expect(getTranslatedApiErrorMessage(networkError)).toBe(
      'Der Server ist nicht erreichbar. Prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.'
    );
  });

  it('returns a parsed error without keys unchanged', () => {
    const parsed = { kind: 'unknown' as const, title: 'T', message: 'M' };
    expect(translateApiError(parsed)).toBe(parsed);
  });
});
