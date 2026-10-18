// Added (SOUP-4208): turn the backend's sign-up refusals into words a person can act on.
//
// The backend (Grails AccountController.register, and the Go port that matches it) answers a
// refused field with `errors` as a LIST of Grails message templates whose placeholders were never
// filled in, e.g. "Property [{0}] of class [{1}] with value [{2}] is not a valid e-mail address".
// The page used to treat `errors` as a field map, so a list left every field key unset and the
// person saw no message at all. A field map (older backends) is still passed through unchanged.

const TEMPLATE_HINTS: Array<[RegExp, string]> = [
  [/is not a valid e-mail address/i, 'That email address is not valid. Check it and try again.'],
  [/cannot be (blank|null)/i, 'A required field is empty. Fill in every field marked with a star.'],
  [/exceeds the maximum size/i, 'One of the fields is too long. Shorten it and try again.'],
  [/is less than the minimum size/i, 'One of the fields is too short. Add a little more and try again.'],
  [/is not contained within the list/i, 'One of the choices is not allowed. Pick another option.'],
  [/does not match the required pattern/i, 'One of the fields is in the wrong format. Check it and try again.'],
];

const MAX_SHOWN = 3;

/** One plain sentence for one backend message. Messages without placeholders are kept as they are. */
export function plainRegistrationMessage(raw: unknown): string {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) return '';
  for (const [pattern, hint] of TEMPLATE_HINTS) {
    if (pattern.test(text)) return hint;
  }
  // Any other unfilled template: drop the "Property [{0}] of class [{1}]" scaffolding.
  if (/\{\d\}/.test(text)) return 'Some details are not valid. Check the form and try again.';
  return text.slice(0, 300);
}

/**
 * Normalise `errors` from a sign-up reply into the page's field-error map.
 * A list becomes one `form` message; a map is returned as it came.
 */
export function registrationErrorsToFields(errors: unknown): Record<string, string> | null {
  if (Array.isArray(errors)) {
    const unique = Array.from(new Set(errors.map(plainRegistrationMessage).filter(Boolean)));
    if (unique.length === 0) return null;
    const shown = unique.slice(0, MAX_SHOWN).join(' ');
    return { form: unique.length > MAX_SHOWN ? `${shown} (and ${unique.length - MAX_SHOWN} more)` : shown };
  }
  if (errors && typeof errors === 'object') {
    const entries = Object.entries(errors as Record<string, unknown>).filter(([, v]) => typeof v === 'string' && v);
    return entries.length ? Object.fromEntries(entries) as Record<string, string> : null;
  }
  return null;
}
