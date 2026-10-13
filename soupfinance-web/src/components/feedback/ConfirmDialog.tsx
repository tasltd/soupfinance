/**
 * ConfirmDialog — shared confirmation modal for destructive or irreversible actions
 * Reference: soupfinance-designs/modal-delete-confirmation/
 *
 * Added (SOUPFIN-164): replaces window.confirm, which cannot be translated, styled
 * or tested, and which the browser may suppress altogether. Layout follows the
 * design: accent bar on the left, icon in a tinted circle, title, message, an
 * optional note, and a footer with Cancel and the confirm action.
 *
 * Escape and the Cancel button close it; focus starts on Cancel so a stray Enter
 * never confirms a delete.
 */
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export type ConfirmDialogTone = 'danger' | 'warning';

export interface ConfirmDialogProps {
  /** Whether the dialog is shown. */
  open: boolean;
  /** Headline, phrased as the question ("Delete transaction JE-001?"). */
  title: string;
  /** Body text explaining the consequence. */
  message: ReactNode;
  /** Optional secondary note shown in a boxed hint under the message. */
  note?: ReactNode;
  /** Label of the confirm button ("Delete", "Reverse"). */
  confirmLabel: string;
  /** Label of the cancel button. Defaults to common:actions.cancel. */
  cancelLabel?: string;
  /** Material Symbols icon name. Defaults to "delete". */
  icon?: string;
  /** danger = red (delete), warning = amber (reverse). */
  tone?: ConfirmDialogTone;
  /** Disables both buttons and shows a spinner on confirm while the action runs. */
  isPending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** data-testid root; children get `-title`, `-message`, `-confirm`, `-cancel`. */
  testId?: string;
}

const TONE_CLASSES: Record<ConfirmDialogTone, { bar: string; iconWrap: string; icon: string; button: string }> = {
  danger: {
    bar: 'bg-danger',
    iconWrap: 'bg-danger/10',
    icon: 'text-danger',
    button: 'bg-danger hover:bg-danger/90',
  },
  warning: {
    bar: 'bg-warning',
    iconWrap: 'bg-warning/10',
    icon: 'text-warning',
    button: 'bg-warning hover:bg-warning/90',
  },
};

export function ConfirmDialog({
  open,
  title,
  message,
  note,
  confirmLabel,
  cancelLabel,
  icon = 'delete',
  tone = 'danger',
  isPending = false,
  onConfirm,
  onCancel,
  testId = 'confirm-dialog',
}: ConfirmDialogProps) {
  const { t } = useTranslation('common');
  const titleId = useId();
  const messageId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const tones = TONE_CLASSES[tone];

  // Focus Cancel on open, and let Escape close the dialog.
  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isPending) onCancel();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, isPending, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={() => !isPending && onCancel()}
      data-testid={`${testId}-overlay`}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        onClick={(event) => event.stopPropagation()}
        className="relative w-full max-w-lg overflow-hidden rounded-xl bg-surface-light dark:bg-surface-dark shadow-2xl"
        data-testid={testId}
      >
        <span className={`absolute inset-y-0 left-0 w-1.5 ${tones.bar}`} aria-hidden="true" />
        <div className="flex gap-4 p-6 pl-8">
          <div className={`flex size-12 flex-shrink-0 items-center justify-center rounded-full ${tones.iconWrap}`}>
            <span className={`material-symbols-outlined text-2xl ${tones.icon}`} aria-hidden="true">
              {icon}
            </span>
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <h2
              id={titleId}
              className="text-xl font-bold text-text-light dark:text-text-dark"
              data-testid={`${testId}-title`}
            >
              {title}
            </h2>
            <div id={messageId} className="text-subtle-text" data-testid={`${testId}-message`}>
              {message}
            </div>
            {note && (
              <div className="mt-2 flex items-start gap-2 rounded-lg border border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark p-3 text-sm text-subtle-text">
                <span className="material-symbols-outlined text-base" aria-hidden="true">info</span>
                <span>{note}</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-3 border-t border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark px-6 py-4">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="h-10 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark px-4 text-sm font-medium text-text-light dark:text-text-dark hover:bg-primary/5 disabled:opacity-50"
            data-testid={`${testId}-cancel`}
          >
            {cancelLabel ?? t('actions.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className={`flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-bold text-white disabled:opacity-50 ${tones.button}`}
            data-testid={`${testId}-confirm`}
          >
            <span
              className={`material-symbols-outlined text-base ${isPending ? 'animate-spin' : ''}`}
              aria-hidden="true"
            >
              {isPending ? 'progress_activity' : icon}
            </span>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
