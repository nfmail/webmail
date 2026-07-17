import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PromptDialog } from '../prompt-dialog';

/**
 * Characterization tests for PromptDialog. next-intl is mocked globally so
 * default confirm/cancel labels resolve to the raw keys "confirm"/"cancel".
 */
describe('PromptDialog (characterization)', () => {
  const baseProps = {
    onClose: vi.fn(),
    onSubmit: vi.fn(),
    title: 'Rename folder',
  };

  it('renders nothing while closed', () => {
    render(<PromptDialog {...baseProps} isOpen={false} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders as a modal dialog with title and a text input when open', () => {
    render(<PromptDialog {...baseProps} isOpen message="Pick a new name" />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Rename folder')).toBeInTheDocument();
    expect(screen.getByText('Pick a new name')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('seeds the input with defaultValue', () => {
    render(<PromptDialog {...baseProps} isOpen defaultValue="Archive" />);
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('Archive');
  });

  it('applies the placeholder', () => {
    render(<PromptDialog {...baseProps} isOpen placeholder="Folder name" />);
    expect(screen.getByPlaceholderText('Folder name')).toBeInTheDocument();
  });

  it('disables confirm while the (trimmed) input is empty', () => {
    render(<PromptDialog {...baseProps} isOpen />);
    expect(screen.getByRole('button', { name: 'confirm' })).toBeDisabled();
  });

  it('enables confirm once the input has non-whitespace content', () => {
    render(<PromptDialog {...baseProps} isOpen />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Reports' } });
    expect(screen.getByRole('button', { name: 'confirm' })).toBeEnabled();
  });

  it('passes the trimmed input value to onSubmit, then calls onClose', () => {
    const onSubmit = vi.fn();
    const onClose = vi.fn();
    render(
      <PromptDialog {...baseProps} isOpen onSubmit={onSubmit} onClose={onClose} />
    );
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '  Reports  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'confirm' }));
    expect(onSubmit).toHaveBeenCalledWith('Reports');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('submits on Enter within the form', () => {
    const onSubmit = vi.fn();
    render(<PromptDialog {...baseProps} isOpen onSubmit={onSubmit} defaultValue="Ready" />);
    fireEvent.submit(screen.getByRole('textbox').closest('form')!);
    expect(onSubmit).toHaveBeenCalledWith('Ready');
  });

  it('does not submit an empty value', () => {
    const onSubmit = vi.fn();
    const onClose = vi.fn();
    render(<PromptDialog {...baseProps} isOpen onSubmit={onSubmit} onClose={onClose} />);
    fireEvent.submit(screen.getByRole('textbox').closest('form')!);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('invokes onClose (not onSubmit) when cancel is pressed', () => {
    const onSubmit = vi.fn();
    const onClose = vi.fn();
    render(
      <PromptDialog {...baseProps} isOpen onSubmit={onSubmit} onClose={onClose} defaultValue="X" />
    );
    fireEvent.click(screen.getByRole('button', { name: 'cancel' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('invokes onClose on Escape', () => {
    const onClose = vi.fn();
    render(<PromptDialog {...baseProps} isOpen onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('invokes onClose on an outside (backdrop) mousedown', () => {
    const onClose = vi.fn();
    render(<PromptDialog {...baseProps} isOpen onClose={onClose} />);
    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalled();
  });

  it('moves focus inside the dialog when opened', () => {
    render(<PromptDialog {...baseProps} isOpen />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.contains(document.activeElement)).toBe(true);
  });
});
