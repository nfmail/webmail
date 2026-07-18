import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ConfirmDialog } from '../confirm-dialog';

/**
 * Characterization tests for ConfirmDialog. next-intl is mocked globally in
 * vitest.setup.ts so translation keys pass through verbatim ("Confirm" /
 * "Cancel"), which is what the default button labels resolve to here.
 */
describe('ConfirmDialog (characterization)', () => {
  const baseProps = {
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    title: 'Delete item',
    message: 'This cannot be undone.',
  };

  it('renders nothing while closed', () => {
    render(<ConfirmDialog {...baseProps} isOpen={false} />);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.queryByText('Delete item')).toBeNull();
  });

  it('renders as a modal alertdialog with title and message when open', () => {
    render(<ConfirmDialog {...baseProps} isOpen />);
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Delete item')).toBeInTheDocument();
    expect(screen.getByText('This cannot be undone.')).toBeInTheDocument();
  });

  it('is labelled and described by its title and message (a11y wiring)', () => {
    render(<ConfirmDialog {...baseProps} isOpen />);
    const dialog = screen.getByRole('alertdialog');
    const labelId = dialog.getAttribute('aria-labelledby');
    const descId = dialog.getAttribute('aria-describedby');
    expect(document.getElementById(labelId!)?.textContent).toBe('Delete item');
    expect(document.getElementById(descId!)?.textContent).toBe('This cannot be undone.');
  });

  it('renders default confirm/cancel labels from translations', () => {
    render(<ConfirmDialog {...baseProps} isOpen />);
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('honors custom confirm/cancel text', () => {
    render(
      <ConfirmDialog {...baseProps} isOpen confirmText="Yes, delete" cancelText="Keep" />
    );
    expect(screen.getByRole('button', { name: 'Yes, delete' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep' })).toBeInTheDocument();
  });

  it('moves focus inside the dialog when opened', () => {
    render(<ConfirmDialog {...baseProps} isOpen />);
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('invokes onConfirm and then onClose when confirm is pressed', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <ConfirmDialog {...baseProps} isOpen onConfirm={onConfirm} onClose={onClose} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('invokes onClose (and not onConfirm) when cancel is pressed', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <ConfirmDialog {...baseProps} isOpen onConfirm={onConfirm} onClose={onClose} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('invokes onClose on Escape', () => {
    const onClose = vi.fn();
    render(<ConfirmDialog {...baseProps} isOpen onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('invokes onClose on an outside (backdrop) mousedown', () => {
    const onClose = vi.fn();
    render(<ConfirmDialog {...baseProps} isOpen onClose={onClose} />);
    // mousedown on the body, outside the dialog node, triggers the close.
    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalled();
  });

  it('does NOT close on a mousedown inside the dialog', () => {
    const onClose = vi.fn();
    render(<ConfirmDialog {...baseProps} isOpen onClose={onClose} />);
    fireEvent.mouseDown(screen.getByText('Delete item'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('renders a warning affordance for the destructive variant', () => {
    const { container } = render(
      <ConfirmDialog {...baseProps} isOpen variant="destructive" />
    );
    // The destructive variant adds a decorative icon svg that the default omits.
    expect(container.querySelector('svg')).not.toBeNull();
  });
});
