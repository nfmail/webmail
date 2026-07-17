"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Globe } from "lucide-react";
import type { IJMAPClient } from '@/lib/jmap/client-interface';
import { useCalendarStore, type ICalSubscription } from "@/stores/calendar-store";
import { CalendarColorPicker } from "@/components/settings/calendar-management-settings";
import { toast } from "@/stores/toast-store";

interface ICalSubscriptionModalProps {
  client: IJMAPClient;
  onClose: () => void;
  editSubscription?: ICalSubscription;
  initialUrl?: string;
  initialName?: string;
}

export function ICalSubscriptionModal({ client, onClose, editSubscription, initialUrl, initialName }: ICalSubscriptionModalProps) {
  const t = useTranslations("calendar.subscription");
  const tCommon = useTranslations("common");
  const addICalSubscription = useCalendarStore((s) => s.addICalSubscription);
  const updateICalSubscription = useCalendarStore((s) => s.updateICalSubscription);

  const isEdit = !!editSubscription;

  const [url, setUrl] = useState(editSubscription?.url || initialUrl || "");
  const [name, setName] = useState(editSubscription?.name || initialName || "");
  const [color, setColor] = useState(editSubscription?.color || "#3b82f6");
  const [refreshInterval, setRefreshInterval] = useState(editSubscription?.refreshInterval || 60);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValid = url.trim().length > 0 && name.trim().length > 0;

  const handleSubmit = useCallback(async () => {
    let trimmedUrl = url.trim();
    if (!trimmedUrl || !name.trim()) return;

    // Convert webcal:// to https://
    if (trimmedUrl.startsWith("webcal://")) {
      trimmedUrl = trimmedUrl.replace(/^webcal:\/\//, "https://");
    }

    try {
      new URL(trimmedUrl);
    } catch {
      setError(t("invalid_url"));
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      if (isEdit && editSubscription) {
        const updates: { url?: string; name?: string; color?: string; refreshInterval?: number } = {};
        if (trimmedUrl !== editSubscription.url) updates.url = trimmedUrl;
        if (name.trim() !== editSubscription.name) updates.name = name.trim();
        if (color !== editSubscription.color) updates.color = color;
        if (refreshInterval !== editSubscription.refreshInterval) updates.refreshInterval = refreshInterval;
        await updateICalSubscription(client, editSubscription.id, updates);
        toast.success(t("updated", { name: name.trim() }));
        onClose();
      } else {
        const subscription = await addICalSubscription(client, trimmedUrl, name.trim(), color, refreshInterval);
        if (subscription) {
          toast.success(t("success", { name: name.trim() }));
          onClose();
        } else {
          setError(t("error"));
        }
      }
    } catch {
      setError(isEdit ? t("update_error") : t("error"));
    } finally {
      setIsSubmitting(false);
    }
  }, [url, name, color, refreshInterval, client, isEdit, editSubscription, addICalSubscription, updateICalSubscription, onClose, t]);

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !isSubmitting) onClose(); }}>
      <DialogContent
        showCloseButton={!isSubmitting}
        className="max-w-md gap-0 p-0"
        aria-label={t("title")}
      >
        <DialogHeader className="flex-row items-center gap-2 px-6 py-4 border-b border-border">
          <Globe className="w-5 h-5 text-primary" />
          <DialogTitle className="text-lg font-semibold">{isEdit ? t("edit_title") : t("title")}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 px-6 py-4">
          <p className="text-sm text-muted-foreground">{t("description")}</p>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              {t("url_label")}
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={t("url_placeholder")}
              autoFocus
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              disabled={isSubmitting}
              onKeyDown={(e) => { if (e.key === "Enter" && isValid) handleSubmit(); }}
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              {t("name_label")}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("name_placeholder")}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              disabled={isSubmitting}
              onKeyDown={(e) => { if (e.key === "Enter" && isValid) handleSubmit(); }}
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              {t("color_label")}
            </label>
            <CalendarColorPicker value={color} onChange={setColor} allowCustom />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              {t("refresh_interval")}
            </label>
            <Select
              value={String(refreshInterval)}
              onValueChange={(v) => setRefreshInterval(Number(v))}
              disabled={isSubmitting}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15">{t("interval_15")}</SelectItem>
                <SelectItem value="30">{t("interval_30")}</SelectItem>
                <SelectItem value="60">{t("interval_60")}</SelectItem>
                <SelectItem value="360">{t("interval_360")}</SelectItem>
                <SelectItem value="1440">{t("interval_1440")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
              {error}
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            {tCommon("cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin me-2" />
                {isEdit ? t("saving") : t("subscribing")}
              </>
            ) : (
              isEdit ? t("save") : t("subscribe")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
