/**
 * Places a React element inside a translated sentence.
 *
 * Added (SOUPFIN-183): `<Trans>` parses interpolated values as markup, so a bill
 * number or vendor name such as `<1>Acme</1>` lost its tags or came out
 * half-escaped. Here the translation is rendered with ELEMENT_SLOT as the value,
 * then split around it, so the user's value is only ever a React text child.
 *
 *   withElement(t('deleteDialog.confirm', { name: ELEMENT_SLOT }), <strong>{name}</strong>)
 */
import { Fragment, type ReactNode } from 'react';

export const ELEMENT_SLOT = '\u0000';

export function withElement(text: string, element: ReactNode): ReactNode {
  const parts = text.split(ELEMENT_SLOT);
  return parts.map((part, i) => (
    <Fragment key={i}>
      {part}
      {i < parts.length - 1 && element}
    </Fragment>
  ));
}
