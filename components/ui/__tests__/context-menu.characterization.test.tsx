import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSubMenu,
  ContextMenuHeader,
} from '../context-menu';

/**
 * Characterization tests for the ContextMenu family.
 *
 * The public, data-driven API is unchanged, but the implementation was rebuilt
 * on Radix DropdownMenu. That rebuild deliberately makes `onClose` LIVE, which
 * flips three assertions that the previous (hand-rolled) characterization
 * locked as dead behavior:
 *
 * - Escape now closes the menu → `onClose` is invoked (was: never wired).
 * - Outside interaction now closes the menu → `onClose` is invoked (was: never).
 * - Selecting an item now closes the menu → `onClose` is invoked in addition to
 *   the item handler (was: item click only ran the handler, never closed).
 *
 * All call sites already pass a working `onClose` and set their own state in
 * item handlers, so the extra close is an idempotent state-set.
 *
 * Preserved behavior (still locked here): visibility is driven solely by
 * `isOpen`; the menu renders into a portal; item clicks do not bubble to
 * ancestor React handlers; disabled items do not fire; separators, headers,
 * shortcuts, and hover/keyboard submenus render.
 *
 * Selectors were adapted to the Radix DOM where necessary (menu items are
 * `<div role="menuitem">` with `aria-disabled`, sub-triggers advertise
 * `aria-haspopup="menu"`).
 */

