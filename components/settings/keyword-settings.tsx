"use client";

import React, { useState } from "react";
import { useTranslations } from "@/i18n/client";
import { useSettingsStore, KEYWORD_PALETTE, DEFAULT_KEYWORDS, type KeywordDefinition } from "@/stores/settings-store";
import { useAuthStore } from "@/stores/auth-store";
import { useEmailStore } from "@/stores/email-store";
import { SettingsSection } from "./settings-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Plus, Pencil, Trash2, GripVertical, Check, X, RotateCcw, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const PALETTE_KEYS = Object.keys(KEYWORD_PALETTE);

function KeywordColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PALETTE_KEYS.map((colorKey) => (
        <button
          key={colorKey}
          type="button"
          onClick={() => onChange(colorKey)}
          className={cn(
            "w-6 h-6 rounded-full transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            KEYWORD_PALETTE[colorKey].dot,
            value === colorKey && "ring-2 ring-offset-2 ring-offset-background ring-foreground"
          )}
          aria-label={colorKey}
        />
      ))}
    </div>
  );
}

function KeywordRow({
  keyword,
  onEdit,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  isDragOver,
  isDragging,
}: {
  keyword: KeywordDefinition;
  onEdit: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onDragEnd: () => void;
  isDragOver: boolean;
  isDragging: boolean;
}) {
  const t = useTranslations("settings.keywords");
  const palette = KEYWORD_PALETTE[keyword.color];

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={cn(
        "flex items-center gap-3 py-2.5 px-3 rounded-md border bg-background group transition-opacity",
        isDragging ? "opacity-40" : "opacity-100",
        isDragOver ? "border-primary" : "border-border"
      )}
    >
      <GripVertical className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-50 cursor-grab" />
      <div className={cn("w-5 h-5 rounded-full shrink-0", palette?.dot || "bg-muted-foreground")} />
      <span className="flex-1 text-sm font-medium truncate">{keyword.label}</span>
      <span className="text-xs text-muted-foreground font-mono">{"$label:" + keyword.id}</span>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={onEdit}
          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title={t("edit")}
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
          title={t("delete")}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function KeywordEditForm({
  initial,
  existingIds,
  onSave,
  onCancel,
}: {
  initial?: KeywordDefinition;
  existingIds: string[];
  onSave: (keyword: KeywordDefinition) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("settings.keywords");
  const [label, setLabel] = useState(initial?.label || "");
  const [color, setColor] = useState(initial?.color || "blue");
  const isEditing = !!initial;

  const normalizedId = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  const isDuplicate = normalizedId.length > 0 && existingIds.includes(normalizedId);
  const isValid = normalizedId.length > 0 && label.trim().length > 0 && !isDuplicate;

  const handleSave = () => {
    if (!isValid) return;
    onSave({ id: normalizedId, label: label.trim(), color });
  };

  return (
    <div className="p-3 rounded-md border border-primary/30 bg-accent/30">
      <FieldGroup>
        <Field data-invalid={isDuplicate ? true : undefined}>
          <FieldLabel htmlFor="keyword-edit-label" className="text-xs">
            {t("label_field")}
          </FieldLabel>
          <Input
            id="keyword-edit-label"
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t("label_placeholder")}
            autoFocus
            maxLength={30}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            aria-invalid={isDuplicate ? true : undefined}
            aria-describedby={isDuplicate ? "keyword-edit-label-error" : undefined}
          />
          {isDuplicate && (
            <FieldError id="keyword-edit-label-error" aria-live="polite">
              {t("id_exists")}
            </FieldError>
          )}
        </Field>
        <Field>
          <FieldLabel className="text-xs">{t("color_field")}</FieldLabel>
          <KeywordColorPicker value={color} onChange={setColor} />
        </Field>
      </FieldGroup>
      <div className="flex items-center gap-2 justify-end pt-3">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          <X className="w-3.5 h-3.5" />
          {t("cancel")}
        </Button>
        <Button type="button" size="sm" onClick={handleSave} disabled={!isValid}>
          <Check className="w-3.5 h-3.5" />
          {isEditing ? t("save") : t("add")}
        </Button>
      </div>
    </div>
  );
}

export function KeywordSettings() {
  const t = useTranslations("settings.keywords");
  const { emailKeywords, addKeyword, updateKeyword, renameKeyword, removeKeyword, reorderKeywords } =
    useSettingsStore();
  const { client } = useAuthStore();
  const { fetchTagCounts } = useEmailStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const existingIds = emailKeywords.map((k) => k.id);

  const handleDragStart = (index: number) => {
    setDragIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (index !== dragOverIndex) setDragOverIndex(index);
  };

  const handleDrop = (index: number) => {
    if (dragIndex === null || dragIndex === index) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }
    const reordered = [...emailKeywords];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(index, 0, moved);
    reorderKeywords(reordered);
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleAdd = (keyword: KeywordDefinition) => {
    addKeyword(keyword);
    setIsAdding(false);
  };

  const handleEdit = async (keyword: KeywordDefinition) => {
    const oldId = editingId;
    if (!oldId) return;

    const idChanged = oldId !== keyword.id;

    if (idChanged && client) {
      setIsMigrating(true);
      try {
        const oldJmapKeyword = `$label:${oldId}`;
        const newJmapKeyword = `$label:${keyword.id}`;
        await client.migrateKeyword(oldJmapKeyword, newJmapKeyword);
        renameKeyword(oldId, keyword);
        fetchTagCounts(client);
      } catch (error) {
        console.error("Failed to migrate keyword:", error);
        const toastModule = await import('sonner');
        toastModule.toast.error(t("migration_error"));
        setIsMigrating(false);
        return;
      }
      setIsMigrating(false);
    } else {
      updateKeyword(oldId, { label: keyword.label, color: keyword.color });
    }

    setEditingId(null);
  };

  const handleDelete = (id: string) => {
    removeKeyword(id);
  };

  const handleResetDefaults = () => {
    reorderKeywords(DEFAULT_KEYWORDS);
  };

  return (
    <SettingsSection title={t("title")} description={t("description")}>
      <div className="flex flex-col gap-2">
        {isMigrating && (
          <div className="flex items-center gap-2 p-2 text-xs text-muted-foreground bg-accent/50 rounded-md">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            {t("migrating")}
          </div>
        )}
        {emailKeywords.map((keyword, index) =>
          editingId === keyword.id ? (
            <KeywordEditForm
              key={keyword.id}
              initial={keyword}
              existingIds={existingIds.filter((id) => id !== keyword.id)}
              onSave={handleEdit}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <KeywordRow
              key={keyword.id}
              keyword={keyword}
              onEdit={() => {
                setEditingId(keyword.id);
                setIsAdding(false);
              }}
              onDelete={() => handleDelete(keyword.id)}
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={() => handleDrop(index)}
              onDragEnd={handleDragEnd}
              isDragOver={dragOverIndex === index && dragIndex !== index}
              isDragging={dragIndex === index}
            />
          )
        )}

        {isAdding ? (
          <KeywordEditForm
            existingIds={existingIds}
            onSave={handleAdd}
            onCancel={() => setIsAdding(false)}
          />
        ) : (
          <div className="flex items-center gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-dashed"
              onClick={() => {
                setIsAdding(true);
                setEditingId(null);
              }}
            >
              <Plus className="w-3.5 h-3.5" />
              {t("add_keyword")}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={handleResetDefaults}>
              <RotateCcw className="w-3.5 h-3.5" />
              {t("reset_defaults")}
            </Button>
          </div>
        )}
      </div>
    </SettingsSection>
  );
}
