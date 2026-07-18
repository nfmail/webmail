"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface PromptDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (value: string) => void;
  title: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
}

/**
 * PromptDialog built on the shadcn Dialog primitive plus a text Input.
 *
 * Radix handles focus trapping, Escape, and the aria wiring. A manual
 * `mousedown`-outside listener is retained because Radix dismisses on
 * `pointerdown`, whereas the characterization suite closes the dialog with
 * `fireEvent.mouseDown(document.body)`.
 */
export function PromptDialog({
  isOpen,
  onClose,
  onSubmit,
  title,
  message,
  placeholder,
  defaultValue = "",
  confirmText,
  cancelText,
}: PromptDialogProps) {
  const t = useTranslations("confirm_dialog");
  const [value, setValue] = useState(defaultValue);

  const handleOpenChange = (open: boolean) => {
    if (!open) onClose();
  };

  useEffect(() => {
    if (isOpen) {
      setValue(defaultValue);
    }
  }, [isOpen, defaultValue]);

  useEffect(() => {
    if (!isOpen) return;

    const handleBackdropMouseDown = (e: MouseEvent) => {
      const content = document.querySelector('[data-slot="dialog-content"]');
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
  const trimmed = value.trim();
  const canSubmit = trimmed.length > 0;

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!canSubmit) return;
    try {
      onSubmit(trimmed);
    } finally {
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-w-md"
        aria-modal="true"
        aria-describedby={undefined}
      >
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-foreground">
              {title}
            </DialogTitle>
            {message ? (
              <DialogDescription className="mt-2 text-sm text-muted-foreground">
                {message}
              </DialogDescription>
            ) : null}
          </DialogHeader>

          <Input
            type="text"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            className="mt-4"
          />

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={onClose}>
              {resolvedCancelText}
            </Button>
            <Button type="submit" variant="default" disabled={!canSubmit}>
              {resolvedConfirmText}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
