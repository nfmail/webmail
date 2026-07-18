"use client";

import { useTranslations } from "@/i18n/client";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SearchFilters } from "@/lib/jmap/search-utils";

interface SearchChipsProps {
  filters: SearchFilters;
  onRemoveFilter: (key: keyof SearchFilters) => void;
  onClearAll: () => void;
  className?: string;
}

export function SearchChips({
  filters,
  onRemoveFilter,
  onClearAll,
  className,
}: SearchChipsProps) {
  const t = useTranslations();

  const chips: { key: keyof SearchFilters; label: string; value: string }[] = [];

  if (filters.from) {
    chips.push({ key: "from", label: t("From"), value: filters.from });
  }
  if (filters.to) {
    chips.push({ key: "to", label: t("To"), value: filters.to });
  }
  if (filters.subject) {
    chips.push({ key: "subject", label: t("Subject"), value: filters.subject });
  }
  if (filters.body) {
    chips.push({ key: "body", label: t("Body"), value: filters.body });
  }
  if (filters.hasAttachment !== null) {
    chips.push({
      key: "hasAttachment",
      label: t("Attachments"),
      value: filters.hasAttachment ? t("Yes") : t("No"),
    });
  }
  if (filters.dateAfter) {
    chips.push({ key: "dateAfter", label: t("After"), value: filters.dateAfter });
  }
  if (filters.dateBefore) {
    chips.push({ key: "dateBefore", label: t("Before"), value: filters.dateBefore });
  }
  if (filters.isUnread !== null) {
    chips.push({
      key: "isUnread",
      label: filters.isUnread ? t("Unread") : t("Read"),
      value: "",
    });
  }
  if (filters.isStarred !== null) {
    chips.push({
      key: "isStarred",
      label: t("Starred"),
      value: filters.isStarred ? t("Yes") : t("No"),
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className={cn("px-4 py-2 border-b border-border bg-muted/20 flex items-center gap-2 flex-wrap", className)}>
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary border border-primary/20"
        >
          <span className="font-medium">{chip.label}</span>
          {chip.value && (
            <>
              <span className="text-primary">:</span>
              <span className="max-w-24 truncate">{chip.value}</span>
            </>
          )}
          <button
            type="button"
            onClick={() => onRemoveFilter(chip.key)}
            className="ms-0.5 p-0.5 rounded-full hover:bg-primary/20 transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      {chips.length > 1 && (
        <button
          type="button"
          onClick={onClearAll}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {t("Clear all")}
        </button>
      )}
    </div>
  );
}
