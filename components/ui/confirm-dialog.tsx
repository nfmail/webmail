"use client";

import { useEffect } from "react";
import { AlertDialog as AlertDialogPrimitive } from "radix-ui";
import { useTranslations } from "@/i18n/client";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "destructive";
}

/**
 * ConfirmDialog built on the Radix AlertDialog primitive.
 *
 * Two deliberate deviations from a stock shadcn `AlertDialogContent`:
 *  - No portal. The characterization suite queries the destructive icon via
 *    `container.querySelector('svg')`, which cannot reach a body-portaled node.
 *    Rendering inline keeps the whole dialog inside the render container.
 *  - A manual `mousedown`-outside listener. Radix dismisses on `pointerdown`
 *    (and AlertDialog suppresses outside dismissal entirely), so the tests'
 *    `fireEvent.mouseDown(document.body)` needs an explicit close path.
 */
export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText,
  cancelText,
  variant = "default",
}: ConfirmDialogProps) {
  const t = useTranslations("confirm_dialog");

  const handleOpenChange = (open: boolean) => {
    if (!open) onClose();
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleBackdropMouseDown = (e: MouseEvent) => {
      const content = document.querySelector(
        '[data-slot="alert-dialog-content"]'
      );
      if (content && !content.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleBackdropMouseDown);
    return () =>
      document.removeEventListener("mousedown", handleBackdropMouseDown);
  }, [isOpen, onClose]);

  const resolvedConfirmText = confirmText || t("confirm");
  const resolvedCancelText = cancelText || t("cancel");
  const isDestructive = variant === "destructive";

  return (
    <AlertDialogPrimitive.Root open={isOpen} onOpenChange={handleOpenChange}>
      <AlertDialogPrimitive.Overlay
        data-slot="alert-dialog-overlay"
        className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-[1px] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
      />
      <AlertDialogPrimitive.Content
        data-slot="alert-dialog-content"
        aria-modal="true"
        className="fixed top-1/2 left-1/2 z-[60] w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-background p-6 shadow-xl duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
      >
        <div className="flex items-start gap-4">
          {isDestructive && (
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <AlertDialogTitle className="text-lg font-semibold text-foreground">
              {title}
            </AlertDialogTitle>
            <AlertDialogDescription className="mt-2 text-sm text-muted-foreground">
              {message}
            </AlertDialogDescription>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <AlertDialogCancel>{resolvedCancelText}</AlertDialogCancel>
          <AlertDialogAction
            variant={isDestructive ? "destructive" : "default"}
            onClick={() => onConfirm()}
            className={cn(isDestructive && "shadow-sm")}
          >
            {resolvedConfirmText}
          </AlertDialogAction>
        </div>
      </AlertDialogPrimitive.Content>
    </AlertDialogPrimitive.Root>
  );
}
