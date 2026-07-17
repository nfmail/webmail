import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ToastContainer, ToastItem, type Toast } from '../toast';

/**
 * Characterization tests for the toast primitives.
 *
 * ACTUAL API SURFACE: this module exports the presentational, CONTROLLED
 * components `ToastItem` and `ToastContainer` (plus the `Toast`/`ToastType`
 * types). It intentionally does NOT export a `toast()` function, a `useToast`
 * hook, or a provider — enqueue/dequeue state lives elsewhere in the app. These
 * tests therefore drive the components with an explicit `toasts` array and
 * `onClose` callback, which is the real public contract.
 *
 * Dismissal is animated: dismiss() flips an exit flag and calls onClose after a
 * ~280ms timeout, so onClose assertions use waitFor.
 */
function makeToast(overrides: Partial<Toast> = {}): Toast {
  return {
    id: 't1',
    type: 'success',
    title: 'Saved',
    ...overrides,
  };
}

describe('ToastContainer (characterization)', () => {
  it('renders nothing meaningful for an empty list but exposes a polite live region', () => {
    render(<ToastContainer toasts={[]} onClose={() => {}} />);
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region.textContent).toBe('');
  });

  it('renders the title (and message) of each toast', () => {
    const toasts = [
      makeToast({ id: 'a', title: 'Message sent', message: 'Delivered to 3 people' }),
      makeToast({ id: 'b', title: 'Draft saved' }),
    ];
    render(<ToastContainer toasts={toasts} onClose={() => {}} />);
    expect(screen.getByText('Message sent')).toBeInTheDocument();
    expect(screen.getByText('Delivered to 3 people')).toBeInTheDocument();
    expect(screen.getByText('Draft saved')).toBeInTheDocument();
  });

  it('renders every toast type without error', () => {
    const toasts: Toast[] = (['success', 'error', 'info', 'warning'] as const).map((type, i) => ({
      id: `type-${i}`,
      type,
      title: `${type} title`,
    }));
    render(<ToastContainer toasts={toasts} onClose={() => {}} />);
    for (const t of toasts) {
      expect(screen.getByText(`${t.type} title`)).toBeInTheDocument();
    }
  });
});

describe('ToastItem (characterization)', () => {
  it('renders the title and optional message', () => {
    render(<ToastItem toast={makeToast({ message: 'body copy' })} onClose={() => {}} />);
    expect(screen.getByText('Saved')).toBeInTheDocument();
    expect(screen.getByText('body copy')).toBeInTheDocument();
  });

  it('dismisses via the close button, eventually calling onClose with the id', async () => {
    const onClose = vi.fn();
    render(<ToastItem toast={makeToast({ id: 'close-me' })} onClose={onClose} />);
    // With no action, the only button is the close (X) button.
    const closeBtn = screen.getByRole('button');
    fireEvent.click(closeBtn);
    await waitFor(() => expect(onClose).toHaveBeenCalledWith('close-me'));
  });

  it('renders an action button and invokes its handler on click', async () => {
    const onAction = vi.fn();
    const onClose = vi.fn();
    render(
      <ToastItem
        toast={makeToast({ id: 'act', action: { label: 'Undo', onClick: onAction } })}
        onClose={onClose}
      />
    );
    const undo = screen.getByRole('button', { name: 'Undo' });
    fireEvent.click(undo);
    expect(onAction).toHaveBeenCalledOnce();
    await waitFor(() => expect(onClose).toHaveBeenCalledWith('act'));
  });

  it('invokes the toast onClick when the body is clicked (and no action is set)', async () => {
    const onBodyClick = vi.fn();
    const onClose = vi.fn();
    render(
      <ToastItem
        toast={makeToast({ id: 'clickable', onClick: onBodyClick })}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByText('Saved'));
    expect(onBodyClick).toHaveBeenCalledOnce();
    await waitFor(() => expect(onClose).toHaveBeenCalledWith('clickable'));
  });

  it('does NOT trigger the body onClick when an action is present', () => {
    const onBodyClick = vi.fn();
    render(
      <ToastItem
        toast={makeToast({
          id: 'both',
          onClick: onBodyClick,
          action: { label: 'Retry', onClick: () => {} },
        })}
        onClose={() => {}}
      />
    );
    // Clicking the body (title) region should not fire onClick while an action exists.
    fireEvent.click(screen.getByText('Saved'));
    expect(onBodyClick).not.toHaveBeenCalled();
  });

  it('renders a caller-provided custom icon node in place of the default', () => {
    render(
      <ToastItem
        toast={makeToast({ icon: <span data-testid="custom-icon">★</span> })}
        onClose={() => {}}
      />
    );
    expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
  });
});
