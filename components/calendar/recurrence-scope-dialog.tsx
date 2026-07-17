"use client";

import { useState, useId } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Repeat, Trash2 } from "lucide-react";

export type RecurrenceEditScope = "this" | "this_and_future" | "all";

interface RecurrenceScopeDialogProps {
  isOpen: boolean;
  actionType: "edit" | "delete";
  onSelect: (scope: RecurrenceEditScope) => void;
  onClose: () => void;
}

export function RecurrenceScopeDialog({
  isOpen,
  actionType,
  onSelect,
  onClose,
}: RecurrenceScopeDialogProps) {
  const t = useTranslations("calendar.recurrence_scope");
  const id = useId();
  const [selected, setSelected] = useState<RecurrenceEditScope>("this");

  const isDelete = actionType === "delete";
  const heading = isDelete ? t("delete_title") : t("edit_title");

  const options: { value: RecurrenceEditScope; label: string }[] = [
    { value: "this", label: t("this_event") },
    { value: "this_and_future", label: t("this_and_future") },
    { value: "all", label: t("all_events") },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent showCloseButton={false} className="max-w-sm gap-0 p-0">
        <div className="p-6">
          <div className="flex items-start gap-3 mb-4">
            <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
              isDelete ? "bg-destructive/10" : "bg-primary/10"
            }`}>
              {isDelete ? (
                <Trash2 className="w-5 h-5 text-destructive" />
              ) : (
                <Repeat className="w-5 h-5 text-primary" />
              )}
            </div>
            <div>
              <DialogTitle className="text-lg font-semibold">{heading}</DialogTitle>
              <DialogDescription className="mt-1">
                {t("description")}
              </DialogDescription>
            </div>
          </div>

          <div className="flex flex-col gap-2" role="radiogroup" aria-label={heading}>
            {options.map((option) => (
              <label
                key={option.value}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md cursor-pointer transition-colors ${
                  selected === option.value
                    ? "bg-primary/10 border border-primary/30"
                    : "hover:bg-muted border border-transparent"
                }`}
              >
                <input
                  type="radio"
                  name={`${id}-scope`}
                  value={option.value}
                  checked={selected === option.value}
                  onChange={() => setSelected(option.value)}
                  className="accent-primary"
                />
                <span className="text-sm">{option.label}</span>
              </label>
            ))}
          </div>
        </div>

        <DialogFooter className="px-6 pb-6">
          <Button variant="outline" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            variant={isDelete ? "destructive" : "default"}
            onClick={() => onSelect(selected)}
          >
            {isDelete ? t("delete") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
