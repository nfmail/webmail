"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Calendar as CalendarIcon } from "lucide-react";
import type { IJMAPClient } from "@/lib/jmap/client-interface";
import { useCalendarStore } from "@/stores/calendar-store";
import { CalendarColorPicker } from "@/components/settings/calendar-management-settings";
import { toast } from "@/stores/toast-store";

interface CreateCalendarModalProps {
  client: IJMAPClient;
  onClose: () => void;
}

export function CreateCalendarModal({ client, onClose }: CreateCalendarModalProps) {
  const t = useTranslations();
  const tCommon = useTranslations();
  const createCalendar = useCalendarStore((s) => s.createCalendar);

  const [name, setName] = useState("");
  const [color, setColor] = useState("#3b82f6");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isValid = name.trim().length > 0;

  const handleSubmit = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setIsSubmitting(true);
    try {
      const created = await createCalendar(client, { name: trimmed, color });
      if (created) {
        toast.success(t("Calendar created"));
        onClose();
      } else {
        toast.error(t("Failed to create calendar"));
      }
    } catch {
      toast.error(t("Failed to create calendar"));
    } finally {
      setIsSubmitting(false);
    }
  }, [name, color, client, createCalendar, onClose, t]);

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !isSubmitting) onClose(); }}>
      <DialogContent
        showCloseButton={!isSubmitting}
        className="max-w-md gap-0 p-0"
        aria-label={t("Add calendar")}
      >
        <DialogHeader className="flex-row items-center gap-2 px-6 py-4 border-b border-border">
          <CalendarIcon className="w-5 h-5 text-primary" />
          <DialogTitle className="text-lg font-semibold">{t("Add calendar")}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 px-6 py-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              {t("Name")}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("Calendar name")}
              autoFocus
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              disabled={isSubmitting}
              onKeyDown={(e) => { if (e.key === "Enter" && isValid) handleSubmit(); }}
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              {t("Color")}
            </label>
            <CalendarColorPicker value={color} onChange={setColor} allowCustom />
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            {tCommon("Cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin me-2" />
                {tCommon("Loading...")}
              </>
            ) : (
              t("Create")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
