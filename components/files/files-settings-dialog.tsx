"use client";

import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SettingsSection, SettingItem, ToggleSwitch, RadioGroup } from "@/components/settings/settings-section";

export type FolderLayout = "inline" | "sidebar";

export interface FilesSettings {
  defaultViewMode: "list" | "grid";
  showIcons: boolean;
  coloredIcons: boolean;
  defaultSortKey: "name" | "size" | "modified";
  defaultSortDir: "asc" | "desc";
  showHiddenFiles: boolean;
  showThumbnails: boolean;
  folderLayout: FolderLayout;
}

export const DEFAULT_FILES_SETTINGS: FilesSettings = {
  defaultViewMode: "list",
  showIcons: true,
  coloredIcons: true,
  defaultSortKey: "name",
  defaultSortDir: "asc",
  showHiddenFiles: false,
  showThumbnails: true,
  folderLayout: "inline",
};

export function loadFilesSettings(): FilesSettings {
  if (typeof window === "undefined") return DEFAULT_FILES_SETTINGS;
  try {
    const raw = localStorage.getItem("files-settings");
    if (raw) return { ...DEFAULT_FILES_SETTINGS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return DEFAULT_FILES_SETTINGS;
}

export function saveFilesSettings(settings: FilesSettings) {
  localStorage.setItem("files-settings", JSON.stringify(settings));
  // Dispatch custom event for same-tab listeners (StorageEvent only fires cross-tab)
  window.dispatchEvent(new CustomEvent("files-settings-changed"));
}

interface FilesSettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  settings: FilesSettings;
  onSettingsChange: (settings: FilesSettings) => void;
}

export function FilesSettingsDialog({ isOpen, onClose, settings, onSettingsChange }: FilesSettingsDialogProps) {
  const t = useTranslations("files");

  const update = (patch: Partial<FilesSettings>) => {
    const next = { ...settings, ...patch };
    onSettingsChange(next);
    saveFilesSettings(next);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md max-h-[80vh] gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border p-4 text-start">
          <DialogTitle>{t("settings_title")}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-6 overflow-y-auto p-4">
          <SettingsSection title={t("settings_display")}>
            <SettingItem label={t("settings_folder_layout")} description={t("settings_folder_layout_desc")}>
              <RadioGroup
                value={settings.folderLayout}
                onChange={(v) => update({ folderLayout: v as FolderLayout })}
                options={[
                  { value: "inline", label: t("settings_folder_layout_inline") },
                  { value: "sidebar", label: t("settings_folder_layout_sidebar") },
                ]}
              />
            </SettingItem>
            <SettingItem label={t("settings_default_view")} description={t("settings_default_view_desc")}>
              <RadioGroup
                value={settings.defaultViewMode}
                onChange={(v) => update({ defaultViewMode: v as "list" | "grid" })}
                options={[
                  { value: "list", label: t("list_view") },
                  { value: "grid", label: t("grid_view") },
                ]}
              />
            </SettingItem>
            <SettingItem label={t("settings_default_sort")} description={t("settings_default_sort_desc")}>
              <RadioGroup
                value={settings.defaultSortKey}
                onChange={(v) => update({ defaultSortKey: v as "name" | "size" | "modified" })}
                options={[
                  { value: "name", label: t("name") },
                  { value: "size", label: t("size") },
                  { value: "modified", label: t("modified") },
                ]}
              />
            </SettingItem>
            <SettingItem label={t("settings_sort_direction")} description={t("settings_sort_direction_desc")}>
              <RadioGroup
                value={settings.defaultSortDir}
                onChange={(v) => update({ defaultSortDir: v as "asc" | "desc" })}
                options={[
                  { value: "asc", label: t("settings_ascending") },
                  { value: "desc", label: t("settings_descending") },
                ]}
              />
            </SettingItem>
          </SettingsSection>

          <SettingsSection title={t("settings_icons")}>
            <SettingItem label={t("settings_show_icons")} description={t("settings_show_icons_desc")}>
              <ToggleSwitch
                checked={settings.showIcons}
                onChange={(v) => update({ showIcons: v })}
              />
            </SettingItem>
            <SettingItem label={t("settings_colored_icons")} description={t("settings_colored_icons_desc")}>
              <ToggleSwitch
                checked={settings.coloredIcons}
                onChange={(v) => update({ coloredIcons: v })}
                disabled={!settings.showIcons}
              />
            </SettingItem>
            <SettingItem label={t("settings_show_thumbnails")} description={t("settings_show_thumbnails_desc")}>
              <ToggleSwitch
                checked={settings.showThumbnails}
                onChange={(v) => update({ showThumbnails: v })}
              />
            </SettingItem>
          </SettingsSection>

          <SettingsSection title={t("settings_behavior")}>
            <SettingItem label={t("settings_show_hidden")} description={t("settings_show_hidden_desc")}>
              <ToggleSwitch
                checked={settings.showHiddenFiles}
                onChange={(v) => update({ showHiddenFiles: v })}
              />
            </SettingItem>
          </SettingsSection>
        </div>
      </DialogContent>
    </Dialog>
  );
}
