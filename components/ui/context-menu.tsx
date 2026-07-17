"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

interface Position {
  x: number;
  y: number;
}

interface ContextMenuProps {
  isOpen: boolean;
  position: Position;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * Data-driven, fully controlled context menu.
 *
 * The public API (props on ContextMenu / ContextMenuItem / ... ) is preserved
 * from the original hand-rolled popup so the ~9 call sites compile unchanged.
 * Under the hood it is now implemented over Radix DropdownMenu:
 *
 * - visibility is driven by `isOpen` (Radix `open`);
 * - the menu is anchored to an invisible, zero-size, fixed-position trigger
 *   placed at `position`, so callers keep passing the raw pointer coordinates
 *   they already compute;
 * - `onClose` is now genuinely wired: Escape, outside interaction, and item
 *   selection all flow through Radix `onOpenChange(false)`. Call sites already
 *   pass a working `onClose` and set their own state in item handlers, so the
 *   extra close is an idempotent state-set.
 *
 * The forwarded `ref` is attached to the menu content node; `useContextMenu`
 * relies on it for its own outside-click / scroll dismissal.
 */
export const ContextMenu = React.forwardRef<HTMLDivElement, ContextMenuProps>(
  ({ isOpen, position, onClose, children }, ref) => {
    const handleOpenChange = (open: boolean) => {
      if (!open) onClose();
    };

    return (
      <DropdownMenuPrimitive.Root
        open={isOpen}
        onOpenChange={handleOpenChange}
        modal={false}
      >
        <DropdownMenuPrimitive.Trigger
          aria-hidden
          tabIndex={-1}
          style={{
            position: "fixed",
            left: position.x,
            top: position.y,
            width: 0,
            height: 0,
            padding: 0,
            margin: 0,
            border: 0,
            opacity: 0,
            pointerEvents: "none",
          }}
        />
        <DropdownMenuPrimitive.Portal>
          <DropdownMenuPrimitive.Content
            ref={ref}
            side="bottom"
            align="start"
            sideOffset={0}
            onCloseAutoFocus={(e) => e.preventDefault()}
            className={cn(
              "z-50 min-w-[200px] overflow-hidden rounded-md border border-border bg-background py-1 shadow-lg",
              "focus:outline-none"
            )}
          >
            {/* The scrollable region lives on this inner wrapper (not the menu
                content itself) so it can carry tabIndex={0}: Radix pins the
                [role=menu] element at tabindex=-1 for its roving-focus model,
                which trips axe's scrollable-region-focusable (Safari keyboard
                access) rule. A focusable group with an accessible name keeps
                the scroll container reachable by keyboard. */}
            <div
              role="group"
              aria-label="Menu options"
              tabIndex={0}
              className="max-h-[min(calc(100vh-20px),320px)] overflow-y-auto focus:outline-none"
            >
              {children}
            </div>
          </DropdownMenuPrimitive.Content>
        </DropdownMenuPrimitive.Portal>
      </DropdownMenuPrimitive.Root>
    );
  }
);

ContextMenu.displayName = "ContextMenu";

interface ContextMenuItemProps {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
  shortcut?: string;
}

export function ContextMenuItem({
  icon: Icon,
  label,
  onClick,
  disabled = false,
  destructive = false,
  shortcut,
}: ContextMenuItemProps) {
  return (
    <DropdownMenuPrimitive.Item
      disabled={disabled}
      data-variant={destructive ? "destructive" : "default"}
      // Preserve the original popup's behavior of not letting item clicks bubble
      // to ancestor React handlers. React portals bubble synthetic events through
      // the React tree, so without this an item click would reach the wrapping
      // row/onContextMenu handlers the way the old `e.stopPropagation()` prevented.
      onClick={(e) => e.stopPropagation()}
      onSelect={() => {
        // Radix already closes the menu on select (→ onClose); we only need to
        // run the caller's handler.
        onClick();
      }}
      className={cn(
        "w-full px-3 py-1.5 text-sm flex items-center gap-2 select-none outline-none",
        "transition-colors duration-150 cursor-pointer",
        "focus:bg-muted data-[highlighted]:bg-muted",
        "data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed data-[disabled]:pointer-events-none",
        destructive &&
          // Light: #dc2626 clears 4.5:1 on the white menu surface. Dark: #dc2626
          // as text on #0a0a0a is only 4.10:1, so use the lighter red-400 which
          // clears 4.5:1 there. (The solid --color-destructive token stays
          // #dc2626 because it must keep working as a button *background*.)
          "text-destructive dark:text-red-400 focus:bg-destructive/10 data-[highlighted]:bg-destructive/10"
      )}
    >
      {Icon && <Icon className="w-4 h-4 flex-shrink-0" />}
      <span className="flex-1">{label}</span>
      {shortcut && (
        <span className="text-xs text-muted-foreground ms-auto">{shortcut}</span>
      )}
    </DropdownMenuPrimitive.Item>
  );
}

export function ContextMenuSeparator() {
  return (
    <DropdownMenuPrimitive.Separator className="h-px bg-border my-1" />
  );
}

interface ContextMenuSubMenuProps {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}

export function ContextMenuSubMenu({
  icon: Icon,
  label,
  children,
}: ContextMenuSubMenuProps) {
  return (
    <DropdownMenuPrimitive.Sub>
      <DropdownMenuPrimitive.SubTrigger
        className={cn(
          "w-full px-3 py-1.5 text-sm flex items-center gap-2 select-none outline-none",
          "transition-colors duration-150 cursor-pointer",
          "focus:bg-muted data-[highlighted]:bg-muted data-[state=open]:bg-muted"
        )}
      >
        {Icon && <Icon className="w-4 h-4 flex-shrink-0" />}
        <span className="flex-1">{label}</span>
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
      </DropdownMenuPrimitive.SubTrigger>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.SubContent
          sideOffset={2}
          className={cn(
            "z-50 min-w-[180px] overflow-hidden rounded-md border border-border bg-background py-1 shadow-lg"
          )}
        >
          {/* Scrollable region on a focusable inner group — see ContextMenu
              content above for why the [role=menu] element can't carry it. */}
          <div
            role="group"
            aria-label="Submenu options"
            tabIndex={0}
            className="max-h-[min(300px,calc(100vh-40px))] overflow-y-auto focus:outline-none"
          >
            {children}
          </div>
        </DropdownMenuPrimitive.SubContent>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Sub>
  );
}

interface ContextMenuHeaderProps {
  children: React.ReactNode;
}

export function ContextMenuHeader({ children }: ContextMenuHeaderProps) {
  return (
    <DropdownMenuPrimitive.Label className="px-3 py-2 text-xs font-medium text-muted-foreground border-b border-border">
      {children}
    </DropdownMenuPrimitive.Label>
  );
}
