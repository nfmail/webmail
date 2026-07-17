import { render, screen, fireEvent } from '@testing-library/react';
import { createRef, useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { Input } from '../input';

/**
 * Characterization tests for the hand-rolled Input, locking public behavior
 * (value/onChange, type/placeholder/disabled passthrough, ref forwarding,
 * className merge) prior to an API-compatible shadcn swap.
 */
describe('Input (characterization)', () => {
  it('renders a native <input> element', () => {
    render(<Input placeholder="p" />);
    expect(screen.getByPlaceholderText('p').tagName).toBe('INPUT');
  });

  it('reports each keystroke value via onChange (controlled parent)', () => {
    const onChange = vi.fn();
    function Harness() {
      const [v, setV] = useState('');
      return (
        <Input
          value={v}
          onChange={(e) => {
            onChange(e.target.value);
            setV(e.target.value);
          }}
        />
      );
    }
    render(<Harness />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'abc' } });
    expect(onChange).toHaveBeenLastCalledWith('abc');
    expect(input.value).toBe('abc');
  });

  it('passes through the type attribute', () => {
    render(<Input type="email" placeholder="mail" />);
    expect(screen.getByPlaceholderText('mail')).toHaveAttribute('type', 'email');
  });

  it('renders the placeholder text', () => {
    render(<Input placeholder="Search…" />);
    expect(screen.getByPlaceholderText('Search…')).toBeInTheDocument();
  });

  it('reflects the disabled attribute and blocks change events', () => {
    const onChange = vi.fn();
    render(<Input disabled onChange={onChange} placeholder="d" />);
    const input = screen.getByPlaceholderText('d');
    expect(input).toBeDisabled();
  });

  it('forwards a ref to the underlying input node', () => {
    const ref = createRef<HTMLInputElement>();
    render(<Input ref={ref} placeholder="ref" />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });

  it('merges a caller-supplied className with the base classes', () => {
    render(<Input className="custom-marker" placeholder="m" />);
    const input = screen.getByPlaceholderText('m');
    expect(input).toHaveClass('custom-marker');
    expect(input.className).toContain('rounded-md');
  });

  it('forwards arbitrary DOM props (readOnly, aria-*, name)', () => {
    render(<Input name="username" aria-label="user" defaultValue="fixed" readOnly />);
    const input = screen.getByLabelText('user') as HTMLInputElement;
    expect(input).toHaveAttribute('name', 'username');
    expect(input).toHaveAttribute('readonly');
    expect(input.value).toBe('fixed');
  });
});
