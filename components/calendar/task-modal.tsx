"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X, Trash2, CalendarDays, Bell, Flag } from "lucide-react";
import { format, parseISO } from "date-fns";

import type { CalendarTask, Calendar, CalendarEventAlert } from "@/lib/jmap/types";

interface TaskModalProps {
  task?: CalendarTask | null;
  calendars: Calendar[];
  onSave: (data: Partial<CalendarTask>) => void | Promise<void>;
  onDelete?: (id: string) => void;
  onClose: () => void;
  isMobile?: boolean;
}

type PriorityLevel = "none" | "high" | "medium" | "low";
type AlertOption = "none" | "at_time" | "5" | "15" | "30" | "60" | "1440";

function priorityToLevel(p: number): PriorityLevel {
  if (p >= 1 && p <= 4) return "high";
  if (p === 5) return "medium";
  if (p >= 6 && p <= 9) return "low";
  return "none";
}

function levelToPriority(l: PriorityLevel): number {
  switch (l) {
    case "high": return 1;
    case "medium": return 5;
    case "low": return 9;
    default: return 0;
  }
}

export function TaskModal({
  task,
  calendars,
  onSave,
  onDelete,
  onClose,
  isMobile: _isMobile,
}: TaskModalProps) {
  const t = useTranslations("calendar");
  const isEdit = !!task;
  const titleRef = useRef<HTMLInputElement>(null);

  const writableCalendars = calendars.filter(c => !c.isShared || c.myRights?.mayWriteAll || c.myRights?.mayWriteOwn);
  const defaultCalendarId = writableCalendars[0]?.id ?? calendars[0]?.id ?? "";

  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [dueDate, setDueDate] = useState(task?.due ? format(parseISO(task.due), "yyyy-MM-dd") : "");
  const [dueTime, setDueTime] = useState(task?.due && !task.showWithoutTime ? format(parseISO(task.due), "HH:mm") : "");
  const [showTime, setShowTime] = useState(task?.due ? !task.showWithoutTime : false);
  const [priority, setPriority] = useState<PriorityLevel>(priorityToLevel(task?.priority ?? 0));
  const [progress, setProgress] = useState<CalendarTask["progress"]>(task?.progress ?? "needs-action");
  const [calendarId, setCalendarId] = useState(() => {
    if (task) {
      const ids = Object.keys(task.calendarIds);
      return ids[0] ?? defaultCalendarId;
    }
    return defaultCalendarId;
  });
  const [alertOption, setAlertOption] = useState<AlertOption>(() => {
    if (!task?.alerts) return "none";
    const first = Object.values(task.alerts)[0];
    if (!first || first.trigger["@type"] !== "OffsetTrigger") return "none";
    const offset = first.trigger.offset;
    if (offset === "PT0S") return "at_time";
    const m = offset.match(/-?PT?(\d+)M$/);
    if (m) return m[1] as AlertOption;
    const h = offset.match(/-?PT?(\d+)H$/);
    if (h) return String(parseInt(h[1]) * 60) as AlertOption;
    const d = offset.match(/-?P(\d+)D/);
    if (d) return String(parseInt(d[1]) * 1440) as AlertOption;
    return "none";
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const handleSave = useCallback(async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      let due: string | null = null;
      let showWithoutTime = true;
      if (dueDate) {
        if (showTime && dueTime) {
          due = `${dueDate}T${dueTime}:00`;
          showWithoutTime = false;
        } else {
          due = dueDate;
          showWithoutTime = true;
        }
      }

      let alerts: Record<string, CalendarEventAlert> | null = null;
      if (alertOption !== "none") {
        const offset = alertOption === "at_time" ? "PT0S" : `-PT${alertOption}M`;
        alerts = {
          "default-alert": {
            "@type": "Alert",
            trigger: { "@type": "OffsetTrigger", offset, relativeTo: "start" },
            action: "display",
            acknowledged: null,
            relatedTo: null,
          },
        };
      }

      const data: Partial<CalendarTask> = {
        "@type": "Task",
        title: title.trim(),
        description: description.trim() || "",
        due,
        showWithoutTime,
        priority: levelToPriority(priority),
        progress,
        calendarIds: { [calendarId]: true },
        alerts,
      };

      if (isEdit && task) {
        data.id = task.id;
      }

      await onSave(data);
      onClose();
    } finally {
      setSaving(false);
    }
  }, [title, description, dueDate, dueTime, showTime, priority, progress, calendarId, alertOption, isEdit, task, onSave, onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleSave();
    }
  }, [onClose, handleSave]);

  return (
    <div className="flex flex-col h-full bg-background" onKeyDown={handleKeyDown}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold">
          {isEdit ? t("tasks.edit") : t("tasks.create")}
        </h2>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {/* Title */}
        <Input
          ref={titleRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("tasks.title_placeholder")}
          className="text-base font-medium"
        />

        {/* Description */}
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("tasks.description_placeholder")}
          rows={3}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
        />

        {/* Due Date */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" />
            {t("tasks.due_date")}
          </label>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            />
            {dueDate && (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={showTime}
                  onChange={(e) => setShowTime(e.target.checked)}
                  className="rounded"
                />
                {t("tasks.include_time")}
              </label>
            )}
            {showTime && (
              <input
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
              />
            )}
          </div>
        </div>

        {/* Priority */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <Flag className="h-3.5 w-3.5" />
            {t("tasks.priority")}
          </label>
          <Select value={priority} onValueChange={(v) => setPriority(v as PriorityLevel)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("tasks.priority_none")}</SelectItem>
              <SelectItem value="high">{t("tasks.priority_high")}</SelectItem>
              <SelectItem value="medium">{t("tasks.priority_medium")}</SelectItem>
              <SelectItem value="low">{t("tasks.priority_low")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Progress */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-muted-foreground">
            {t("tasks.progress")}
          </label>
          <Select value={progress} onValueChange={(v) => setProgress(v as CalendarTask["progress"])}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="needs-action">{t("tasks.progress_needs_action")}</SelectItem>
              <SelectItem value="in-process">{t("tasks.progress_in_process")}</SelectItem>
              <SelectItem value="completed">{t("tasks.progress_completed")}</SelectItem>
              <SelectItem value="cancelled">{t("tasks.progress_cancelled")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Calendar */}
        {writableCalendars.length > 1 && (
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-muted-foreground">
              {t("tasks.calendar")}
            </label>
            <Select value={calendarId} onValueChange={setCalendarId}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {writableCalendars.map((cal) => (
                  <SelectItem key={cal.id} value={cal.id}>{cal.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Alert */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <Bell className="h-3.5 w-3.5" />
            {t("tasks.alert")}
          </label>
          <Select value={alertOption} onValueChange={(v) => setAlertOption(v as AlertOption)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("tasks.alert_none")}</SelectItem>
              <SelectItem value="at_time">{t("tasks.alert_at_time")}</SelectItem>
              <SelectItem value="5">{t("tasks.alert_5min")}</SelectItem>
              <SelectItem value="15">{t("tasks.alert_15min")}</SelectItem>
              <SelectItem value="30">{t("tasks.alert_30min")}</SelectItem>
              <SelectItem value="60">{t("tasks.alert_1hr")}</SelectItem>
              <SelectItem value="1440">{t("tasks.alert_1day")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-border">
        <div>
          {isEdit && onDelete && task && (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => onDelete(task.id)}
            >
              <Trash2 className="h-4 w-4 me-1" />
              {t("tasks.delete")}
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            {t("tasks.cancel")}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!title.trim() || saving}>
            {t("tasks.save")}
          </Button>
        </div>
      </div>
    </div>
  );
}