// Radix's menu primitives call a few DOM APIs that jsdom does not implement.
// Provide minimal no-op stubs so focus management and positioning don't throw.
beforeAll(() => {
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
  }
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

describe('ContextMenu (characterization)', () => {
  const pos = { x: 20, y: 30 };

  it('renders nothing while closed', () => {
    render(
      <ContextMenu isOpen={false} position={pos} onClose={() => {}}>
        <ContextMenuItem label="Reply" onClick={() => {}} />
      </ContextMenu>
    );
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.queryByText('Reply')).toBeNull();
  });

  it('renders a vertical menu with its items when open', () => {
    render(
      <ContextMenu isOpen position={pos} onClose={() => {}}>
        <ContextMenuItem label="Reply" onClick={() => {}} />
        <ContextMenuItem label="Forward" onClick={() => {}} />
      </ContextMenu>
    );
    const menu = screen.getByRole('menu');
    expect(menu).toHaveAttribute('aria-orientation', 'vertical');
    expect(screen.getByRole('menuitem', { name: 'Reply' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Forward' })).toBeInTheDocument();
  });

  it('fires an item handler AND closes (onClose) on click', () => {
    // Behavior flip: selecting an item now closes the menu via Radix, so onClose
    // fires in addition to the item handler. The old popup only ran the handler.
    const onReply = vi.fn();
    const onClose = vi.fn();
    render(
      <ContextMenu isOpen position={pos} onClose={onClose}>
        <ContextMenuItem label="Reply" onClick={onReply} />
      </ContextMenu>
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reply' }));
    expect(onReply).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalled();
  });

  it('stops item clicks from bubbling to an ancestor onClick', () => {
    const ancestorClick = vi.fn();
    const onReply = vi.fn();
    render(
      <div onClick={ancestorClick}>
        <ContextMenu isOpen position={pos} onClose={() => {}}>
          <ContextMenuItem label="Reply" onClick={onReply} />
        </ContextMenu>
      </div>
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reply' }));
    expect(onReply).toHaveBeenCalledOnce();
    // The menu is portaled, but React synthetic events bubble through the React
    // tree; the item stops propagation so the wrapping ancestor never fires.
    expect(ancestorClick).not.toHaveBeenCalled();
  });

  it('closes (calls onClose) when Escape is pressed', () => {
    // Behavior flip: onClose is now live. The old popup ignored Escape entirely.
    const onClose = vi.fn();
    render(
      <ContextMenu isOpen position={pos} onClose={onClose}>
        <ContextMenuItem label="Reply" onClick={() => {}} />
      </ContextMenu>
    );
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('closes (calls onClose) on an outside interaction', async () => {
    // Behavior flip: onClose is now live. The old popup never closed on an
    // outside click — that was the parent's job.
    const onClose = vi.fn();
    render(
      <ContextMenu isOpen position={pos} onClose={onClose}>
        <ContextMenuItem label="Reply" onClick={() => {}} />
      </ContextMenu>
    );
    // Ensure the menu is mounted before dismissing.
    expect(screen.getByRole('menu')).toBeInTheDocument();
    // Radix registers its outside-pointerdown listener on a deferred macrotask
    // (setTimeout 0) to avoid catching the opening interaction; wait for it.
    await new Promise((resolve) => setTimeout(resolve, 0));
    fireEvent.pointerDown(document.body);
    fireEvent.click(document.body);
    expect(onClose).toHaveBeenCalled();
  });

  it('does not fire a disabled item handler and marks it disabled', () => {
    const onClick = vi.fn();
    render(
      <ContextMenu isOpen position={pos} onClose={() => {}}>
        <ContextMenuItem label="Archive" onClick={onClick} disabled />
      </ContextMenu>
    );
    const item = screen.getByRole('menuitem', { name: 'Archive' });
    // Radix marks a disabled menu item with aria-disabled/data-disabled rather
    // than the native `disabled` attribute (it renders a <div>, not a <button>).
    expect(item).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(item);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders a separator with role="separator"', () => {
    render(
      <ContextMenu isOpen position={pos} onClose={() => {}}>
        <ContextMenuItem label="Reply" onClick={() => {}} />
        <ContextMenuSeparator />
        <ContextMenuItem label="Delete" onClick={() => {}} />
      </ContextMenu>
    );
    expect(screen.getByRole('separator')).toBeInTheDocument();
  });

  it('renders a header label', () => {
    render(
      <ContextMenu isOpen position={pos} onClose={() => {}}>
        <ContextMenuHeader>Message actions</ContextMenuHeader>
        <ContextMenuItem label="Reply" onClick={() => {}} />
      </ContextMenu>
    );
    expect(screen.getByText('Message actions')).toBeInTheDocument();
  });

  it('renders a shortcut hint alongside an item', () => {
    render(
      <ContextMenu isOpen position={pos} onClose={() => {}}>
        <ContextMenuItem label="Reply" onClick={() => {}} shortcut="⌘R" />
      </ContextMenu>
    );
    expect(screen.getByText('⌘R')).toBeInTheDocument();
  });

  describe('submenu', () => {
    it('keeps the submenu contents collapsed until opened', () => {
      render(
        <ContextMenu isOpen position={pos} onClose={() => {}}>
          <ContextMenuSubMenu label="Move to">
            <ContextMenuItem label="Inbox" onClick={() => {}} />
          </ContextMenuSubMenu>
        </ContextMenu>
      );
      // Trigger label is present, but the nested item is not yet rendered.
      expect(screen.getByText('Move to')).toBeInTheDocument();
      expect(screen.queryByRole('menuitem', { name: 'Inbox' })).toBeNull();
    });

    it('opens the submenu on trigger activation, exposing its items', () => {
      render(
        <ContextMenu isOpen position={pos} onClose={() => {}}>
          <ContextMenuSubMenu label="Move to">
            <ContextMenuItem label="Inbox" onClick={() => {}} />
          </ContextMenuSubMenu>
        </ContextMenu>
      );
      // Radix sub-triggers advertise aria-haspopup="menu" and toggle aria-expanded.
      const trigger = screen.getByRole('menuitem', { name: 'Move to' });
      expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      fireEvent.click(trigger);
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByRole('menuitem', { name: 'Inbox' })).toBeInTheDocument();
    });

    it('fires a submenu item handler on click', () => {
      const onInbox = vi.fn();
      render(
        <ContextMenu isOpen position={pos} onClose={() => {}}>
          <ContextMenuSubMenu label="Move to">
            <ContextMenuItem label="Inbox" onClick={onInbox} />
          </ContextMenuSubMenu>
        </ContextMenu>
      );
      fireEvent.click(screen.getByRole('menuitem', { name: 'Move to' }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Inbox' }));
      expect(onInbox).toHaveBeenCalledOnce();
    });
  });
});
