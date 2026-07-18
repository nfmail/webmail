"use client";

import { useCallback, useEffect, useRef } from "react";
import { useTranslations } from "@/i18n/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Paperclip,
  Star,
  Mail,
  MailOpen,
  X,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SearchFilters } from "@/lib/jmap/search-utils";

interface AdvancedSearchPanelProps {
  filters: SearchFilters;
  isOpen: boolean;
  onFiltersChange: (filters: Partial<SearchFilters>) => void;
  onClear: () => void;
  onSearch: () => void;
  onClose: () => void;
}

export function AdvancedSearchPanel({
  filters,
  isOpen,
  onFiltersChange,
  onClear,
  onSearch,
  onClose,
}: AdvancedSearchPanelProps) {
  const t = useTranslations();
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const debouncedSearch = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      onSearch();
    }, 300);
  }, [onSearch]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const handleTextChange = (field: keyof SearchFilters, value: string) => {
    onFiltersChange({ [field]: value });
    debouncedSearch();
  };

  const handleToggle = (field: "hasAttachment" | "isUnread" | "isStarred", current: boolean | null) => {
    const next = current === null ? true : current === true ? false : null;
    onFiltersChange({ [field]: next });
    onSearch();
  };

  const handleDateChange = (field: "dateAfter" | "dateBefore", value: string) => {
    onFiltersChange({ [field]: value });
    onSearch();
  };

  const handleClear = () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    onClear();
  };

  if (!isOpen) return null;

  return (
    <div className="border-b border-border bg-muted/30 animate-in slide-in-from-top-2 fade-in duration-200">
      <div className="px-4 py-3">
        <FieldGroup className="gap-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">{t("Advanced Search")}</span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={handleClear} className="h-7 px-2 text-xs">
              <RotateCcw className="w-3 h-3 me-1" />
              {t("Clear")}
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Field className="gap-1.5">
            <FieldLabel htmlFor="adv-search-from" className="text-xs font-normal text-muted-foreground">{t("From")}</FieldLabel>
            <Input
              id="adv-search-from"
              value={filters.from}
              onChange={(e) => handleTextChange("from", e.target.value)}
              placeholder={t("Sender email or name")}
              className="h-8 text-sm"
            />
          </Field>
          <Field className="gap-1.5">
            <FieldLabel htmlFor="adv-search-to" className="text-xs font-normal text-muted-foreground">{t("To")}</FieldLabel>
            <Input
              id="adv-search-to"
              value={filters.to}
              onChange={(e) => handleTextChange("to", e.target.value)}
              placeholder={t("Recipient email or name")}
              className="h-8 text-sm"
            />
          </Field>
        </div>

        <Field className="gap-1.5">
          <FieldLabel htmlFor="adv-search-subject" className="text-xs font-normal text-muted-foreground">{t("Subject")}</FieldLabel>
          <Input
            id="adv-search-subject"
            value={filters.subject}
            onChange={(e) => handleTextChange("subject", e.target.value)}
            placeholder={t("Subject contains...")}
            className="h-8 text-sm"
          />
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field className="gap-1.5">
            <FieldLabel htmlFor="adv-search-date-after" className="text-xs font-normal text-muted-foreground">{t("After")}</FieldLabel>
            <Input
              id="adv-search-date-after"
              type="date"
              value={filters.dateAfter}
              onChange={(e) => handleDateChange("dateAfter", e.target.value)}
              className="h-8 text-sm"
            />
          </Field>
          <Field className="gap-1.5">
            <FieldLabel htmlFor="adv-search-date-before" className="text-xs font-normal text-muted-foreground">{t("Before")}</FieldLabel>
            <Input
              id="adv-search-date-before"
              type="date"
              value={filters.dateBefore}
              onChange={(e) => handleDateChange("dateBefore", e.target.value)}
              className="h-8 text-sm"
            />
          </Field>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <ToggleFilterButton
            icon={<Paperclip className="w-3.5 h-3.5" />}
            label={t("Attachments")}
            value={filters.hasAttachment}
            onClick={() => handleToggle("hasAttachment", filters.hasAttachment)}
          />
          <ToggleFilterButton
            icon={<Star className="w-3.5 h-3.5" />}
            label={t("Starred")}
            value={filters.isStarred}
            onClick={() => handleToggle("isStarred", filters.isStarred)}
          />
          <ToggleFilterButton
            icon={filters.isUnread === false ? <MailOpen className="w-3.5 h-3.5" /> : <Mail className="w-3.5 h-3.5" />}
            label={filters.isUnread === false ? t("Read") : t("Unread")}
            value={filters.isUnread}
            onClick={() => handleToggle("isUnread", filters.isUnread)}
          />
        </div>
        </FieldGroup>
      </div>
    </div>
  );
}

function ToggleFilterButton({
  icon,
  label,
  value,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: boolean | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-colors border",
        value === true && "bg-primary/10 border-primary/30 text-primary",
        value === false && "bg-muted border-border text-muted-foreground line-through",
        value === null && "bg-background border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground"
      )}
    >
      {icon}
      {label}
    </button>
  );
}
