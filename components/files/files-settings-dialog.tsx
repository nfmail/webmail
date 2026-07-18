"use client";

import { useTranslations } from "@/i18n/client";
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
  const t = useTranslations();

  const update = (patch: Partial<FilesSettings>) => {
    const next = { ...settings, ...patch };
    onSettingsChange(next);
    saveFilesSettings(next);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md max-h-[80vh] gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border p-4 text-start">
          <DialogTitle>{t("File Settings")}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-6 overflow-y-auto p-4">
          <SettingsSection title={t("Display")}>
            <SettingItem label={t("Folder Navigation")} description={t("Choose how folders are displayed: inline with files or in a sidebar tree")}>
              <RadioGroup
                value={settings.folderLayout}
                onChange={(v) => update({ folderLayout: v as FolderLayout })}
                options={[
                  { value: "inline", label: t("Inline") },
                  { value: "sidebar", label: t("Sidebar") },
                ]}
              />
            </SettingItem>
            <SettingItem label={t("Default View")} description={t("Choose between grid and list layout")}>
              <RadioGroup
                value={settings.defaultViewMode}
                onChange={(v) => update({ defaultViewMode: v as "list" | "grid" })}
                options={[
                  { value: "list", label: t("List view") },
                  { value: "grid", label: t("Grid view") },
                ]}
              />
            </SettingItem>
            <SettingItem label={t("Default Sort")} description={t("Choose the default sorting for files")}>
              <RadioGroup
                value={settings.defaultSortKey}
                onChange={(v) => update({ defaultSortKey: v as "name" | "size" | "modified" })}
                options={[
                  { value: "name", label: t("Name") },
                  { value: "size", label: t("Size") },
                  { value: "modified", label: t("Modified") },
                ]}
              />
            </SettingItem>
            <SettingItem label={t("Sort Direction")} description={t("Choose ascending or descending order")}>
              <RadioGroup
                value={settings.defaultSortDir}
                onChange={(v) => update({ defaultSortDir: v as "asc" | "desc" })}
                options={[
                  { value: "asc", label: t("Ascending") },
                  { value: "desc", label: t("Descending") },
                ]}
              />
            </SettingItem>
          </SettingsSection>

          <SettingsSection title={t("Icons")}>
            <SettingItem label={t("Show File Icons")} description={t("Display icons next to files and folders")}>
              <ToggleSwitch
                checked={settings.showIcons}
                onChange={(v) => update({ showIcons: v })}
              />
            </SettingItem>
            <SettingItem label={t("Colored Icons")} description={t("Use colorful icons instead of monochrome")}>
              <ToggleSwitch
                checked={settings.coloredIcons}
                onChange={(v) => update({ coloredIcons: v })}
                disabled={!settings.showIcons}
              />
            </SettingItem>
            <SettingItem label={t("Show Thumbnails")} description={t("Display image previews instead of icons for image files")}>
              <ToggleSwitch
                checked={settings.showThumbnails}
                onChange={(v) => update({ showThumbnails: v })}
              />
            </SettingItem>
          </SettingsSection>

          <SettingsSection title={t("Behavior")}>
            <SettingItem label={t("Show Hidden Files")} description={t("Display files and folders that start with a dot")}>
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
