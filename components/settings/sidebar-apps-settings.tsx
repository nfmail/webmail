"use client";

import { useState, useCallback, useRef } from "react";
import { useTranslations } from "@/i18n/client";
import { Plus, Pencil, Trash2, ExternalLink, PanelRight, GripVertical } from "lucide-react";
import { icons as lucideIcons, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SettingsSection, SettingItem, ToggleSwitch } from "./settings-section";
import { IconPicker } from "@/components/layout/icon-picker";
import { useSettingsStore, type SidebarApp } from "@/stores/settings-store";
import { useConfirmDialog } from "@/hooks/use-confirm-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn, generateUUID } from "@/lib/utils";

interface SidebarAppFormData {
  name: string;
  url: string;
  icon: string;
  openMode: "tab" | "inline";
  showOnMobile: boolean;
}

function AppForm({
  app,
  onSave,
  onCancel,
}: {
  app?: SidebarApp;
  onSave: (data: SidebarAppFormData) => void;
  onCancel: () => void;
}) {
  const t = useTranslations();
  const isEditing = !!app;

  const [formData, setFormData] = useState<SidebarAppFormData>({
    name: app?.name || "",
    url: app?.url || "",
    icon: app?.icon || "Globe",
    openMode: app?.openMode || "tab",
    showOnMobile: app?.showOnMobile ?? false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) {
      newErrors.name = t("Name is required");
    }
    if (!formData.url.trim()) {
      newErrors.url = t("URL is required");
    } else {
      try {
        const parsed = new URL(formData.url);
        if (!["http:", "https:"].includes(parsed.protocol)) {
          newErrors.url = t("Enter a valid http or https URL");
        }
      } catch {
        newErrors.url = t("Enter a valid http or https URL");
      }
    }
    if (!formData.icon) {
      newErrors.icon = t("Icon is required");
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    onSave(formData);
  };

  const SelectedIcon = formData.icon
    ? (lucideIcons[formData.icon as keyof typeof lucideIcons] as LucideIcon | undefined)
    : null;

  return (
    <form onSubmit={handleSubmit} className="p-4 border border-border rounded-lg bg-secondary/30">
      <FieldGroup>
        <Field data-invalid={errors.name ? true : undefined}>
          <FieldLabel htmlFor="sidebar-app-name">{t("Name")}</FieldLabel>
          <Input
            id="sidebar-app-name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder={t("My App")}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? "sidebar-app-name-error" : undefined}
          />
          {errors.name && (
            <FieldError id="sidebar-app-name-error" aria-live="polite">
              {errors.name}
            </FieldError>
          )}
        </Field>

        <Field data-invalid={errors.url ? true : undefined}>
          <FieldLabel htmlFor="sidebar-app-url">{t("URL")}</FieldLabel>
          <Input
            id="sidebar-app-url"
            value={formData.url}
            onChange={(e) => setFormData({ ...formData, url: e.target.value })}
            placeholder="https://example.com"
            aria-invalid={errors.url ? true : undefined}
            aria-describedby={errors.url ? "sidebar-app-url-error" : undefined}
          />
          {errors.url && (
            <FieldError id="sidebar-app-url-error" aria-live="polite">
              {errors.url}
            </FieldError>
          )}
        </Field>

        <Field data-invalid={errors.icon ? true : undefined}>
          <FieldLabel>{t("Icon")}</FieldLabel>
          <div className="flex items-center gap-2">
            {SelectedIcon && (
              <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center">
                <SelectedIcon className="w-4 h-4" />
              </div>
            )}
            <span className="text-sm text-muted-foreground">{formData.icon}</span>
          </div>
          <IconPicker value={formData.icon} onChange={(icon) => setFormData({ ...formData, icon })} />
          {errors.icon && <FieldError aria-live="polite">{errors.icon}</FieldError>}
        </Field>

        <Field>
          <FieldLabel>{t("Open Mode")}</FieldLabel>
          <ToggleGroup
            type="single"
            variant="outline"
            value={formData.openMode}
            // Radix emits '' when the active item is toggled off; this is a
            // mutually-exclusive choice and cannot be empty, so ignore it.
            onValueChange={(next) => next && setFormData({ ...formData, openMode: next as "tab" | "inline" })}
          >
            <ToggleGroupItem value="tab" className="gap-2">
              <ExternalLink className="w-4 h-4" />
              {t("New Tab")}
            </ToggleGroupItem>
            <ToggleGroupItem value="inline" className="gap-2">
              <PanelRight className="w-4 h-4" />
              {t("Inline")}
            </ToggleGroupItem>
          </ToggleGroup>
        </Field>

        <Field orientation="horizontal">
          <FieldLabel htmlFor="sidebar-app-show-on-mobile">{t("Show on Mobile")}</FieldLabel>
          <ToggleSwitch
            id="sidebar-app-show-on-mobile"
            checked={formData.showOnMobile}
            onChange={(checked) => setFormData({ ...formData, showOnMobile: checked })}
          />
        </Field>
      </FieldGroup>

      <div className="flex gap-2 justify-end pt-4">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {t("Cancel")}
        </Button>
        <Button type="submit" size="sm">
          {isEditing ? t("Update") : t("Add")}
        </Button>
      </div>
    </form>
  );
}

export function SidebarAppsSettings() {
  const t = useTranslations();
  const tApps = useTranslations();
  const { sidebarApps, keepAppsLoaded, addSidebarApp, updateSidebarApp, removeSidebarApp, reorderSidebarApps, updateSetting } = useSettingsStore();
  const [editingApp, setEditingApp] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const { dialogProps: confirmDialogProps, confirm: confirmDialog } = useConfirmDialog();
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const draggedIndexRef = useRef<number | null>(null);

  const handleAdd = useCallback((data: SidebarAppFormData) => {
    const id = `app-${generateUUID()}`;
    addSidebarApp({ id, ...data });
    setShowAddForm(false);
  }, [addSidebarApp]);

  const handleUpdate = useCallback((id: string, data: SidebarAppFormData) => {
    updateSidebarApp(id, data);
    setEditingApp(null);
  }, [updateSidebarApp]);

  const handleDelete = useCallback(async (app: SidebarApp) => {
    const confirmed = await confirmDialog({
      title: tApps("Delete App"),
      message: tApps("Are you sure you want to delete \"{name}\"?", { name: app.name }),
      confirmText: tApps("Delete"),
      variant: 'destructive',
    });
    if (!confirmed) return;
    removeSidebarApp(app.id);
  }, [confirmDialog, tApps, removeSidebarApp]);

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    draggedIndexRef.current = index;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIndex(index);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    setDragOverIndex(null);
    const fromIndex = draggedIndexRef.current;
    if (fromIndex === null || fromIndex === dropIndex) return;
    const newApps = [...sidebarApps];
    const [moved] = newApps.splice(fromIndex, 1);
    newApps.splice(dropIndex, 0, moved);
    reorderSidebarApps(newApps);
  }, [sidebarApps, reorderSidebarApps]);

  const handleDragEnd = useCallback(() => {
    draggedIndexRef.current = null;
    setDragOverIndex(null);
  }, []);

  return (
    <>
      <SettingsSection title={t("Sidebar Apps")} description={t("Manage custom apps and links in your sidebar")}>
        <SettingItem label={t("Keep Apps Loaded")} description={t("Keep inline apps running in the background when switching between them to avoid reloading")} htmlFor="sidebar-apps-keep-loaded">
          <ToggleSwitch
            id="sidebar-apps-keep-loaded"
            checked={keepAppsLoaded}
            onChange={(v) => updateSetting("keepAppsLoaded", v)}
          />
        </SettingItem>
      </SettingsSection>

      <SettingsSection title={t("Custom Apps")} description={t("Add, edit, or remove custom apps from your sidebar")}>
        <div className="flex flex-col gap-3">
          {sidebarApps.length === 0 && !showAddForm && (
            <p className="text-sm text-muted-foreground py-4 text-center">{tApps("Add custom apps and links to your sidebar")}</p>
          )}

          {sidebarApps.map((app, index) => {
            if (editingApp === app.id) {
              return (
                <AppForm
                  key={app.id}
                  app={app}
                  onSave={(data) => handleUpdate(app.id, data)}
                  onCancel={() => setEditingApp(null)}
                />
              );
            }

            const AppIcon = lucideIcons[app.icon as keyof typeof lucideIcons] as LucideIcon | undefined;
            return (
              <div
                key={app.id}
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={(e) => handleDrop(e, index)}
                onDragEnd={handleDragEnd}
                className={cn(
                  "flex items-center gap-3 p-3 border rounded-lg transition-colors",
                  dragOverIndex === index
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted/50"
                )}
              >
                <div className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-muted-foreground flex-shrink-0">
                  <GripVertical className="w-4 h-4" />
                </div>
                <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                  {AppIcon ? <AppIcon className="w-4 h-4" /> : null}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{app.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{app.url}</div>
                </div>
                <span className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0",
                  app.openMode === "inline"
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground"
                )}>
                  {app.openMode === "inline" ? tApps("Inline") : tApps("Tab")}
                </span>
                <button
                  onClick={() => setEditingApp(app.id)}
                  className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(app)}
                  className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}

          {showAddForm && (
            <AppForm
              onSave={handleAdd}
              onCancel={() => setShowAddForm(false)}
            />
          )}

          {!showAddForm && !editingApp && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddForm(true)}
              className="w-full"
            >
              <Plus className="w-4 h-4 me-2" />
              {tApps("Add App")}
            </Button>
          )}
        </div>
      </SettingsSection>

      <ConfirmDialog {...confirmDialogProps} />
    </>
  );
}
