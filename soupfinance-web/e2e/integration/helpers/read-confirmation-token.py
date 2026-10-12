#!/usr/bin/env python3
"""
Print the email-confirmation token the LXC backend mailed for one registration (SOUPFIN-152).

The LXC backend signs confirmation tokens with HMAC-SHA256 under REGISTRATION_TOKEN_SECRET,
or under a random secret made at startup when that is unset (soupmarkets-web d5deb23b7e). A
test cannot mint that token, so it reads the real email, as a person would.

In development the backend redirects every email to support@techatscale.io, which is delivered
to the dominic@techatscale.io mailbox. The body still names the registering address, so the
newest "Confirm Your SoupFinance Account" message whose body carries that address holds the token.

Usage:  read-confirmation-token.py <registered email> [--timeout 180]
Prints: the token on stdout, exit 0. Exit 2 when no matching email arrived in time.

Mailbox credentials come from the environment (CONFIRM_IMAP_HOST, CONFIRM_IMAP_USER,
CONFIRM_IMAP_PASSWORD), else from the credential store under soupmarkets/techatscale-mail.
"""
import argparse
import email
import html
import imaplib
import os
import re
import subprocess
import sys
import time
from email.header import decode_header

CREDENTIAL_STORE = os.path.expanduser('~/.claude/scripts/credential-store.sh')
SUBJECT = 'Confirm Your SoupFinance Account'
FOLDERS = ['INBOX', '"Junk Mail"']
TOKEN_RE = re.compile(r'confirm-email\?token=([A-Za-z0-9_\-=%]+)')


def credential(env_key, store_key):
    value = os.environ.get(env_key)
    if value:
        return value
    out = subprocess.run(
        ['bash', CREDENTIAL_STORE, 'get', 'soupmarkets/techatscale-mail', store_key],
        capture_output=True, text=True, check=True,
    )
    return out.stdout.strip()


def body_text(message):
    parts = message.walk() if message.is_multipart() else [message]
    chunks = []
    for part in parts:
        if part.get_content_type() not in ('text/plain', 'text/html'):
            continue
        payload = part.get_payload(decode=True) or b''
        chunks.append(payload.decode(part.get_content_charset() or 'utf-8', 'replace'))
    return html.unescape('\n'.join(chunks))


def subject_of(message):
    out = []
    for value, charset in decode_header(message.get('Subject', '')):
        out.append(value.decode(charset or 'utf-8', 'replace') if isinstance(value, bytes) else value)
    return ''.join(out)


def find_token(imap, address):
    for folder in FOLDERS:
        if imap.select(folder, readonly=True)[0] != 'OK':
            continue
        status, data = imap.search(None, 'SUBJECT', f'"{SUBJECT}"')
        if status != 'OK':
            continue
        # Newest first; only the last few are worth reading
        for msg_id in reversed(data[0].split()[-40:]):
            status, fetched = imap.fetch(msg_id, '(RFC822)')
            if status != 'OK':
                continue
            message = email.message_from_bytes(fetched[0][1])
            if SUBJECT not in subject_of(message):
                continue
            text = body_text(message)
            if address.lower() not in text.lower():
                continue
            match = TOKEN_RE.search(text)
            if match:
                return match.group(1)
    return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('address')
    parser.add_argument('--timeout', type=int, default=180)
    args = parser.parse_args()

    host = credential('CONFIRM_IMAP_HOST', 'host')
    user = credential('CONFIRM_IMAP_USER', 'user')
    password = credential('CONFIRM_IMAP_PASSWORD', 'password')

    deadline = time.time() + args.timeout
    while True:
        imap = imaplib.IMAP4_SSL(host, 993)
        try:
            imap.login(user, password)
            token = find_token(imap, args.address)
        finally:
            try:
                imap.logout()
            except Exception:
                pass
        if token:
            print(token)
            return 0
        if time.time() >= deadline:
            print(f'No "{SUBJECT}" email for {args.address} within {args.timeout}s', file=sys.stderr)
            return 2
        time.sleep(10)


if __name__ == '__main__':
    sys.exit(main())
