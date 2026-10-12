/**
 * Email-confirmation token for a fresh registration on the LXC backend (SOUPFIN-152).
 *
 * The backend signs the token: base64url("agentId:timestamp:hmac"), where hmac is
 * HMAC-SHA256 of "agentId:timestamp" under REGISTRATION_TOKEN_SECRET (soupmarkets-web
 * d5deb23b7e). When that variable is unset the backend makes a random secret at startup,
 * so the only way in is the email itself.
 *
 *  - REGISTRATION_TOKEN_SECRET set here (and on the backend): mint the token locally.
 *  - Otherwise: read the confirmation email the backend sent, through
 *    read-confirmation-token.py (IMAP; see that file for the mailbox and credentials).
 */
import { createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MAILBOX_SCRIPT = path.join(HERE, 'read-confirmation-token.py');

const base64url = (value: Buffer | string) => Buffer.from(value).toString('base64url');

/** The token the backend would mint for this agent now, under the shared secret. */
export function mintConfirmationToken(agentId: string, secret: string, now = Date.now()): string {
  const payload = `${agentId}:${now}`;
  const signature = base64url(createHmac('sha256', secret).update(payload, 'utf8').digest());
  return base64url(`${payload}:${signature}`);
}

/**
 * The confirmation token for a registration, by whichever route this environment allows.
 * Throws with the mailbox script's own message when no email arrives in time.
 */
export function confirmationTokenFor(email: string, agentId: string | undefined, timeoutSeconds = 180): string {
  const secret = process.env.REGISTRATION_TOKEN_SECRET?.trim();
  if (secret && agentId) return mintConfirmationToken(agentId, secret);

  try {
    return execFileSync('python3', [MAILBOX_SCRIPT, email, '--timeout', String(timeoutSeconds)], {
      encoding: 'utf8',
      timeout: (timeoutSeconds + 60) * 1000,
    }).trim();
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr ?? '';
    throw new Error(
      `No confirmation token for ${email}. Set REGISTRATION_TOKEN_SECRET on the backend and here, ` +
        `or make the confirmation mailbox readable. ${stderr}`.trim()
    );
  }
}
