/**
 * ConfirmDialog (SOUPFIN-164) — the shared modal that replaces window.confirm.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from '../../../i18n';
import { ConfirmDialog } from '../ConfirmDialog';

function renderDialog(props: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ConfirmDialog
      open
      title="Delete transaction JE-1?"
      message="This cannot be undone."
      confirmLabel="Delete"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    />
  );
  return { onConfirm, onCancel };
}

describe('ConfirmDialog', () => {
  it('renders nothing while closed', () => {
    renderDialog({ open: false });
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('is an alertdialog named by its title and described by its message', () => {
    renderDialog({ note: 'Linked reports are kept.' });
    const dialog = screen.getByRole('alertdialog', { name: 'Delete transaction JE-1?' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('This cannot be undone.');
    expect(dialog).toHaveTextContent('Linked reports are kept.');
  });

  it('starts focus on Cancel, so Enter does not confirm', async () => {
    const { onConfirm, onCancel } = renderDialog();
    expect(screen.getByTestId('confirm-dialog-cancel')).toHaveFocus();
    await userEvent.setup().keyboard('{Enter}');
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onConfirm from the confirm button only', async () => {
    const { onConfirm, onCancel } = renderDialog();
    await userEvent.setup().click(screen.getByTestId('confirm-dialog-confirm'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('cancels on Escape and on a click outside, not on a click inside', async () => {
    const user = userEvent.setup();
    const { onCancel } = renderDialog();
    await user.click(screen.getByTestId('confirm-dialog-title'));
    expect(onCancel).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    await user.click(screen.getByTestId('confirm-dialog-overlay'));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('locks both buttons, Escape and the overlay while the action runs', async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = renderDialog({ isPending: true });
    expect(screen.getByTestId('confirm-dialog-confirm')).toBeDisabled();
    expect(screen.getByTestId('confirm-dialog-cancel')).toBeDisabled();
    await user.keyboard('{Escape}');
    await user.click(screen.getByTestId('confirm-dialog-overlay'));
    expect(onCancel).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('labels Cancel in the selected language unless told otherwise', async () => {
    await i18n.changeLanguage('nl');
    renderDialog();
    expect(screen.getByTestId('confirm-dialog-cancel')).toHaveTextContent('Annuleren');
  });

  it('keeps a very long title and message inside the dialog (overflow)', () => {
    const long = 'Transaction '.repeat(200);
    renderDialog({ title: long, message: long });
    const title = screen.getByTestId('confirm-dialog-title');
    expect(title.textContent).toHaveLength(long.length);
    // The text column may shrink below its content, so long words wrap rather than widen the dialog
    expect(title.parentElement).toHaveClass('min-w-0');
    expect(screen.getByRole('alertdialog')).toHaveClass('max-w-lg');
  });
});
