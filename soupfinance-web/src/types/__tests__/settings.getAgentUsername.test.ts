/**
 * Unit tests for getAgentUsername() — SOUPFIN-45.
 *
 * The backend serialises `Agent.userAccess` as a shallow Grails FK ({ id, class })
 * with NO `username` (measured: 0 of 100 agents on the LXC backend). The login name
 * survives only inside `simpleID` ("First Last, Access:the.username"). UserFormPage
 * read `userAccess.username` raw, loaded a blank username, failed Zod's min(3), and
 * react-hook-form silently blocked the Update submit.
 */
import { describe, it, expect } from 'vitest';
import { getAgentUsername } from '../settings';
import type { Agent } from '../settings';

const base = (over: Partial<Agent> = {}): Agent =>
  ({ id: 'a1', firstName: 'Test', lastName: 'User', ...over } as Agent);

describe('getAgentUsername (SOUPFIN-45)', () => {
  it('recovers the username from simpleID when userAccess has no username', () => {
    // The exact payload /rest/agent/show/{id}.json returns.
    const agent = base({
      userAccess: { id: 1715 },
      simpleID: 'Test User, Access:e2e.label.audit',
    });
    expect(getAgentUsername(agent)).toBe('e2e.label.audit');
  });

  it('prefers userAccess.username when the backend does send it', () => {
    const agent = base({
      userAccess: { id: 1715, username: 'direct.name' },
      simpleID: 'Test User, Access:stale.name',
    });
    expect(getAgentUsername(agent)).toBe('direct.name');
  });

  // --- absence edge cases -------------------------------------------------
  it('returns undefined when neither userAccess.username nor simpleID exist', () => {
    expect(getAgentUsername(base())).toBeUndefined();
  });

  it('returns undefined for an empty simpleID', () => {
    expect(getAgentUsername(base({ simpleID: '' }))).toBeUndefined();
  });

  it('returns undefined when simpleID carries no Access: segment', () => {
    expect(getAgentUsername(base({ simpleID: 'Test User' }))).toBeUndefined();
  });

  it('falls back to simpleID when userAccess.username is an empty string', () => {
    const agent = base({
      userAccess: { id: 1, username: '' },
      simpleID: 'Test User, Access:fallback.name',
    });
    expect(getAgentUsername(agent)).toBe('fallback.name');
  });

  // --- format / content edge cases ---------------------------------------
  it('is case-insensitive on the Access: marker and tolerates extra spacing', () => {
    expect(getAgentUsername(base({ simpleID: 'A B, access:   spaced.name' }))).toBe('spaced.name');
  });

  it('stops at the first comma so trailing segments are not swallowed', () => {
    expect(getAgentUsername(base({ simpleID: 'A B, Access:first.name, Extra:x' }))).toBe('first.name');
  });

  it('handles an email-style username', () => {
    expect(getAgentUsername(base({ simpleID: 'A B, Access:fui@techatscale.io' }))).toBe(
      'fui@techatscale.io'
    );
  });

  // --- EXCESS end: the one fixtures never reach ---------------------------
  it('recovers a pathologically long username intact', () => {
    const long = 'u'.repeat(500);
    expect(getAgentUsername(base({ simpleID: `A B, Access:${long}` }))).toBe(long);
  });

  it('recovers a username containing dots, dashes and underscores', () => {
    expect(getAgentUsername(base({ simpleID: 'A B, Access:first.last-2_admin' }))).toBe(
      'first.last-2_admin'
    );
  });

  it('does not confuse a name that merely contains the word access', () => {
    expect(getAgentUsername(base({ simpleID: 'Access Manager User' }))).toBeUndefined();
  });
});
