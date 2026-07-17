import { render, screen, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { Button } from '../button';

/**
 * Characterization tests: lock the CURRENT public behavior of the hand-rolled
 * Button before it is swapped for an API-compatible shadcn version.
 *
 * These assert public API behavior (props, callbacks, ref forwarding, semantic
 * attributes) rather than internal class names, so they should keep passing
 * after an API-compatible swap.
 */
describe('Button (characterization)', () => {
  it('renders a native <button> element', () => {
    render(<Button>Go</Button>);
    expect(screen.getByRole('button', { name: 'Go' }).tagName).toBe('BUTTON');
  });

  it('accepts every documented variant without throwing', () => {
    for (const variant of ['default', 'ghost', 'outline', 'destructive'] as const) {
      const { unmount } = render(<Button variant={variant}>{variant}</Button>);
      expect(screen.getByText(variant)).toBeInTheDocument();
      unmount();
    }
  });

  it('accepts every documented size without throwing', () => {
    for (const size of ['sm', 'md', 'lg', 'icon'] as const) {
      const { unmount } = render(<Button size={size}>{size}</Button>);
      expect(screen.getByText(size)).toBeInTheDocument();
      unmount();
    }
  });

  it('renders distinct variants with distinct styling (loose contract)', () => {
    const { rerender } = render(<Button variant="default">X</Button>);
    const defaultClass = screen.getByText('X').className;
    rerender(<Button variant="destructive">X</Button>);
    const destructiveClass = screen.getByText('X').className;
    expect(defaultClass).not.toBe(destructiveClass);
  });

  it('forwards a ref to the underlying button node', () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Ref</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    expect(ref.current?.textContent).toBe('Ref');
  });

  it('does not fire onClick while disabled', () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Disabled
      </Button>
    );
    fireEvent.click(screen.getByText('Disabled'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('passes through the type attribute', () => {
    render(<Button type="submit">Submit</Button>);
    expect(screen.getByText('Submit')).toHaveAttribute('type', 'submit');
  });

  it('has no implicit type attribute when none is provided', () => {
    // Current behavior: type is not defaulted; the native default applies.
    render(<Button>NoType</Button>);
    expect(screen.getByText('NoType')).not.toHaveAttribute('type');
  });

  it('merges a caller-supplied className with the base classes', () => {
    render(<Button className="custom-marker">Merged</Button>);
    const btn = screen.getByText('Merged');
    expect(btn).toHaveClass('custom-marker');
    // A base structural class remains present alongside the custom one.
    expect(btn.className).toContain('inline-flex');
  });

  it('forwards arbitrary DOM props (aria-label, data-*)', () => {
    render(
      <Button aria-label="labelled" data-testid="btn-x">
        icon
      </Button>
    );
    const btn = screen.getByTestId('btn-x');
    expect(btn).toHaveAttribute('aria-label', 'labelled');
  });
});
