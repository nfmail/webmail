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
  const t = useTranslations("calendar.management");
  const tCommon = useTranslations("common");
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
        toast.success(t("calendar_created"));
        onClose();
      } else {
        toast.error(t("error_create"));
      }
    } catch {
      toast.error(t("error_create"));
    } finally {
      setIsSubmitting(false);
    }
  }, [name, color, client, createCalendar, onClose, t]);

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !isSubmitting) onClose(); }}>
      <DialogContent
        showCloseButton={!isSubmitting}
        className="max-w-md gap-0 p-0"
        aria-label={t("add_calendar")}
      >
        <DialogHeader className="flex-row items-center gap-2 px-6 py-4 border-b border-border">
          <CalendarIcon className="w-5 h-5 text-primary" />
          <DialogTitle className="text-lg font-semibold">{t("add_calendar")}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 px-6 py-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              {t("name")}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("name_placeholder")}
              autoFocus
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              disabled={isSubmitting}
              onKeyDown={(e) => { if (e.key === "Enter" && isValid) handleSubmit(); }}
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              {t("color")}
            </label>
            <CalendarColorPicker value={color} onChange={setColor} allowCustom />
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            {tCommon("cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin me-2" />
                {tCommon("loading")}
              </>
            ) : (
              t("create")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
