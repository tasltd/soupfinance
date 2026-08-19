# SoupFinance — design conventions

SoupFinance is a double-entry **accounting and receivables platform**: invoices, bills,
payments, the general ledger, client and vendor records, and the financial reports drawn
from them (P&L, balance sheet, cash flow, AR/AP aging). The people using it are
bookkeepers, accountants and finance managers who work in it for hours at a time and are
reconciling real money — so design for **density, legibility and reversibility**, not for
delight.

## House rules

- **Orange is action, never decoration.** `--color-primary` (#f24a0d) marks the one thing
  the user is meant to do on a screen: submit, post, approve, pay. A screen with three
  orange buttons has no primary action. Everything else is a bordered or ghost button.
- **Money is right-aligned, fixed-precision, and signed.** Always two decimals, always with
  the account's currency symbol, negatives in `--color-danger`. Never abbreviate an amount
  in a ledger or report — `12,480.00`, not `12.5k`. Totals sit in a bordered summary row,
  not floating in prose.
- **State is a colour token plus a word.** Paid / overdue / draft / pending use
  `--color-success`, `--color-danger`, `--color-subtle-text` and `--color-warning`
  respectively — always with the label next to the colour. Colour alone fails both
  colour-blind users and print.
- **Every list has four states**: loading (`Spinner`), empty (an explanatory line and the
  action that fills it), error (`ApiErrorState`), and populated. An empty table with no
  explanation is a bug, not a state.
- **Destructive and financial actions confirm.** Voiding an invoice, deleting a payment or
  posting to the ledger asks first, and the confirmation names the record and the amount.
- **Forms:** label above the field, helper text below, error text replacing the helper in
  `--color-danger`. Required fields carry the asterisk on the label — never placeholder-only
  labelling. Use `Input`, `Select`, `Textarea`, `Checkbox`, `Radio`, `DatePicker` rather
  than raw elements; they carry the focus, disabled and error styling.
- **Feedback has two channels**: `AlertBanner` for something that stays true about the page
  (module disabled, period locked, validation summary), `Toast` for something that just
  happened (saved, posted, failed). Don't use a toast to report a persistent condition.
- **Layout is fixed.** `MainLayout` owns the app frame — `SideNav` (collapsible, remembers
  its state) plus `TopNav` (account switcher, notifications, user menu). `AuthLayout` owns
  every signed-out screen. Page content never re-implements the frame.

## Type and icons

- **Manrope** is the only typeface, via `--font-display`. Headings 600–800, body 400–500.
- Icons are **Material Symbols Outlined**, rendered as `<span class="material-symbols-outlined">name</span>`.
  Icons never appear without a label except in a `Tooltip`-wrapped icon button.

## Colour tokens

Light and dark are both first-class — the app toggles `.dark` on `<html>`. Every surface
pairs a light and dark token (`--color-surface-light` / `--color-surface-dark`,
`--color-text-light` / `--color-text-dark`, `--color-border-light` / `--color-border-dark`).
A one-mode colour is a bug: it will be unreadable in the other.
