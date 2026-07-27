/**
 * Unit tests for AddEntityButton (SOUPFIN-30 #15).
 *
 * The "+" beside an entity dropdown must:
 *  - open the create page in a NEW TAB (so the in-progress form is preserved)
 *  - refresh the dropdown's query when the user returns to this tab
 *  - NOT refresh on an unrelated window focus (before the button was clicked)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AddEntityButton } from '../AddEntityButton';

function renderButton(props: Partial<React.ComponentProps<typeof AddEntityButton>> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
  render(
    <QueryClientProvider client={queryClient}>
      <AddEntityButton
        to="/vendors/new"
        label="Add new vendor"
        queryKey={['vendors']}
        testId="vendor-add"
        {...props}
      />
    </QueryClientProvider>
  );
  return { invalidateSpy };
}

describe('AddEntityButton (SOUPFIN-30 #15)', () => {
  let openSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders an accessible "+" button', () => {
    renderButton();
    const button = screen.getByTestId('vendor-add');
    expect(button).toHaveAttribute('aria-label', 'Add new vendor');
    // type="button" is essential — inside a <form> a default submit button
    // would submit the half-filled bill instead of opening the create page.
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveTextContent('add');
  });

  it('opens the create route in a new tab rather than navigating away', () => {
    renderButton();
    fireEvent.click(screen.getByTestId('vendor-add'));
    expect(openSpy).toHaveBeenCalledWith('/vendors/new', '_blank', 'noopener,noreferrer');
  });

  it('does NOT invalidate the dropdown query before the button is clicked', () => {
    const { invalidateSpy } = renderButton();
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('invalidates the dropdown query when the user returns after clicking', () => {
    const { invalidateSpy } = renderButton();
    fireEvent.click(screen.getByTestId('vendor-add'));
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['vendors'] });
  });

  it('only refreshes once per click (a second focus does not re-invalidate)', () => {
    const { invalidateSpy } = renderButton();
    fireEvent.click(screen.getByTestId('vendor-add'));
    act(() => {
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('focus'));
    });
    expect(invalidateSpy).toHaveBeenCalledTimes(1);
  });

  it('does nothing when disabled', () => {
    renderButton({ disabled: true });
    const button = screen.getByTestId('vendor-add');
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('invalidates the exact queryKey it was given (not a hardcoded one)', () => {
    const { invalidateSpy } = renderButton({
      to: '/clients/new',
      label: 'Add new client',
      queryKey: ['clients', { max: 100 }],
    });
    fireEvent.click(screen.getByTestId('vendor-add'));
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['clients', { max: 100 }] });
  });
});
