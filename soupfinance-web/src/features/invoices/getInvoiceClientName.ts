/**
 * getInvoiceClientName — the client's name for an invoice list row (SOUPFIN-165).
 *
 * The invoice list renders `accountServices` as a bare FK: `{ id, class,
 * serialised }`. There is no Client object to hand to getClientDisplayName, and
 * fetching one per row would be an N+1 over the whole page. The serialised
 * AccountServices label already carries the KYC name, in one of these shapes
 * (measured on the LXC backend, 2026-10-13, 83 invoices):
 *
 *   Direct Account : Individual(Ama Mensah)
 *   Direct Account : Corporate(Decokraft Limited) | KPMG
 *   Direct ITF Account : Corporate(Acme Ltd) - ITF : SCGN/The Gold Fund
 *   Account 9A86DD2BDC          ← account with no client attached
 *   ASW Growth Plan v2          ← named portfolio, no KYC subtype
 *
 * So: take the text inside the first `Individual(…)` / `Corporate(…)` /
 * `Itf(…)` group, matching nested parentheses ("Acme (Ghana) Ltd"). When there
 * is no such group the account has no client to name, and its own label is the
 * honest thing to show. Same never-blank contract as getClientDisplayName.
 */
import type { Invoice } from '../../types';

const KYC_GROUP = /\b(?:Individual|Corporate|Itf|ITF)\(/;

export function getInvoiceClientName(accountServices: Invoice['accountServices'] | null | undefined): string {
  const label = accountServices?.serialised?.trim();
  if (!label) return 'N/A';

  const match = KYC_GROUP.exec(label);
  if (!match) return label;

  // Walk to the matching close paren so a name containing "(…)" survives.
  const start = match.index + match[0].length;
  let depth = 1;
  let end = start;
  while (end < label.length && depth > 0) {
    if (label[end] === '(') depth += 1;
    else if (label[end] === ')') depth -= 1;
    if (depth > 0) end += 1;
  }
  const name = label.slice(start, end).trim();
  return name || 'Unnamed client';
}
